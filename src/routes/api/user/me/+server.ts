import { json } from '@sveltejs/kit';
import { PointService } from '$lib/server/services/pointService';
import { ShopService } from '$lib/server/services/shopService';
import { TitleService } from '$lib/server/services/titleService';
import { TutorialService } from '$lib/server/services/tutorialService';
import { verifyAttendeeSession } from '$lib/server/auth';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies }) => {
    const sessionToken = cookies.get('user_session');
    let userId = 1; // Fallback for dev/test if no session
    let name = 'Guest';

    if (sessionToken) {
        const user = await verifyAttendeeSession(sessionToken);
        if (user) {
            userId = user.id;
            name = user.name;
        }
    }
    
    try {
        const [points, inventory, title, completedTutorials] = await Promise.all([
            PointService.getUserPoints(userId),
            ShopService.getInventory(userId),
            TitleService.getUserTitle(userId),
            TutorialService.getCompletedTutorials(userId)
        ]);
        
        return json({
            points,
            inventory,
            title,
            name,
            completedTutorials
        });
    } catch (e) {
        console.error(e);
        return json({ error: 'Failed to fetch user data' }, { status: 500 });
    }
}
