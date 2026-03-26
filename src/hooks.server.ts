import { startAutoCloseScheduler } from '$lib/server/autoClose';
import { verifyAdminSession, verifyAttendeeSession } from '$lib/server/auth';
import {
	recordRequest,
	recordDbPoolStats,
	getActiveDbConnections,
	getDbPoolStats
} from '$lib/server/performance';

// Start the scheduler when the server starts
startAutoCloseScheduler();

// DB pool monitoring interval (every 30 seconds)
let dbPoolMonitorInterval: NodeJS.Timeout | null = null;
if (!dbPoolMonitorInterval) {
	dbPoolMonitorInterval = setInterval(
		async () => {
			try {
				const activeConnections = await getActiveDbConnections();
				const poolStats = getDbPoolStats();
				await recordDbPoolStats(activeConnections, poolStats.maxConnections);
			} catch (error) {
				console.error('[PERF] DB pool monitoring error:', error);
			}
		},
		30 * 1000
	);
}

import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const startTime = Date.now();

	// API 키 인증 엔드포인트는 세션 검증 스킵 (DB 커넥션 절약)
	const isApiKeyRoute = event.url.pathname.startsWith('/api/ble/') || event.url.pathname.startsWith('/api/wifi/') || event.url.pathname.startsWith('/api/internal/');
	if (!isApiKeyRoute) {
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

	const beforeResolve = Date.now();
	const response = await resolve(event);
	if (isApiKeyRoute) {
		console.log(`[HOOK] ⏱️ ${event.url.pathname}: auth=${beforeResolve - startTime}ms, resolve=${Date.now() - beforeResolve}ms, total=${Date.now() - startTime}ms`);
	}

	// 성능 메트릭 기록 (정적 파일 제외)
	const pathname = event.url.pathname;
	// SvelteKit form action 이름 포함 (예: /games?/importBgg → /games?/importBgg)
	const actionMatch = event.url.search.match(/^\?\/([\w]+)/);
	const path = actionMatch ? `${pathname}?/${actionMatch[1]}` : pathname;
	if (
		!pathname.startsWith('/_app/') &&
		!pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)
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
