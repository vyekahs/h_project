/**
 * 어드민 되돌리기.
 *
 * 노쇼 처리는 예약 취소 + 페널티 부여 + 대기 승계를 한 번에 하고, 그중 하나는
 * 제3자에게 영향을 준다. 게임 종료도 확인창 없이 한 번에 실행된다. 마감은
 * 방 전체를 퇴장시키고 도는 판을 모두 닫는다. 실수했을 때 되돌릴 방법이 없었다.
 *
 * 원상태는 서버에 남긴다. 클라이언트에 상태를 들려 보냈다가 돌려받으면
 * 되돌리기가 "관리자가 아무 페널티나 지우고 아무나 참가시키는" 임의 변경
 * 수단이 되기 때문이다. 클라이언트는 불투명한 id만 받는다.
 *
 * 되돌리기는 방금 한 실수를 무르는 것이지 이력 관리가 아니므로 짧게 만료된다.
 */
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { updateSettingsCache } from '$lib/server/ble';
import { emitLiveEvent } from '$lib/server/liveEvents';

/** 이 시간이 지나면 되돌릴 수 없다. 토스트가 사라진 뒤 한참 있다 눌리는 것을 막는다. */
export { UNDO_WINDOW_MS } from '../adminUndoWindow';
import { UNDO_WINDOW_MS } from '../adminUndoWindow';

/**
 * 되돌릴 수 있는 조치의 종류.
 *
 * 확인창을 거치는 조치도 여기 있다. 확인창이 막는 것은 오조작이지 오판이
 * 아니기 때문이다 — 동명이인을 고르거나 다른 사람의 사정을 나중에 듣는 일은
 * 확인창 뒤에서 일어난다.
 *
 * 한때 이 목록은 셋뿐이었고, 그래서 콘솔은 30초 토스트와 10분 창과 전용
 * 패널까지 지어놓고 파괴적 동작 여덟 중 다섯에서 그 배관에 연결하지 않았다.
 * 그중 하나가 사람을 판정하는 유일한 동작(페널티 부여)이었다.
 */
export type UndoKind =
	| 'no_show'
	| 'end_game'
	| 'blacklist'
	| 'penalty'
	| 'remove_attendee'
	| 'cancel_reservation'
	| 'dissolve_game'
	| 'end_expired_games'
	| 'close_day'
	| 'pass_grant'
	| 'pass_adjust';

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

export type UndoEntry = { kind: UndoKind; payload: any; label: string };
export type ApplyUndoResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * 되돌리기를 실제로 적용한다.
 *
 * 이 분기는 대시보드 액션 안에 인라인으로 있었다. 그런데 「최근 조치」 패널은
 * 페이지를 옮겨도 남고, 되돌리기 버튼은 누르는 시점의 URL 로 POST 한다 —
 * 대시보드에서 한 조치를 정기권 페이지에서 되돌리는 일이 실제로 일어난다.
 * 그때 그 라우트가 이 분기를 모르면 takeUndo 가 기록만 소비하고 원상복구는
 * 일어나지 않는다. 그래서 적용은 라우트가 아니라 여기가 갖는다.
 */
