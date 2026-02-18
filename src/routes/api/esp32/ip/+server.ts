import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url }) => {
    const scannerId = url.searchParams.get('scanner_id');

    if (!scannerId) {
        return json({ error: 'Missing scanner_id' }, { status: 400 });
    }

    try {
        const result = await db.execute(
            sql`SELECT ip_address FROM scanners WHERE id = ${scannerId} AND ip_address IS NOT NULL`
        );

        if (result.length === 0 || !(result[0] as any).ip_address) {
            return json({ error: 'Scanner not found or IP not registered' }, { status: 404 });
        }

        return json({ ip: (result[0] as any).ip_address });

    } catch (e: any) {
        console.error('[ESP32] Get IP error:', e);
        return json({ error: 'Server Error' }, { status: 500 });
    }
};
