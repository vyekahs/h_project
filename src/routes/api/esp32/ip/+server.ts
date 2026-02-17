import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';

export const GET: RequestHandler = async ({ url }) => {
    const scannerId = url.searchParams.get('scanner_id');

    if (!scannerId) {
        return json({ error: 'Missing scanner_id' }, { status: 400 });
    }

    try {
        const result = await query(
            'SELECT ip_address FROM scanners WHERE id = $1 AND ip_address IS NOT NULL',
            [scannerId]
        );

        if (result.rows.length === 0 || !result.rows[0].ip_address) {
            return json({ error: 'Scanner not found or IP not registered' }, { status: 404 });
        }

        return json({ ip: result.rows[0].ip_address });

    } catch (e: any) {
        console.error('[ESP32] Get IP error:', e);
        return json({ error: 'Server Error' }, { status: 500 });
    }
};
