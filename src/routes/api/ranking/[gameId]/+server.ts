import { json } from '@sveltejs/kit';
import { RankingService } from '$lib/server/services/rankingService';

export async function GET({ params, url }) {
    const { gameId } = params;
    const limit = parseInt(url.searchParams.get('limit') || '100');
    
    try {
        const leaderboard = await RankingService.getLeaderboard(gameId, limit);
        return json(leaderboard);
    } catch (e) {
        console.error(e);
        return json({ error: 'Failed to fetch rankings' }, { status: 500 });
    }
}
