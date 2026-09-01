import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { RankingService } from '$lib/server/services/rankingService';

// +page.svelte의 games 배열에서 실제로 노출 중인 게임과 맞춰둔다 —
// 여기 있던 unblock-me/regicide/match-crash는 +page.svelte에서는 이미
// 주석 처리돼 그리드엔 없는데 이 목록에만 남아있어서, 활동 티커가 그
// 게임들의 최근 기록을 계속 노출하는 불일치가 있었다.
const GAME_IDS = ['sudoku', 'killer-sudoku', 'tichu', 'energy', 'water-sort', 'triple-tile', 'train-tracks', '2048', 'freecell', 'block-blaster'];

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) {
        throw redirect(303, '/login?redirectTo=/minigames');
    }

    const userId = locals.user.id;

    const [activityFeed, popularGames, userRanks] = await Promise.all([
        RankingService.getRecentActivity(1, GAME_IDS),
        RankingService.getPopularGames(3),
        RankingService.getUserRanksForGames(userId, GAME_IDS)
    ]);

    return {
        activityFeed: activityFeed as any[],
        popularGames,
        userRanks
    };
};
