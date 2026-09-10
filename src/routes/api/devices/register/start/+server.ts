
import { json } from '@sveltejs/kit';
import { DeviceRegistrationService } from '$lib/server/deviceRegistration';

// POST /api/devices/register/start
// User starts the flow.
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        if (!locals.user) {
            return json({ error: '로그인이 필요합니다' }, { status: 401 });
        }

        const { deviceId, deviceName } = await request.json();
        const attendeeId = locals.user.id;

        if (!deviceId) {
            return json({ error: 'Missing deviceId' }, { status: 400 });
        }

        // 등록 기기가 서버와 통신 중이 아니면 시작하지 않는다. 그대로 진행하면
        // PIN은 멀쩡히 뜨는데 아무 일도 일어나지 않아, 사용자가 이유를 알 수 없다.
        if (!(await DeviceRegistrationService.isRegistrationDeviceOnline())) {
            return json(
                { error: '등록 기기가 응답하지 않습니다. 전원과 WiFi를 확인하거나 관리자에게 문의해 주세요.' },
                { status: 503 }
            );
        }

        const result = await DeviceRegistrationService.startRegistration(deviceId, attendeeId, deviceName || 'Phone');

        return json({
            success: true,
            pin: result.pin,
            expiresAt: result.expiresAt,
            regId: result.regId // Updated to match service change
        });

    } catch (e: any) {
        console.error('Registration Start Error Detail:', e);
        return json({ error: 'Server Error: ' + e.message }, { status: 500 });
    }
}
