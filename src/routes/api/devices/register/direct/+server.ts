import { json } from '@sveltejs/kit';
import { DeviceRegistrationService } from '$lib/server/deviceRegistration';

// POST /api/devices/register/direct
// Android Web Bluetooth 플로우: 웹에서 직접 IRK를 가져와 등록
// 사용자가 자기 폰 브라우저에서 직접 BLE 연결했으므로 PIN 불필요
export async function POST({ request, locals }: { request: Request; locals: App.Locals }) {
    try {
        if (!locals.user) {
            return json({ error: '로그인이 필요합니다' }, { status: 401 });
        }

        const body = await request.json();
        const { irk, deviceName } = body;
        const attendeeId = locals.user.id;

        if (!irk) {
            return json({ error: 'Missing irk' }, { status: 400 });
        }

        if (irk.length !== 32 || !/^[0-9a-f]+$/i.test(irk)) {
            return json({ error: 'Invalid IRK format' }, { status: 400 });
        }

        const result = await DeviceRegistrationService.directRegister(attendeeId, irk, deviceName || 'Phone');
        return json(result);

    } catch (e: any) {
        console.error('Direct Register Error:', e);
        return json({ error: 'Server Error: ' + e.message }, { status: 500 });
    }
}
