import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Permanent redirect to unified monitor (performance tab)
	throw redirect(301, '/admin/monitor?tab=performance');
};
