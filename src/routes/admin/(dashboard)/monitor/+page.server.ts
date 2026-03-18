import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import {
	getSystemHealth,
	getEndpointStats,
	getSlowRequests,
	getSlowQueries,
	getRealtimeMetrics
} from '$lib/server/performance';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.isAdmin) {
		throw redirect(303, '/admin/login');
	}

	const tab = url.searchParams.get('tab') || 'hardware';

	// Pre-load performance data for instant tab switching
	const performanceData = {
		health: getSystemHealth(),
		endpoints: getEndpointStats(),
		slowRequests: getSlowRequests(20),
		slowQueries: getSlowQueries(20),
		realtime: getRealtimeMetrics()
	};

	return {
		tab,
		performance: performanceData
	};
};
