import { json } from '@sveltejs/kit';
import { TitleService } from '$lib/server/services/titleService';

export async function POST({ request, locals }) {
    if (!locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { titleId } = await request.json();
    if (!titleId) {
        return json({ error: 'Missing titleId' }, { status: 400 });
    }
    
    try {
        await TitleService.equipTitle(parseInt(locals.user.id), titleId);
        return json({ success: true });
    } catch (e: any) {
        console.error('Failed to equip title', e);
        return json({ error: e.message || 'Internal Error' }, { status: 500 });
    }
}
