import { query } from './db';

/**
 * Promotes the next person in the waitlist for a given session.
 */
export async function promoteWaitlist(sessionId: number) {
    await query('BEGIN');
    try {
        // 1. Get session info and current participant count
        const sessionInfo = await query(`
            SELECT gs.id, gs.status, g.max_players, COUNT(sp.id) as current_players
            FROM game_sessions gs
            JOIN games g ON gs.game_id = g.id
            LEFT JOIN session_participants sp ON gs.id = sp.session_id
            WHERE gs.id = $1
            GROUP BY gs.id, gs.status, g.max_players
        `, [sessionId]);

        if (sessionInfo.rows.length === 0) {
            await query('ROLLBACK');
            return;
        }

        const { status, max_players, current_players } = sessionInfo.rows[0];

        // 2. If there's room, find the next waitlisted person
        if (current_players < max_players) {
            const nextInLine = await query(`
                SELECT id, attendee_id FROM reservations
                WHERE session_id = $1 AND status = 'waitlisted'
                ORDER BY created_at ASC
                LIMIT 1
            `, [sessionId]);

            if (nextInLine.rows.length > 0) {
                const { id: reservationId, attendee_id: attendeeId } = nextInLine.rows[0];

                if (status === 'scheduled') {
                    // For scheduled games, add them as participants directly
                    await query('INSERT INTO session_participants (session_id, attendee_id) VALUES ($1, $2)', [sessionId, attendeeId]);
                    await query('DELETE FROM reservations WHERE id = $1', [reservationId]);
                } else if (status === 'playing') {
                    // For playing games, confirm their reservation for the next round
                    await query("UPDATE reservations SET status = 'confirmed' WHERE id = $1", [reservationId]);
                }
            }
        }
        await query('COMMIT');
    } catch (e) {
        await query('ROLLBACK');
        console.error('Failed to promote waitlist:', e);
    }
}

/**
 * Applies a penalty to an attendee.
 */
export async function applyPenalty(attendeeId: number, points: number = 1) {
    await query(`
        UPDATE attendees 
        SET penalty_points = penalty_points + $1, 
            last_penalty_at = NOW(),
            updated_at = NOW()
        WHERE id = $2
    `, [points, attendeeId]);
}
