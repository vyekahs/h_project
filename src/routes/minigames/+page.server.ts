import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { RankingService } from '$lib/server/services/rankingService';
import { TitleService } from '$lib/server/services/titleService';
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';

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

    // 오락실 마스터는 '남들과 비교한 결과'라, 자격이 생기는 순간에 본인이 아무것도
    // 하고 있지 않을 수 있다(칭호 판정은 본인이 움직일 때만 돈다). 그래서 칭호가
    // 걸리는 이 화면에서 주인을 다시 맞춘다.
    //
    // 맞추는 게 먼저다. 그래야 방금 칭호를 받은 사람이 같은 요청에서 축하 팝업까지
    // 받는다. 병렬로 돌리면 팝업 조회가 칭호 부여보다 먼저 끝나 한 박자 늦게 뜬다.
    const [activityFeed, userRanks, [arcadeMaster, pendingTitle]] = await Promise.all([
        RankingService.getRecentActivity(1, GAME_IDS),
        RankingService.getUserRanksForGames(userId, GAME_IDS),
        (async () => {
            const master = await TitleService.syncArcadeMaster();
            const pending = await claimPendingTitleAnnouncement(userId);
            return [master, pending] as const;
        })()
    ]);

    return {
        activityFeed: activityFeed as any[],
        userRanks,
        pendingTitle,
        arcadeMaster
    };
};


/**
 * 아직 알리지 않은 칭호 획득을 하나 가져오면서 동시에 '알림 완료'로 표시한다.
 *
 * '오락실 마스터'처럼 특정 게임에 속하지 않는 칭호는 게임 결과창에 띄우면 어색해서
 * (어느 게임 덕분에 받은 건지 말할 수 없다) 여기 오락실 페이지에서 알린다.
 *
 * 조회와 표시를 한 UPDATE ... RETURNING으로 처리한다. 읽고 나서 따로 표시하면
 * 그 사이에 다른 탭이 같은 행을 읽어 알림이 두 번 뜬다. 이렇게 하면 먼저 도착한
 * 요청만 행을 가져가므로 정확히 한 번만 뜬다.
 *
 * 실패해도 페이지는 정상적으로 그려야 한다 — 축하 문구 하나 때문에 오락실
 * 전체가 안 열리면 곤란하다.
 */
async function claimPendingTitleAnnouncement(userId: number) {
    try {
        const rows = (await db.execute(sql`
            UPDATE minigame_user_titles ut
            SET announced_at = NOW()
            FROM minigame_titles t
            WHERE ut.title_id = t.id
              AND ut.user_id = ${userId}
              AND ut.announced_at IS NULL
              AND t.condition_value->>'announceOn' = 'arcade'
            RETURNING t.title_name, t.description
        `)) as any[];

        const row = rows[0];
        return row ? { name: row.title_name as string, description: row.description as string | null } : null;
    } catch (e) {
        console.error('[Minigames] 칭호 알림 조회 실패', e);
        return null;
    }
}
