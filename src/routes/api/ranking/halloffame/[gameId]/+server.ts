import { json } from '@sveltejs/kit';
import { RankingService } from '$lib/server/services/rankingService';

export async function GET({ params }) {
    const { gameId } = params;

    try {
        const hallOfFame = await RankingService.getHallOfFame(gameId);
        return json(hallOfFame);
    } catch (e) {
        console.error(e);
        return json({ error: 'Failed to fetch hall of fame' }, { status: 500 });
    }
}
