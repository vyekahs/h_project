import { json } from '@sveltejs/kit';
import { PointService } from '$lib/server/services/pointService';
import { TitleService } from '$lib/server/services/titleService';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) {
        return json({ error: '로그인이 필요합니다' }, { status: 401 });
    }
    const userId = locals.user.id;

    const { amount, source } = await request.json();
    
    if (!amount || source !== 'rewarded_ad') {
         return json({ error: 'Invalid request' }, { status: 400 });
    }
    
    try {
        // Enforce daily limit for ads? PointService might need update or check checks here.
        // Planning: 5 times / day.
        // We could check transaction count in DB.
        
        await PointService.addPoints(userId, amount, 'bonus', 'ad_reward');
        // addPoints()는 더 이상 자체적으로 칭호 체크를 하지 않으므로 여기서 직접 호출
        // (응답을 막을 필요는 없는 부수 효과라 fire-and-forget)
        TitleService.checkAndAssignTitles(userId).catch(console.error);
        return json({ success: true, message: 'Points awarded' });
    } catch (e) {
        console.error(e);
        return json({ error: 'Failed to award points' }, { status: 500 });
    }
}
