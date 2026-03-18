import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyAdminSession } from '$lib/server/auth';
import {
	getSlowRequestsFromDB,
	getSlowRequestStats,
	getSlowestEndpointsFromDB,
	getDbPoolStatsFromDB,
	getDbPoolStatsAggregated
} from '$lib/server/performance';

export const GET: RequestHandler = async ({ cookies, url }) => {
	// Auth check
	const adminToken = cookies.get('admin_session');
	if (!adminToken || !(await verifyAdminSession(adminToken))) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Parse query params
	const limitParam = url.searchParams.get('limit');
	const daysParam = url.searchParams.get('days');

	const limit = limitParam ? parseInt(limitParam, 10) : 100;
	const days = daysParam ? parseInt(daysParam, 10) : 7;
	const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

	// Fetch data in parallel
	const [slowRequests, stats, slowestEndpoints, dbPoolHistory, dbPoolStats] = await Promise.all([
		getSlowRequestsFromDB(limit, sinceDate),
		getSlowRequestStats(sinceDate),
		getSlowestEndpointsFromDB(20),
		getDbPoolStatsFromDB(limit, sinceDate),
		getDbPoolStatsAggregated(sinceDate)
	]);

	return json({
		slowRequests,
		stats,
		slowestEndpoints,
		dbPoolHistory,
		dbPoolStats,
		period: {
			days,
			since: sinceDate.toISOString()
		}
	});
};
