import { json } from '@sveltejs/kit';
import { NotificationService } from '$lib/server/services/notificationService';
import { verifyAttendeeSession } from '$lib/server/auth';
import type { RequestHandler } from './$types';

const VALID_TYPES = ['mention', 'visit_plan', 'game_join', 'rank_change'];

export const GET: RequestHandler = async ({ cookies }) => {
	const sessionToken = cookies.get('user_session');
	if (!sessionToken) return json({ error: '로그인이 필요합니다' }, { status: 401 });
	const user = await verifyAttendeeSession(sessionToken);
	if (!user) return json({ error: '세션이 만료되었습니다' }, { status: 401 });

	const prefs = await NotificationService.getPreferences(user.id);
	return json(prefs);
};

export const POST: RequestHandler = async ({ request, cookies }) => {
	const sessionToken = cookies.get('user_session');
	if (!sessionToken) return json({ error: '로그인이 필요합니다' }, { status: 401 });
	const user = await verifyAttendeeSession(sessionToken);
	if (!user) return json({ error: '세션이 만료되었습니다' }, { status: 401 });

	const { type, enabled } = await request.json();
	if (!VALID_TYPES.includes(type) || typeof enabled !== 'boolean') {
		return json({ error: '잘못된 요청입니다' }, { status: 400 });
	}

	await NotificationService.setPreference(user.id, type, enabled);
	return json({ success: true });
};