export async function applyUndo(entry: UndoEntry): Promise<ApplyUndoResult> {
	const { applyPenalty } = await import('$lib/server/reservations');

	try {
            if (entry.kind === 'end_game') {
                const { sessionId, prevEndTime } = entry.payload;
                await db.transaction(async (tx) => {
                    await tx.execute(sql`
                        UPDATE game_sessions SET status = 'playing', end_time = ${prevEndTime}
                        WHERE id = ${sessionId}
                    `);
                    await tx.execute(sql`
                        UPDATE session_participants SET is_winner = false, score = NULL
                        WHERE session_id = ${sessionId}
                    `);
                });
            } else if (entry.kind === 'blacklist') {
                const { attendeeId, prev } = entry.payload;
                await db.execute(sql`
                    UPDATE attendees SET is_blacklisted = ${prev} WHERE id = ${attendeeId}
                `);
            } else if (entry.kind === 'no_show') {
                const { sessionId, attendeeId, status, createdAt, hadParticipant, penaltyLogId, promoted } = entry.payload;
                await db.transaction(async (tx) => {
                    // 1. 승계부터 되돌린다. 자리를 비워야 원래 사람이 돌아올 수 있다.
                    if (promoted?.mode === 'joined') {
                        await tx.execute(sql`
                            DELETE FROM session_participants
                            WHERE session_id = ${sessionId} AND attendee_id = ${promoted.attendeeId}
                        `);
                        await tx.execute(sql`
                            INSERT INTO reservations (session_id, attendee_id, status, created_at)
                            VALUES (${sessionId}, ${promoted.attendeeId}, 'waitlisted', ${promoted.createdAt})
                        `);
                    } else if (promoted?.mode === 'confirmed') {
                        await tx.execute(sql`
                            UPDATE reservations SET status = 'waitlisted' WHERE id = ${promoted.reservationId}
                        `);
                    }

                    // 2. 예약을 원래 상태로 되돌린다. 신청 시각까지 살려야 대기 순서가 유지된다.
                    await tx.execute(sql`
                        INSERT INTO reservations (session_id, attendee_id, status, created_at)
                        VALUES (${sessionId}, ${attendeeId}, ${status}, ${createdAt})
                    `);
                    if (hadParticipant) {
                        await tx.execute(sql`
                            INSERT INTO session_participants (session_id, attendee_id)
                            VALUES (${sessionId}, ${attendeeId})
                        `);
                    }

                    // 3. 페널티와 그 기록을 함께 지운다. 기록만 남으면 이력이 거짓이 된다.
                    if (penaltyLogId) {
                        await tx.execute(sql`DELETE FROM penalty_logs WHERE id = ${penaltyLogId}`);
                    }
                });
                await applyPenalty(Number(attendeeId), -1);
            } else if (entry.kind === 'penalty') {
                const { attendeeId, points, penaltyLogId } = entry.payload;
                // 기록만 남으면 이력이 거짓이 되므로 점수와 로그를 함께 되돌린다.
                if (penaltyLogId) {
                    await db.execute(sql`DELETE FROM penalty_logs WHERE id = ${penaltyLogId}`);
                }
                await applyPenalty(Number(attendeeId), -Number(points));
            } else if (entry.kind === 'remove_attendee') {
                const { attendeeId, prevStatus, visitIds, prevGame } = entry.payload;
                await db.transaction(async (tx) => {
                    await tx.execute(sql`
                        UPDATE attendees SET status = ${prevStatus}, updated_at = NOW() WHERE id = ${attendeeId}
                    `);
                    for (const visitId of (visitIds ?? []) as number[]) {
                        await tx.execute(sql`UPDATE visits SET departure_time = NULL WHERE id = ${visitId}`);
                    }
                    if (prevGame) {
                        await tx.execute(sql`
                            UPDATE game_sessions SET status = ${prevGame.status}, end_time = ${prevGame.endTime}
                            WHERE id = ${prevGame.id}
                        `);
                    }
                });
            } else if (entry.kind === 'cancel_reservation') {
                const { sessionId, attendeeId, status, createdAt, hadParticipant, promoted } = entry.payload;
                await db.transaction(async (tx) => {
                    // 1. 승계부터 되돌린다. 자리를 비워야 원래 사람이 돌아올 수 있다.
                    if (promoted?.mode === 'joined') {
                        await tx.execute(sql`
                            DELETE FROM session_participants
                            WHERE session_id = ${sessionId} AND attendee_id = ${promoted.attendeeId}
                        `);
                        await tx.execute(sql`
                            INSERT INTO reservations (session_id, attendee_id, status, created_at)
                            VALUES (${sessionId}, ${promoted.attendeeId}, 'waitlisted', ${promoted.createdAt})
                        `);
                    } else if (promoted?.mode === 'confirmed') {
                        await tx.execute(sql`
                            UPDATE reservations SET status = 'waitlisted' WHERE id = ${promoted.reservationId}
                        `);
                    }
                    // 2. 신청 시각까지 살려야 대기 순서가 유지된다.
                    await tx.execute(sql`
                        INSERT INTO reservations (session_id, attendee_id, status, created_at)
                        VALUES (${sessionId}, ${attendeeId}, ${status}, ${createdAt})
                    `);
                    if (hadParticipant) {
                        await tx.execute(sql`
                            INSERT INTO session_participants (session_id, attendee_id)
                            VALUES (${sessionId}, ${attendeeId})
                        `);
                    }
                });
            } else if (entry.kind === 'dissolve_game') {
                const { session, participants, reservations, skip } = entry.payload;
                await db.transaction(async (tx) => {
                    // id까지 원래대로 돌아간다 — 시퀀스는 이미 그 값을 지나 있으므로 충돌하지 않는다.
                    await tx.execute(sql`
                        INSERT INTO game_sessions
                        SELECT * FROM jsonb_populate_record(NULL::game_sessions, ${JSON.stringify(session)}::jsonb)
                    `);
                    if (participants?.length) {
                        await tx.execute(sql`
                            INSERT INTO session_participants
                            SELECT * FROM jsonb_populate_recordset(NULL::session_participants, ${JSON.stringify(participants)}::jsonb)
                        `);
                    }
                    if (reservations?.length) {
                        await tx.execute(sql`
                            INSERT INTO reservations
                            SELECT * FROM jsonb_populate_recordset(NULL::reservations, ${JSON.stringify(reservations)}::jsonb)
                        `);
                    }
                    // 위에서 조건부로 넣었으므로 없을 수도 있다. DELETE는 그래도 안전하다.
                    if (skip) {
                        await tx.execute(sql`
                            DELETE FROM recurring_game_skips
                            WHERE recurring_schedule_id = ${skip.recurringScheduleId}
                              AND skip_date = ${skip.skipDate}::date
                        `);
                    }
                });
            } else if (entry.kind === 'end_expired_games') {
                const { games } = entry.payload;
                await db.transaction(async (tx) => {
                    for (const g of (games ?? []) as { id: number; endTime: string }[]) {
                        // 승자 기록 없이 닫힌 판이므로 참가자 결과는 건드리지 않는다.
                        await tx.execute(sql`
                            UPDATE game_sessions SET status = 'playing', end_time = ${g.endTime} WHERE id = ${g.id}
                        `);
                    }
                });
            } else if (entry.kind === 'close_day') {
                const { attendeeIds, visitIds, playing, scheduledIds, prevIsOpen, prevLastAutoClose } = entry.payload;
                await db.transaction(async (tx) => {
                    for (const attendeeId of (attendeeIds ?? []) as number[]) {
                        await tx.execute(sql`UPDATE attendees SET status = 'present' WHERE id = ${attendeeId}`);
                    }
                    for (const visitId of (visitIds ?? []) as number[]) {
                        await tx.execute(sql`UPDATE visits SET departure_time = NULL WHERE id = ${visitId}`);
                    }
                    for (const g of (playing ?? []) as { id: number; endTime: string }[]) {
                        await tx.execute(sql`
                            UPDATE game_sessions SET status = 'playing', end_time = ${g.endTime} WHERE id = ${g.id}
                        `);
                    }
                    for (const sessionId of (scheduledIds ?? []) as number[]) {
                        await tx.execute(sql`UPDATE game_sessions SET status = 'scheduled' WHERE id = ${sessionId}`);
                    }
                    const restoredIsOpen = prevIsOpen ?? 'true';
                    await tx.execute(sql`
                        INSERT INTO system_settings (key, value) VALUES ('is_open', ${restoredIsOpen})
                        ON CONFLICT (key) DO UPDATE SET value = ${restoredIsOpen}
                    `);
                    if (prevLastAutoClose === null) {
                        await tx.execute(sql`DELETE FROM system_settings WHERE key = 'last_auto_close_date'`);
                    } else {
                        await tx.execute(sql`
                            INSERT INTO system_settings (key, value) VALUES ('last_auto_close_date', ${prevLastAutoClose})
                            ON CONFLICT (key) DO UPDATE SET value = ${prevLastAutoClose}
                        `);
                    }
                });
                updateSettingsCache((prevIsOpen ?? 'true') === 'true');
                emitLiveEvent('visitors');
            } else if (entry.kind === 'pass_grant' || entry.kind === 'pass_adjust') {
                /*
                    정기권 두 조치는 되돌리는 방법이 같다 — 만료일을 조치 직전 값으로
                    돌려놓는다. 발급 전에 정기권이 없었으면 expiresBefore 가 null 이고,
                    그러면 없던 상태로 돌아간다.

                    이력 행도 함께 지운다. 페널티와 같은 규칙이다 — 되돌린 조치의
                    기록만 남으면 이력이 거짓이 된다.
                */
                const { attendeeId, expiresBefore, logId } = entry.payload;
                await db.transaction(async (tx) => {
                    await tx.execute(sql`
                        UPDATE attendees SET season_pass_expires_at = ${expiresBefore ?? null}
                        WHERE id = ${attendeeId}
                    `);
                    if (logId) {
                        await tx.execute(sql`DELETE FROM season_pass_logs WHERE id = ${logId}`);
                    }
                });
            } else {
                return { ok: false as const, status: 400, error: '되돌릴 수 없는 조치입니다.' };
            }
        } catch (error) {
            console.error('undoAdminAction failed:', error);
            return { ok: false as const, status: 500, error: '되돌리지 못했습니다. 화면을 새로고침해 상태를 확인해주세요.' };
        }

	emitLiveEvent('games');
	return { ok: true };
}
