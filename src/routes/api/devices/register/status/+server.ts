import { json } from '@sveltejs/kit';
import { query } from '$lib/server/db';

export async function GET({ url }) {
    const regId = url.searchParams.get('regId');

    if (!regId) {
        return json({ error: 'Missing regId' }, { status: 400 });
    }

    try {
        const res = await query(
            'SELECT step FROM device_registrations WHERE id = $1',
            [regId]
        );

        if (res.rows.length === 0) {
            return json({ error: 'Registration not found' }, { status: 404 });
        }

        return json({ step: res.rows[0].step });

    } catch (e: any) {
        console.error('Registration Status Error:', e);
        return json({ error: 'Server Error' }, { status: 500 });
    }
}
