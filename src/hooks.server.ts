import { startAutoCloseScheduler } from '$lib/server/autoClose';
import { verifyAdminSession, verifyAttendeeSession } from '$lib/server/auth';

// Start the scheduler when the server starts
startAutoCloseScheduler();

import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    // 1+2. 인증 쿼리 순차 실행 (커넥션 1개씩만 사용)
    const userSessionToken = event.cookies.get('user_session');
    if (userSessionToken) {
        const user = await verifyAttendeeSession(userSessionToken);
        if (user) event.locals.user = user;
    }

    const adminSessionToken = event.cookies.get('admin_session');
    if (adminSessionToken) {
        const isAdmin = await verifyAdminSession(adminSessionToken);
        if (isAdmin) event.locals.isAdmin = isAdmin;
    }

    // /admin 경로 보호 (admin 전용)
    if (event.url.pathname.startsWith('/admin') && !event.url.pathname.startsWith('/admin/login')) {
        if (!event.locals.isAdmin) {
            return new Response('Redirect', {
                status: 303,
                headers: { Location: '/admin/login' }
            });
        }
    }

	const response = await resolve(event);
	return response;
}
