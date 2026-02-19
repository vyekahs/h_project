import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';

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

    if (!winner || scoreA === undefined || scoreB === undefined || !playerData || playerData.length === 0) {
        return json({ error: 'Missing required fields' }, { status: 400 });
    }

    try {
        await db.transaction(async (tx) => {
            // Always create a new game session
            const creatorId = playerData.find((p: any) => p.id > 0)?.id || null;
            const result = await tx.execute(
                sql`INSERT INTO game_sessions (game_name, status, end_time, created_by)
                 VALUES ('티츄', 'finished', NOW(), ${creatorId}) RETURNING id`
            );
            const newSessionId = (result[0] as any).id;

            for (const player of playerData) {
                const isWinner = player.team === winner;
                const score = player.team === 'A' ? scoreA : scoreB;

                if (player.id > 0) {
                    await tx.execute(
                        sql`INSERT INTO session_participants (session_id, attendee_id, is_winner, score)
                         VALUES (${newSessionId}, ${player.id}, ${isWinner}, ${score})`
                    );
                }
            }
        });
        return json({ success: true });
    } catch (e: any) {
        console.error('[Tichu Result Error]', e);
        return json({ error: '게임 결과 저장에 실패했습니다' }, { status: 500 });
    } finally {
        client.release();
    }
}
