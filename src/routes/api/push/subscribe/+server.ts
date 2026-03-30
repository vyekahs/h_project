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

	const { endpoint, keys } = await request.json();
	if (!endpoint || !keys?.p256dh || !keys?.auth) {
		return json({ error: '잘못된 구독 정보입니다' }, { status: 400 });
	}

	await db.execute(sql`
		INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
		VALUES (${user.id}, ${endpoint}, ${keys.p256dh}, ${keys.auth})
		ON CONFLICT (endpoint) DO UPDATE SET
			user_id = ${user.id},
			p256dh = ${keys.p256dh},
			auth = ${keys.auth}
	`);

	return json({ success: true });
};
