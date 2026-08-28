import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
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
    const { winner, scoreA, scoreB, playerData, sessionId } = await request.json();

    if (!winner || scoreA === undefined || scoreB === undefined || !playerData || playerData.length === 0) {
        return json({ error: 'Missing required fields' }, { status: 400 });
    }

    try {
        await db.transaction(async (tx) => {
            // 메인 화면에서 시작한 실제 게임과 연동된 카운터라면(sessionId 존재), 새 세션을
            // 만들지 않고 그 세션을 그대로 마무리한다. 그래야 "진행 중인 게임" 목록에서
            // 자동으로 사라지고, 메인 화면에서 또 "종료"를 눌러 중복 저장되는 일이 없다.
            let existingSession: { id: number } | null = null;
            if (sessionId) {
                const res = await tx.execute(sql`SELECT id FROM game_sessions WHERE id = ${sessionId} AND status != 'finished'`);
                existingSession = (res[0] as any) || null;
            }

            const targetSessionId: number = existingSession
                ? existingSession.id
                : (await tx.execute(
                    sql`INSERT INTO game_sessions (game_name, status, end_time, created_by)
                     VALUES ('티츄', 'finished', NOW(), ${playerData.find((p: any) => p.id > 0)?.id || null}) RETURNING id`
                  ) as any)[0].id;

            if (existingSession) {
                await tx.execute(sql`UPDATE game_sessions SET status = 'finished', end_time = NOW() WHERE id = ${targetSessionId}`);
            }

            for (const player of playerData) {
                const isWinner = player.team === winner;
                const score = player.team === 'A' ? scoreA : scoreB;

                if (existingSession) {
                    // 게임 시작 시점에 이미 만들어진 참가자 행을 갱신한다 (게스트는 음수 id = -session_participants.id)
                    if (player.id > 0) {
                        await tx.execute(
                            sql`UPDATE session_participants SET is_winner = ${isWinner}, score = ${score}
                             WHERE session_id = ${targetSessionId} AND attendee_id = ${player.id}`
                        );
                    } else {
                        await tx.execute(
                            sql`UPDATE session_participants SET is_winner = ${isWinner}, score = ${score}
                             WHERE session_id = ${targetSessionId} AND id = ${Math.abs(player.id)}`
                        );
                    }
                } else if (player.id > 0) {
                    await tx.execute(
                        sql`INSERT INTO session_participants (session_id, attendee_id, is_winner, score)
                         VALUES (${targetSessionId}, ${player.id}, ${isWinner}, ${score})`
                    );
                } else {
                    await tx.execute(
                        sql`INSERT INTO session_participants (session_id, guest_name, is_winner, score)
                         VALUES (${targetSessionId}, ${player.name}, ${isWinner}, ${score})`
                    );
                }
            }
        });
        return json({ success: true });
    } catch (e: any) {
        console.error('[Tichu Result Error]', e);
        return json({ error: '게임 결과 저장에 실패했습니다' }, { status: 500 });
    }
}
