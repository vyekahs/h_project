import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

export const GET: RequestHandler = async ({ request }) => {
	const key = request.headers.get('x-internal-key');
	if (key !== INTERNAL_API_KEY) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const res = await db.execute(sql`SELECT attendee_id, irk FROM user_devices`);
	const devices = (res as any[]).map((r) => ({
		attendee_id: r.attendee_id,
		irk_hex: r.irk
	}));

	return json({ devices });
};
