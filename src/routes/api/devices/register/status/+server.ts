import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
    const regId = url.searchParams.get('regId');

    if (!regId) {
        return json({ error: 'Missing regId' }, { status: 400 });
    }

    try {
        const res = await db.execute(
            sql`SELECT step FROM device_registrations WHERE id = ${regId}`
        );

        if (res.length === 0) {
            return json({ error: 'Registration not found' }, { status: 404 });
        }

        return json({ step: (res[0] as any).step });

    } catch (e: any) {
        console.error('Registration Status Error:', e);
        return json({ error: 'Server Error' }, { status: 500 });
    }
}
