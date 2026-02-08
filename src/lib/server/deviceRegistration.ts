
import { query } from '$lib/server/db';
import { addToIrkCache } from '$lib/server/ble';

export class DeviceRegistrationService {
    // 1. Start Registration: Generate PIN for a device ID
    static async startRegistration(deviceId: string, attendeeId: number, deviceName: string = 'Phone') {
        // Generate 4-digit PIN
        const pin = Math.floor(1000 + Math.random() * 9000).toString();
        const expiresAt = new Date(Date.now() + 120 * 1000); // 120 seconds

        // 만료된 미완료 등록 모두 정리 + 같은 device의 이전 등록 정리
        await query(
            `DELETE FROM device_registrations
             WHERE step != 'completed'
               AND (device_id = $1 OR expires_at < NOW())`,
            [deviceId]
        );

        // Create new
        const res = await query(
            `INSERT INTO device_registrations (device_id, pin, target_attendee_id, step, device_name, expires_at)
             VALUES ($1, $2, $3, 'pending', $4, $5)
             RETURNING id`,
            [deviceId, pin, attendeeId, deviceName, expiresAt]
        );

        return { pin, expiresAt, regId: res.rows[0].id };
    }

    // 2. Poll: Device checks if there is a pending registration
    static async pollForDevice(deviceId: string) {
        const res = await query(
            `SELECT r.*, a.name as attendee_name
             FROM device_registrations r
             JOIN attendees a ON r.target_attendee_id = a.id
             WHERE (r.device_id = $1 OR r.device_id = 'ALL')
               AND r.step = 'pending'
               AND r.expires_at > NOW()
             ORDER BY r.created_at DESC
             LIMIT 1`,
            [deviceId]
        );

        if (res.rows.length === 0) return null;

        const reg = res.rows[0];
        return {
            pin: reg.pin,
            targetName: reg.attendee_name,
            regId: reg.id
        };
    }

    // 3. Upload IRK: ESP32 sends the IRK after successful BLE PIN pairing
    // BLE 레벨에서 PIN 인증 완료 → 바로 user_devices에 등록
    static async uploadIrk(regId: number, irk: string) {
        console.log(`[Service] IRK upload for regId: ${regId}`);

        const regRes = await query(
            'SELECT id, step, target_attendee_id, device_name FROM device_registrations WHERE id = $1 AND step IN ($2, $3)',
            [regId, 'pending', 'polling']
        );

        if (regRes.rows.length === 0) {
            throw new Error('Registration session not found or already completed');
        }

        const attendeeId = regRes.rows[0].target_attendee_id;
        const deviceName = regRes.rows[0].device_name || 'Phone';

        // BLE PIN 인증 완료됐으므로 바로 user_devices에 등록
        await query(
            `INSERT INTO user_devices (attendee_id, irk, name)
             VALUES ($1, $2, $3)
             ON CONFLICT (irk) DO UPDATE SET attendee_id = $1, name = $3, last_seen_at = NOW()`,
            [attendeeId, irk, deviceName]
        );

        await query(
            "UPDATE device_registrations SET step = 'completed', irk = $1 WHERE id = $2",
            [irk, regId]
        );

        await addToIrkCache(attendeeId, irk, deviceName);
        console.log(`[Service] Registration ${regId} completed directly (BLE PIN verified)`);
        return { success: true };
    }

    // 4. Direct Register: Web Bluetooth에서 IRK를 직접 가져온 경우 (Android)
    // PIN 검증 불필요 - 사용자가 자기 폰 브라우저에서 직접 연결했으므로 본인 확인됨
    static async directRegister(attendeeId: number, irk: string, deviceName: string = 'Phone') {
        console.log(`[Service] Direct IRK register for attendee: ${attendeeId}`);

        if (!irk || irk.length !== 32) {
            throw new Error('Invalid IRK format');
        }

        await query(
            `INSERT INTO user_devices (attendee_id, irk, name)
             VALUES ($1, $2, $3)
             ON CONFLICT (irk) DO UPDATE SET attendee_id = $1, name = $3, last_seen_at = NOW()`,
            [attendeeId, irk, deviceName]
        );

        await addToIrkCache(attendeeId, irk, deviceName);
        console.log(`[Service] Direct registration completed for attendee: ${attendeeId}`);
        return { success: true };
    }

    // 5. Verify PIN: 사용자가 웹에서 PIN을 입력하면 IRK를 확정 등록 (iOS 플로우)
    static async verifyAndComplete(regId: number, pin: string) {
        console.log(`[Service] PIN verification for regId: ${regId}`);
        await query('BEGIN');
        try {
            const regRes = await query(
                `SELECT target_attendee_id, pin, irk, device_name
                 FROM device_registrations
                 WHERE id = $1 AND step = 'irk_uploaded'`,
                [regId]
            );

            if (regRes.rows.length === 0) {
                throw new Error('Registration not found or IRK not yet uploaded');
            }

            const reg = regRes.rows[0];

            // PIN 검증
            if (reg.pin !== pin) {
                console.error(`[Service] PIN mismatch for regId: ${regId}`);
                await query('ROLLBACK');
                return { success: false, error: 'PIN이 일치하지 않습니다' };
            }

            // PIN 일치 → IRK를 user_devices에 확정 등록
            await query(
                `INSERT INTO user_devices (attendee_id, irk, name)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (irk) DO UPDATE SET attendee_id = $1, name = $3, last_seen_at = NOW()`,
                [reg.target_attendee_id, reg.irk, reg.device_name || 'Phone']
            );

            await query(
                "UPDATE device_registrations SET step = 'completed' WHERE id = $1",
                [regId]
            );

            await query('COMMIT');
            await addToIrkCache(reg.target_attendee_id, reg.irk, reg.device_name || 'Phone');
            console.log(`[Service] Registration ${regId} completed with PIN verification`);
            return { success: true };
        } catch (e) {
            await query('ROLLBACK');
            console.error('[Service] Error in verifyAndComplete:', e);
            throw e;
        }
    }
}
