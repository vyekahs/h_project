/**
 * 어드민 되돌리기.
 *
 * 노쇼 처리는 예약 취소 + 페널티 부여 + 대기 승계를 한 번에 하고, 그중 하나는
 * 제3자에게 영향을 준다. 게임 종료도 스트립과 목록 양쪽에서 확인창 없이 한 번에
 * 실행된다. 둘 다 실수했을 때 되돌릴 방법이 없었다.
 *
 * 원상태는 서버에 남긴다. 클라이언트에 상태를 들려 보냈다가 돌려받으면
 * 되돌리기가 "관리자가 아무 페널티나 지우고 아무나 참가시키는" 임의 변경
 * 수단이 되기 때문이다. 클라이언트는 불투명한 id만 받는다.
 *
 * 되돌리기는 방금 한 실수를 무르는 것이지 이력 관리가 아니므로 짧게 만료된다.
 */
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';

/** 이 시간이 지나면 되돌릴 수 없다. 토스트가 사라진 뒤 한참 있다 눌리는 것을 막는다. */
export const UNDO_WINDOW_MS = 10 * 60 * 1000;

export type UndoKind = 'no_show' | 'end_game';

export type UndoHandle = { id: number; label: string };

/** 되돌릴 수 있는 조치를 기록하고, 클라이언트에 줄 손잡이를 돌려준다. */
export async function recordUndo(
	kind: UndoKind,
	payload: Record<string, unknown>,
	label: string
): Promise<UndoHandle> {
	const rows = await db.execute(sql`
        INSERT INTO admin_undo (kind, payload, label)
        VALUES (${kind}, ${JSON.stringify(payload)}::jsonb, ${label})
        RETURNING id
    `);
	return { id: Number((rows as any[])[0].id), label };
}

export type TakeUndoResult =
	| { ok: true; kind: UndoKind; payload: any; label: string }
	| { ok: false; reason: 'already_undone' | 'expired' | 'unknown' };

/**
 * 되돌리기 기록을 한 번만 꺼낸다.
 *
 * consumed_at을 조건과 동시에 갱신해서, 되돌리기 버튼을 연타해도
 * 반전이 두 번 적용되지 않는다.
 */
export async function takeUndo(id: number): Promise<TakeUndoResult> {
	const rows = await db.execute(sql`
        UPDATE admin_undo
        SET consumed_at = NOW()
        WHERE id = ${id}
          AND consumed_at IS NULL
          AND created_at > NOW() - ${`${Math.round(UNDO_WINDOW_MS / 1000)} seconds`}::INTERVAL
        RETURNING kind, payload, label
    `);
	const row = (rows as any[])[0];
	if (row) {
		return { ok: true, kind: row.kind as UndoKind, payload: row.payload, label: row.label as string };
	}

	// 왜 못 꺼냈는지 구분한다. "시간이 지났다"와 "이미 되돌렸다"는 운영자에게
	// 다른 사실이고, 둘을 한 문구로 뭉뚱그리면 화면이 또 거짓말을 하게 된다.
	const probe = await db.execute(sql`
        SELECT consumed_at IS NOT NULL AS consumed FROM admin_undo WHERE id = ${id}
    `);
	const found = (probe as any[])[0];
	if (!found) return { ok: false, reason: 'unknown' };
	return { ok: false, reason: found.consumed ? 'already_undone' : 'expired' };
}
