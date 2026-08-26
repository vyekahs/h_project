import { json } from '@sveltejs/kit';
import { PointService } from '$lib/server/services/pointService';
import { ShopService } from '$lib/server/services/shopService';
import { TitleService } from '$lib/server/services/titleService';
import { verifyAttendeeSession } from '$lib/server/auth';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies }) => {
    const sessionToken = cookies.get('user_session');
    let userId = 1; // Fallback for dev/test if no session
    let name = 'Guest';
    let authenticated = false;

    if (sessionToken) {
        const user = await verifyAttendeeSession(sessionToken);
        if (user) {
            userId = user.id;
            name = user.name;
            authenticated = true;
        }
    }

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
            name,
            authenticated
        });
    } catch (e) {
        console.error(e);
        return json({ error: 'Failed to fetch user data' }, { status: 500 });
    }
}
