import { startAutoCloseScheduler } from '$lib/server/autoClose';
import { verifyAdminSession, verifyAttendeeSession } from '$lib/server/auth';
import {
	recordRequest,
	recordRequestStart,
	recordRequestEnd,
	markRequestAborted,
	recordDbPoolStats,
	getActiveDbConnections,
	getDbPoolStats
} from '$lib/server/performance';
import { runDataRetention } from '$lib/server/retention';

let requestIdSeq = 0;
function nextRequestId() {
	requestIdSeq = (requestIdSeq + 1) % Number.MAX_SAFE_INTEGER;
	return `${Date.now()}-${requestIdSeq}`;
}

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

// 데이터 보존 정리 (기동 직후 1회 + 이후 30일 간격)
//
// 지우는 대상이 30~180일 지난 데이터라 매일 돌 이유가 없다. 미니게임 로그 삭제는
// 월 경계 기준이라 실제로 한 달에 한 번만 지워지고, 월별 집계도 '완결된 달'만
// 대상이라 이번 달 신선도를 신경 쓸 필요가 없다.
//
// 배포가 잦으면 아래 setTimeout 때문에 30일보다 자주 실행되는데, 집계는 값이
// 달라졌을 때만 쓰고 DELETE는 조건에 맞는 행이 없으면 아무 일도 안 하므로
// 중복 실행이 낭비가 되지 않는다.
// 블루/그린으로 두 인스턴스가 동시에 돌아도 DELETE는 멱등이라 안전하다.
let retentionInterval: NodeJS.Timeout | null = null;
if (!retentionInterval) {
	// 기동 직후 곧바로 돌리면 배포 시점의 부하와 겹치므로 1분 뒤에 시작
	setTimeout(() => {
		runDataRetention().catch((e) => console.error('[RETENTION] 초기 정리 실패:', e));
	}, 60 * 1000);

	retentionInterval = setInterval(
		() => {
			runDataRetention().catch((e) => console.error('[RETENTION] 정리 실패:', e));
		},
		30 * 24 * 60 * 60 * 1000
	);
}

import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const startTime = Date.now();

	// API 키 인증 엔드포인트 + ping은 세션 검증 스킵 (DB 커넥션 절약)
	// ping은 순수 네트워크 왕복 시간만 재야 하므로 DB 조회가 섞이면 안 됨
	// 주의: '/api/wifi/' 전체를 넣으면 안 된다. 그 아래 /api/wifi/code는 브라우저에서
	// 로그인한 사용자가 호출하는 엔드포인트라, 세션을 건너뛰면 locals.user가 비어
	// 본인 확인을 할 수 없게 된다(실제로 그 탓에 남의 attendeeId로 코드를 받을 수
	// 있었다). 기기/서버 간 통신 경로만 정확히 나열한다.
	const isApiKeyRoute =
		event.url.pathname.startsWith('/api/ble/') ||
		event.url.pathname === '/api/wifi/report' ||
		event.url.pathname.startsWith('/api/internal/') ||
		event.url.pathname === '/api/ping';
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

	// 성능 메트릭용 경로 (정적 파일 제외) — SvelteKit form action 이름 포함
	// (예: /games?/importBgg → /games?/importBgg)
	const pathname = event.url.pathname;
	const actionMatch = event.url.search.match(/^\?\/([\w]+)/);
	const path = actionMatch ? `${pathname}?/${actionMatch[1]}` : pathname;
	const isTrackedRequest =
		!pathname.startsWith('/_app/') &&
		!pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/);

	const requestId = isTrackedRequest ? nextRequestId() : null;
	if (requestId) {
		recordRequestStart(requestId, path, event.request.method);
		// adapter-node는 TCP 연결이 끊기면(새로고침/탭 종료 등) 이 signal을 abort시킨다 —
		// 유저가 이미 응답을 기다리지 않게 된 요청은 "멈춤" 경고에서 빼기 위한 신호로 쓴다.
		event.request.signal.addEventListener('abort', () => markRequestAborted(requestId));
	}

	const beforeResolve = Date.now();
	try {
		const response = await resolve(event);
		if (isApiKeyRoute) {
			console.log(`[HOOK] ⏱️ ${event.url.pathname}: auth=${beforeResolve - startTime}ms, resolve=${Date.now() - beforeResolve}ms, total=${Date.now() - startTime}ms`);
		}

		if (isTrackedRequest) {
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
	} finally {
		// resolve()가 던지거나(에러) 끝까지 멈춰있어도 진행 중 목록에서는 반드시 빠지도록
		if (requestId) recordRequestEnd(requestId);
	}
}
