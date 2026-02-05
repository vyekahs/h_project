
import { query } from '$lib/server/db';

export class DeviceRegistrationService {
    // 1. Start Registration: Generate PIN for a device ID
    static async startRegistration(deviceId: string, attendeeId: number) {
        // Generate 4-digit PIN
        const pin = Math.floor(1000 + Math.random() * 9000).toString();
        const expiresAt = new Date(Date.now() + 60 * 1000); // 60 seconds

        // Cleanup old ones for this device
        await query('DELETE FROM device_registrations WHERE device_id = $1', [deviceId]);

        // Create new
        const res = await query(
            `INSERT INTO device_registrations (device_id, pin, target_attendee_id, step, expires_at)
             VALUES ($1, $2, $3, 'pending', $4)
             RETURNING id`,
            [deviceId, pin, attendeeId, expiresAt]
        );

        return { pin, expiresAt, regId: res.rows[0].id };
    }

    // 2. Poll: Device checks if there is a pending registration
    static async pollForDevice(deviceId: string) {
        // Check for specific device ID OR wildcard 'ALL'
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
        
        // Update step to 'polling' so we don't spam? 
        // Or keep 'pending' until device confirms it changed name?
        // Let's notify device once.
        return {
            pin: reg.pin,
            targetName: reg.attendee_name,
            regId: reg.id
        };
    }

    // 3. Complete: ESP32 sends the IRK after successful pairing
    static async completeRegistration(regId: number, irk: string) {
        console.log(`[Service] Starting completion for regId: ${regId}`);
        await query('BEGIN');
        try {
            const regRes = await query(
                'SELECT target_attendee_id FROM device_registrations WHERE id = $1 AND step != $2',
                [regId, 'completed']
            );

            if (regRes.rows.length === 0) {
                console.error(`[Service] Session ${regId} not found or already completed`);
                throw new Error('Registration session not found or already completed');
            }

            const attendeeId = regRes.rows[0].target_attendee_id;
            console.log(`[Service] Found attendeeId: ${attendeeId} for session: ${regId}`);

            await query(
                `INSERT INTO user_devices (attendee_id, irk, name)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (irk) DO UPDATE SET attendee_id = $1, last_seen_at = NOW()`,
                [attendeeId, irk, "Phone"]
            );
            console.log(`[Service] IRK ${irk} associated with attendee ${attendeeId}`);

            await query(
                "UPDATE device_registrations SET step = 'completed' WHERE id = $1",
                [regId]
            );

            await query('COMMIT');
            console.log(`[Service] Registration ${regId} marked as completed`);
            return { success: true };
        } catch (e) {
            await query('ROLLBACK');
            console.error('[Service] Error in completeRegistration:', e);
            throw e;
        }
    }
}
