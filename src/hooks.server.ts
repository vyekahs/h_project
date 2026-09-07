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

// 데이터 보존 정리
//
// 실제 실행 간격(30일)은 runDataRetention 안에서 DB에 기록된 마지막 실행 시각으로
// 판단한다. 여기 타이머는 "확인하러 깨우는" 역할만 한다.
//
// 타이머에 30일을 직접 넣었다가 크게 데었다. 30일은 2,592,000,000ms인데 Node의
// 타이머 지연 상한은 2^31-1ms(약 24.8일)이고, 이를 넘기면 지연이 1ms로 축소된다.
// 그래서 정리 작업이 초당 900회 넘게 돌면서 커넥션 20개를 상시 점유하고 DB에
// 초당 7,500 트랜잭션을 쏟아냈다. 사용자가 없는 새벽에도 계속.
//
// 이제 깨우는 주기는 하루(상한의 1/25 수준으로 안전)이고, 하루에 한 번 깨어나도
// 30일이 안 지났으면 DB 조회 한 번으로 즉시 반환한다.
const RETENTION_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
let retentionInterval: NodeJS.Timeout | null = null;
if (!retentionInterval) {
	// 기동 직후 곧바로 돌리면 배포 시점의 부하와 겹치므로 1분 뒤에 확인
	setTimeout(() => {
		runDataRetention().catch((e) => console.error('[RETENTION] 초기 정리 실패:', e));
	}, 60 * 1000);

	retentionInterval = setInterval(() => {
		runDataRetention().catch((e) => console.error('[RETENTION] 정리 실패:', e));
	}, RETENTION_CHECK_INTERVAL_MS);
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
