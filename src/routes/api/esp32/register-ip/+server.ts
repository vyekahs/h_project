import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';

const SCANNER_API_KEY = process.env.SCANNER_API_KEY || 'hproject_scanner_secret_2026';

export const POST: RequestHandler = async ({ request }) => {
    const authHeader = request.headers.get('x-api-key');
    if (authHeader !== SCANNER_API_KEY) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { scanner_id, ip } = body;

        if (!scanner_id || !ip) {
            return json({ error: 'Missing scanner_id or ip' }, { status: 400 });
        }

        // IP 형식 간단 검증
        const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
        if (!ipRegex.test(ip)) {
            return json({ error: 'Invalid IP format' }, { status: 400 });
        }

        await query(`
            INSERT INTO scanners (id, ip_address, last_seen_at, status)
            VALUES ($1, $2, NOW(), 'active')
            ON CONFLICT (id) DO UPDATE
            SET ip_address = $2, last_seen_at = NOW(), status = 'active'
        `, [scanner_id, ip]);

        console.log(`[ESP32] IP registered: ${scanner_id} → ${ip}`);
        return json({ success: true });

    } catch (e: any) {
        console.error('[ESP32] Register IP error:', e);
        return json({ error: 'Server Error' }, { status: 500 });
    }
};
