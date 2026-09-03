import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';

export class GameHistoryEditError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

const EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 게임 종료 시 입력한 승자/점수를 잘못 기록했을 때 고치는 공용 로직.
 * 마이페이지 활동 기록 탭과 장식장 모달, 두 곳에서 같은 규칙(참여자만,
 * 종료 후 일주일 이내)으로 써서 여기 하나로 모아둔다.
 */
export async function editGameResult(sessionId: string, userId: number, formData: FormData): Promise<void> {
    const sessionResult = await db.execute(sql`
        SELECT gs.status, gs.end_time
        FROM game_sessions gs
        WHERE gs.id = ${sessionId}
    `);
    const session = sessionResult[0] as any;
    if (!session || session.status !== 'finished') {
        throw new GameHistoryEditError(404, '게임 기록을 찾을 수 없습니다.');
    }

    if (Date.now() - new Date(session.end_time).getTime() > EDIT_WINDOW_MS) {
        throw new GameHistoryEditError(403, '게임을 마친 지 일주일이 지나 더 이상 수정할 수 없습니다.');
    }

    const participantResult = await db.execute(sql`
        SELECT 1 FROM session_participants WHERE session_id = ${sessionId} AND attendee_id = ${userId}
    `);
    if (participantResult.length === 0) {
        throw new GameHistoryEditError(403, '해당 게임의 참여자만 수정할 수 있습니다.');
    }

    const winnerIds = formData.getAll('winnerIds').map((id) => id.toString());
    const scores: Record<string, number> = {};
    for (const [key, value] of formData.entries()) {
        if (key.startsWith('score_')) {
            const attendeeId = key.replace('score_', '');
            if (value.toString().trim() !== '') {
                scores[attendeeId] = parseInt(value.toString());
            }
        }
    }

    await db.transaction(async (tx) => {
        // 이전에 기록된 승자 표시를 먼저 지워야, 승자를 바꿔 수정했을 때
        // 옛 승자가 그대로 남는 문제가 없다.
        await tx.execute(sql`UPDATE session_participants SET is_winner = false WHERE session_id = ${sessionId}`);
        if (winnerIds.length > 0) {
            await tx.execute(
                sql`UPDATE session_participants SET is_winner = true WHERE session_id = ${sessionId} AND attendee_id = ANY(${'{' + winnerIds.join(',') + '}'}::int[])`
            );
        }
        for (const [attendeeId, score] of Object.entries(scores)) {
            await tx.execute(sql`UPDATE session_participants SET score = ${score} WHERE session_id = ${sessionId} AND attendee_id = ${attendeeId}`);
        }
    });
}
