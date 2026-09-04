
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { addToIrkCache } from '$lib/server/ble';

const BLE_SERVER_URL = process.env.BLE_SERVER_URL || 'http://ble-server:3001';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

async function notifyBleServerIrkAdd(attendeeId: number, irkHex: string) {
    if (!INTERNAL_API_KEY) {
        console.error('[IRK] INTERNAL_API_KEY 환경변수가 설정되지 않아 BLE 서버 알림을 건너뜁니다.');
        return;
    }
    try {
        await fetch(`${BLE_SERVER_URL}/irk/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-key': INTERNAL_API_KEY },
            body: JSON.stringify({ attendee_id: attendeeId, irk_hex: irkHex })
        });
    } catch (e) {
        console.error('[IRK] Failed to notify BLE server (add):', e);
    }
}

export class DeviceRegistrationService {
    static async startRegistration(deviceId: string, attendeeId: number, deviceName: string = 'Phone') {
        const pin = Math.floor(1000 + Math.random() * 9000).toString();
        const expiresAt = new Date(Date.now() + 120 * 1000);

        await db.execute(sql`
            DELETE FROM device_registrations
            WHERE step != 'completed'
              AND (device_id = ${deviceId} OR expires_at < NOW())
        `);

        const res = await db.execute(sql`
            INSERT INTO device_registrations (device_id, pin, target_attendee_id, step, device_name, expires_at)
            VALUES (${deviceId}, ${pin}, ${attendeeId}, 'pending', ${deviceName}, ${expiresAt.toISOString()})
            RETURNING id
        `);

        return { pin, expiresAt, regId: (res[0] as any).id };
    }

    static async pollForDevice(deviceId: string) {
        const res = await db.execute(sql`
            SELECT r.*, a.name as attendee_name
            FROM device_registrations r
            JOIN attendees a ON r.target_attendee_id = a.id
            WHERE (r.device_id = ${deviceId} OR r.device_id = 'ALL')
              AND r.step = 'pending'
              AND r.expires_at > NOW()
            ORDER BY r.created_at DESC
            LIMIT 1
        `);

        if (res.length === 0) return null;

        const reg = res[0] as any;
        return {
            pin: reg.pin,
            targetName: reg.attendee_name,
            regId: reg.id
        };
    }

    static async uploadIrk(regId: number, irk: string) {
        console.log(`[Service] IRK upload for regId: ${regId}`);

        const regRes = await db.execute(sql`
            SELECT id, step, target_attendee_id, device_name FROM device_registrations
            WHERE id = ${regId} AND step IN ('pending', 'polling')
        `);

        if (regRes.length === 0) {
            throw new Error('Registration session not found or already completed');
        }

        const reg = regRes[0] as any;
        const attendeeId = reg.target_attendee_id;
        const deviceName = reg.device_name || 'Phone';

        await db.execute(sql`
            INSERT INTO user_devices (attendee_id, irk, name)
            VALUES (${attendeeId}, ${irk}, ${deviceName})
            ON CONFLICT (irk) DO UPDATE SET attendee_id = ${attendeeId}, name = ${deviceName}, last_seen_at = NOW()
        `);

        await db.execute(sql`
            UPDATE device_registrations SET step = 'completed', irk = ${irk} WHERE id = ${regId}
        `);

        await addToIrkCache(attendeeId, irk, deviceName);
        notifyBleServerIrkAdd(attendeeId, irk);
        console.log(`[Service] Registration ${regId} completed directly (BLE PIN verified)`);
        return { success: true };
    }

    static async directRegister(attendeeId: number, irk: string, deviceName: string = 'Phone') {
        console.log(`[Service] Direct IRK register for attendee: ${attendeeId}`);

        if (!irk || irk.length !== 32) {
            throw new Error('Invalid IRK format');
        }

        await db.execute(sql`
            INSERT INTO user_devices (attendee_id, irk, name)
            VALUES (${attendeeId}, ${irk}, ${deviceName})
            ON CONFLICT (irk) DO UPDATE SET attendee_id = ${attendeeId}, name = ${deviceName}, last_seen_at = NOW()
        `);

        await addToIrkCache(attendeeId, irk, deviceName);
        notifyBleServerIrkAdd(attendeeId, irk);
        console.log(`[Service] Direct registration completed for attendee: ${attendeeId}`);
        return { success: true };
    }

    static async verifyAndComplete(regId: number, pin: string) {
        console.log(`[Service] PIN verification for regId: ${regId}`);
        const result = await db.transaction(async (tx) => {
            const regRes = await tx.execute(sql`
                SELECT target_attendee_id, pin, irk, device_name
                FROM device_registrations
                WHERE id = ${regId} AND step = 'irk_uploaded'
            `);

            if (regRes.length === 0) {
                throw new Error('Registration not found or IRK not yet uploaded');
            }

            const reg = regRes[0] as any;

            if (reg.pin !== pin) {
                console.error(`[Service] PIN mismatch for regId: ${regId}`);
                return { success: false as const, error: 'PIN이 일치하지 않습니다' };
            }

            await tx.execute(sql`
                INSERT INTO user_devices (attendee_id, irk, name)
                VALUES (${reg.target_attendee_id}, ${reg.irk}, ${reg.device_name || 'Phone'})
                ON CONFLICT (irk) DO UPDATE SET attendee_id = ${reg.target_attendee_id}, name = ${reg.device_name || 'Phone'}, last_seen_at = NOW()
            `);

            await tx.execute(sql`
                UPDATE device_registrations SET step = 'completed' WHERE id = ${regId}
            `);

            return { success: true as const, attendeeId: reg.target_attendee_id, irk: reg.irk, deviceName: reg.device_name || 'Phone' };
        });

        if (result.success) {
            await addToIrkCache(result.attendeeId, result.irk, result.deviceName);
            notifyBleServerIrkAdd(result.attendeeId, result.irk);
            console.log(`[Service] Registration ${regId} completed with PIN verification`);
        }
        return { success: result.success, ...(result.success ? {} : { error: (result as any).error }) };
    }
}
