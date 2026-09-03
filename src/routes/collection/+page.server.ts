import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { verifyAttendeeSession } from '$lib/server/auth';
import { editGameResult, GameHistoryEditError } from '$lib/server/services/gameHistoryService';

export const load: PageServerLoad = async ({ cookies }) => {
    const userSessionToken = cookies.get('user_session');
    if (!userSessionToken) {
        throw redirect(303, '/login?redirectTo=/collection');
    }
    const user = await verifyAttendeeSession(userSessionToken);
    if (!user) {
        throw redirect(303, '/login?redirectTo=/collection');
    }

    const [gamesResult, playedResult] = await Promise.all([
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
        `)
    ]);

    const playedByGameId: Record<number, any[]> = {};
    const allPlays: any[] = [];
    for (const row of playedResult as any[]) {
        const play = {
            sessionId: row.session_id,
            gameName: row.game_name,
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
        allPlays
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
    }
};
