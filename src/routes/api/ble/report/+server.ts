import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { processScanResults } from '$lib/server/ble';
import { query } from '$lib/server/db';

const SCANNER_API_KEY = process.env.SCANNER_API_KEY || 'hproject_scanner_secret_2026';

export const POST: RequestHandler = async ({ request }) => {
    // 1. Auth Check
    const authHeader = request.headers.get('x-api-key');
    if (authHeader !== SCANNER_API_KEY) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { scanner_id, timestamp, devices } = body;
        
        console.log(`[BLE] Report from ${scanner_id}: ${devices?.length || 0} devices`);
        // Log MACs with RSSI to identify close devices
        console.log(`[BLE] Devices: ${devices?.map((d: any) => `${d.mac} (${d.rssi}dBm)`).join(', ')}`);
        
        // Support fallback ID
        const actualScannerId = scanner_id || 'unknown_scanner';

        if (!Array.isArray(devices)) {
            return json({ error: 'Invalid Format' }, { status: 400 });
        }

        // 2. Log Scanner Heartbeat
        try {
            await query(`
                INSERT INTO scanners (id, last_seen_at, status) 
                VALUES ($1, NOW(), 'active')
                ON CONFLICT (id) DO UPDATE 
                SET last_seen_at = NOW(), status = 'active'
            `, [actualScannerId]);
        } catch (e) {
            console.error('Failed to update scanner heartbeat', e);
        }

        // 3. Process in background (async) to not block scanner
        // Or await if we want to ensure processing. Await is safer for consistency.
        await processScanResults(actualScannerId, timestamp, devices);

        return json({ success: true, count: devices.length });
    } catch (e) {
        console.error('[API] Scanner Report Error', e);
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};
