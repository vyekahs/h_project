import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { verifyAttendeeSession } from '$lib/server/auth';
import { editGameResult, GameHistoryEditError } from '$lib/server/services/gameHistoryService';
import { getRecommendations, DIFFICULTY_BUCKETS } from '$lib/server/recommendations';

export const load: PageServerLoad = async ({ cookies }) => {
    const userSessionToken = cookies.get('user_session');
    if (!userSessionToken) {
        throw redirect(303, '/login?redirectTo=/collection');
    }
    const user = await verifyAttendeeSession(userSessionToken);
    if (!user) {
        throw redirect(303, '/login?redirectTo=/collection');
    }

    const [gamesResult, playedResult, ownedResult, ratedResult, recommendations, categoryRows, exclusionRows] = await Promise.all([
        db.execute(sql`
            SELECT id, name, image_url, playtime_min, min_players, max_players, difficulty
            FROM games
            WHERE is_active = true
            ORDER BY name ASC
        `),
        // game_id가 없는 옛 기록은(생성 시 카탈로그에서 안 고르고 이름만 입력한 경우)
        // 이름이 정확히 일치하는 카탈로그 게임으로 대신 매칭한다 —
        // 그렇지 않으면 실제 플레이의 상당수가 장식장에서 누락된다.
        // 카드를 눌렀을 때 모달에 개별 플레이 내역을 바로 보여줄 수 있게
        // 집계 대신 판별 행을 그대로 가져온다 (요약은 클라이언트에서 계산).
        db.execute(sql`
            SELECT
                g.id AS game_id,
                g.name AS game_name,
                g.image_url AS game_image_url,
                gs.id AS session_id,
                gs.end_time,
                sp.score AS my_score,
                sp.is_winner,
                (
                    SELECT json_agg(json_build_object(
                        'attendee_id', a2.id,
                        'name', a2.name,
                        'score', sp2.score,
                        'is_winner', sp2.is_winner
                    ))
                    FROM session_participants sp2
                    JOIN attendees a2 ON sp2.attendee_id = a2.id
                    WHERE sp2.session_id = gs.id AND sp2.attendee_id != ${user.id}
                ) as opponents
            FROM session_participants sp
            JOIN game_sessions gs ON sp.session_id = gs.id
            JOIN games g ON (gs.game_id = g.id) OR (gs.game_id IS NULL AND gs.game_name = g.name)
            WHERE sp.attendee_id = ${user.id} AND gs.status = 'finished'
            ORDER BY gs.end_time DESC
        `),
        // 혼놀 보유 여부와 무관하게, 본인도 그 게임을 갖고 있다고 체크한 목록.
        // (attendee_id, game_id) 복합키라 같은 게임을 여러 사람이 각자 체크한다 —
        // 장식장의 그 물건이 누구 것이라는 뜻이 아니다.
        db.execute(sql`SELECT game_id FROM game_ownership WHERE attendee_id = ${user.id}`),
        db.execute(sql`SELECT game_id, rating FROM game_ratings WHERE attendee_id = ${user.id}`),
        getRecommendations(user.id).catch(() => null),
        // 제외 설정 화면의 카테고리 목록 — 실제 카탈로그에 있는 값만 보여준다
        // (BGG 전체 분류를 다 나열하면 대부분 이 클럽엔 없는 게임의 태그다).
        db.execute(sql`
            SELECT trim(cat) AS category, COUNT(*)::int AS cnt
            FROM games, unnest(string_to_array(categories, ',')) AS cat
            WHERE is_active = true AND categories IS NOT NULL
            GROUP BY trim(cat)
            ORDER BY cnt DESC, category ASC
        `),
        db.execute(sql`SELECT kind, value FROM game_rec_exclusions WHERE attendee_id = ${user.id}`)
    ]);

    const playedByGameId: Record<number, any[]> = {};
    const allPlays: any[] = [];
    for (const row of playedResult as any[]) {
        const play = {
            sessionId: row.session_id,
            gameName: row.game_name,
            gameImageUrl: row.game_image_url,
            endTime: row.end_time,
            myScore: row.my_score,
            isWinner: row.is_winner,
            opponents: row.opponents ?? []
        };
        (playedByGameId[row.game_id] ??= []).push(play);
        allPlays.push(play);
    }

    return {
        userId: user.id,
        userName: user.name,
        games: gamesResult as any[],
        playedByGameId,
        // 마이페이지 활동기록 탭을 대체하는 "전체 기록" 보기용 —
        // 게임과 무관하게 시간순으로 쭉 훑어야 하는 경우("지난주에 뭐 했더라")를 위한 것.
        allPlays,
        ownedGameIds: (ownedResult as any[]).map((r) => r.game_id),
        ratingsByGameId: Object.fromEntries((ratedResult as any[]).map((r) => [r.game_id, r.rating])),
        recommendations,
        recCategories: (categoryRows as any[]).map((r) => r.category as string),
        difficultyBuckets: DIFFICULTY_BUCKETS,
        recExclusions: (exclusionRows as any[]).map((r) => ({ kind: r.kind as string, value: r.value as string }))
    };
};

