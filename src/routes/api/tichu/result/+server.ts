import { json } from '@sveltejs/kit';
import { query } from '$lib/server/db';

export async function POST({ request }: { request: Request }) {
    const { winner, scoreA, scoreB, playerData } = await request.json();

    if (!winner || scoreA === undefined || scoreB === undefined || !playerData || playerData.length === 0) {
        return json({ error: 'Missing required fields' }, { status: 400 });
    }

    try {
        await query('BEGIN');

        // Always create a new game session
        const creatorId = playerData.find((p: any) => p.id > 0)?.id || null;
        const result = await query(
            `INSERT INTO game_sessions (game_name, status, end_time, created_by)
             VALUES ($1, $2, NOW(), $3) RETURNING id`,
            ['티츄', 'finished', creatorId]
        );
        const newSessionId = result.rows[0].id;

        for (const player of playerData) {
            const isWinner = player.team === winner;
            const score = player.team === 'A' ? scoreA : scoreB;

            if (player.id > 0) {
                await query(
                    `INSERT INTO session_participants (session_id, attendee_id, is_winner, score)
                     VALUES ($1, $2, $3, $4)`,
                    [newSessionId, player.id, isWinner, score]
                );
            }
        }

        await query('COMMIT');
        return json({ success: true });
    } catch (e: any) {
        await query('ROLLBACK');
        console.error('[Tichu Result Error]', e);
        return json({ error: e.message }, { status: 500 });
    }
}
