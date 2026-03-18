import { startAutoCloseScheduler } from '$lib/server/autoClose';
import { verifyAdminSession, verifyAttendeeSession } from '$lib/server/auth';
import { recordRequest } from '$lib/server/performance';

// Start the scheduler when the server starts
startAutoCloseScheduler();

import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const startTime = Date.now();

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

	// 성능 메트릭 기록 (정적 파일 제외)
	const path = event.url.pathname;
	if (
		!path.startsWith('/_app/') &&
		!path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)
	) {
		const duration = Date.now() - startTime;
		recordRequest({
			path,
			method: event.request.method,
			duration,
			timestamp: Date.now(),
			statusCode: response.status,
			userAgent: event.request.headers.get('user-agent') || undefined
		});
	}

	return response;
}
