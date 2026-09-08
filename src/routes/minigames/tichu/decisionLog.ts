/**
 * 티츄 선언 판단 기록 수집.
 *
 * AI의 선언 기준은 지금 온라인 티츄 사이트 플레이어 6명의 누적 기록에 맞춰
 * 잡혀 있다. 그런데 그 사람들은 실력이 제각각인 온라인 상대와 붙었고 우리 AI는
 * 우리 AI를 상대한다. 조건이 달라서 비교가 얼마나 정확한지 알 수 없다.
 * 우리 플레이어의 기록은 **AI와 정확히 같은 상대·같은 규칙**이라 그 결함이 없다.
 *
 * 선언한 판만이 아니라 매 라운드를 남긴다. "이 손패에서 안 불렀다"도 기준을
 * 배우는 데 똑같이 중요해서, 선언율이 12%라면 8배 빨리 쌓인다.
 */
import { calcExitRate } from '$lib/games/tichu/ai/playSearchGrid';
import { buildCardTracker, comboLikelyToWin } from '$lib/games/tichu/ai/cardTracker';
import {
	evaluateHandStrength,
	findOptimalPartition,
	findAllPlayableCombinations
} from '$lib/games/tichu/ai/handEvaluator';
import { estimateGoOutFirstProb } from '$lib/games/tichu/ai/monteCarlo';
import { isBomb } from '$lib/games/tichu/combinations';
import type { Card } from '$lib/games/tichu/types';

export interface DecisionRow {
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

/** 라운드 진행 중 모아두는 임시 상태 */
interface Pending {
	roundNumber: number;
	hand8: string[] | null;
	hand14: string[] | null;
	features: Partial<DecisionRow>;
}

let pending: Pending | null = null;
let buffer: DecisionRow[] = [];

export function resetDecisionLog() {
	pending = null;
	buffer = [];
}

/** 그랜드 티츄 판단 시점(8장) */
export function noteGrandTichuHand(roundNumber: number, hand: Card[]) {
	pending = { roundNumber, hand8: hand.map(c => c.id), hand14: null, features: {} };
}

/**
 * 플레이 시작 시점(교환 후 14장) — 스몰 티츄 판단의 기준 시점이다.
 * AI가 쓰는 것과 같은 축의 특징값을 함께 계산해 둔다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function noteHandAtPlayStart(roundNumber: number, hand: Card[], engine: any) {
	if (!pending || pending.roundNumber !== roundNumber) {
		pending = { roundNumber, hand8: null, hand14: null, features: {} };
	}
	pending.hand14 = hand.map(c => c.id);
	try {
		const context = engine.createAiContext(0);
		const tracker = buildCardTracker(context);
		const exit = calcExitRate(hand, tracker);
		const nonBomb = findAllPlayableCombinations(hand).filter(c => !isBomb(c));
		const part = findOptimalPartition(hand, nonBomb);
		let leads = 0;
		for (const c of part.combos) {
			if (comboLikelyToWin(c, tracker, hand) >= 0.6) leads++;
		}
		pending.features = {
			pureWinRate: exit.pureWinRate,
			exitRate: exit.rate,
			minTurns: part.turns,
			leadCombos: leads,
			handStrength: evaluateHandStrength(hand),
			raceProb: estimateGoOutFirstProb(context, 24)
		};
	} catch {
		// 특징값 계산이 실패해도 원본 손패는 남긴다
	}
}

/** 라운드가 끝났을 때 실제 판단과 결과를 확정한다 */
export function commitRound(
	roundNumber: number,
	declared: 'none' | 'small' | 'grand',
	finishedFirst: boolean,
	teamScore: number,
	partnerStrategy: string
) {
	const p = pending && pending.roundNumber === roundNumber ? pending : null;
	buffer.push({
		roundNumber,
		pureWinRate: p?.features.pureWinRate ?? null,
		exitRate: p?.features.exitRate ?? null,
		minTurns: p?.features.minTurns ?? null,
		leadCombos: p?.features.leadCombos ?? null,
		handStrength: p?.features.handStrength ?? null,
		raceProb: p?.features.raceProb ?? null,
		declared,
		finishedFirst,
		teamScore,
		hand8: p?.hand8 ?? null,
		hand14: p?.hand14 ?? null,
		partnerStrategy
	});
	pending = null;
}

/**
 * 게임이 끝날 때 한 번에 보낸다.
 * 실패해도 게임 진행에는 영향이 없어야 하므로 조용히 넘어간다.
 */
export async function flushDecisionLog() {
	if (buffer.length === 0) return;
	const rounds = buffer.slice(0, 30);
	buffer = [];
	try {
		await fetch('/api/tichu/decision', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ rounds })
		});
	} catch {
		// 기록 실패는 무시 (로그인 안 한 상태 등)
	}
}
