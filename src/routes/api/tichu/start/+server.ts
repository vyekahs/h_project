import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { verifyAttendeeSession } from '$lib/server/auth';
import { emitLiveEvent } from '$lib/server/liveEvents';

// 티츄 카운터에서 "재시작"으로 같은 4명이 바로 다음 판을 시작할 때 호출된다.
// 메인 화면의 "진행 중인 게임" 목록에 새 판이 즉시(플레이 도중에도) 보이도록
// 'playing' 상태의 game_sessions를 새로 만든다. 최초 시작(메인에서 이미 만든 세션으로
// 들어온 경우)에는 호출되지 않는다 — 그때는 기존 세션을 그대로 쓴다.
export async function POST({ request, cookies }: { request: Request; cookies: any }) {
    const sessionToken = cookies.get('user_session');
    if (!sessionToken) {
        return json({ error: '인증이 필요합니다' }, { status: 401 });
    }
    const user = await verifyAttendeeSession(sessionToken);
    if (!user) {
        return json({ error: '세션이 만료되었습니다' }, { status: 401 });
    }

    const { playerData } = await request.json();
    if (!Array.isArray(playerData) || playerData.length !== 4) {
        return json({ error: 'Missing required fields' }, { status: 400 });
    }

    try {
        const newSessionId = await db.transaction(async (tx) => {
            const creatorId = playerData.find((p: any) => p.id > 0)?.id || user.id;
            const result = await tx.execute(
                sql`INSERT INTO game_sessions (game_name, status, start_time, created_by)
                 VALUES ('티츄', 'playing', NOW(), ${creatorId}) RETURNING id`
            );
            const sessionId = (result[0] as any).id;

            for (const player of playerData) {
                if (player.id > 0) {
                    await tx.execute(
                        sql`INSERT INTO session_participants (session_id, attendee_id) VALUES (${sessionId}, ${player.id})`
                    );
                } else {
                    await tx.execute(
                        sql`INSERT INTO session_participants (session_id, guest_name) VALUES (${sessionId}, ${player.name})`
                    );
                }
            }
            return sessionId;
        });

        emitLiveEvent('games');
        return json({ success: true, sessionId: newSessionId });
    } catch (e: any) {
        console.error('[Tichu Start Error]', e);
        return json({ error: '게임 시작에 실패했습니다' }, { status: 500 });
    }
}
