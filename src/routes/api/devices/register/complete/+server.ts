
import { json } from '@sveltejs/kit';
import { DeviceRegistrationService } from '$lib/server/deviceRegistration';
import fs from 'fs';
import path from 'path';

export async function POST({ request }) {
    try {
        const body = await request.json();
        const { regId, irk } = body;
        
        const logMsg = `[${new Date().toISOString()}] Completion req: regId=${regId}, irk=${irk}\n`;
        const logPath = '/Users/arang/projects/Hproject/registration_debug.log';
        fs.appendFileSync(logPath, logMsg);

        console.log(`[Registration] Completion requested for regId: ${regId}, IRK: ${irk}`);

        if (!regId || !irk) {
            console.error('[Registration] Missing regId or irk');
            return json({ error: 'Missing regId or irk' }, { status: 400 });
        }

        const result = await DeviceRegistrationService.completeRegistration(regId, irk);
        console.log('[Registration] Success:', result);
        return json(result);

    } catch (e: any) {
        console.error('Registration Complete Error:', e);
        return json({ error: 'Server Error: ' + e.message }, { status: 500 });
    }
}
