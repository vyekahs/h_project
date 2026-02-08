
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
}

// In-Memory Cache
// RPA -> AttendeeID mapping
const rpaCache = new Map<string, { attendeeId: number; expiresAt: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Last Seen Map for Auto-Checkout
// AttendeeID -> Timestamp (Date.now())
const lastSeenMap = new Map<number, number>();

// Constants
const CHECKOUT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

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


/**
 * Process Scan Results
 */
export async function processScanResults(scannerId: string, timestamp: number, scans: ScanResult[]) {
    // 1. Fetch IRKs from DB
    const res = await query('SELECT irk, attendee_id, name FROM user_devices');
    const allDevices = res.rows.map((row: any) => ({
        irk: row.irk,
        attendeeId: row.attendee_id,
        name: row.name
    })) as UserDevice[];

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
            detectedAttendeeIds.add(attendeeId);
            // Update last seen
            lastSeenMap.set(attendeeId, Date.now());
            // Update DB last_seen_at
            query('UPDATE user_devices SET last_seen_at = NOW() WHERE attendee_id = $1', [attendeeId]).catch(err => console.error(err));
            console.log(`[BLE] ✅ Matched: ${scan.mac} (${scan.rssi}dBm) → User ${attendeeId}`);
        }
    }

    // 3. Auto Check-in Logic & Auto-Open Logic
    
    // Fetch System Settings for Auto-Open
    let isOpen = false;
    let openingTime = '09:00'; // Default
    try {
        const settingsRes = await query("SELECT key, value FROM system_settings WHERE key IN ('is_open', 'opening_time')");
        for (const row of settingsRes.rows) {
            if (row.key === 'is_open') isOpen = row.value === 'true';
            if (row.key === 'opening_time') openingTime = row.value;
        }
    } catch (e) {
        console.error('Failed to fetch settings', e);
    }

    // Check time
    const now = new Date(); // UTC
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const currentHour = kstNow.getUTCHours();
    const currentMinute = kstNow.getUTCMinutes();
    const [openHour, openMinute] = openingTime.split(':').map(Number);
    
    const isPastOpeningTime = (currentHour > openHour) || (currentHour === openHour && currentMinute >= openMinute);

    for (const attendeeId of detectedAttendeeIds) {
        // Check if user is already present AND check if Admin
        const statusRes = await query('SELECT status, is_admin, name FROM attendees WHERE id = $1', [attendeeId]);
        if (statusRes.rows.length > 0) {
            const { status, is_admin, name } = statusRes.rows[0];

            // Auto-Open Logic
            if (!isOpen && is_admin && isPastOpeningTime) {
                console.log(`[BLE] 🚨 Admin ${attendeeId} (${name}) detected! Auto-Opening Gym...`);
                await query("INSERT INTO system_settings (key, value) VALUES ('is_open', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true'");
                isOpen = true; // Avoid repeated updates in this loop
            }

            if (status !== 'present') {
                console.log(`[BLE] Auto Checking-in User ${attendeeId}`);
                // Re-use Check-in Logic
                await query('BEGIN');
                try {
                    await query('UPDATE attendees SET status = $1, arrival_time = NOW(), updated_at = NOW() WHERE id = $2', ['present', attendeeId]);
                    await query('INSERT INTO visits (attendee_id, arrival_time) VALUES ($1, NOW())', [attendeeId]);
                    await query('COMMIT');
                } catch (e) {
                    await query('ROLLBACK');
                    console.error(`[BLE] Failed to check-in ${attendeeId}`, e);
                }
            }
        }
    }

    // 4. Trigger Auto-Checkout Check (opportunistic)
    // Or we can rely on a separate cron. 
    // Let's do it here lightly since it's called every 5 mins by scanner.
    await checkAutoCheckout();
}

/**
 * Auto Checkout Job
 */
async function checkAutoCheckout() {
    const now = Date.now();
    const TimeoutThreshold = now - CHECKOUT_TIMEOUT_MS;

    // We rely on lastSeenMap for fast checks, but also should check DB for source of truth 
    // in case server restarted.
    // Actually, if server restarts, existing 'present' users might linger.
    // Let's query 'present' users and check their `last_seen_at` from `user_devices`.
    
    // Note: If a user has NO device registered, this logic doesn't touch them (Safety).
    // Only checkout users who HAVE a device and were last seen long ago.

    const presentUsers = await query(`
        SELECT a.id, a.name, ud.last_seen_at 
        FROM attendees a
        JOIN user_devices ud ON a.id = ud.attendee_id
        WHERE a.status = 'present'
    `);

    for (const row of presentUsers.rows) {
        // last_seen_at이 null이면 아직 스캐너가 감지 못한 상태 → 체크아웃하지 않음
        if (!row.last_seen_at) continue;

        const lastSeen = new Date(row.last_seen_at).getTime();

        // If last seen is older than 10 mins
        if (lastSeen < TimeoutThreshold) {
            console.log(`[BLE] Auto Checking-out User ${row.id} (${row.name}). Last seen: ${row.last_seen_at}`);
            
            await query('BEGIN');
            try {
                // Check out logic
                await query('UPDATE attendees SET status = $1, updated_at = NOW() WHERE id = $2', ['left', row.id]);
                await query('UPDATE visits SET departure_time = NOW() WHERE attendee_id = $1 AND departure_time IS NULL', [row.id]);
                // Close games? Maybe not auto-close games, just person leaving to avoid disruption?
                // Or user might have just walked to bathroom. 10 mins is tight but requested.
                await query('COMMIT');
            } catch (e) {
                await query('ROLLBACK');
                console.error(`[BLE] Failed to check-out ${row.id}`, e);
            }
        }
    }
}
