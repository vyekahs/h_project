import { db } from '$lib/server/db/index';
import { sql, eq } from 'drizzle-orm';
import { attendees } from '$lib/server/db/schema/core';

export async function promoteWaitlist(sessionId: number) {
    try {
        await db.transaction(async (tx) => {
            const sessionInfo = await tx.execute(sql`
                SELECT gs.id, gs.status, gs.max_players, COUNT(sp.id) as current_players
                FROM game_sessions gs
                LEFT JOIN session_participants sp ON gs.id = sp.session_id
                WHERE gs.id = ${sessionId}
                GROUP BY gs.id, gs.status, gs.max_players
            `);

            if (sessionInfo.length === 0) {
                return;
            }

            const { status, max_players, current_players } = sessionInfo[0] as any;

            if (current_players < max_players) {
                const nextInLine = await tx.execute(sql`
                    SELECT id, attendee_id FROM reservations
                    WHERE session_id = ${sessionId} AND status = 'waitlisted'
                    ORDER BY created_at ASC
                    LIMIT 1
                `);

                if (nextInLine.length > 0) {
                    const { id: reservationId, attendee_id: attendeeId } = nextInLine[0] as any;

                    if (status === 'scheduled') {
                        await tx.execute(sql`INSERT INTO session_participants (session_id, attendee_id) VALUES (${sessionId}, ${attendeeId})`);
                        await tx.execute(sql`DELETE FROM reservations WHERE id = ${reservationId}`);
                    } else if (status === 'playing') {
                        await tx.execute(sql`UPDATE reservations SET status = 'confirmed' WHERE id = ${reservationId}`);
                    }
                }
            }
        });
    } catch (e) {
        console.error('Failed to promote waitlist:', e);
    }
}

/** 페널티를 가감하고 적용 후 누적 점수를 돌려준다. 0점 아래로는 내려가지 않는다. */
export async function applyPenalty(attendeeId: number, points: number = 1): Promise<number> {
    const rows = await db.execute(sql`
        UPDATE attendees
        SET penalty_points = GREATEST(0, penalty_points + ${points}),
            last_penalty_at = NOW(),
            updated_at = NOW()
        WHERE id = ${attendeeId}
        RETURNING penalty_points
    `);
    return Number((rows as any[])[0]?.penalty_points ?? 0);
}
