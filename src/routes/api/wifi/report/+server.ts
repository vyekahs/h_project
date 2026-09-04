import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { processWifiReport } from '$lib/server/ble';
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';

const SCANNER_API_KEY = process.env.SCANNER_API_KEY;

export const POST: RequestHandler = async ({ request }) => {
    const authHeader = request.headers.get('x-api-key');
    if (authHeader !== SCANNER_API_KEY) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { scanner_id, devices } = body;

        const actualScannerId = scanner_id || 'esp32_s3_wifi';

        if (!Array.isArray(devices)) {
            return json({ error: 'Invalid Format' }, { status: 400 });
        }

        console.log(`[WiFi] Report from ${actualScannerId}: ${devices.length} devices`);

        // Scanner heartbeat
        try {
            await db.execute(sql`
                INSERT INTO scanners (id, last_seen_at, status)
                VALUES (${actualScannerId}, NOW(), 'active')
                ON CONFLICT (id) DO UPDATE
                SET last_seen_at = NOW(), status = 'active'
            `);
        } catch (e) {
            console.error('Failed to update scanner heartbeat', e);
        }

        await processWifiReport(actualScannerId, devices);

        return json({ success: true, count: devices.length });
    } catch (e) {
        console.error('[API] WiFi Report Error', e);
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};
