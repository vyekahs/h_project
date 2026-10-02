import { json } from '@sveltejs/kit';
import { verifyAttendeeSession } from '$lib/server/auth';
import { db } from '$lib/server/db/index';
import { tichuDecisionLog } from '$lib/server/db/schema/minigame';
import type { RequestHandler } from './$types';

/** 한 번에 받을 수 있는 행 수 (한 라운드 = 네 자리 4행) */
const MAX_ROWS = 40;

interface DecisionRow {
	roundNumber: number;
	seat: number;
	seatStrategy: string | null;
	smallCardsOut: number | null;
	partnerDeclared: string;
	oppDeclared: string;
	finishPosition: number | null;
	plays: [number, string][] | null;
	pureWinRate: number | null;
	exitRate: number | null;
	minTurns: number | null;
	leadCombos: number | null;
	handStrength: number | null;
	raceProb: number | null;
	declared: 'none' | 'small' | 'grand';
	finishedFirst: boolean;
	teamScore: number | null;
	hand8: string[] | null;
	hand14: string[] | null;
	partnerStrategy: string | null;
	targetScore: number | null;
}

const clampNum = (v: unknown): number | null =>
	typeof v === 'number' && Number.isFinite(v) ? v : null;
const clampInt = (v: unknown): number | null =>
	typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null;
/** 플레이 기록: [자리, 내용] 배열. 형식이 조금이라도 어긋나면 통째로 버린다 */
const clampPlays = (v: unknown): [number, string][] | null =>
	Array.isArray(v) && v.length <= 300 && v.every(
		x => Array.isArray(x) && x.length === 2 && [0, 1, 2, 3].includes(x[0]) &&
			typeof x[1] === 'string' && x[1].length <= 200
	) ? (v as [number, string][]) : null;
const DECLARED = ['none', 'small', 'grand'];
const clampDeclared = (v: unknown): string | null =>
	typeof v === 'string' && DECLARED.includes(v) ? v : null;
const clampIds = (v: unknown): string[] | null =>
	Array.isArray(v) && v.length <= 14 && v.every(x => typeof x === 'string' && x.length <= 32)
		? (v as string[])
		: null;

/**
 * 티츄 선언 판단 기록.
 *
 * AI의 선언 기준을 실제 플레이어와 같은 조건에서 비교/보정하기 위한 것이다.
 * 라운드가 끝날 때마다 보낸다 (전송에 실패한 라운드는 다음 라운드와 함께 온다).
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
	const sessionToken = cookies.get('user_session');
	if (!sessionToken) return json({ error: '로그인이 필요합니다' }, { status: 401 });
	const user = await verifyAttendeeSession(sessionToken);
	if (!user) return json({ error: '세션이 만료되었습니다' }, { status: 401 });

	let body: { rounds?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: '잘못된 요청' }, { status: 400 });
	}
	if (!Array.isArray(body.rounds) || body.rounds.length === 0) {
		return json({ error: 'rounds가 필요합니다' }, { status: 400 });
	}
	if (body.rounds.length > MAX_ROWS) {
		return json({ error: `한 번에 ${MAX_ROWS}행까지만 보낼 수 있습니다` }, { status: 400 });
	}

	const rows = (body.rounds as DecisionRow[])
		.filter(r => r && (r.declared === 'none' || r.declared === 'small' || r.declared === 'grand'))
		.map(r => ({
			userId: user.id,
			roundNumber: clampInt(r.roundNumber) ?? 0,
			seat: [0, 1, 2, 3].includes(r.seat) ? r.seat : 0,
			seatStrategy: typeof r.seatStrategy === 'string' ? r.seatStrategy.slice(0, 20) : null,
			smallCardsOut: clampInt(r.smallCardsOut),
			partnerDeclared: clampDeclared(r.partnerDeclared),
			oppDeclared: clampDeclared(r.oppDeclared),
			finishPosition: [1, 2, 3, 4].includes(r.finishPosition as number) ? r.finishPosition : null,
			pureWinRate: clampNum(r.pureWinRate),
			exitRate: clampNum(r.exitRate),
			minTurns: clampInt(r.minTurns),
			leadCombos: clampInt(r.leadCombos),
			handStrength: clampNum(r.handStrength),
			raceProb: clampNum(r.raceProb),
			declared: r.declared,
			finishedFirst: r.finishedFirst === true,
			teamScore: clampInt(r.teamScore),
			hand8: clampIds(r.hand8),
			hand14: clampIds(r.hand14),
			partnerStrategy: typeof r.partnerStrategy === 'string' ? r.partnerStrategy.slice(0, 20) : null,
			targetScore: clampInt(r.targetScore),
			plays: clampPlays(r.plays)
		}));

	if (rows.length === 0) return json({ error: '유효한 라운드가 없습니다' }, { status: 400 });

	try {
		await db.insert(tichuDecisionLog).values(rows);
		return json({ ok: true, saved: rows.length });
	} catch (e) {
		console.error('[tichu/decision] 저장 실패', e);
		return json({ error: '저장에 실패했습니다' }, { status: 500 });
	}
};
