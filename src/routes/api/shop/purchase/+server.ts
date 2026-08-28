import { json } from '@sveltejs/kit';
import { ShopService } from '$lib/server/services/shopService';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) {
        return json({ error: '로그인이 필요합니다' }, { status: 401 });
    }
    const userId = locals.user.id;

    const { itemCode } = await request.json();
    
    if (!itemCode) {
        return json({ error: 'Item code required' }, { status: 400 });
    }
    
    try {
        const result = await ShopService.purchaseItem(userId, itemCode);
        if (!result.success) {
            return json({ error: result.message }, { status: 400 });
        }
        return json({ success: true, message: 'Purchased successfully' });
    } catch (e) {
        console.error(e);
        return json({ error: 'Purchase failed' }, { status: 500 });
    }
}
