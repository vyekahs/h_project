/*
    정기권 쓰기 경로는 하나여야 한다.

    예전에는 발급이 두 곳에 있었다 — 정기권 페이지와 회원 상세 페이지. 정기권
    페이지 것만 season_pass_logs 에 기록하고 되돌리기를 남겼고, 회원 상세 것은
    아무 흔적 없이 attendees 의 값만 덮었다. 그래서 「분명 있었는데 없어졌다」가
    생기면 무슨 일이 있었는지 아무도 알 수 없었다.

    월·화 보정도 각자 구현이었다. 회원 상세 쪽은 한 번만 밀어서(월→수) 같은
    시작일에도 정기권 페이지와 만료일이 달라질 수 있었다. computePassPeriod 는
    막힌 날을 하루씩 넘기므로 둘의 결과가 어긋난다.

    이 모듈이 그 하나의 경로다. 두 화면 모두 여기를 부른다.
*/
import { db } from './db/index';
import { sql } from 'drizzle-orm';
import { computePassPeriod } from '$lib/passPeriod';

/** 조정 일수의 상한. 예전에는 상한이 없어 −1 연타로 만료일이 과거까지 갔다. */
export const MAX_ADJUST_DAYS = 365;
/** 어드민 콘솔은 공용 계정 하나라 누가 눌렀는지는 남지 않는다. */
export const ACTOR = '관리자';

export type PassWriteResult =
	| { ok: false; status: number; error: string }
	| {
			ok: true;
			payload: { attendeeId: number; expiresBefore: string | null; logId: number };
			label: string;
			expiresDate: string;
			totalDays: number;
	  };

/** 발급. 이전 만료일이 있으면 재발급, 없으면 신규 — 사람이 고를 것이 아니다. */
export async function issuePass(opts: {
	attendeeId: number;
	startDate: string;
	note?: string;
	actor?: string;
}): Promise<PassWriteResult> {
	const { attendeeId, startDate } = opts;
	const note = (opts.note ?? '').trim();
	const actor = opts.actor ?? ACTOR;

	if (!attendeeId) return { ok: false, status: 400, error: '회원을 선택해주세요.' };
	const period = computePassPeriod(startDate);
	if (!period) return { ok: false, status: 400, error: '시작일을 올바르게 선택해주세요.' };

	const out = await db.transaction(async (tx) => {
		const prev = (
			(await tx.execute(
				sql`SELECT season_pass_expires_at FROM attendees WHERE id = ${attendeeId}`
			)) as any[]
		)[0];
		if (!prev) return { kind: 'error', message: '해당 회원을 찾을 수 없습니다.' } as const;

		const expiresBefore = prev.season_pass_expires_at ?? null;
		const label = expiresBefore ? '재발급' : '신규 발급';

		await tx.execute(sql`
			UPDATE attendees SET season_pass_expires_at = ${period.expiresAt.toISOString()}
			WHERE id = ${attendeeId}
		`);

		/* 규칙이 민 이유와 사람이 적은 메모를 같은 칸에서 읽는다 */
		const noteParts = [note, period.explanation].filter(Boolean);
		const rows = (await tx.execute(sql`
			INSERT INTO season_pass_logs
				(attendee_id, action, reason_id, reason_label, note, days,
				 started_on, expires_before, expires_after, actor)
			VALUES (${attendeeId}, 'grant', NULL, ${label},
					${noteParts.length ? noteParts.join(' · ') : null},
					${period.totalDays}, ${startDate}, ${expiresBefore},
					${period.expiresAt.toISOString()}, ${actor})
			RETURNING id
		`)) as any[];
		const logId = Number(rows[0].id);
		/* 발급 행이 정기권의 시작이다 — 자기 id 를 달아 이후 조정이 물려받게 한다 */
		await tx.execute(sql`UPDATE season_pass_logs SET pass_id = ${logId} WHERE id = ${logId}`);
		return { kind: 'ok', attendeeId, expiresBefore, logId, label } as const;
	});

	if (out.kind === 'error') return { ok: false, status: 400, error: out.message };
	return {
		ok: true,
		payload: { attendeeId: out.attendeeId, expiresBefore: out.expiresBefore ?? null, logId: out.logId },
		label: out.label,
		expiresDate: period.expiresDate,
		totalDays: period.totalDays
	};
}

/** 조정(±일). 사유 문구는 필수 — 왜 하루를 더 줬는지가 남지 않으면 이력이 아니다. */
export async function adjustPassDays(opts: {
	attendeeId: number;
	days: number;
	reasonId?: number | null;
	reasonLabel: string;
	actor?: string;
}): Promise<PassWriteResult> {
	const { attendeeId, days, reasonLabel } = opts;
	const reasonId = opts.reasonId ?? null;
	const actor = opts.actor ?? ACTOR;

	if (!attendeeId || !Number.isInteger(days) || days === 0) {
		return { ok: false, status: 400, error: '잘못된 요청입니다.' };
	}
	if (Math.abs(days) > MAX_ADJUST_DAYS) {
		return {
			ok: false,
			status: 400,
			error: `한 번에 조정할 수 있는 일수는 ${MAX_ADJUST_DAYS}일까지입니다.`
		};
	}

	const out = await db.transaction(async (tx) => {
		const prev = (
			(await tx.execute(
				sql`SELECT season_pass_expires_at FROM attendees WHERE id = ${attendeeId}`
			)) as any[]
		)[0];
		if (!prev?.season_pass_expires_at) return { kind: 'error', message: '유효한 정기권이 없습니다.' } as const;
		const expiresBefore = prev.season_pass_expires_at;

		const after = (
			(await tx.execute(sql`
				UPDATE attendees
				SET season_pass_expires_at = season_pass_expires_at + interval '1 day' * ${days}
				WHERE id = ${attendeeId}
				RETURNING season_pass_expires_at
			`)) as any[]
		)[0];

		const rows = (await tx.execute(sql`
			INSERT INTO season_pass_logs
				(attendee_id, pass_id, action, reason_id, reason_label, note, days,
				 expires_before, expires_after, actor)
			VALUES (${attendeeId},
					/* 지금 정기권 = 이 회원의 마지막 발급 행. 없으면 NULL(발급 기록 이전의 옛 정기권). */
					(SELECT MAX(id) FROM season_pass_logs
					  WHERE attendee_id = ${attendeeId} AND action = 'grant'),
					'adjust', ${reasonId}, ${reasonLabel}, NULL, ${days},
					${expiresBefore}, ${after.season_pass_expires_at}, ${actor})
			RETURNING id
		`)) as any[];
		return { kind: 'ok', attendeeId, expiresBefore, logId: Number(rows[0].id), label: reasonLabel } as const;
	});

	if (out.kind === 'error') return { ok: false, status: 400, error: out.message };
	return {
		ok: true,
		payload: { attendeeId: out.attendeeId, expiresBefore: out.expiresBefore ?? null, logId: out.logId },
		label: out.label,
		expiresDate: '',
		totalDays: days
	};
}

