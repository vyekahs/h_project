import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { RankingService } from '$lib/server/services/rankingService';

const GAME_IDS = ['sudoku', 'killer-sudoku', 'unblock-me'];

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) {
        throw redirect(303, '/login?redirectTo=/minigames');
    }

    const userId = locals.user.id;

    const [activityFeed, ...rankResults] = await Promise.all([
        RankingService.getRecentActivity(20),
        ...GAME_IDS.map(gameId => RankingService.getUserRank(userId, gameId))
    ]);

    const userRanks: Record<string, number | null> = {};
    GAME_IDS.forEach((gameId, i) => {
        userRanks[gameId] = rankResults[i];
    });

    return {
        activityFeed,
        userRanks
    };
};
