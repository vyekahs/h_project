import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyAdminSession } from '$lib/server/auth';
import { getPerformanceHistory } from '$lib/server/performance';

/** 쿼리 파라미터를 정수로 읽되, 범위를 벗어나거나 숫자가 아니면 기본값을 쓴다. */
function intParam(raw: string | null, fallback: number, min: number, max: number): number {
	const n = raw ? parseInt(raw, 10) : NaN;
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, n));
}

export const GET: RequestHandler = async ({ cookies, url }) => {
	const adminToken = cookies.get('admin_session');
	if (!adminToken || !(await verifyAdminSession(adminToken))) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// 예전에는 parseInt 결과를 그대로 SQL에 넘겼다. ?limit=abc면 NaN이 들어가
	// 쿼리가 깨지고, ?limit=99999999면 테이블을 통째로 끌어온다.
	const limit = intParam(url.searchParams.get('limit'), 100, 1, 1000);
	const days = intParam(url.searchParams.get('days'), 7, 1, 365);

	// 다섯 개를 동시에 던지던 것을 CTE 한 방으로 합쳤다 (getPerformanceHistory 주석 참고).
	const history = await getPerformanceHistory(limit, days);

	return json({
		...history,
		period: {
			days,
			since: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
		}
	});
};