export const actions: Actions = {
    editHistory: async ({ request, cookies }) => {
        const userSessionToken = cookies.get('user_session');
        if (!userSessionToken) return fail(401, { error: '로그인이 필요합니다.' });
        const user = await verifyAttendeeSession(userSessionToken);
        if (!user) return fail(401, { error: '로그인이 필요합니다.' });

        const data = await request.formData();
        const sessionId = data.get('sessionId')?.toString();
        if (!sessionId) return fail(400, { error: '잘못된 요청입니다.' });

        try {
            await editGameResult(sessionId, user.id, data);
            return { success: true };
        } catch (e) {
            if (e instanceof GameHistoryEditError) return fail(e.status, { error: e.message });
            return fail(500, { error: '기록 수정에 실패했습니다.' });
        }
    },

    // 관리자 승인 없이 본인이 직접 체크/해제한다 — 혼놀 보유 여부와는 무관.
    toggleOwnership: async ({ request, cookies }) => {
        const userSessionToken = cookies.get('user_session');
        if (!userSessionToken) return fail(401, { error: '로그인이 필요합니다.' });
        const user = await verifyAttendeeSession(userSessionToken);
        if (!user) return fail(401, { error: '로그인이 필요합니다.' });

        const data = await request.formData();
        const gameId = data.get('gameId')?.toString();
        const owned = data.get('owned') === 'true';
        if (!gameId) return fail(400, { error: '잘못된 요청입니다.' });

        try {
            if (owned) {
                await db.execute(sql`
                    INSERT INTO game_ownership (attendee_id, game_id) VALUES (${user.id}, ${gameId})
                    ON CONFLICT DO NOTHING
                `);
            } else {
                await db.execute(sql`DELETE FROM game_ownership WHERE attendee_id = ${user.id} AND game_id = ${gameId}`);
            }
            return { success: true, ownershipToggled: true };
        } catch (e) {
            return fail(500, { error: '처리에 실패했습니다.' });
        }
    },

    // 평점은 본인이 해본 게임에만 의미가 있다 — 여기서도 한 번 더 막는다
    // (game_ownership과 달리 플레이 기록 없이 매길 수 있으면 추천 신호가 흐려진다).
    rateGame: async ({ request, cookies }) => {
        const userSessionToken = cookies.get('user_session');
        if (!userSessionToken) return fail(401, { error: '로그인이 필요합니다.' });
        const user = await verifyAttendeeSession(userSessionToken);
        if (!user) return fail(401, { error: '로그인이 필요합니다.' });

        const data = await request.formData();
        const gameId = data.get('gameId')?.toString();
        const ratingStr = data.get('rating')?.toString() ?? '';
        if (!gameId) return fail(400, { error: '잘못된 요청입니다.' });

        try {
            const hasPlayed = await db.execute(sql`
                SELECT 1 FROM session_participants sp
                JOIN game_sessions gs ON sp.session_id = gs.id
                WHERE sp.attendee_id = ${user.id} AND gs.status = 'finished'
                  AND (gs.game_id = ${gameId} OR (gs.game_id IS NULL AND gs.game_name = (SELECT name FROM games WHERE id = ${gameId})))
                LIMIT 1
            `);
            if (hasPlayed.length === 0) return fail(403, { error: '플레이한 게임만 평가할 수 있습니다.' });

            if (ratingStr === '') {
                await db.execute(sql`DELETE FROM game_ratings WHERE attendee_id = ${user.id} AND game_id = ${gameId}`);
                return { success: true, ratingCleared: true };
            }
            const rating = Number(ratingStr);
            if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
                return fail(400, { error: '평점은 1~10 사이여야 합니다.' });
            }
            await db.execute(sql`
                INSERT INTO game_ratings (attendee_id, game_id, rating) VALUES (${user.id}, ${gameId}, ${rating})
                ON CONFLICT (attendee_id, game_id) DO UPDATE SET rating = EXCLUDED.rating, updated_at = NOW()
            `);
            return { success: true, rated: true };
        } catch (e) {
            return fail(500, { error: '평점 저장에 실패했습니다.' });
        }
    },

    // 추천에서 특정 난이도/카테고리를 빼고 싶을 때. (attendee_id, kind, value)
    // 복합키라 ON CONFLICT DO NOTHING으로 켜고, 없으면 그냥 지워서 끈다.
    toggleRecExclusion: async ({ request, cookies }) => {
        const userSessionToken = cookies.get('user_session');
        if (!userSessionToken) return fail(401, { error: '로그인이 필요합니다.' });
        const user = await verifyAttendeeSession(userSessionToken);
        if (!user) return fail(401, { error: '로그인이 필요합니다.' });

        const data = await request.formData();
        const kind = data.get('kind')?.toString();
        const value = data.get('value')?.toString();
        const excluded = data.get('excluded') === 'true';
        if (kind !== 'category' && kind !== 'difficulty') return fail(400, { error: '잘못된 요청입니다.' });
        if (!value) return fail(400, { error: '잘못된 요청입니다.' });

        try {
            if (excluded) {
                await db.execute(sql`
                    INSERT INTO game_rec_exclusions (attendee_id, kind, value) VALUES (${user.id}, ${kind}, ${value})
                    ON CONFLICT DO NOTHING
                `);
            } else {
                await db.execute(sql`
                    DELETE FROM game_rec_exclusions WHERE attendee_id = ${user.id} AND kind = ${kind} AND value = ${value}
                `);
            }
            return { success: true, exclusionToggled: true };
        } catch (e) {
            return fail(500, { error: '처리에 실패했습니다.' });
        }
    }
};
