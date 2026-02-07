
import { json } from '@sveltejs/kit';
import { DeviceRegistrationService } from '$lib/server/deviceRegistration';

// ESP32가 IRK를 업로드하는 엔드포인트 (임시 저장만, 아직 확정 아님)
export async function POST({ request }: { request: Request }) {
    try {
        const body = await request.json();
        const { regId, irk } = body;

        console.log(`[Registration] IRK upload for regId: ${regId}, IRK: ${irk}`);

        if (!regId || !irk) {
            return json({ error: 'Missing regId or irk' }, { status: 400 });
        }

        const result = await DeviceRegistrationService.uploadIrk(regId, irk);
        return json(result);

    } catch (e: any) {
        console.error('IRK Upload Error:', e);
        return json({ error: 'Server Error: ' + e.message }, { status: 500 });
    }
}
