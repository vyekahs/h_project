import { json } from '@sveltejs/kit';
import { getClient } from '$lib/server/db';
import { verifyAttendeeSession } from '$lib/server/auth';

export async function POST({ request, cookies }: { request: Request; cookies: any }) {
    const sessionToken = cookies.get('user_session');
    if (!sessionToken) {
        return json({ error: '인증이 필요합니다' }, { status: 401 });
    }
    const user = await verifyAttendeeSession(sessionToken);
    if (!user) {
        return json({ error: '세션이 만료되었습니다' }, { status: 401 });
    }
    const { winner, scoreA, scoreB, playerData, isAiGame } = await request.json();

    // AI games can be saved by any authenticated user; multiplayer requires admin
    if (!isAiGame && !user.can_manage_games && !user.is_admin) {
        return json({ error: '게임 관리 권한이 필요합니다' }, { status: 403 });
    }

    // Type validation
    if (typeof winner !== 'string' || !['A', 'B'].includes(winner)) {
        return json({ error: 'winner must be "A" or "B"' }, { status: 400 });
    }
    if (typeof scoreA !== 'number' || typeof scoreB !== 'number' || !Number.isFinite(scoreA) || !Number.isFinite(scoreB)) {
        return json({ error: 'scoreA and scoreB must be finite numbers' }, { status: 400 });
    }
    if (!Array.isArray(playerData) || playerData.length === 0) {
        return json({ error: 'playerData must be a non-empty array' }, { status: 400 });
    }
    for (const p of playerData) {
        if (typeof p.id !== 'number' || typeof p.team !== 'string' || !['A', 'B'].includes(p.team)) {
            return json({ error: 'Invalid playerData entry' }, { status: 400 });
        }
    }

    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Always create a new game session
        const creatorId = playerData.find((p: any) => p.id > 0)?.id ?? (isAiGame ? user.id : null);
        const result = await client.query(
            `INSERT INTO game_sessions (game_name, status, end_time, created_by)
             VALUES ($1, $2, NOW(), $3) RETURNING id`,
            ['티츄', 'finished', creatorId]
        );
        const newSessionId = result.rows[0].id;

        for (const player of playerData) {
            const isWinner = player.team === winner;
            const score = player.team === 'A' ? scoreA : scoreB;

            if (player.id > 0) {
                await client.query(
                    `INSERT INTO session_participants (session_id, attendee_id, is_winner, score)
                     VALUES ($1, $2, $3, $4)`,
                    [newSessionId, player.id, isWinner, score]
                );
            }
        }

        await client.query('COMMIT');
        return json({ success: true });
    } catch (e: any) {
        await client.query('ROLLBACK');
        console.error('[Tichu Result Error]', e);
        return json({ error: '게임 결과 저장에 실패했습니다' }, { status: 500 });
    } finally {
        client.release();
    }
}
