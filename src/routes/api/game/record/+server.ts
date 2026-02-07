import { json } from '@sveltejs/kit';
import { RankingService } from '$lib/server/services/rankingService';
import { TitleService } from '$lib/server/services/titleService';
import { verifyAttendeeSession } from '$lib/server/auth';


export async function POST({ request, locals, cookies }) {
    // Authenticate
    const sessionToken = cookies.get('user_session');
    let userId = 1; // Fallback
    
    if (sessionToken) {
        const user = await verifyAttendeeSession(sessionToken);
        if (user) {
            userId = user.id;
        } else {
             // If token exists but is invalid, maybe 401? For now fall back to 1 or error.
             // return json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    const { gameId, difficulty, clearTime, score, skipReward, mistakes } = await request.json();

    if (!gameId || !difficulty || clearTime === undefined) {
        return json({ error: 'Missing required fields' }, { status: 400 });
    }

    try {
        const result = await RankingService.submitScore(userId, gameId, difficulty, clearTime, score, skipReward, mistakes || 0);
        
        // Trigger Title Check (Safely)
        try {
            await TitleService.checkAndAssignTitles(userId);
        } catch (e) {
            console.error('[API] Title check failed:', e);
        }

        return json(result);
    } catch (e: any) {
        console.error(e);
        return json({ error: e.message, stack: e.stack }, { status: 500 });
    }
}
