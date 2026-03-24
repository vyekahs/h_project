import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { processScanResults } from '$lib/server/ble';
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';

const SCANNER_API_KEY = process.env.SCANNER_API_KEY || 'hproject_scanner_secret_2026';

export const POST: RequestHandler = async ({ request }) => {
    // 1. Auth Check
    const authHeader = request.headers.get('x-api-key');
    if (authHeader !== SCANNER_API_KEY) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Parse JSON with control character sanitization (BLE device names may contain them)
        const rawText = await request.text();
        const sanitized = rawText.replace(/[\x00-\x1F\x7F]/g, '');
        const body = JSON.parse(sanitized);
        const { scanner_id, timestamp, devices, batch_index, total_batches } = body;
        const isLastBatch = !total_batches || (batch_index === total_batches - 1);

        console.log(`[BLE] Report from ${scanner_id}: ${devices?.length || 0} devices (batch ${(batch_index ?? 0) + 1}/${total_batches ?? 1})`);
        // Log MACs with RSSI to identify close devices
        console.log(`[BLE] Devices: ${devices?.map((d: any) => `${d.mac} (${d.rssi}dBm)`).join(', ')}`);

        // Support fallback ID
        const actualScannerId = scanner_id || 'unknown_scanner';

        if (!Array.isArray(devices)) {
            return json({ error: 'Invalid Format' }, { status: 400 });
        }

        // 2. Log Scanner Heartbeat (fire-and-forget, 응답 차단 방지)
        db.execute(sql`
            INSERT INTO scanners (id, last_seen_at, status)
            VALUES (${actualScannerId}, NOW(), 'active')
            ON CONFLICT (id) DO UPDATE
            SET last_seen_at = NOW(), status = 'active'
        `).catch(e => {
            console.error('Failed to update scanner heartbeat', e);
        });

        // 3. Quick Response Strategy: Respond immediately, process in background
        // This prevents ECONNRESET errors when processScanResults takes too long
        const responsePromise = json({ success: true, count: devices.length });

        // Process in background without blocking response
        processScanResults(actualScannerId, timestamp, devices, isLastBatch).catch(e => {
            console.error('[BLE] Background processing error:', e);
        });

        return responsePromise;
    } catch (e) {
        // Only log non-connection errors (avoid logging ECONNRESET spam)
        if (e && typeof e === 'object' && 'code' in e && e.code === 'ECONNRESET') {
            console.log('[API] Scanner disconnected early (ECONNRESET)');
        } else {
            console.error('[API] Scanner Report Error', e);
        }
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};
