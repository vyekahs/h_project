import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { RankingService } from '$lib/server/services/rankingService';

const GAME_IDS = ['sudoku', 'killer-sudoku', 'unblock-me', 'tichu', 'energy', 'water-sort', 'triple-tile', 'train-tracks', '2048', 'freecell', 'regicide', 'block-blaster'];

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) {
        throw redirect(303, '/login?redirectTo=/minigames');
    }

    const userId = locals.user.id;

    const [activityFeed, popularGames, ...rankResults] = await Promise.all([
        RankingService.getRecentActivity(1),
        RankingService.getPopularGames(3),
        ...GAME_IDS.map(gameId => RankingService.getUserRank(userId, gameId))
    ]);

    const userRanks: Record<string, number | null> = {};
    GAME_IDS.forEach((gameId, i) => {
        userRanks[gameId] = rankResults[i];
    });

    return {
        activityFeed: activityFeed as any[],
        popularGames,
        userRanks
    };
};
