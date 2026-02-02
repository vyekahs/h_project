import { json } from '@sveltejs/kit';
import { PointService } from '$lib/server/services/pointService';
import { ShopService } from '$lib/server/services/shopService';
import { TitleService } from '$lib/server/services/titleService';
import { verifyAttendeeSession } from '$lib/server/auth';

export async function GET({ cookies }) {
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
        const [points, inventory, title] = await Promise.all([
            PointService.getUserPoints(userId),
            ShopService.getInventory(userId),
            TitleService.getUserTitle(userId)
        ]);
        
        return json({
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
