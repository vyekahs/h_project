import { json } from '@sveltejs/kit';
import { PointService } from '$lib/server/services/pointService';
import { ShopService } from '$lib/server/services/shopService';
import { TitleService } from '$lib/server/services/titleService';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) {
        return json({ error: '로그인이 필요합니다' }, { status: 401 });
    }
    const userId = locals.user.id;
    const name = locals.user.name;

    try {
        const [points, inventory, title] = await Promise.all([
            PointService.getUserPoints(userId),
            ShopService.getInventory(userId),
            TitleService.getUserTitle(userId)
        ]);

        return json({
            id: userId,
            points,
            inventory,
            title,
            name
        });
    } catch (e) {
        console.error(e);
        return json({ error: 'Failed to fetch user data' }, { status: 500 });
    }
}
