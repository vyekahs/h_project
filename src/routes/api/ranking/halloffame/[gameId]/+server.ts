import { json } from '@sveltejs/kit';
import { RankingService } from '$lib/server/services/rankingService';

export async function GET({ params, url }) {
    const { gameId } = params;
    const preview = url.searchParams.get('preview') === 'true';

    try {
        const data = preview
            ? await RankingService.getTopScorers(gameId, 3)
            : await RankingService.getHallOfFame(gameId);
        return json(data);
    } catch (e) {
        console.error(e);
        return json({ error: 'Failed to fetch hall of fame' }, { status: 500 });
    }
}
