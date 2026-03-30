import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { verifyAttendeeSession } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const sessionToken = cookies.get('user_session');
	if (!sessionToken) return json({ error: '로그인이 필요합니다' }, { status: 401 });
	const user = await verifyAttendeeSession(sessionToken);
	if (!user) return json({ error: '세션이 만료되었습니다' }, { status: 401 });

	const { endpoint } = await request.json();
	if (!endpoint) {
		return json({ error: '잘못된 요청입니다' }, { status: 400 });
	}

	await db.execute(sql`
		DELETE FROM push_subscriptions
		WHERE user_id = ${user.id} AND endpoint = ${endpoint}
	`);

	return json({ success: true });
};
