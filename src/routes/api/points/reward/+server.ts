import { json } from '@sveltejs/kit';
import { PointService } from '$lib/server/services/pointService';

export async function POST({ request }) {
    // const userId = locals.user?.id;
    const userId = 1; // Mock
    
    const { amount, source } = await request.json();
    
    if (!amount || source !== 'rewarded_ad') {
         return json({ error: 'Invalid request' }, { status: 400 });
    }
    
    try {
        // Enforce daily limit for ads? PointService might need update or check checks here.
        // Planning: 5 times / day.
        // We could check transaction count in DB.
        
        await PointService.addPoints(userId, amount, 'bonus', 'ad_reward');
        return json({ success: true, message: 'Points awarded' });
    } catch (e) {
        console.error(e);
        return json({ error: 'Failed to award points' }, { status: 500 });
    }
}
