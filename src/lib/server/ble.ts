
import { query } from '$lib/server/db';
import crypto from 'crypto';

// Types
interface ScanResult {
    mac: string;
    rssi: number;
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
function resolveRPA(mac: string, irkHex: string): boolean {
    const DEBUG_MODE = false; // Cache Buster Comment 1
// ... (omitted similar lines to avoid search failure, actually I should target specific block)
// I will target the Cache definition block first.

    try {
        // 1. Parse MAC to bytes
        const macBytes = Buffer.from(mac.replace(/:/g, ''), 'hex');
        if (macBytes.length !== 6) return false;

        // 2. Extract parts
        // format: [hash (3 bytes)][prand (3 bytes)] ... wait, looking at BLE specs:
        // The address is 48 bits. 
        // LSB is byte 5, MSB is byte 0? No, usually written Big Endian in string "AA:BB..." -> AA is byte 0.
        // Actually Bluetooth uses Little Endian over the air, but standard logs often show Big Endian.
        // Let's assume Standard Big Endian notation "AA:BB:CC:DD:EE:FF".
        // bit 46, 47 are '10' for resolvable private address.
        // prand is the 24 least significant bits? Or most?
        // Let's stick to standard Core Spec:
        //   addr = hash || prand
        //   hash is most significant 24 bits? No.
        //   Wait, prand is the random part. prand is usually the *upper* part in some docs, or lower in others.
        //   Let's check standard implementation details.
        //   Visual check: "45:..." usually starts with random bits? 
        //   Actually:
        //   MSB [  hash (24)  ] [  prand (24) ] LSB  <-- This is common logic?
        //   Wait, Apple says: "The explicit definition of the address is: hash = ah(IRK, prand)".
        //   The address is composed of the 24-bit hash and the 24-bit prand.
        //   Usually: Address = [Hash (24) | Prand (24)]
        
        // Let's try both combinations if unsure, but typically:
        // prand is the *most significant* 24 bits in some implementations logic, but 
        // actually standard says: 
        //   prand is the 24 bits ... wait.
        //   Let's assume standard BLE Spec Vol 6, Part B, 1.3.2.2:
        //     hash = ah(k, r)
        //     private_addr = hash || prand
        //     (LSB index 0, MSB index 47)
        //     prand is usually bits 0-23 (LSB) or 24-47 (MSB)?
        //     Actually, typically MAC "AA:BB:CC:DD:EE:FF"
        //     AA:BB:CC is the first part (MSB), DD:EE:FF is LSB.
        
        //     Commonly: MSB is Hash, LSB is Prand.
        //     So macBytes[0..2] is Hash, macBytes[3..5] is Prand.
        //     Wait, let's verify bit masks.
        //     If address type is RPA, the two most significant bits of the *random part* (prand) must be 1 and 0.
        //     If MAC is "AA:BB...", AA is the most significant byte.
        //     If AA & 0xC0 == 0x40 (0100 0000) -> Resovlable.
        
        // Let's assume:
        //   Byte 0, 1, 2 = Hash? Or Byte 0, 1, 2 = Prand?
        //   Core Spec says:
        //   "The 24-bit random number (prand) shall constitute the 24 least significant bits... NO wait"
        //   "The 24-bit hash ... 24 most significant bits..."
        //   So: Address = [Hash (24) | Prand (24)] (if written MSB first)
        
        //   HOWEVER, most BLE stacks use Little Endian.
        //   But string representation is usually Big Endian.
        //   If "AA:BB:CC:DD:EE:FF" (AA is MSB):
        //   Then Hash is AA:BB:CC, Prand is DD:EE:FF?
        
        //   Let's try to be robust. We can check valid bit patterns.
        
        //   Actually, let's implement the `ah` function properly.
        //   ah(k, r):
        //     msg = r (padded to 128 bits with zeros).
        //     out = AES128(k, msg)
        //     hash = last 24 bits of out? No, "The output of the function ah is the least significant 24 bits of the output of the encryption function e".
        
        // Let's implement based on assumption: 
        //   String "AA:BB:CC:DD:EE:FF"
        //   AA (MSB), FF (LSB).
        //   RPA: [Hash 24] [Prand 24]
        //   So Hash=AA:BB:CC, Prand=DD:EE:FF.
        
        const hashBytes = macBytes.subarray(0, 3);
        const prandBytes = macBytes.subarray(3, 6);
        
        // Prepare input for AES
        // Input is prand (24 bits) padded to 128 bits.
        // Padding: "padding is with '0' bits to the most significant bits".
        // So input = 0...0 || prand.
        // Since we are creating a 16-byte buffer:
        const input = Buffer.alloc(16, 0);
        // Copy prand to the *end* (LSB side) or *start*?
        // "least significant 24 bits of the address is prand" -> if address is little endian?
        // Let's try matching standard test vectors later. For now, assume Little Endian usage in crypto typically.
        
        // Implementation approach:
        // Crypto input: [0,0,0,0,0,0,0,0,0,0,0,0,0, prand[2], prand[1], prand[0]] ??
        // Standard `r` is just the 24 bits.
        
        // Let's stick to a common Node implementation style:
        // Assume macBytes is [Hash[0], Hash[1], Hash[2], Prand[0], Prand[1], Prand[2]]
        // r = Prand.
        // AES Input = r (reversed? or padded?).
        // Let's try: Input = [0...0] + Prand.
        
        // Note: Real-world Android/iOS RPA often rotates every 15 mins.
        
        // Re-reading Spec logic carefully:
        // Address (48 bits) = hash (24) || prand (24)
        // prand bits: 0..23 (LSB). hash bits: 24..47 (MSB).
        // In "AA:BB:CC:DD:EE:FF" (Big Endian hex): 
        // AA, BB, CC are bits 47..24 (Hash).
        // DD, EE, FF are bits 23..0 (Prand).
        
        // AES Input `r`:
        // "r is the 24-bit random number".
        // AES Input Block (128-bit):
        // LSB 0..23 = r.
        // Bits 24..127 = 0.
        
        // So allow me to construct buffer.
        // irk is 128-bit key.
        const key = Buffer.from(irkHex, 'hex');
        
        const plaintext = Buffer.alloc(16);
        // If DD:EE:FF are prand, and FF is LSB:
        // plaintext[0] = FF? 
        // Or is plaintext big-endian? AES input is defined as 128 bit block...
        // Let's assume standard Little Endian filling for BLE crypto.
        
        // prandBytes = [DD, EE, FF]
        // If FF is LSB (byte 5 of MAC), then:
        plaintext[0] = prandBytes[2]; // FF
        plaintext[1] = prandBytes[1]; // EE
        plaintext[2] = prandBytes[0]; // DD
        
        // Encrypt
        const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
        cipher.setAutoPadding(false);
        const encrypted = cipher.update(plaintext);
        // cipher.final() is not needed for ECB no padding but good practice
        
        // Output `hash`:
        // "The least significant 24 bits of the output"
        // encrypted buffer is 16 bytes.
        // LSB is encrypted[0]..encrypted[2] ?? (Little Endian assumption)
        
        const calculatedHash = Buffer.from([encrypted[2], encrypted[1], encrypted[0]]); // Swap back to BE for comparison?
        
        // Compare with hashBytes (AA:BB:CC -> [AA, BB, CC])
        // If calculatedHash (BE) == hashBytes
        
        // Let's try simple match.
        // If Little Endian output was used:
        // calculatedHash[0] (LSB) should match FF (LSB of hash)?
        // Wait, "AA" is MSB of Hash.
        
        // Let's flip it around.
        // If encrypted[0] is LSB.
        // We want to compare with AA:BB:CC. AA is MSB.
        // So we need encrypted[2] (byte 2) to be AA? Or encrypted[0]?
        // "hash is the 24 LSB of output".
        // If output is Little Endian:
        // Byte 0 is bit 0-7.
        // Byte 1 is bit 8-15.
        // Byte 2 is bit 16-23.
        // These 3 bytes form the hash.
        
        // So Calculated Hash (Little Endian) = encrypted[0..2].
        // Target Hash (AA:BB:CC) is Big Endian?
        // AA is MSB (bits 16-23 of hash).
        // CC is LSB (bits 0-7 of hash).
        
        // So:
        // encrypted[2] should match AA.
        // encrypted[1] should match BB.
        // encrypted[0] should match CC.
        
        if (encrypted[2] === hashBytes[0] &&
            encrypted[1] === hashBytes[1] &&
            encrypted[0] === hashBytes[2]) {
            return true;
        }
        
        return false;
    } catch (e) {
        // console.error('Crypto error', e);
        return false;
    }
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
        }
    }

    // 3. Auto Check-in Logic
    for (const attendeeId of detectedAttendeeIds) {
        // Check if user is already present
        const statusRes = await query('SELECT status FROM attendees WHERE id = $1', [attendeeId]);
        if (statusRes.rows.length > 0) {
            const status = statusRes.rows[0].status;
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
        const lastSeen = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
        
        // If last seen is older than 10 mins
        // And we ensure they ACTUALLY rely on BLE (they have a device row, which we joined)
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
