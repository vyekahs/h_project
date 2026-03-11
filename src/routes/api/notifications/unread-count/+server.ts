import { json } from '@sveltejs/kit';
import { NotificationService } from '$lib/server/services/notificationService';
import { verifyAttendeeSession } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies }) => {
	const sessionToken = cookies.get('user_session');
	if (!sessionToken) return json({ count: 0 });
	const user = await verifyAttendeeSession(sessionToken);
	if (!user) return json({ count: 0 });

	const count = await NotificationService.getUnreadCount(user.id);
	return json({ count });
};
