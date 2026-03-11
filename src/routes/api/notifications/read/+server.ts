import { json } from '@sveltejs/kit';
import { NotificationService } from '$lib/server/services/notificationService';
import { verifyAttendeeSession } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const sessionToken = cookies.get('user_session');
	if (!sessionToken) return json({ error: '로그인이 필요합니다' }, { status: 401 });
	const user = await verifyAttendeeSession(sessionToken);
	if (!user) return json({ error: '세션이 만료되었습니다' }, { status: 401 });

	const { notificationIds, all } = await request.json();

	if (all) {
		await NotificationService.markAllAsRead(user.id);
	} else if (Array.isArray(notificationIds) && notificationIds.length > 0) {
		await NotificationService.markAsRead(user.id, notificationIds);
	} else {
		return json({ error: '읽음 처리할 알림을 지정해주세요' }, { status: 400 });
	}

	return json({ success: true });
};
