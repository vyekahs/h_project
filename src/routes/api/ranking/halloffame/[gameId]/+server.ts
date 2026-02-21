import { json } from '@sveltejs/kit';
import { RankingService } from '$lib/server/services/rankingService';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
    const { gameId } = params;

    try {
        const data = await RankingService.getHallOfFame(gameId);
        return json(data);
    } catch (e) {
        console.error(e);
        return json({ error: 'Failed to fetch hall of fame' }, { status: 500 });
    }
}
