import { json } from '@sveltejs/kit';
import { verifyAttendeeSession } from '$lib/server/auth';
import { db } from '$lib/server/db/index';
import { tichuDecisionLog } from '$lib/server/db/schema/minigame';
import type { RequestHandler } from './$types';

/** 한 번에 받을 수 있는 라운드 수 (한 게임이 이보다 길어지는 일은 없다) */
const MAX_ROWS = 30;

interface DecisionRow {
	roundNumber: number;
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
}

const clampNum = (v: unknown): number | null =>
	typeof v === 'number' && Number.isFinite(v) ? v : null;
const clampInt = (v: unknown): number | null =>
	typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null;
const clampIds = (v: unknown): string[] | null =>
	Array.isArray(v) && v.length <= 14 && v.every(x => typeof x === 'string' && x.length <= 32)
		? (v as string[])
		: null;

/**
 * 티츄 선언 판단 기록.
 *
 * AI의 선언 기준을 실제 플레이어와 같은 조건에서 비교/보정하기 위한 것이다.
 * 게임이 끝날 때 그 게임의 라운드들을 한 번에 보낸다.
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
		return json({ error: `한 번에 ${MAX_ROWS}라운드까지만 보낼 수 있습니다` }, { status: 400 });
	}

	const rows = (body.rounds as DecisionRow[])
		.filter(r => r && (r.declared === 'none' || r.declared === 'small' || r.declared === 'grand'))
		.map(r => ({
			userId: user.id,
			roundNumber: clampInt(r.roundNumber) ?? 0,
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
			partnerStrategy: typeof r.partnerStrategy === 'string' ? r.partnerStrategy.slice(0, 20) : null
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
