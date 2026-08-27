import { json } from '@sveltejs/kit';
import { RankingService } from '$lib/server/services/rankingService';
import { TitleService } from '$lib/server/services/titleService';
import { verifyAttendeeSession } from '$lib/server/auth';
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { NotificationService } from '$lib/server/services/notificationService';
import { GAME_REGISTRY } from '$lib/games/gameRegistry';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
    // Authenticate
    const sessionToken = cookies.get('user_session');
    if (!sessionToken) {
        return json({ error: '로그인이 필요합니다' }, { status: 401 });
    }
    const user = await verifyAttendeeSession(sessionToken);
    if (!user) {
        return json({ error: '세션이 만료되었습니다' }, { status: 401 });
    }
    const userId = user.id;

    // 카페 방문 이력 확인
    const visitCheck = await db.execute(sql`SELECT 1 FROM visits WHERE attendee_id = ${userId} LIMIT 1`);
    if (visitCheck.length === 0) {
        return json({ error: '카페 방문 기록이 없습니다' }, { status: 403 });
    }

    const { gameId, difficulty, clearTime, score, skipReward, mistakes } = await request.json();

    if (!gameId || !difficulty || clearTime === undefined) {
        return json({ error: 'Missing required fields' }, { status: 400 });
    }

    try {
        const result = await RankingService.submitScore(userId, gameId, difficulty, clearTime, score, skipReward, mistakes || 0);

        // Trigger Title Check and return newly assigned titles
        let newTitles: string[] = [];
        try {
            const assignedCodes = await TitleService.checkAndAssignTitles(userId);
            if (assignedCodes.length > 0) {
                const titleInfoRes = await db.execute(sql`
                    SELECT title_name, condition_value FROM minigame_titles
                    WHERE title_code = ANY(ARRAY[${sql.join(assignedCodes.map(c => sql`${c}`), sql`, `)}])
                `);
                
                // Only show titles relevant to this game
                newTitles = titleInfoRes
                    .filter((r: any) => {
                        const cond = r.condition_value;
                        if (!cond) return false;
                        // Exclude non-game titles (account_age, gift_count, etc.)
                        if (!cond.gameId && !cond.rank && cond.type !== 'total_points' && cond.type !== 'play_count') return false;
                        // Exclude titles for a different game
                        if (cond.gameId && cond.gameId !== gameId) return false;
                        return true;
                    })
                    .map((r: any) => r.title_name);
            }
        } catch (e) {
            console.error('[API] Title check failed:', e);
        }

        // Rank change notification for displaced users
        // 응답에 영향 없는 부수 효과라 백그라운드로 돌리고 응답을 막지 않는다.
        // (알림 건당 DB 조회 + 웹 푸시 외부 호출이 있어 순서대로 기다리면 순위 변동자가
        // 많을 때 응답이 크게 느려짐)
        (async () => {
            if (result.currentRank !== null) {
                const oldRank = result.previousRank;
                const newRank = result.currentRank;

                if (oldRank === null || newRank < oldRank) {
                    const now = new Date();
                    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                    const rangeStart = newRank;
                    const rangeEnd = oldRank ? oldRank : newRank + 5;

                    const displacedUsers = await db.execute(sql`
                        SELECT ranked.user_id, a.name as nickname FROM (
                            SELECT user_id, RANK() OVER (ORDER BY total_score DESC, score_updated_at ASC) as rank
                            FROM minigame_monthly_rankings
                            WHERE game_id = ${gameId} AND month_key = ${monthKey}
                        ) ranked
                        JOIN attendees a ON ranked.user_id = a.id
                        WHERE ranked.rank > ${rangeStart} AND ranked.rank <= ${rangeEnd + 1}
                        AND ranked.user_id != ${userId}
                    `);

                    const displayName = GAME_REGISTRY[gameId]?.name ?? gameId;

                    for (const du of displacedUsers as any[]) {
                        await NotificationService.notify(
                            du.user_id,
                            {
                                type: 'rank_change',
                                title: '랭킹 변동 알림',
                                body: `${displayName} 랭킹이 떨어졌어요! ${user.name}님이 ${du.nickname}님을 앞질렀어요!`,
                                url: `/minigames/start/${gameId}?tab=ranking`,
                            },
                            userId,
                            `ranking:${gameId}:${monthKey}`
                        );
                    }
                }
            }
        })().catch((e) => console.error('[API] Rank change notification failed:', e));

        return json({ ...result, newTitles });
    } catch (e: any) {
        console.error(e);
        return json({ error: e.message, stack: e.stack }, { status: 500 });
    }
}
