
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
// 캐시의 status가 DB와 어긋날 수 있어(QR 체크인·관리자 처리는 캐시를 안 건드림)
// 주기적으로 다시 읽는다. 자세한 이유는 ensureCachesLoaded() 참고.
let attendeeCacheLoadedAt = 0;
const ATTENDEE_CACHE_TTL_MS = 5 * 60 * 1000; // 5분

// Last Seen Maps for Auto-Checkout (AttendeeID -> timestamp ms)
// BLE/WiFi 분리: 둘 중 하나라도 최근 감지되면 체크아웃 방지 (OR 조건)
const lastSeenBleMap = new Map<number, number>();
const lastSeenWifiMap = new Map<number, number>();
// 게임에 참여 중인 것으로 확인된 시각.
//
// BLE/WiFi 맵과 따로 둔다. 게임 참여를 lastSeenBleMap에 적으면 "BLE로 봤다"는
// 기록이 되어, 나중에 auto_checkout_logs의 ble_seen_at을 보고 탐지 상태를
// 진단할 때 실제로는 못 잡은 시간을 잡은 것으로 오해하게 된다.
const lastSeenGameMap = new Map<number, number>();

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
    // GAME은 "게임 참여를 근거로 재실로 판단했다"는 뜻이다. BLE/WiFi로 못 잡았지만
    // 게임 기록상 자리에 있던 경우라, 탐지 상태를 진단할 때 구분되어야 한다.
    source: 'BLE' | 'WiFi' | 'GAME';
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
    lastSeenGameMap.clear();
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
    // 주기적으로 다시 읽는다.
    //
    // 이 캐시의 status는 자동 체크인/체크아웃 경로에서만 갱신된다. QR 체크인
    // (checkin/[token])과 관리자 화면은 DB만 바꾸고 이 캐시는 건드리지 않아서,
    // 그렇게 입장한 회원은 캐시에 'left'로 남는다. checkAutoCheckout은 캐시에서
    // status === 'present'인 사람만 순회하므로 그 회원은 자동 체크아웃 대상에서
    // 통째로 빠진다 — 영업 종료(markAllLeft) 전까지 계속 입장 상태로 남았다.
    //
    // 모든 쓰기 경로가 캐시를 갱신하도록 강제하는 것보다, DB를 주기적으로 다시
    // 읽어 어긋남을 스스로 바로잡는 편이 안전하다(경로가 늘어나도 깨지지 않는다).
    const cacheAge = Date.now() - attendeeCacheLoadedAt;
    if (!attendeeCacheLoaded || cacheAge > ATTENDEE_CACHE_TTL_MS) {
        const res = await db.execute(sql`
            SELECT DISTINCT a.id, a.name, a.status, a.is_admin
            FROM attendees a
            JOIN user_devices ud ON a.id = ud.attendee_id
        `);
        // DB가 원본이므로 통째로 교체한다. 기기를 모두 삭제한 회원처럼 더는
        // 대상이 아닌 항목도 이때 정리된다.
        // (await 없이 동기적으로 교체해 중간 상태가 노출되지 않게 한다)
        attendeeCache.clear();
        for (const row of res) {
            const r = row as any;
            attendeeCache.set(r.id, {
                id: r.id,
                name: r.name,
                status: r.status,
                isAdmin: r.is_admin
            });
        }
        const isReload = attendeeCacheLoaded;
        attendeeCacheLoaded = true;
        attendeeCacheLoadedAt = Date.now();
        if (!isReload) {
            console.log(`[${kstTime()}][${source}] Attendee cache loaded: ${attendeeCache.size} users`);
        }
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
 * Auto Check-in — BLE/WiFi 공통 (1명씩 처리)
 */
export async function processAutoCheckin(detectedAttendeeIds: Set<number>, isWithinAutoOpenWindow: boolean, source: 'BLE' | 'WiFi') {
    for (const attendeeId of detectedAttendeeIds) {
        const attendee = attendeeCache.get(attendeeId);
        if (!attendee) continue;

        // Auto-Open Logic (오픈시간 ±2시간만 허용)
        if (!settingsCache!.isOpen && attendee.isAdmin && isWithinAutoOpenWindow) {
            console.log(`[${kstTime()}][${source}] 🚨 Admin ${attendeeId} (${attendee.name}) detected! Auto-Opening Gym...`);
            await db.execute(sql`INSERT INTO system_settings (key, value) VALUES ('is_open', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true'`);
            settingsCache!.isOpen = true;
            pushAutoLog('auto-open', source, attendee.name, attendeeId);
        }

        if (settingsCache!.isOpen && attendee.status !== 'present') {
            const existing = await db.execute(sql`
                SELECT id FROM visits WHERE attendee_id = ${attendeeId} AND departure_time IS NULL AND arrival_time::date = (NOW() AT TIME ZONE 'Asia/Seoul')::date
            `);
            if (existing.length > 0) {
                console.log(`[${kstTime()}][${source}] User ${attendeeId} already has open visit today, updating status only`);
                await db.transaction(async (tx) => {
                    await tx.execute(sql`UPDATE attendees SET status = 'present', updated_at = NOW() WHERE id = ${attendeeId}`);
                    // 신규 체크인 경로와 동일하게 "오늘 갈 예정"에서도 제거해야 함 —
                    // 여기서 빠져있어서 체크인됐는데도 갈 예정 목록에 계속 남아있던 버그
                    await tx.execute(sql`DELETE FROM daily_visit_plans WHERE attendee_id = ${attendeeId} AND plan_date = CURRENT_DATE`);
                });
                attendee.status = 'present';
                pushAutoLog('checkin', source, attendee.name, attendeeId);
                emitLiveEvent('visitors');
                continue;
            }

            // 오늘 자동 체크아웃된 방문이 있으면 새 방문을 만들지 않고 그것을 다시 연다.
            //
            // 시간 제한을 두지 않는다. 이 기록으로 알고 싶은 것은 "오늘 왔는가"와
            // "얼마나 있었는가"이지 중간에 편의점을 다녀왔는지가 아니다. 사람당
            // 하루 한 방문으로 두면 방문 횟수·체류 시간·자주 만난 친구가 모두
            // 탐지 품질에 흔들리지 않는다. 실제로 어떤 회원은 자리에 앉아 있었는데도
            // 하루가 네 조각으로 남았다(19:17~21:15, 21:26~21:47, 22:21~22:54,
            // 22:57~23:08).
            //
            // 다만 수동 체크아웃은 병합하지 않는다. 관리자가 손으로 내보낸 것은
            // "나갔다"는 사람의 판단이라 되돌리면 안 되고, 마감 처리 후 스친 신호가
            // 방문을 다시 열어버리는 것도 막아야 한다. auto_checkout_logs의
            // checked_out_at과 visits.departure_time이 같은 트랜잭션의 NOW()라
            // 정확히 일치하는 점으로 구분한다.
            //
            // 자정을 넘겨 운영하면 날짜가 갈리며 방문이 나뉜다. 바로 위의
            // "이미 열린 방문" 판정도 같은 기준을 쓰므로 동작이 어긋나지는 않는다.
            let merged = false;
            try {
                const reopened = (await db.execute(sql`
                    UPDATE visits v
                    SET departure_time = NULL
                    WHERE v.id = (
                        SELECT v2.id FROM visits v2
                        JOIN auto_checkout_logs l
                          ON l.attendee_id = v2.attendee_id
                         AND l.checked_out_at = v2.departure_time
                        WHERE v2.attendee_id = ${attendeeId}
                          AND v2.departure_time IS NOT NULL
                          AND (v2.arrival_time AT TIME ZONE 'Asia/Seoul')::date
                              = (NOW() AT TIME ZONE 'Asia/Seoul')::date
                        ORDER BY v2.departure_time DESC
                        LIMIT 1
                    )
                    RETURNING v.id
                `)) as any[];
                merged = reopened.length > 0;
                if (merged) {
                    console.log(`[${kstTime()}][${source}] User ${attendeeId} 직전 자동 체크아웃을 취소하고 방문을 이어붙임 (visit ${reopened[0].id})`);
                }
            } catch (e) {
                // 병합에 실패해도 체크인 자체는 진행한다. 방문이 쪼개질 뿐이다.
                console.error(`[${kstTime()}][${source}] 방문 병합 실패 (새 방문으로 진행)`, e);
            }

            console.log(`[${kstTime()}][${source}] Auto Checking-in User ${attendeeId}`);
            try {
                await db.transaction(async (tx) => {
                    await tx.execute(sql`UPDATE attendees SET status = 'present', updated_at = NOW() WHERE id = ${attendeeId}`);
                    if (!merged) {
                        // 병합했으면 arrival_time을 건드리지 않는다. 덮어쓰면 처음
                        // 도착한 시각이 사라져 체류 시간이 잘못 계산된다.
                        await tx.execute(sql`UPDATE attendees SET arrival_time = NOW() WHERE id = ${attendeeId}`);
                        await tx.execute(sql`INSERT INTO visits (attendee_id, arrival_time) VALUES (${attendeeId}, NOW())`);
                    }
                    await tx.execute(sql`DELETE FROM daily_visit_plans WHERE attendee_id = ${attendeeId} AND plan_date = CURRENT_DATE`);
                });
                attendee.status = 'present';
                pushAutoLog('checkin', source, attendee.name, attendeeId);
                emitLiveEvent('visitors');
            } catch (e) {
                console.error(`[${source}] Failed to check-in ${attendeeId}`, e);
            }
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

    // 디버그: 체크아웃 임박 유저만 출력 (lastSeen > threshold의 절반)
    const warnThreshold = now - CHECKOUT_TIMEOUT_MS / 2;
    for (const attendee of presentUsers) {
        const bleSeen = lastSeenBleMap.get(attendee.id) ?? 0;
        const wifiSeen = lastSeenWifiMap.get(attendee.id) ?? 0;
        const lastSeen = Math.max(bleSeen, wifiSeen);
        if (lastSeen > 0 && lastSeen < warnThreshold) {
            const agoMin = Math.round((now - lastSeen) / 60000);
            console.log(`[${kstTime()}][AUTO] ⚠️ ${attendee.name}(${attendee.id}) lastSeen=${agoMin}min ago, threshold=${CHECKOUT_TIMEOUT_MS / 60000}min, playing=${playingUserIds.has(attendee.id)}`);
        }
    }

    for (const attendee of presentUsers) {
        if (playingUserIds.has(attendee.id)) {
            // 게임 중이면 자리에 있는 것이 확실하다.
            //
            // 예전에는 체크아웃만 건너뛰었다. 그런데 미탐지 시간은 그동안에도
            // 계속 쌓이기 때문에, 게임이 끝나는 순간 누적된 시간이 임계를 넘겨
            // 곧바로 체크아웃됐다. 두 시간짜리 게임을 끝내고 일어서자마자
            // "나간 사람"이 되는 셈이다.
            //
            // 게임 참여 자체를 '봤다'로 취급해 시계를 되감는다. 게임이 끝난 뒤
            // 다시 20분을 못 잡아야 체크아웃된다.
            lastSeenGameMap.set(attendee.id, now);
            continue;
        }
        const bleSeen = lastSeenBleMap.get(attendee.id) ?? 0;
        const wifiSeen = lastSeenWifiMap.get(attendee.id) ?? 0;
        const gameSeen = lastSeenGameMap.get(attendee.id) ?? 0;
        const lastSeen = Math.max(bleSeen, wifiSeen, gameSeen);

        if (lastSeen === 0) continue;

        if (lastSeen < timeoutThreshold) {
            const bleAgo = bleSeen ? `${Math.round((now - bleSeen) / 60000)}분 전` : 'never';
            const wifiAgo = wifiSeen ? `${Math.round((now - wifiSeen) / 60000)}분 전` : 'never';
            // 무엇을 근거로 '마지막에 봤다'고 판단했는지. 게임 참여가 근거였다면
            // BLE로 잡았다고 적으면 안 된다 — 사후 진단이 어긋난다.
            const lastSource =
                gameSeen >= bleSeen && gameSeen >= wifiSeen
                    ? 'GAME'
                    : bleSeen >= wifiSeen
                      ? 'BLE'
                      : 'WiFi';
            console.log(`[${kstTime()}][AUTO] Checking-out User ${attendee.id} (${attendee.name}). BLE: ${bleAgo}, WiFi: ${wifiAgo}`);

            try {
                await db.transaction(async (tx) => {
                    await tx.execute(sql`UPDATE attendees SET status = 'left', updated_at = NOW() WHERE id = ${attendee.id}`);
                    await tx.execute(sql`UPDATE visits SET departure_time = NOW() WHERE attendee_id = ${attendee.id} AND departure_time IS NULL`);
                    // 판정 근거를 남긴다. 메모리 로그(autoLogs)는 100건에서 잘리고
                    // 재시작하면 사라져서 사후 분석이 불가능했다.
                    // idle_seconds가 있으면 "임계값을 아슬아슬하게 넘겼다"와
                    // "몇 시간째 못 잡았다"를 구분할 수 있다 — 원인이 전혀 다르다.
                    // 시각은 Date 객체가 아니라 ISO 문자열로 넘긴다.
                    // tx.execute(sql`...`)는 postgres.js의 unsafe()로 내려가 파라미터
                    // 타입 추론을 하지 않기 때문에, Date를 그대로 주면 Bind 단계에서
                    // ERR_INVALID_ARG_TYPE로 던진다. 이 INSERT는 위의 UPDATE 두 개와
                    // 같은 트랜잭션이므로, 실패하면 체크아웃 자체가 롤백된다.
                    await tx.execute(sql`
                        INSERT INTO auto_checkout_logs
                            (attendee_id, last_seen_at, last_source, ble_seen_at, wifi_seen_at,
                             idle_seconds, timeout_seconds)
                        VALUES (
                            ${attendee.id},
                            ${lastSeen > 0 ? new Date(lastSeen).toISOString() : null},
                            ${lastSource},
                            ${bleSeen > 0 ? new Date(bleSeen).toISOString() : null},
                            ${wifiSeen > 0 ? new Date(wifiSeen).toISOString() : null},
                            ${lastSeen > 0 ? Math.round((now - lastSeen) / 1000) : null},
                            ${Math.round(CHECKOUT_TIMEOUT_MS / 1000)}
                        )
                    `);
                });
                attendee.status = 'left';
                lastSeenBleMap.delete(attendee.id);
                lastSeenWifiMap.delete(attendee.id);
                lastSeenGameMap.delete(attendee.id);
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
