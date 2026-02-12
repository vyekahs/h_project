import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateWifiCode } from '$lib/server/wifi-codes';

/** 코드 생성 */
export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const { attendeeId } = body;

        if (!attendeeId) {
            return json({ error: 'Missing attendeeId' }, { status: 400 });
        }

        const code = generateWifiCode(attendeeId);

        console.log(`[WiFi] Code generated: ${code} for attendee ${attendeeId}`);
        return json({ success: true, code });

    } catch (e: any) {
        console.error('WiFi Code Generation Error:', e);
        return json({ error: 'Server Error' }, { status: 500 });
    }
};
