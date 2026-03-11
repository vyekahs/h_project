import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { verifyAttendeeSession } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const sessionToken = cookies.get('user_session');
	if (!sessionToken) return json({ error: '로그인이 필요합니다' }, { status: 401 });
	const user = await verifyAttendeeSession(sessionToken);
	if (!user) return json({ error: '세션이 만료되었습니다' }, { status: 401 });

	const query = url.searchParams.get('q')?.trim() ?? '';

	let res;
	if (query.length === 0) {
		// @ only: show recent/all users
		res = await db.execute(sql`
			SELECT id, name FROM attendees
			WHERE id != ${user.id}
			ORDER BY name ASC
			LIMIT 5
		`);
	} else {
		res = await db.execute(sql`
			SELECT id, name FROM attendees
			WHERE name ILIKE ${'%' + query + '%'}
			  AND id != ${user.id}
			ORDER BY name ASC
			LIMIT 5
		`);
	}

	return json({ users: (res as any[]).map(r => ({ id: r.id, name: r.name })) });
};
