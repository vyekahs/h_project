
import { json } from '@sveltejs/kit';
import { DeviceRegistrationService } from '$lib/server/deviceRegistration';

// 사용자가 웹에서 PIN을 입력하여 등록을 확정하는 엔드포인트
export async function POST({ request }: { request: Request }) {
    try {
        const body = await request.json();
        const { regId, pin } = body;

        if (!regId || !pin) {
            return json({ error: 'Missing regId or pin' }, { status: 400 });
        }

        const result = await DeviceRegistrationService.verifyAndComplete(regId, pin);
        return json(result);

    } catch (e: any) {
        console.error('PIN Verify Error:', e);
        return json({ error: 'Server Error: ' + e.message }, { status: 500 });
    }
}
