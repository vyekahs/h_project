
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { processScanResults } from '$lib/server/ble';

const SCANNER_API_KEY = process.env.SCANNER_API_KEY || 'test-scanner-key';

export const POST: RequestHandler = async ({ request }) => {
    // 1. Auth Check
    const authHeader = request.headers.get('x-api-key');
    if (authHeader !== SCANNER_API_KEY) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { scanner_id, timestamp, devices } = body;

        if (!Array.isArray(devices)) {
            return json({ error: 'Invalid Format' }, { status: 400 });
        }

        // 2. Process in background (async) to not block scanner
        // Or await if we want to ensure processing. Await is safer for consistency.
        await processScanResults(scanner_id, timestamp, devices);

        return json({ success: true, count: devices.length });
    } catch (e) {
        console.error('[API] Scanner Report Error', e);
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};
