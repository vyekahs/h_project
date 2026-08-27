/**
 * Monte Carlo sampling for Tichu endgame lead decisions.
 *
 * 상대/파트너의 실제 손패는 보이지 않으므로, 안 보이는 카드(unseen cards)를 무작위로
 * 여러 번 섞어 나눠본 "가상의 세계(world)"들을 만들고, 그 안에서 내 리드를 실제로
 * 이길 수 있는 손이 있는지 시뮬레이션해 승률을 추정한다 (Perfect Information Monte Carlo).
 *
 * 같은 worlds 집합을 decideLeadEndgame 호출 1회당 한 번만 만들어 모든 후보 콤보 평가에
 * 재사용한다 (common random numbers 기법) — 후보 간 비교의 분산을 줄이고 비용도 아낀다.
 */
import type { Card, Combination, SeatIndex } from '../types';
import type { AiDecisionContext } from './types';
import { createAllCards } from '../constants';
import { shuffle } from '../deck';
import { findBeatablePlays } from './handEvaluator';

export const DEFAULT_MC_SAMPLES = 20;

/** 파트너가 트릭을 이겨도 팀 입장에선 완전한 실패가 아니므로 절반 가중치로 인정 */
const PARTNER_SAFE_CREDIT = 0.5;

export interface SampledWorld {
	/** 나를 제외하고, 아직 손패가 남은 좌석 → 그 세계에서 배정된 손패 */
	hands: Map<SeatIndex, Card[]>;
}

/**
 * 아직 아무에게도 배정되지 않은(내 손패도, 이미 낸 카드도 아닌) 카드 목록.
 */
export function getUnseenCards(context: AiDecisionContext): Card[] {
	const seen = new Set<string>();
	for (const card of context.hand) seen.add(card.id);
	for (const player of context.players) {
		for (const card of player.wonCards) seen.add(card.id);
	}
	if (context.trick) {
		for (const play of context.trick.plays) {
			for (const card of play.combination.cards) seen.add(card.id);
		}
	}
	return createAllCards().filter(card => !seen.has(card.id));
}

/**
 * unseen 카드를 무작위로 나눠 sampleCount개의 가상 세계를 만든다.
 * 배정할 카드 수와 unseen 카드 수가 맞지 않으면(데이터 불일치) 빈 배열을 반환해
 * 호출부가 기존 정적 확률 로직으로 폴백하도록 한다.
 */
export function buildSampleWorlds(
	context: AiDecisionContext,
	sampleCount: number = DEFAULT_MC_SAMPLES
): SampledWorld[] {
	const seatsNeeded: { seat: SeatIndex; count: number }[] = [];
	for (const player of context.players) {
		if (player.seat === context.currentSeat) continue;
		if (player.finishOrder !== null) continue;
		if (player.hand.length === 0) continue;
		seatsNeeded.push({ seat: player.seat, count: player.hand.length });
	}

	const unseen = getUnseenCards(context);
	const totalNeeded = seatsNeeded.reduce((sum, s) => sum + s.count, 0);
	if (totalNeeded !== unseen.length) return [];

	const worlds: SampledWorld[] = [];
	for (let i = 0; i < sampleCount; i++) {
		const shuffled = shuffle(unseen);
		const hands = new Map<SeatIndex, Card[]>();
		let offset = 0;
		for (const { seat, count } of seatsNeeded) {
			hands.set(seat, shuffled.slice(offset, offset + count));
			offset += count;
		}
		worlds.push({ hands });
	}
	return worlds;
}

export type BeatOutcome = 'mine' | 'partner' | 'opponent';

/**
 * 하나의 가상 세계에서, 이 콤보를 누가 이길 수 있는지 분류.
 * 상대(opponent) 중 하나라도 이길 수 있으면 즉시 'opponent' (게임 최악의 경우 가정:
 * 이길 수 있으면 이긴다고 본다). 상대는 못 이기고 파트너만 이길 수 있으면 'partner'.
 * 아무도 못 이기면 'mine'.
 */
export function classifyBeatOutcome(
	combo: Combination,
	world: SampledWorld,
	partnerSeat: SeatIndex
): BeatOutcome {
	let partnerCanBeat = false;
	for (const [seat, cardsForSeat] of world.hands) {
		if (findBeatablePlays(cardsForSeat, combo).length === 0) continue;
		if (seat === partnerSeat) {
			partnerCanBeat = true;
		} else {
			return 'opponent';
		}
	}
	return partnerCanBeat ? 'partner' : 'mine';
}

export interface McLeadResult {
	mineRate: number;
	partnerRate: number;
	opponentRate: number;
	/** 팀 관점 실질 승률: mineRate + 0.5 * partnerRate */
	effectiveWinProb: number;
}

/**
 * 여러 세계에 걸쳐 이 리드가 안전한지(아무도 못 이기는지) 비율로 집계.
 */
export function evaluateLeadSafety(
	combo: Combination,
	worlds: SampledWorld[],
	partnerSeat: SeatIndex
): McLeadResult {
	if (worlds.length === 0) {
		return { mineRate: 0, partnerRate: 0, opponentRate: 0, effectiveWinProb: 0 };
	}
	let mine = 0;
	let partner = 0;
	let opponent = 0;
	for (const world of worlds) {
		const outcome = classifyBeatOutcome(combo, world, partnerSeat);
		if (outcome === 'mine') mine++;
		else if (outcome === 'partner') partner++;
		else opponent++;
	}
	const total = worlds.length;
	const mineRate = mine / total;
	const partnerRate = partner / total;
	return {
		mineRate,
		partnerRate,
		opponentRate: opponent / total,
		effectiveWinProb: mineRate + PARTNER_SAFE_CREDIT * partnerRate
	};
}

export interface McTwoTurnResult extends McLeadResult {
	/** 리드가 성공한 세계들 중, 2턴째(remainder)도 상대에게 뺏기지 않는 비율 */
	remainderSafeRate: number;
}

/**
 * 2턴 완성 계획(lead → remainder)을 평가.
 * 나가는 것 자체는 리드가 성공해야만 의미가 있으므로(리드가 막히면 2턴째를 낼 기회가 없음),
 * remainder 안전성은 리드가 'mine'으로 분류된 세계에서만 집계한다.
 */
export function evaluateTwoTurnFinish(
	lead: Combination,
	remainder: Combination,
	worlds: SampledWorld[],
	partnerSeat: SeatIndex
): McTwoTurnResult {
	if (worlds.length === 0) {
		return { mineRate: 0, partnerRate: 0, opponentRate: 0, effectiveWinProb: 0, remainderSafeRate: 0 };
	}
	let mine = 0;
	let partner = 0;
	let opponent = 0;
	let remainderSafe = 0;
	for (const world of worlds) {
		const leadOutcome = classifyBeatOutcome(lead, world, partnerSeat);
		if (leadOutcome === 'mine') {
			mine++;
			const remainderOutcome = classifyBeatOutcome(remainder, world, partnerSeat);
			if (remainderOutcome !== 'opponent') remainderSafe++;
		} else if (leadOutcome === 'partner') {
			partner++;
		} else {
			opponent++;
		}
	}
	const total = worlds.length;
	const mineRate = mine / total;
	const partnerRate = partner / total;
	return {
		mineRate,
		partnerRate,
		opponentRate: opponent / total,
		effectiveWinProb: mineRate + PARTNER_SAFE_CREDIT * partnerRate,
		remainderSafeRate: mine > 0 ? remainderSafe / mine : 0
	};
}
