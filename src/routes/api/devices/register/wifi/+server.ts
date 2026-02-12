import { json } from '@sveltejs/kit';
import { query } from '$lib/server/db';
import { addWifiMacToCache } from '$lib/server/ble';
import { verifyWifiCode } from '$lib/server/wifi-codes';

// CORS 헤더 (ESP32 로컬 HTTP 페이지에서 cross-origin 요청 허용)
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

// OPTIONS preflight 처리
export async function OPTIONS() {
    return new Response(null, { status: 204, headers: corsHeaders });
}

// POST /api/devices/register/wifi
// WiFi MAC 주소 등록 (ESP32 등록 페이지에서 code + MAC 전송)
export async function POST({ request }: { request: Request }) {
    try {
        const body = await request.json();
        const { code, wifiMac } = body;

        if (!code || !wifiMac) {
            return json({ error: 'Missing code or wifiMac' }, { status: 400, headers: corsHeaders });
        }

        // MAC 형식 검증 (XX:XX:XX:XX:XX:XX)
        const macRegex = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;
        if (!macRegex.test(wifiMac)) {
            return json({ error: 'Invalid MAC format' }, { status: 400, headers: corsHeaders });
        }

        // 일회용 코드 검증 → attendeeId 확인
        const verified = verifyWifiCode(code);
        if (!verified) {
            return json({ error: 'Invalid or expired code' }, { status: 401, headers: corsHeaders });
        }

        const { attendeeId } = verified;
        const mac = wifiMac.toUpperCase();

        // 해당 유저의 기기가 있는지 확인
        const deviceRes = await query(
            'SELECT id FROM user_devices WHERE attendee_id = $1 LIMIT 1',
            [attendeeId]
        );

        if (deviceRes.rows.length === 0) {
            return json({ error: 'No registered device found. Register BLE first.' }, { status: 400, headers: corsHeaders });
        }

        // WiFi MAC 업데이트
        await query(
            'UPDATE user_devices SET wifi_mac = $1 WHERE attendee_id = $2',
            [mac, attendeeId]
        );

        await addWifiMacToCache(attendeeId, mac);

        console.log(`[WiFi] MAC registered: ${mac} for attendee ${attendeeId}`);
        return json({ success: true, mac }, { headers: corsHeaders });

    } catch (e: any) {
        console.error('WiFi MAC Register Error:', e);
        return json({ error: 'Server Error: ' + e.message }, { status: 500, headers: corsHeaders });
    }
}
