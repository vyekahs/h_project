
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';
import { emitLiveEvent } from '$lib/server/liveEvents';

// Types
interface ScanResult {
    mac: string;
    rssi: number;
    name?: string;
}

interface UserDevice {
    attendeeId: number;
    irk: string; // Hex string
    name: string;
    wifiMac?: string; // WiFi MAC address (XX:XX:XX:XX:XX:XX)
}

// In-Memory Cache
// RPA -> AttendeeID mapping
const rpaCache = new Map<string, { attendeeId: number; expiresAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes (BLE RPA rotation ~15min, 여유 확보)

// Negative cache: 매칭 안 된 MAC 단기 캐시 (반복 스캔 방지)
const negativeCacheMs = 5 * 60 * 1000; // 5 minutes
const negativeCache = new Set<string>(); // MAC addresses with no match
const negativeCacheExpiry = new Map<string, number>(); // MAC -> expiresAt

// IRK Device Cache (서버 시작 후 첫 요청에서 로드, 이후 영구 캐시)
let irkCache: UserDevice[] | null = null;

// WiFi MAC → AttendeeID 캐시 (IRK 캐시 로드 시 함께 구성)
const wifiMacCache = new Map<string, number>(); // MAC (uppercase) → attendeeId

// Attendee Cache (기기 등록된 유저 정보 캐시)
interface AttendeeInfo {
    id: number;
    name: string;
    status: string;
    isAdmin: boolean;
}
const attendeeCache = new Map<number, AttendeeInfo>();
let attendeeCacheLoaded = false;

// Last Seen Maps for Auto-Checkout (AttendeeID -> timestamp ms)
// BLE/WiFi 분리: 둘 중 하나라도 최근 감지되면 체크아웃 방지 (OR 조건)
const lastSeenBleMap = new Map<number, number>();
const lastSeenWifiMap = new Map<number, number>();

// System Settings Cache (영구 캐시, 변경 시 updateSettingsCache 호출)
let settingsCache: { isOpen: boolean; openingTime: string } | null = null;

// Constants
const CHECKOUT_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes

/** 한국 시간 타임스탬프 (HH:mm:ss) */
function kstTime(): string {
    return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(11, 19);
}

// Auto check-in/checkout log ring buffer (최근 100건)
interface AutoLog {
    time: string;
    type: 'checkin' | 'checkout' | 'auto-open';
    source: 'BLE' | 'WiFi';
    userName: string;
    attendeeId: number;
}
const autoLogs: AutoLog[] = [];
const MAX_AUTO_LOGS = 100;

function pushAutoLog(type: AutoLog['type'], source: AutoLog['source'], userName: string, attendeeId: number) {
    autoLogs.unshift({ time: kstTime(), type, source, userName, attendeeId });
    if (autoLogs.length > MAX_AUTO_LOGS) autoLogs.length = MAX_AUTO_LOGS;
}

export function getAutoCheckinLogs(): AutoLog[] {
    return autoLogs;
}

/** 설정 캐시 업데이트 (외부에서 is_open 변경 시 호출) */
export function updateSettingsCache(isOpen: boolean, openingTime?: string) {
    if (!settingsCache) {
        settingsCache = { isOpen, openingTime: openingTime || '09:00' };
    } else {
        settingsCache.isOpen = isOpen;
        if (openingTime !== undefined) settingsCache.openingTime = openingTime;
    }
}

/** 마감 시 모든 present 유저를 left로 변경 (캐시 동기화) */
export function markAllLeft() {
    for (const attendee of attendeeCache.values()) {
        if (attendee.status === 'present') {
            attendee.status = 'left';
        }
    }
    lastSeenBleMap.clear();
    lastSeenWifiMap.clear();
}

/** BLE lastSeen 업데이트 (Rust BLE 서버에서 호출) */
export function updateLastSeenBle(attendeeId: number, timestamp: number) {
    lastSeenBleMap.set(attendeeId, timestamp);
}

/** 오토오픈 윈도우 계산 (오픈시간 ±2시간) */
export function calculateAutoOpenWindow(): boolean {
    if (!settingsCache) return false;
    const now = new Date();
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const currentMins = kstNow.getUTCHours() * 60 + kstNow.getUTCMinutes();
    const [openHour, openMinute] = settingsCache.openingTime.split(':').map(Number);
    const openMins = openHour * 60 + openMinute;
    const diff = currentMins - openMins;
    return diff >= -120 && diff <= 120;
}

/** 기기 등록 시 IRK 캐시에 즉시 추가 (중복 IRK는 업데이트) */
export async function addToIrkCache(attendeeId: number, irk: string, name: string, wifiMac?: string) {
    if (irkCache) {
        const existing = irkCache.findIndex(d => d.irk === irk);
        if (existing >= 0) {
            irkCache[existing] = { attendeeId, irk, name, wifiMac };
        } else {
            irkCache.push({ attendeeId, irk, name, wifiMac });
        }
    }
    // WiFi MAC 캐시 동기화
    if (wifiMac) {
        wifiMacCache.set(wifiMac.toUpperCase(), attendeeId);
    }
    // attendeeCache에도 추가 (없으면 DB에서 조회)
    if (attendeeCacheLoaded && !attendeeCache.has(attendeeId)) {
        try {
            const res = await db.execute(sql`SELECT id, name, status, is_admin FROM attendees WHERE id = ${attendeeId}`);
            if (res.length > 0) {
                const row = res[0] as any;
                attendeeCache.set(attendeeId, { id: row.id, name: row.name, status: row.status, isAdmin: row.is_admin });
            }
        } catch (e) {
            // non-critical
        }
    }
}

/** 기기 삭제 시 IRK 캐시에서 제거 */
export function removeFromIrkCache(attendeeId: number, irk?: string) {
    if (irkCache) {
        // WiFi MAC 캐시에서도 제거
        const toRemove = irkCache.filter(d => irk ? d.irk === irk : d.attendeeId === attendeeId);
        for (const dev of toRemove) {
            if (dev.wifiMac) wifiMacCache.delete(dev.wifiMac.toUpperCase());
        }

        irkCache = irkCache.filter(d =>
            irk ? d.irk !== irk : d.attendeeId !== attendeeId
        );
    }
    // 해당 유저의 기기가 더 이상 없으면 attendeeCache에서도 제거
    if (irkCache && !irkCache.some(d => d.attendeeId === attendeeId)) {
        attendeeCache.delete(attendeeId);
    }
}

/** WiFi MAC 등록 시 캐시에 추가 */
export async function addWifiMacToCache(attendeeId: number, wifiMac: string) {
    const mac = wifiMac.toUpperCase();
    wifiMacCache.set(mac, attendeeId);
    // IRK 캐시의 해당 유저 기기에도 wifiMac 업데이트
    if (irkCache) {
        const device = irkCache.find(d => d.attendeeId === attendeeId);
        if (device) device.wifiMac = mac;
    }
}

/**
 * Resolve RPA using IRK
 */
export const resolveRPA = (mac: string, irkHex: string): boolean => {
    try {
        const macClean = mac.replace(/:/g, '');
        const macBytes = Buffer.from(macClean, 'hex');
        const irk = Buffer.from(irkHex, 'hex');

        if (macBytes.length !== 6) return false;

        const candidates = [
            { prand: macBytes.subarray(0, 3), hash: macBytes.subarray(3, 6) },
            { prand: macBytes.subarray(3, 6), hash: macBytes.subarray(0, 3) }
        ];

        const keyRev = Buffer.from(irk).reverse();
        const keyStd = irk;

        for (const { prand, hash } of candidates) {
            if (verifyMetric(hash, prand, keyRev, 'Tail', 'Normal')) return true;
            if (verifyMetric(hash, prand, keyRev, 'Head', 'Reverse')) return true;
            if (verifyMetric(hash, prand, keyStd, 'Tail', 'Reverse')) return true;
            if (verifyMetric(hash, prand, keyStd, 'Tail', 'Normal')) return true;
        }

        return false;
    } catch (e) {
        return false;
    }
};

function verifyMetric(hash: Buffer, prand: Buffer, key: Buffer, padding: 'Head'|'Tail', order: 'Normal'|'Reverse'): boolean {
    const plaintext = Buffer.alloc(16);

    let p0, p1, p2;
    if (order === 'Normal') {
        p0 = prand[0]; p1 = prand[1]; p2 = prand[2];
    } else {
        p0 = prand[2]; p1 = prand[1]; p2 = prand[0];
    }

    if (padding === 'Head') {
        plaintext[0] = p0; plaintext[1] = p1; plaintext[2] = p2;
    } else {
        plaintext[13] = p0; plaintext[14] = p1; plaintext[15] = p2;
    }

    const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
    cipher.setAutoPadding(false);
    const encrypted = cipher.update(plaintext);

    if (padding === 'Tail') {
        if (order === 'Normal') {
             return encrypted[13] === hash[0] && encrypted[14] === hash[1] && encrypted[15] === hash[2];
        } else {
             return encrypted[13] === hash[0] && encrypted[14] === hash[1] && encrypted[15] === hash[2];
        }
    } else {
        if (order === 'Normal') {
            return encrypted[0] === hash[0] && encrypted[1] === hash[1] && encrypted[2] === hash[2];
        } else {
            if (encrypted[0] === hash[0] && encrypted[1] === hash[1] && encrypted[2] === hash[2]) return true;
            if (encrypted[0] === hash[2] && encrypted[1] === hash[1] && encrypted[2] === hash[0]) return true;
        }
    }
    return false;
}


/** 캐시 초기화 (settings, IRK, attendee — 첫 요청에서 DB 로드 후 영구 캐시) */
export async function ensureCachesLoaded(source: string = 'BLE') {
    if (!settingsCache) {
        try {
            const settingsRes = await db.execute(sql`SELECT key, value FROM system_settings WHERE key IN ('is_open', 'opening_time')`);
            let isOpen = false;
            let openingTime = '09:00';
            for (const row of settingsRes) {
                const r = row as any;
                if (r.key === 'is_open') isOpen = r.value === 'true';
                if (r.key === 'opening_time') openingTime = r.value;
            }
            settingsCache = { isOpen, openingTime };
            console.log(`[${kstTime()}][${source}] Settings cache loaded: isOpen=${isOpen}, openingTime=${openingTime}`);
        } catch (e) {
            console.error('Failed to fetch settings', e);
            settingsCache = { isOpen: false, openingTime: '09:00' };
        }
    }
    if (!irkCache) {
        const res = await db.execute(sql`SELECT irk, attendee_id, name, wifi_mac FROM user_devices`);
        irkCache = res.map((row: any) => ({
            irk: row.irk,
            attendeeId: row.attendee_id,
            name: row.name,
            wifiMac: row.wifi_mac || undefined
        })) as UserDevice[];
        for (const dev of irkCache) {
            if (dev.wifiMac) {
                wifiMacCache.set(dev.wifiMac.toUpperCase(), dev.attendeeId);
            }
        }
        console.log(`[${kstTime()}][${source}] IRK cache loaded: ${irkCache.length} devices (${wifiMacCache.size} with WiFi MAC)`);
    }
    if (!attendeeCacheLoaded) {
        const res = await db.execute(sql`
            SELECT a.id, a.name, a.status, a.is_admin
            FROM attendees a
            JOIN user_devices ud ON a.id = ud.attendee_id
        `);
        for (const row of res) {
            const r = row as any;
            attendeeCache.set(r.id, {
                id: r.id,
                name: r.name,
                status: r.status,
                isAdmin: r.is_admin
            });
        }
        attendeeCacheLoaded = true;
        console.log(`[${kstTime()}][${source}] Attendee cache loaded: ${attendeeCache.size} users`);
    }
}

/**
 * Process Scan Results
 */
export async function processScanResults(scannerId: string, timestamp: number, scans: ScanResult[], isLastBatch: boolean = true) {
    await ensureCachesLoaded('BLE');

    // 오픈 시간 전후 2시간 범위 밖이면 스캔 처리 완전 스킵
    const nowCheck = new Date();
    const kstCheck = new Date(nowCheck.getTime() + 9 * 60 * 60 * 1000);
    const checkHour = kstCheck.getUTCHours();
    const checkMinute = kstCheck.getUTCMinutes();
    const [ohCheck, omCheck] = settingsCache!.openingTime.split(':').map(Number);
    const currentMinutesTotal = checkHour * 60 + checkMinute;
    const openMinutesTotal = ohCheck * 60 + omCheck;
    const beforeOpeningWindow = currentMinutesTotal < (openMinutesTotal - 120);

    if (!settingsCache!.isOpen && beforeOpeningWindow) {
        console.log(`[${kstTime()}][BLE] Gym closed & before opening window, skipping (${scans.length} devices)`);
        return;
    }
    const allDevices = irkCache!;

    console.log(`[${kstTime()}][BLE] Processing ${scans.length} MACs against ${allDevices.length} registered devices`);
    const namedDevices = scans.filter(s => s.name && s.name.length > 0);
    if (namedDevices.length > 0) {
        console.log(`[${kstTime()}][BLE] Named Devices: ${namedDevices.map(d => `${d.name} (${d.mac})`).join(', ')}`);
    }

    const detectedAttendeeIds = new Set<number>();

    // 2. Resolve MACs
    const nowTs = Date.now();
    for (const scan of scans) {
        let attendeeId: number | undefined;

        // 포지티브 캐시 확인
        if (rpaCache.has(scan.mac)) {
            const cached = rpaCache.get(scan.mac)!;
            if (nowTs < cached.expiresAt) {
                attendeeId = cached.attendeeId;
                // 캐시 히트 시 TTL 갱신
                cached.expiresAt = nowTs + CACHE_TTL_MS;
            } else {
                rpaCache.delete(scan.mac);
            }
        }

        // 네거티브 캐시 확인 (매칭 안 된 MAC 스킵)
        if (!attendeeId) {
            const negExpiry = negativeCacheExpiry.get(scan.mac);
            if (negExpiry && nowTs < negExpiry) {
                continue; // 최근에 매칭 실패한 MAC, 스킵
            } else if (negExpiry) {
                negativeCache.delete(scan.mac);
                negativeCacheExpiry.delete(scan.mac);
            }
        }

        if (!attendeeId) {
            for (const device of allDevices) {
                if (resolveRPA(scan.mac, device.irk)) {
                    attendeeId = device.attendeeId;
                    rpaCache.set(scan.mac, {
                        attendeeId,
                        expiresAt: nowTs + CACHE_TTL_MS
                    });
                    break;
                }
            }
            // 매칭 실패 시 네거티브 캐시 등록
            if (!attendeeId) {
                negativeCache.add(scan.mac);
                negativeCacheExpiry.set(scan.mac, nowTs + negativeCacheMs);
            }
        }

        if (attendeeId) {
            const isFirst = !detectedAttendeeIds.has(attendeeId);
            detectedAttendeeIds.add(attendeeId);
            lastSeenBleMap.set(attendeeId, nowTs);
            if (isFirst) {
                console.log(`[${kstTime()}][BLE] ✅ Matched: ${scan.mac} (${scan.rssi}dBm) → User ${attendeeId}`);
            }
        }
    }

    console.log(`[${kstTime()}][BLE] Match Summary: ${detectedAttendeeIds.size} users matched out of ${scans.length} scanned devices`);
    if (detectedAttendeeIds.size > 0) {
        console.log(`[${kstTime()}][BLE] Matched Users: ${[...detectedAttendeeIds].join(', ')}`);
    }

    if (isLastBatch) {
        const recentThreshold = Date.now() - 2 * 60 * 1000;
        const missingUsers = [...attendeeCache.values()].filter(a => {
            if (a.status !== 'present') return false;
            const bleSeen = lastSeenBleMap.get(a.id) ?? 0;
            const wifiSeen = lastSeenWifiMap.get(a.id) ?? 0;
            const lastSeen = Math.max(bleSeen, wifiSeen);
            return lastSeen === 0 || lastSeen < recentThreshold;
        });
        if (missingUsers.length > 0) {
            const details = missingUsers.map(u => {
                const ble = lastSeenBleMap.get(u.id);
                const wifi = lastSeenWifiMap.get(u.id);
                const bleAgo = ble ? `${Math.round((Date.now() - ble) / 60000)}m` : '-';
                const wifiAgo = wifi ? `${Math.round((Date.now() - wifi) / 60000)}m` : '-';
                return `${u.name}(${u.id}, BLE:${bleAgo}, WiFi:${wifiAgo})`;
            }).join(', ');
            console.log(`[${kstTime()}][BLE] ⚠️ Present users NOT detected recently: ${details}`);
        }
    }

    // 3. Auto Check-in Logic & Auto-Open Logic
    const now = new Date();
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const currentHour = kstNow.getUTCHours();
    const currentMinute = kstNow.getUTCMinutes();
    const [openHour, openMinute] = settingsCache!.openingTime.split(':').map(Number);

    // 오픈시간 전후 2시간만 자동 오픈 허용 (예: 09:00 오픈이면 07:00~11:00)
    const currentMins = currentHour * 60 + currentMinute;
    const openMins = openHour * 60 + openMinute;
    const diffFromOpening = currentMins - openMins;
    const isWithinAutoOpenWindow = diffFromOpening >= -120 && diffFromOpening <= 120;

    await processAutoCheckin(detectedAttendeeIds, isWithinAutoOpenWindow, 'BLE');

    // 4. Trigger Auto-Checkout Check (마지막 배치에서만 실행)
    if (isLastBatch) {
        await checkAutoCheckout();
    }
}

/**
 * Auto Check-in (배치 처리) — BLE/WiFi 공통
 */
export async function processAutoCheckin(detectedAttendeeIds: Set<number>, isWithinAutoOpenWindow: boolean, source: 'BLE' | 'WiFi') {
    // 1. Auto-Open: 어드민 감지 시 자동 오픈
    for (const attendeeId of detectedAttendeeIds) {
        const attendee = attendeeCache.get(attendeeId);
        if (!attendee) continue;
        if (!settingsCache!.isOpen && attendee.isAdmin && isWithinAutoOpenWindow) {
            console.log(`[${kstTime()}][${source}] 🚨 Admin ${attendeeId} (${attendee.name}) detected! Auto-Opening Gym...`);
            await db.execute(sql`INSERT INTO system_settings (key, value) VALUES ('is_open', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true'`);
            settingsCache!.isOpen = true;
            pushAutoLog('auto-open', source, attendee.name, attendeeId);
            break; // 한 명만 오픈하면 됨
        }
    }

    if (!settingsCache!.isOpen) return;

    // 2. 체크인 대상 수집 (status !== 'present')
    const needCheckin: number[] = [];
    for (const attendeeId of detectedAttendeeIds) {
        const attendee = attendeeCache.get(attendeeId);
        if (attendee && attendee.status !== 'present') {
            needCheckin.push(attendeeId);
        }
    }
    if (needCheckin.length === 0) return;

    // 3. 배치 조회: 오늘 열린 방문이 있는 유저
    let existingVisitIds = new Set<number>();
    try {
        const existing = await db.execute(sql`
            SELECT DISTINCT attendee_id FROM visits
            WHERE attendee_id IN (${sql.join(needCheckin.map(id => sql`${id}`), sql`, `)})
              AND departure_time IS NULL
              AND arrival_time::date = (NOW() AT TIME ZONE 'Asia/Seoul')::date
        `);
        existingVisitIds = new Set((existing as any[]).map(r => r.attendee_id));
    } catch (e) {
        console.error(`[${source}] Failed to batch-check existing visits`, e);
    }

    // 4a. 기존 visit 있는 유저 → status만 업데이트 (배치)
    const resumeIds = needCheckin.filter(id => existingVisitIds.has(id));
    if (resumeIds.length > 0) {
        try {
            await db.execute(sql`UPDATE attendees SET status = 'present', updated_at = NOW() WHERE id IN (${sql.join(resumeIds.map(id => sql`${id}`), sql`, `)})`);
            for (const id of resumeIds) {
                const attendee = attendeeCache.get(id);
                if (attendee) attendee.status = 'present';
                console.log(`[${kstTime()}][${source}] User ${id} already has open visit today, updating status only`);
            }
            emitLiveEvent('visitors');
        } catch (e) {
            console.error(`[${source}] Failed to batch-resume users`, e);
        }
    }

    // 4b. 신규 체크인 유저 → 트랜잭션 (배치)
    const newCheckinIds = needCheckin.filter(id => !existingVisitIds.has(id));
    if (newCheckinIds.length > 0) {
        try {
            await db.transaction(async (tx) => {
                await tx.execute(sql`UPDATE attendees SET status = 'present', arrival_time = NOW(), updated_at = NOW() WHERE id IN (${sql.join(newCheckinIds.map(id => sql`${id}`), sql`, `)})`);
                // visits 배치 INSERT (unnest 사용)
                for (const id of newCheckinIds) {
                    await tx.execute(sql`INSERT INTO visits (attendee_id, arrival_time) VALUES (${id}, NOW())`);
                }
                await tx.execute(sql`DELETE FROM daily_visit_plans WHERE attendee_id IN (${sql.join(newCheckinIds.map(id => sql`${id}`), sql`, `)}) AND plan_date = CURRENT_DATE`);
            });
            for (const id of newCheckinIds) {
                const attendee = attendeeCache.get(id);
                if (attendee) {
                    attendee.status = 'present';
                    pushAutoLog('checkin', source, attendee.name, id);
                }
                console.log(`[${kstTime()}][${source}] Auto Checking-in User ${id}`);
            }
            emitLiveEvent('visitors');
        } catch (e) {
            console.error(`[${source}] Failed to batch check-in`, e);
        }
    }
}

/**
 * Auto Checkout Job
 */
export async function checkAutoCheckout() {
    const now = Date.now();
    const timeoutThreshold = now - CHECKOUT_TIMEOUT_MS;

    const presentUsers = [...attendeeCache.values()].filter(a => a.status === 'present');
    if (presentUsers.length === 0) return;

    // 현재 게임중인 유저는 체크아웃에서 제외
    let playingUserIds = new Set<number>();
    try {
        const playingUsersResult = await db.execute(sql`
            SELECT DISTINCT sp.attendee_id
            FROM session_participants sp
            JOIN game_sessions gs ON sp.session_id = gs.id
            WHERE gs.status = 'playing' AND sp.attendee_id IS NOT NULL
        `);
        playingUserIds = new Set((playingUsersResult as any[]).map(r => r.attendee_id));
    } catch (e) {
        console.error('[AUTO] Failed to fetch playing users, proceeding without game check', e);
    }

    for (const attendee of presentUsers) {
        if (playingUserIds.has(attendee.id)) continue;
        const bleSeen = lastSeenBleMap.get(attendee.id) ?? 0;
        const wifiSeen = lastSeenWifiMap.get(attendee.id) ?? 0;
        const lastSeen = Math.max(bleSeen, wifiSeen);

        if (lastSeen === 0) continue;

        if (lastSeen < timeoutThreshold) {
            const bleAgo = bleSeen ? `${Math.round((now - bleSeen) / 60000)}분 전` : 'never';
            const wifiAgo = wifiSeen ? `${Math.round((now - wifiSeen) / 60000)}분 전` : 'never';
            const lastSource = bleSeen >= wifiSeen ? 'BLE' : 'WiFi';
            console.log(`[${kstTime()}][AUTO] Checking-out User ${attendee.id} (${attendee.name}). BLE: ${bleAgo}, WiFi: ${wifiAgo}`);

            try {
                await db.transaction(async (tx) => {
                    await tx.execute(sql`UPDATE attendees SET status = 'left', updated_at = NOW() WHERE id = ${attendee.id}`);
                    await tx.execute(sql`UPDATE visits SET departure_time = NOW() WHERE attendee_id = ${attendee.id} AND departure_time IS NULL`);
                });
                attendee.status = 'left';
                lastSeenBleMap.delete(attendee.id);
                lastSeenWifiMap.delete(attendee.id);
                pushAutoLog('checkout', lastSource, attendee.name, attendee.id);
                emitLiveEvent('visitors');
            } catch (e) {
                console.error(`[AUTO] Failed to check-out ${attendee.id}`, e);
            }
        }
    }
}

/**
 * Process WiFi Report (공유기에 연결된 기기 MAC 목록)
 */
export async function processWifiReport(_scannerId: string, devices: { mac: string }[]) {
    await ensureCachesLoaded('WiFi');

    // 오픈 시간 전후 2시간 범위 밖이면 스캔 처리 완전 스킵
    const nowCheck = new Date();
    const kstCheck = new Date(nowCheck.getTime() + 9 * 60 * 60 * 1000);
    const checkHour = kstCheck.getUTCHours();
    const checkMinute = kstCheck.getUTCMinutes();
    const [ohCheck, omCheck] = settingsCache!.openingTime.split(':').map(Number);
    const currentMinutesTotal = checkHour * 60 + checkMinute;
    const openMinutesTotal = ohCheck * 60 + omCheck;
    const beforeOpeningWindow = currentMinutesTotal < (openMinutesTotal - 120);

    if (!settingsCache!.isOpen && beforeOpeningWindow) {
        console.log(`[${kstTime()}][WiFi] Gym closed & before opening window, skipping (${devices.length} devices)`);
        return;
    }

    if (wifiMacCache.size === 0) {
        console.log(`[${kstTime()}][WiFi] No WiFi MACs registered, skipping`);
        return;
    }

    const detectedAttendeeIds = new Set<number>();
    const reportedMacs = devices.map(d => d.mac.toUpperCase());
    const registeredMacs = [...wifiMacCache.keys()];

    const matchedMacs: string[] = [];
    for (const device of devices) {
        const mac = device.mac.toUpperCase();
        const attendeeId = wifiMacCache.get(mac);
        if (attendeeId) {
            detectedAttendeeIds.add(attendeeId);
            lastSeenWifiMap.set(attendeeId, Date.now());
            matchedMacs.push(mac);
        }
    }

    console.log(`[${kstTime()}][WiFi] ${devices.length} scanned → ${detectedAttendeeIds.size} matched (${wifiMacCache.size} registered)`);
    if (detectedAttendeeIds.size > 0) {
        console.log(`[${kstTime()}][WiFi] Matched MACs: ${matchedMacs.join(', ')}`);
    }
    console.log(`[${kstTime()}][WiFi] Registered: ${registeredMacs.join(', ')}`);
    console.log(`[${kstTime()}][WiFi] Scanned: ${reportedMacs.join(', ')}`);

    if (detectedAttendeeIds.size === 0) return;

    const now = new Date();
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const currentHour = kstNow.getUTCHours();
    const currentMinute = kstNow.getUTCMinutes();
    const [openHour, openMinute] = settingsCache!.openingTime.split(':').map(Number);

    // 오픈시간 전후 2시간만 자동 오픈 허용 (예: 09:00 오픈이면 07:00~11:00)
    const currentMins = currentHour * 60 + currentMinute;
    const openMins = openHour * 60 + openMinute;
    const diffFromOpening = currentMins - openMins;
    const isWithinAutoOpenWindow = diffFromOpening >= -120 && diffFromOpening <= 120;

    await processAutoCheckin(detectedAttendeeIds, isWithinAutoOpenWindow, 'WiFi');

    await checkAutoCheckout();
}
