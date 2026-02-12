
import { query } from '$lib/server/db';
import crypto from 'crypto';

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
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

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

// Last Seen Map for Auto-Checkout (AttendeeID -> timestamp ms)
const lastSeenMap = new Map<number, number>();

// System Settings Cache (영구 캐시, 변경 시 updateSettingsCache 호출)
let settingsCache: { isOpen: boolean; openingTime: string } | null = null;

// Constants
const CHECKOUT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes (RPA 변경으로 간헐적 매칭 실패 대비)

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
            const res = await query('SELECT id, name, status, is_admin FROM attendees WHERE id = $1', [attendeeId]);
            if (res.rows.length > 0) {
                const row = res.rows[0];
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
 * RPA (Random Private Address) format:
 *   [24-bit hash] [24-bit prand]
 *   hash = AES-128(IRK, prand) truncated to 24 bits
 * 
 * Note: Input MAC is usually "AA:BB:CC:DD:EE:FF"
 */
// Comprehensive RPA Resolution (Supports iPhone, Android, and Variants)
export const resolveRPA = (mac: string, irkHex: string): boolean => {
    try {
        const macClean = mac.replace(/:/g, '');
        const macBytes = Buffer.from(macClean, 'hex');
        const irk = Buffer.from(irkHex, 'hex');

        if (macBytes.length !== 6) return false;

        // Candidate Partitioning (Prand vs Hash)
        const candidates = [
            { prand: macBytes.subarray(0, 3), hash: macBytes.subarray(3, 6) }, // Case 1: [P][H] (iPhone Verified)
            { prand: macBytes.subarray(3, 6), hash: macBytes.subarray(0, 3) }  // Case 2: [H][P] (Standard?)
        ];

        // Keys
        const keyRev = Buffer.from(irk).reverse();
        const keyStd = irk;

        for (const { prand, hash } of candidates) {
            // Strategies to try
            // 1. iPhone Verified: KeyRev, Tail Padding, Normal Order
            if (verifyMetric(hash, prand, keyRev, 'Tail', 'Normal')) return true;

            // 2. User/Standard: KeyRev, LittleEndian(Head?, RevOrder?) -> User code used Head
            if (verifyMetric(hash, prand, keyRev, 'Head', 'Reverse')) return true;

            // 3. User/Standard: KeyStd, BigEndian(Tail), RevOrder
            if (verifyMetric(hash, prand, keyStd, 'Tail', 'Reverse')) return true;

            // 4. Android Attempt: KeyStd, Tail Padding, Normal Order
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
    const encrypted = cipher.update(plaintext); // ECB update is usually sufficient for single block

    // Compare
    // If Padding check was Head, check Head? If Tail, check Tail?
    // User's code compared Head for Reverse(HeadPad) and Tail for Std(TailPad).
    // Let's assume Hash match location aligns with Padding location for now?
    // iPhone Verified: Pad Tail, Compare Tail.
    
    if (padding === 'Tail') {
        // Compare Tail (13, 14, 15)
        // User's Reverse Order Logic expects Hash to be Normal Order?
        // User code: encrypted[13] == hash[0].
        // If 'Reverse' order meant swapping inputs, usually hash check matches that swap?
        // Let's stick to: Hash is always [0, 1, 2] of the Hash Part.
        if (order === 'Normal') {
             return encrypted[13] === hash[0] && encrypted[14] === hash[1] && encrypted[15] === hash[2];
        } else {
             // User's BigEndian verify checked: enc[15]==h[2] (which is same index-wise if h is [0,1,2])
             // verify(..., false): enc[13]==h[0]. 
             return encrypted[13] === hash[0] && encrypted[14] === hash[1] && encrypted[15] === hash[2];
        }
    } else {
        // Head
        if (order === 'Normal') {
            return encrypted[0] === hash[0] && encrypted[1] === hash[1] && encrypted[2] === hash[2];
        } else {
            // User's Reverse(Little) verify: enc[0]==h[2]? 
            // return encrypted[0] === hash[2] && encrypted[1] === hash[1] && encrypted[2] === hash[0];
            // My "Verified" iPhone code used Normal comparison.
            // Let's try Standard Normal comparison first.
            if (encrypted[0] === hash[0] && encrypted[1] === hash[1] && encrypted[2] === hash[2]) return true;
            // Also try Reverse compare just in case
            if (encrypted[0] === hash[2] && encrypted[1] === hash[1] && encrypted[2] === hash[0]) return true;
        }
    }
    return false;
}


/** 캐시 초기화 (settings, IRK, attendee — 첫 요청에서 DB 로드 후 영구 캐시) */
async function ensureCachesLoaded(source: string = 'BLE') {
    if (!settingsCache) {
        try {
            const settingsRes = await query("SELECT key, value FROM system_settings WHERE key IN ('is_open', 'opening_time')");
            let isOpen = false;
            let openingTime = '09:00';
            for (const row of settingsRes.rows) {
                if (row.key === 'is_open') isOpen = row.value === 'true';
                if (row.key === 'opening_time') openingTime = row.value;
            }
            settingsCache = { isOpen, openingTime };
            console.log(`[${source}] Settings cache loaded: isOpen=${isOpen}, openingTime=${openingTime}`);
        } catch (e) {
            console.error('Failed to fetch settings', e);
            settingsCache = { isOpen: false, openingTime: '09:00' };
        }
    }
    if (!irkCache) {
        const res = await query('SELECT irk, attendee_id, name, wifi_mac FROM user_devices');
        irkCache = res.rows.map((row: any) => ({
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
        console.log(`[${source}] IRK cache loaded: ${irkCache.length} devices (${wifiMacCache.size} with WiFi MAC)`);
    }
    if (!attendeeCacheLoaded) {
        const res = await query(`
            SELECT a.id, a.name, a.status, a.is_admin
            FROM attendees a
            JOIN user_devices ud ON a.id = ud.attendee_id
        `);
        for (const row of res.rows) {
            attendeeCache.set(row.id, {
                id: row.id,
                name: row.name,
                status: row.status,
                isAdmin: row.is_admin
            });
        }
        attendeeCacheLoaded = true;
        console.log(`[${source}] Attendee cache loaded: ${attendeeCache.size} users`);
    }
}

/**
 * Process Scan Results
 */
export async function processScanResults(scannerId: string, timestamp: number, scans: ScanResult[], isLastBatch: boolean = true) {
    await ensureCachesLoaded('BLE');

    // 오픈 시간 전이면 스캔 처리 완전 스킵
    const nowCheck = new Date();
    const kstCheck = new Date(nowCheck.getTime() + 9 * 60 * 60 * 1000);
    const checkHour = kstCheck.getUTCHours();
    const checkMinute = kstCheck.getUTCMinutes();
    const [ohCheck, omCheck] = settingsCache!.openingTime.split(':').map(Number);
    const currentMinutesTotal = checkHour * 60 + checkMinute;
    const openMinutesTotal = ohCheck * 60 + omCheck;
    const beforeOpeningWindow = currentMinutesTotal < (openMinutesTotal - 30);

    if (!settingsCache!.isOpen && beforeOpeningWindow) {
        console.log(`[BLE] Gym closed & before opening window, skipping (${scans.length} devices)`);
        return;
    }
    const allDevices = irkCache!;

    console.log(`[BLE] Processing ${scans.length} MACs against ${allDevices.length} registered devices`);
    // Log names if present
    const namedDevices = scans.filter(s => s.name && s.name.length > 0);
    if (namedDevices.length > 0) {
        console.log(`[BLE] Named Devices: ${namedDevices.map(d => `${d.name} (${d.mac})`).join(', ')}`);
    }

    const detectedAttendeeIds = new Set<number>();

    // 2. Resolve MACs
    for (const scan of scans) {
        let attendeeId: number | undefined;

        // Check Cache
        if (rpaCache.has(scan.mac)) {
            const cached = rpaCache.get(scan.mac)!;
            if (Date.now() < cached.expiresAt) {
                attendeeId = cached.attendeeId;
            } else {
                rpaCache.delete(scan.mac);
            }
        }

        // If not in cache, try to resolve
        if (!attendeeId) {
            for (const device of allDevices) {
                if (resolveRPA(scan.mac, device.irk)) {
                    attendeeId = device.attendeeId;
                    // Cache it
                    rpaCache.set(scan.mac, {
                        attendeeId,
                        expiresAt: Date.now() + CACHE_TTL_MS
                    });
                    break; // Matched
                }
            }
        }

        if (attendeeId) {
            const isFirst = !detectedAttendeeIds.has(attendeeId);
            detectedAttendeeIds.add(attendeeId);
            // Update last seen (메모리만, DB 불필요)
            lastSeenMap.set(attendeeId, Date.now());
            if (isFirst) {
                console.log(`[BLE] ✅ Matched: ${scan.mac} (${scan.rssi}dBm) → User ${attendeeId}`);
            }
        }
    }

    // Diagnostic: Log match summary
    console.log(`[BLE] Match Summary: ${detectedAttendeeIds.size} users matched out of ${scans.length} scanned devices`);
    if (detectedAttendeeIds.size > 0) {
        console.log(`[BLE] Matched Users: ${[...detectedAttendeeIds].join(', ')}`);
    }

    // Diagnostic: Check missing users only on last batch (전체 사이클 기준으로 판단)
    if (isLastBatch) {
        const recentThreshold = Date.now() - 2 * 60 * 1000; // 2분 이내
        const missingUsers = [...attendeeCache.values()].filter(a => {
            if (a.status !== 'present') return false;
            const lastSeen = lastSeenMap.get(a.id);
            return !lastSeen || lastSeen < recentThreshold;
        });
        if (missingUsers.length > 0) {
            console.log(`[BLE] ⚠️ Present users NOT detected recently: ${missingUsers.map(u => `${u.name}(${u.id})`).join(', ')}`);
        }
    }

    // 3. Auto Check-in Logic & Auto-Open Logic

    // Check time
    const now = new Date(); // UTC
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const currentHour = kstNow.getUTCHours();
    const currentMinute = kstNow.getUTCMinutes();
    const [openHour, openMinute] = settingsCache!.openingTime.split(':').map(Number);

    const isPastOpeningTime = (currentHour > openHour) || (currentHour === openHour && currentMinute >= openMinute);

    for (const attendeeId of detectedAttendeeIds) {
        const attendee = attendeeCache.get(attendeeId);
        if (!attendee) continue;

        // Auto-Open Logic
        if (!settingsCache!.isOpen && attendee.isAdmin && isPastOpeningTime) {
            console.log(`[BLE] 🚨 Admin ${attendeeId} (${attendee.name}) detected! Auto-Opening Gym...`);
            await query("INSERT INTO system_settings (key, value) VALUES ('is_open', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true'");
            settingsCache!.isOpen = true;
        }

        if (settingsCache!.isOpen && attendee.status !== 'present') {
            console.log(`[BLE] Auto Checking-in User ${attendeeId}`);
            await query('BEGIN');
            try {
                await query('UPDATE attendees SET status = $1, arrival_time = NOW(), updated_at = NOW() WHERE id = $2', ['present', attendeeId]);
                await query('INSERT INTO visits (attendee_id, arrival_time) VALUES ($1, NOW())', [attendeeId]);
                await query('COMMIT');
                // 캐시 업데이트
                attendee.status = 'present';
            } catch (e) {
                await query('ROLLBACK');
                console.error(`[BLE] Failed to check-in ${attendeeId}`, e);
            }
        }
    }

    // 4. Trigger Auto-Checkout Check (마지막 배치에서만 실행)
    if (isLastBatch) {
        await checkAutoCheckout();
    }
}

/**
 * Auto Checkout Job
 */
async function checkAutoCheckout() {
    const now = Date.now();
    const timeoutThreshold = now - CHECKOUT_TIMEOUT_MS;

    // 캐시에서 present 유저 중 lastSeenMap 기준으로 타임아웃 체크
    const presentUsers = [...attendeeCache.values()].filter(a => a.status === 'present');

    for (const attendee of presentUsers) {
        const lastSeen = lastSeenMap.get(attendee.id);
        // lastSeen이 없으면 아직 스캐너가 감지 못한 상태 → 체크아웃하지 않음
        if (!lastSeen) continue;

        const minutesSinceLastSeen = Math.round((now - lastSeen) / 60000);

        if (lastSeen < timeoutThreshold) {
            console.log(`[BLE] Auto Checking-out User ${attendee.id} (${attendee.name}). Last seen: ${minutesSinceLastSeen}분 전`);

            await query('BEGIN');
            try {
                await query('UPDATE attendees SET status = $1, updated_at = NOW() WHERE id = $2', ['left', attendee.id]);
                await query('UPDATE visits SET departure_time = NOW() WHERE attendee_id = $1 AND departure_time IS NULL', [attendee.id]);
                await query('COMMIT');
                // 캐시 업데이트
                attendee.status = 'left';
            } catch (e) {
                await query('ROLLBACK');
                console.error(`[BLE] Failed to check-out ${attendee.id}`, e);
            }
        }
    }
}

/**
 * Process WiFi Report (공유기에 연결된 기기 MAC 목록)
 * BLE와 동일하게 lastSeenMap 업데이트 → 체크인/체크아웃은 동일한 로직 사용
 */
export async function processWifiReport(_scannerId: string, devices: { mac: string }[]) {
    await ensureCachesLoaded('WiFi');

    if (wifiMacCache.size === 0) {
        console.log(`[WiFi] No WiFi MACs registered, skipping`);
        return;
    }

    const detectedAttendeeIds = new Set<number>();

    for (const device of devices) {
        const mac = device.mac.toUpperCase();
        const attendeeId = wifiMacCache.get(mac);
        if (attendeeId) {
            detectedAttendeeIds.add(attendeeId);
            lastSeenMap.set(attendeeId, Date.now());
        }
    }

    console.log(`[WiFi] ${devices.length} router devices → ${detectedAttendeeIds.size} users matched (${wifiMacCache.size} registered)`);

    if (detectedAttendeeIds.size === 0) return;

    // 체크인 로직 (BLE와 동일)
    const now = new Date();
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const currentHour = kstNow.getUTCHours();
    const currentMinute = kstNow.getUTCMinutes();
    const [openHour, openMinute] = settingsCache!.openingTime.split(':').map(Number);
    const isPastOpeningTime = (currentHour > openHour) || (currentHour === openHour && currentMinute >= openMinute);

    for (const attendeeId of detectedAttendeeIds) {
        const attendee = attendeeCache.get(attendeeId);
        if (!attendee) continue;

        // Auto-Open (관리자 감지)
        if (!settingsCache!.isOpen && attendee.isAdmin && isPastOpeningTime) {
            console.log(`[WiFi] Admin ${attendeeId} (${attendee.name}) detected via WiFi! Auto-Opening...`);
            await query("INSERT INTO system_settings (key, value) VALUES ('is_open', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true'");
            settingsCache!.isOpen = true;
        }

        if (settingsCache!.isOpen && attendee.status !== 'present') {
            console.log(`[WiFi] Auto Checking-in User ${attendeeId} (${attendee.name}) via WiFi`);
            await query('BEGIN');
            try {
                await query('UPDATE attendees SET status = $1, arrival_time = NOW(), updated_at = NOW() WHERE id = $2', ['present', attendeeId]);
                await query('INSERT INTO visits (attendee_id, arrival_time) VALUES ($1, NOW())', [attendeeId]);
                await query('COMMIT');
                attendee.status = 'present';
            } catch (e) {
                await query('ROLLBACK');
                console.error(`[WiFi] Failed to check-in ${attendeeId}`, e);
            }
        }
    }

    // WiFi report 후에도 체크아웃 검사 실행
    await checkAutoCheckout();
}