/*
    해지. 이 콘솔에서 정기권을 흔적 없이 지울 수 있던 마지막 경로였다 —
    만료일을 NULL 로 밀면 목록 조회(WHERE season_pass_expires_at IS NOT NULL)에서
    빠지므로, 왜 사라졌는지 나중에 아무도 알 수 없었다.

    남은 일수를 음수로 적어 「무엇을 잃었는지」가 이력에 드러나게 한다.
*/
export async function cancelPass(opts: {
	attendeeId: number;
	note?: string;
	actor?: string;
}): Promise<PassWriteResult> {
	const { attendeeId } = opts;
	const actor = opts.actor ?? ACTOR;

	const out = await db.transaction(async (tx) => {
		const prev = (
			(await tx.execute(
				sql`SELECT season_pass_expires_at FROM attendees WHERE id = ${attendeeId}`
			)) as any[]
		)[0];
		if (!prev?.season_pass_expires_at) return { kind: 'error', message: '유효한 정기권이 없습니다.' } as const;
		const expiresBefore = prev.season_pass_expires_at;
		const left = Math.max(
			0,
			Math.ceil((new Date(expiresBefore).getTime() - Date.now()) / 86_400_000)
		);

		await tx.execute(
			sql`UPDATE attendees SET season_pass_expires_at = NULL WHERE id = ${attendeeId}`
		);
		const rows = (await tx.execute(sql`
			INSERT INTO season_pass_logs
				(attendee_id, pass_id, action, reason_id, reason_label, note, days,
				 expires_before, expires_after, actor)
			VALUES (${attendeeId},
					(SELECT MAX(id) FROM season_pass_logs
					  WHERE attendee_id = ${attendeeId} AND action = 'grant'),
					'adjust', NULL, '해지', ${opts.note ?? null}, ${-left},
					${expiresBefore}, NULL, ${actor})
			RETURNING id
		`)) as any[];
		return { kind: 'ok', attendeeId, expiresBefore, logId: Number(rows[0].id), label: '해지' } as const;
	});

	if (out.kind === 'error') return { ok: false, status: 400, error: out.message };
	return {
		ok: true,
		payload: { attendeeId: out.attendeeId, expiresBefore: out.expiresBefore ?? null, logId: out.logId },
		label: out.label,
		expiresDate: '',
		totalDays: 0
	};
}

/*
    attendees.season_pass_expires_at 은 캐시다. 진실은 season_pass_logs 에 있다.

    발급이든 조정이든 그 사람의 마지막 행의 expires_after 가 곧 지금 만료일이므로,
    캐시가 깨져도 여기서 되살릴 수 있다. 2026-09-10 에 만료된 정기권들이 컬럼에서
    사라졌을 때, 이 함수가 있었다면 복구가 한 번이었다.

    기록이 없는 회원은 건드리지 않는다 — 되살릴 근거가 없는데 NULL 로 밀면
    멀쩡한 값까지 지우게 된다.

    기본은 dry-run 이다. 이력에 없는 경로로 값이 들어간 회원까지 덮을 수 있으므로,
    무엇이 바뀌는지 먼저 보고 apply: true 로 다시 부른다. 오늘의 교훈이다 —
    확인 없이 쓰는 복구는 두 번째 사고다.
*/
export async function rebuildPassCache(opts: { apply?: boolean } = {}) {
	const diff = (await db.execute(sql`
		WITH rebuilt AS (
			SELECT DISTINCT ON (attendee_id) attendee_id, expires_after
			FROM season_pass_logs
			ORDER BY attendee_id, created_at DESC, id DESC
		)
		SELECT a.id, a.name,
		       a.season_pass_expires_at AS current_value,
		       r.expires_after          AS rebuilt_value
		FROM attendees a
		JOIN rebuilt r ON r.attendee_id = a.id
		WHERE a.season_pass_expires_at IS DISTINCT FROM r.expires_after
		ORDER BY a.id
	`)) as any[];

	if (!opts.apply) return { applied: false, rows: diff };

	await db.execute(sql`
		WITH rebuilt AS (
			SELECT DISTINCT ON (attendee_id) attendee_id, expires_after
			FROM season_pass_logs
			ORDER BY attendee_id, created_at DESC, id DESC
		)
		UPDATE attendees a
		SET season_pass_expires_at = r.expires_after
		FROM rebuilt r
		WHERE a.id = r.attendee_id
		  AND a.season_pass_expires_at IS DISTINCT FROM r.expires_after
	`);
	return { applied: true, rows: diff };
}
