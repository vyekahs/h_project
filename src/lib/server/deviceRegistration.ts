
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
    /**
     * 등록 기기가 지금 서버와 통신 중인지.
     *
     * 등록은 PIN을 서버에서 받아 오고 IRK를 서버로 올리므로, 기기가 인터넷에
     * 닿지 못하면 성립하지 않는다. 그런데 사용자 화면에서는 PIN이 멀쩡히 뜨고
     * 아무 일도 일어나지 않아서, 뭐가 잘못됐는지 알 수가 없다.
     * 시작하기 전에 확인해서 이유를 알려준다.
     */
    static async isRegistrationDeviceOnline(): Promise<boolean> {
        try {
            const rows = (await db.execute(sql`
                SELECT last_seen_at > NOW() - ${sql.raw(DeviceRegistrationService.DEVICE_STALE_AFTER)} AS alive
                FROM scanners WHERE id = 'esp32_s3_registration'
            `)) as any[];
            return rows[0]?.alive === true;
        } catch (e) {
            // 확인할 수 없으면 막지 않는다. 이 점검 때문에 멀쩡한 등록이
            // 실패하는 쪽이 더 나쁘다.
            console.error('[Register] 기기 상태 확인 실패 — 진행한다:', e);
            return true;
        }
    }

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

    /** 등록 기기(S3)가 살아 있다고 볼 수 있는 최대 무응답 시간. 폴링은 15초 주기다. */
    static readonly DEVICE_STALE_AFTER = "INTERVAL '90 seconds'";

    static async pollForDevice(deviceId: string) {
        // 폴링 자체를 하트비트로 쓴다.
        //
        // 예전에는 scanners.last_seen_at이 부팅 시 IP 등록 때만 갱신돼서, 기기가
        // 며칠 전에 죽어도 그 값이 그대로 남아 있었다. 살아 있는지 알 방법이
        // 없으니 "등록을 눌렀는데 아무 일도 안 일어난다"를 설명할 수 없었다.
        //
        // 응답을 막지 않도록 기다리지 않는다(fire-and-forget). 하트비트가 한 번
        // 빠지는 것보다 폴링이 느려지는 쪽이 나쁘다.
        db.execute(sql`
            INSERT INTO scanners (id, last_seen_at, status)
            VALUES ('esp32_s3_registration', NOW(), 'active')
            ON CONFLICT (id) DO UPDATE SET last_seen_at = NOW(), status = 'active'
        `).catch(e => console.error('[Register] 하트비트 갱신 실패', e));

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
