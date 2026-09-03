import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { verifyAttendeeSession } from '$lib/server/auth';

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
        db.execute(sql`
            SELECT
                g.id AS game_id,
                COUNT(*)::int AS play_count,
                COUNT(*) FILTER (WHERE sp.is_winner)::int AS win_count,
                MIN(gs.end_time) AS first_played,
                MAX(gs.end_time) AS last_played
            FROM session_participants sp
            JOIN game_sessions gs ON sp.session_id = gs.id
            JOIN games g ON (gs.game_id = g.id) OR (gs.game_id IS NULL AND gs.game_name = g.name)
            WHERE sp.attendee_id = ${user.id} AND gs.status = 'finished'
            GROUP BY g.id
        `)
    ]);

    const playedByGameId: Record<number, { playCount: number; winCount: number; firstPlayed: string; lastPlayed: string }> = {};
    for (const row of playedResult as any[]) {
        playedByGameId[row.game_id] = {
            playCount: row.play_count,
            winCount: row.win_count,
            firstPlayed: row.first_played,
            lastPlayed: row.last_played
        };
    }

    return {
        games: gamesResult as any[],
        playedByGameId
    };
};
