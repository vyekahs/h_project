import { json } from '@sveltejs/kit';
import { NotificationService } from '$lib/server/services/notificationService';
import { verifyAttendeeSession } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const sessionToken = cookies.get('user_session');
	if (!sessionToken) return json({ error: '로그인이 필요합니다' }, { status: 401 });
	const user = await verifyAttendeeSession(sessionToken);
	if (!user) return json({ error: '세션이 만료되었습니다' }, { status: 401 });

	const limit = Math.min(Number(url.searchParams.get('limit') || 20), 50);
	const notifications = await NotificationService.getNotifications(user.id, limit);
	return json({ notifications });
};
