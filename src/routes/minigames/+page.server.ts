import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { RankingService } from '$lib/server/services/rankingService';
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

    const [activityFeed, userRanks, pendingTitle, arcadeMaster] = await Promise.all([
        RankingService.getRecentActivity(1, GAME_IDS),
        RankingService.getUserRanksForGames(userId, GAME_IDS),
        claimPendingTitleAnnouncement(userId),
        getArcadeMaster()
    ]);

    return {
        activityFeed: activityFeed as any[],
        userRanks,
        pendingTitle,
        arcadeMaster
    };
};

/**
 * 현재 '오락실 마스터' 보유자와 그 사람이 1위인 게임 수.
 *
 * 제외 게임 목록을 코드에 다시 적지 않고 칭호의 condition_value에서 읽는다.
 * 판정(titleService)과 표시가 각자 목록을 들고 있으면 한쪽만 고쳤을 때
 * "5개 1위인데 칭호는 딴 사람이 갖고 있다" 같은 모순이 화면에 그대로 나온다.
 *
 * 개수는 지금 시점으로 다시 센다. 칭호는 누군가 기록을 낼 때만 재판정되므로
 * 보유자가 이미 1위 하나를 뺏겼는데 칭호는 아직 그대로일 수 있는데, 그때
 * 획득 당시의 개수를 보여주면 랭킹 화면과 어긋난다.
 */
async function getArcadeMaster() {
    try {
        const rows = (await db.execute(sql`
            WITH def AS (
                SELECT id, condition_value FROM minigame_titles WHERE title_code = 'arcade_master'
            ),
            excluded AS (
                SELECT json_array_elements_text(
                    COALESCE((SELECT condition_value->'excludeGames' FROM def), '[]'::json)
                ) AS game_id
            ),
            firsts AS (
                SELECT user_id, count(*)::int AS cnt
                FROM (
                    SELECT user_id,
                           RANK() OVER (PARTITION BY game_id ORDER BY total_score DESC) AS rnk
                    FROM minigame_monthly_rankings
                    WHERE month_key = to_char(NOW(), 'YYYY-MM')
                      AND game_id::text NOT IN (SELECT game_id FROM excluded)
                ) r
                WHERE rnk = 1
                GROUP BY user_id
            )
            SELECT a.name, COALESCE(f.cnt, 0)::int AS first_count
            FROM minigame_user_titles ut
            JOIN def ON def.id = ut.title_id
            JOIN attendees a ON a.id = ut.user_id
            LEFT JOIN firsts f ON f.user_id = ut.user_id
        `)) as any[];

        const row = rows[0];
        return row ? { name: row.name as string, firstCount: Number(row.first_count) } : null;
    } catch (e) {
        console.error('[Minigames] 오락실 마스터 조회 실패', e);
        return null;
    }
}

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
