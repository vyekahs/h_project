import { json } from '@sveltejs/kit';
import { TitleService } from '$lib/server/services/titleService';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    try {
        const titles = await TitleService.getOwnedTitles(locals.user.id);
        return json(titles);
    } catch (e) {
        console.error('Failed to fetch titles', e);
        return json({ error: 'Internal Error' }, { status: 500 });
    }
}
