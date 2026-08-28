import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { RankingService } from '$lib/server/services/rankingService';

const GAME_IDS = ['sudoku', 'killer-sudoku', 'unblock-me', 'tichu', 'energy', 'water-sort', 'triple-tile', 'train-tracks', '2048', 'freecell', 'regicide', 'block-blaster', 'match-crash'];

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) {
        throw redirect(303, '/login?redirectTo=/minigames');
    }

    const userId = locals.user.id;

    const [activityFeed, popularGames, userRanks] = await Promise.all([
        RankingService.getRecentActivity(1),
        RankingService.getPopularGames(3),
        RankingService.getUserRanksForGames(userId, GAME_IDS)
    ]);

    return {
        activityFeed: activityFeed as any[],
        popularGames,
        userRanks
    };
};
