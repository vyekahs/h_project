
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
