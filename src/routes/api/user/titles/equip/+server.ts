import { json } from '@sveltejs/kit';
import { TitleService } from '$lib/server/services/titleService';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { titleId } = await request.json();
    if (titleId === undefined) {
        return json({ error: 'Missing titleId' }, { status: 400 });
    }
    
    try {
        console.log(`Equipping title ${titleId} for user ${locals.user.id}`);
        await TitleService.equipTitle(locals.user.id, titleId);
        return json({ success: true });
    } catch (e: any) {
        console.error('Failed to equip title', e);
        return json({ error: e.message || 'Internal Error' }, { status: 500 });
    }
}
