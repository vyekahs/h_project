import { json } from '@sveltejs/kit';
import { query } from '$lib/server/db';
import { addWifiMacToCache } from '$lib/server/ble';

// POST /api/devices/register/wifi
// WiFi MAC 주소 등록 (등록 페이지에서 ESP32-S3 로컬 서버로 MAC 감지 후 호출)
export async function POST({ request }: { request: Request }) {
    try {
        const body = await request.json();
        const { attendeeId, wifiMac } = body;

        if (!attendeeId || !wifiMac) {
            return json({ error: 'Missing attendeeId or wifiMac' }, { status: 400 });
        }

        // MAC 형식 검증 (XX:XX:XX:XX:XX:XX)
        const macRegex = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;
        if (!macRegex.test(wifiMac)) {
            return json({ error: 'Invalid MAC format' }, { status: 400 });
        }

        const mac = wifiMac.toUpperCase();

        // 해당 유저의 기기가 있는지 확인
        const deviceRes = await query(
            'SELECT id FROM user_devices WHERE attendee_id = $1 LIMIT 1',
            [attendeeId]
        );

        if (deviceRes.rows.length === 0) {
            return json({ error: 'No registered device found. Register BLE first.' }, { status: 400 });
        }

        // WiFi MAC 업데이트
        await query(
            'UPDATE user_devices SET wifi_mac = $1 WHERE attendee_id = $2',
            [mac, attendeeId]
        );

        await addWifiMacToCache(attendeeId, mac);

        console.log(`[WiFi] MAC registered: ${mac} for attendee ${attendeeId}`);
        return json({ success: true, mac });

    } catch (e: any) {
        console.error('WiFi MAC Register Error:', e);
        return json({ error: 'Server Error: ' + e.message }, { status: 500 });
    }
}
