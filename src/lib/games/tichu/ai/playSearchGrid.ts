/**
 * Grid Probability Search System for Tichu AI
 *
 * 각 플레이 후보에 대해 확률 기반으로 최적의 플레이를 탐색.
 * winProb × exitRate + contextModifier → totalScore 비교.
 */
import type { Card, Combination, NormalCard, SeatIndex } from '../types';
import type { AiDecisionContext, PersonalityWeights } from './types';
import type { PresetBehavior } from './presets/types';
import type { CardTracker } from './cardTracker';
import { comboLikelyToWin, rankStrengthInContext } from './cardTracker';
import { findAllPlayableCombinations } from './handEvaluator';
import { isBomb, detectCombination } from '../combinations';
import { getTeam, getPartnerSeat, getLeftSeat } from '../constants';

// ===== Types =====

export interface PlayCandidate {
	combo: Combination;
	/** 이 트릭을 이길 확률 (0~1) */
	winProb: number;
	/** 남은 패 나가기 효율 (0~1) */
	exitRate: number;
	/** 예상 나가기 턴 수 */
	finishTurns: number;
	/** 상황 보정값 */
	contextMod: number;
	/** 최종 점수 */
	totalScore: number;
}

// ===== Main Search =====

/**
 * 모든 후보를 확률 기반으로 평가하고 최적 플레이 순으로 정렬 반환.
 *
 * 그리드 구조:
 *         후보1   후보2   후보3
 * winProb  0.9     0.6     0.3
 * exitRate 0.7     0.8     0.9
 * context  +0.1    -0.2    +0.3
 * total    0.72    0.50    0.63
 */
export function searchBestPlay(
	hand: Card[],
	candidates: Combination[],
	tracker: CardTracker,
	context: AiDecisionContext,
	weights: PersonalityWeights,
	behavior: PresetBehavior,
	mode: 'lead' | 'follow'
): PlayCandidate[] {
	if (candidates.length === 0) return [];

	// 파트너 티츄 선언 시 나가기 보너스 억제
	const partnerSeat = getPartnerSeat(context.currentSeat);
	const partnerInfo = context.players[partnerSeat];
	const partnerTichuActive = partnerInfo.finishOrder === null &&
		(partnerInfo.grandTichu === true || partnerInfo.smallTichu);

	// hand의 콤보를 루프 밖에서 한 번만 계산 (성능 최적화)
	const handCombos = findAllPlayableCombinations(hand);
	const handMultiCombos = handCombos.filter(c => !isBomb(c) && c.type !== 'single');
	const cardsInMultiCombo = new Set<string>();
	for (const mc of handMultiCombos) {
		for (const card of mc.cards) cardsInMultiCombo.add(card.id);
	}

	const results: PlayCandidate[] = [];

	for (const combo of candidates) {
		// 1. 이 콤보로 이 트릭을 이길 확률
		const winProb = comboLikelyToWin(combo, tracker, hand);

		// 2. 이 콤보를 낸 후 남은 패의 나가기 효율
		const remainingHand = hand.filter(c => !combo.cards.some(cc => cc.id === c.id));

		let exitRate: number;
		let finishTurns: number;

		if (remainingHand.length === 0) {
			// 이 콤보로 나갈 수 있음!
			exitRate = 1.0;
			finishTurns = 0;
		} else {
			const exitInfo = calcExitRate(remainingHand, tracker);
			exitRate = exitInfo.rate;
			finishTurns = exitInfo.turns;
		}

		// 3. 상황 보정
		const contextMod = calcContextModifier(
			combo, hand, remainingHand, context, tracker, weights, behavior, mode, finishTurns, cardsInMultiCombo
		);

		// 4. 최종 점수 계산
		// 리드: winProb이 낮은 카드일수록 먼저 내야 함 (나중에 팔로우용으로 강한 카드 보존)
		// 팔로우: winProb이 높아야 트릭을 뺏을 수 있음
		let totalScore: number;

		if (mode === 'lead') {
			// 리드: exitRate 중심 + 약한 카드 먼저 소모 보너스
			// exitRate가 높으면 이 콤보를 내고 남은 패가 효율적
			// (1 - winProb)가 높으면 팔로우로 이기기 어려운 카드 → 리드에서 먼저 처리
			totalScore = exitRate * 0.5 + (1 - winProb) * 0.3 + contextMod;

			// 나갈 수 있으면 대폭 보너스 (파트너 티츄면 억제)
			if (remainingHand.length === 0) {
				totalScore = (partnerTichuActive ? 0.8 : 2.0) + contextMod;
			}
		} else {
			// 팔로우: winProb과 exitRate 균형
			totalScore = winProb * 0.3 + exitRate * 0.4 + contextMod;

			// 나갈 수 있으면 대폭 보너스 (파트너 티츄면 억제)
			if (remainingHand.length === 0) {
				totalScore = (partnerTichuActive ? 0.8 : 2.0) + contextMod;
			}
		}

		results.push({ combo, winProb, exitRate, finishTurns, contextMod, totalScore });
	}

	// 점수 내림차순 정렬
	results.sort((a, b) => b.totalScore - a.totalScore);
	return results;
}

// ===== Exit Rate =====

interface ExitInfo {
	rate: number;
	turns: number;
}

/**
 * 남은 손패로 나가기 효율 계산.
 * Greedy 파티션: 가장 큰 콤보부터 선택 → 나머지는 싱글.
 * 각 턴의 승률을 합산하여 효율을 계산.
 */
function calcExitRate(hand: Card[], tracker: CardTracker): ExitInfo {
	if (hand.length === 0) return { rate: 1.0, turns: 0 };

	const combos = findAllPlayableCombinations(hand);
	const multiCombos = combos.filter(c =>
		!isBomb(c) && c.type !== 'single' &&
		// dog는 턴 소모하지만 카드 처리 안 됨 → 제외
		!(c.cards.length === 1 && c.cards[0].type === 'special' && c.cards[0].special === 'dog')
	);

	// Greedy 파티션: 가장 큰 콤보부터 선택 (겹치지 않게)
	const used = new Set<string>();
	const selected: Combination[] = [];
	const sorted = [...multiCombos].sort((a, b) =>
		b.cards.length - a.cards.length || a.rank - b.rank
	);

	for (const c of sorted) {
		if (c.cards.every(card => !used.has(card.id))) {
			c.cards.forEach(card => used.add(card.id));
			selected.push(c);
		}
	}

	const singleCards = hand.filter(c => !used.has(c.id));
	// dog는 리드 전용이므로 싱글로 처리되지만, 턴 카운트에는 포함
	const totalTurns = selected.length + singleCards.length;
	if (totalTurns === 0) return { rate: 1.0, turns: 0 };

	// 각 콤보/싱글의 승률 합산
	let totalWinProb = 0;
	for (const c of selected) {
		totalWinProb += comboLikelyToWin(c, tracker, hand);
	}

	for (const card of singleCards) {
		if (card.type === 'special' && card.special === 'phoenix') {
			// 봉황은 팔로우 시 현재 최고+0.5로 이김 → 높은 승률
			totalWinProb += 0.75;
		} else if (card.type === 'special' && card.special === 'dog') {
			// 개는 턴을 소모하지만 선을 파트너에게 넘기는 역할 → 낮은 승률
			totalWinProb += 0.1;
		} else {
			const rank = card.type === 'normal'
				? card.rank
				: (card.type === 'special' && card.special === 'dragon') ? 15
				: 1; // mahjong
			totalWinProb += rankStrengthInContext(rank, tracker);
		}
	}

	const avgWinProb = totalWinProb / totalTurns;

	// 콤보로 처리되는 카드 비율 (0~1)
	const comboCardRatio = hand.length > 0 ? (hand.length - singleCards.length) / hand.length : 0;

	// 턴 효율: 턴당 평균 처리 카드 수를 0~1로 정규화
	// 1카드/턴(싱글만)→0, 4카드/턴(큰 콤보)→1
	const cardsPerTurn = hand.length / totalTurns;
	const turnEfficiency = Math.min(1, (cardsPerTurn - 1) / 3);

	// exitRate = 승률 기반 + 핸드 구조 보너스
	const rate = Math.min(1.0,
		avgWinProb * 0.6          // 기본: 평균 승률
		+ turnEfficiency * 0.25   // 턴 효율 보너스
		+ comboCardRatio * 0.15   // 콤보 비율 보너스
	);

	return { rate, turns: totalTurns };
}

// ===== Context Modifier =====

/**
 * 상황 보정값 계산.
 * 기존 점수 시스템의 조건별 보너스/페널티를 확률 보정으로 변환.
 */
function calcContextModifier(
	combo: Combination,
	hand: Card[],
	remainingHand: Card[],
	context: AiDecisionContext,
	tracker: CardTracker,
	weights: PersonalityWeights,
	behavior: PresetBehavior,
	mode: 'lead' | 'follow',
	finishTurns: number,
	cardsInMultiCombo: Set<string>
): number {
	let mod = 0;

	const myTeam = getTeam(context.currentSeat);
	const partnerSeat = getPartnerSeat(context.currentSeat);
	const partner = context.players[partnerSeat];
	const partnerFinished = partner.finishOrder !== null;
	const partnerDeclaredTichu = partner.grandTichu === true || partner.smallTichu;
	const iDeclaredTichu = context.players[context.currentSeat].grandTichu === true ||
		context.players[context.currentSeat].smallTichu;

	// === 상대 위협 감지 ===
	const opponentThreat = context.players.some(
		p => getTeam(p.seat) !== myTeam && p.finishOrder === null && p.hand.length <= 4
	);
	// 티츄 선언 상대 (카드 수 무관 — 선언 자체가 위협)
	const opponentTichuThreat = context.players.some(
		p => getTeam(p.seat) !== myTeam &&
			(p.grandTichu === true || p.smallTichu) &&
			p.finishOrder === null
	);

	if (mode === 'lead') {
		// === 리드 상황 보정 ===

		// 프리셋 훅: 리드 스코어링 (additive — 상황 보정과 합산)
		const presetScore = behavior.scoreLeadCandidate?.(combo, hand, context);
		if (presetScore !== null && presetScore !== undefined) {
			mod += clamp(presetScore * 0.01, -0.3, 0.3);
		}

		// 특수 카드 보정
		if (combo.type === 'single' && combo.cards[0].type === 'special') {
			const special = combo.cards[0].special;
			if (special === 'mahjong') {
				mod += 0.4; // 마작 최우선 소모
			} else if (special === 'dragon') {
				mod -= 0.2; // 드래곤은 팔로우용
				if (hand.length <= 3) mod += 0.1;
			} else if (special === 'phoenix') {
				mod -= 0.15; // 봉황도 팔로우용
			}
		}

		// 마작 포함 스트레이트: 마작 소모 + 여러 장 처리
		if ((combo.type === 'straight' || combo.type === 'stairs') &&
			combo.cards.some(c => c.type === 'special' && c.special === 'mahjong')) {
			mod += 0.3;
		}

		// A 폭탄 리드 페널티
		if (isBomb(combo) && combo.rank === 14) {
			mod -= 0.4;
		}

		// 풀하우스: 강한 싱글톤을 페어로 낭비하면 감점
		if (combo.type === 'full_house') {
			mod += applyFullHousePenalty(combo, hand);
		}

		// 스트레이트: A/K 포함 시 고가치 카드 낭비 페널티
		if (combo.type === 'straight') {
			const hasAce = combo.cards.some(c => c.type === 'normal' && (c as NormalCard).rank === 14);
			const hasKing = combo.cards.some(c => c.type === 'normal' && (c as NormalCard).rank === 13);
			if (hasAce) mod -= 0.15;
			if (hasKing) mod -= 0.08;
		}

		// A/K 페어/트리플 리드 보존: 팔로우에서 상대 콤보를 이기는 데 필요
		if ((combo.type === 'pair' || combo.type === 'triple') && combo.rank >= 13 && hand.length > 4) {
			if (combo.rank === 14) mod -= 0.25; // A 페어/트리플: 강한 보존
			else mod -= 0.15;                    // K 페어/트리플: 중간 보존
		}

		// 봉황 페어/트리플 리드: 나갈 수 있을 때만 허용
		if ((combo.type === 'pair' || combo.type === 'triple') &&
			combo.cards.some(c => c.type === 'special' && c.special === 'phoenix') &&
			hand.length > 2) {
			mod -= 1.5;
			// 예외: 이 콤보로 나갈 수 있으면 허용
			if (remainingHand.length === 0 || finishTurns <= 1) mod += 1.5;
		}

		// 싱글: 멀티콤보 구성 카드를 싱글로 내면 감점
		if (combo.type === 'single' && combo.cards[0].type === 'normal') {
			const card = combo.cards[0] as NormalCard;
			if (cardsInMultiCombo.has(card.id) && card.rank <= 8) {
				mod -= 0.05;
			}
		}

		// 티츄 보정
		if (iDeclaredTichu) {
			// 많은 카드를 한 번에 처리하면 보너스
			mod += combo.cards.length * 0.02;
		}
		if (partnerDeclaredTichu && !partnerFinished) {
			// 파트너 티츄: 낮은 카드로 리드 → 파트너가 선 잡기 쉬움
			if (combo.rank <= 6) mod += 0.08;
			else mod -= combo.rank * 0.01;
		}

		// 파트너 카드 1~3장 → 낮은 리드로 지원
		if (!partnerFinished && partner.hand.length <= 3 && partner.hand.length > 0) {
			if (combo.rank <= 8) mod += 0.06;
		}

		// 상대 위협 시 큰 콤보로 빨리 나가기
		if (opponentThreat) {
			mod += combo.cards.length * 0.015;
		}

		// 상대 티츄 선언 + 카드 적으면 → 선 뺏기 위해 강한 리드 보너스
		if (opponentTichuThreat) {
			mod += 0.1;
			// 많은 카드 한 번에 처리 → 빨리 나가기
			mod += combo.cards.length * 0.02;
		}

		// 다음 플레이어가 상대이고 1장 남았으면 → 이길 수 있는 리드 강제
		const nextSeat = getLeftSeat(context.currentSeat) as SeatIndex;
		const nextPlayer = context.players[nextSeat];
		if (getTeam(nextSeat) !== myTeam && nextPlayer.finishOrder === null && nextPlayer.hand.length === 1) {
			if (combo.type === 'single' && combo.cards[0].type !== 'special') {
				// 낮은 싱글(≤10)은 상대가 이길 가능성 높음
				if (combo.rank <= 10) {
					mod -= 0.3;
				} else {
					mod += 0.15;
				}
			} else if (combo.type !== 'single') {
				// 멀티카드 콤보: 1장인 상대는 못 따라옴
				mod += 0.1;
			}
		}

		// Aggressiveness: 카드 수 보너스
		mod += combo.cards.length * weights.aggressiveness * 0.015;

	} else {
		// === 팔로우 상황 보정 ===
		const trick = context.trick!;
		const lastPlay = trick.plays[trick.plays.length - 1];
		const opponentWinning = getTeam(lastPlay.seat) !== myTeam;

		// 봉황 효과 보정: rank=0이지만 실제 A급
		const effectiveRank = (combo.type === 'single' &&
			combo.cards[0].type === 'special' &&
			combo.cards[0].special === 'phoenix') ? 14.5 : combo.rank;

		// 프리셋 훅: 팔로우 스코어링
		const trickCards = trick.plays.flatMap(p => p.combination.cards);
		const trickPoints = getTrickPoints(trickCards);

		const presetScore = behavior.scoreFollowCandidate?.(
			effectiveRank !== combo.rank ? { ...combo, rank: effectiveRank } : combo,
			hand, context, trickPoints, opponentWinning
		);
		if (presetScore !== null && presetScore !== undefined) {
			mod += clamp(presetScore * 0.01, -0.3, 0.3);
		}

		if (opponentWinning) {
			// 상대가 이기고 있으면 트릭 뺏기 보너스
			mod += 0.12;

			// 포인트 있는 트릭은 더 적극
			if (trickPoints >= 10) mod += trickPoints * 0.005;

			// 낮은 싱글톤이 많으면 선을 뺏어서 처리할 가치
			const lowSingletonCount = hand.filter(c =>
				!cardsInMultiCombo.has(c.id) &&
				c.type === 'normal' &&
				(c as NormalCard).rank <= 8
			).length;
			if (lowSingletonCount >= 2) mod += lowSingletonCount * 0.02;

			// 상대가 나가기 직전이면 반드시 뺏기
			const lastPlayerCards = context.players[lastPlay.seat].hand.length;
			if (lastPlayerCards <= 3) mod += 0.15;
		} else {
			// 파트너가 이기고 있으면 패스 선호
			mod -= 0.2;

			// 파트너 트릭에서 드래곤 사용은 최악 (25점 상대 선물 + 파트너 방해)
			if (combo.cards.some(c => c.type === 'special' && c.special === 'dragon')) {
				mod -= 0.5;
			}
		}

		// 드래곤 팔로우 페널티 (트릭 이기면 25점을 상대에게 선물)
		if (combo.cards.some(c => c.type === 'special' && c.special === 'dragon')) {
			mod -= 0.25; // 기본 페널티: 25점 선물 리스크
			// 1) 상대가 이기는 고포인트 트릭: 뺏을 가치가 충분
			if (opponentWinning && trickPoints >= 10) {
				mod += Math.min(0.3, trickPoints * 0.015);
			}
			// 2) 나갈 수 있으면: 1등 보너스가 선물 손해를 상쇄
			if (finishTurns <= 1) {
				mod += 0.35;
			} else if (finishTurns <= 2) {
				mod += 0.15;
			}
			// 3) 파트너에게 줄 수 있으면 페널티 감소
			if (!partnerFinished && partner.hand.length > 0) {
				mod += 0.05;
			}
		}

		// 파트너 나갔으면 빨리 나가기
		if (partnerFinished) {
			mod += combo.cards.length * 0.02;
		}

		// 풀하우스: 강한 싱글톤 페어로 낭비하면 감점
		if (combo.type === 'full_house') {
			mod += applyFullHousePenalty(combo, hand);
		}

		// 스트레이트: A/K 포함 시 고가치 카드 낭비 페널티
		if (combo.type === 'straight') {
			const hasAce = combo.cards.some(c => c.type === 'normal' && (c as NormalCard).rank === 14);
			const hasKing = combo.cards.some(c => c.type === 'normal' && (c as NormalCard).rank === 13);
			if (hasAce) mod -= 0.15;
			if (hasKing) mod -= 0.08;
		}

		// 봉황 페어/트리플 팔로우: 나갈 수 있거나 봉황 없이 이길 페어가 없을 때만 허용
		if ((combo.type === 'pair' || combo.type === 'triple') &&
			combo.cards.some(c => c.type === 'special' && c.special === 'phoenix') &&
			hand.length > 2) {
			mod -= 1.5;
			if (remainingHand.length === 0 || finishTurns <= 1) {
				// 예외1: 나갈 수 있으면 허용
				mod += 1.5;
			} else {
				// 예외2: 봉황 없이 현재 트릭을 이길 수 있는 자연 페어/트리플이 없으면 허용
				const beatRank = lastPlay.combination.rank;
				const normalCards = hand.filter(c => c.type === 'normal') as NormalCard[];
				const rankCounts = new Map<number, number>();
				for (const c of normalCards) rankCounts.set(c.rank, (rankCounts.get(c.rank) ?? 0) + 1);
				const needed = combo.type === 'pair' ? 2 : 3;
				const hasNaturalBeater = [...rankCounts.entries()].some(
					([rank, cnt]) => cnt >= needed && rank > beatRank
				);
				if (!hasNaturalBeater) mod += 1.5;
			}
		}

		// 엔드게임: 이 트릭 이기면 나갈 수 있나?
		if (hand.length <= 5 && remainingHand.length > 0) {
			const afterCombo = detectCombination(remainingHand);
			if (afterCombo) {
				mod += 0.25; // 1턴에 나갈 수 있음
			} else if (remainingHand.length === 1) {
				mod += 0.2; // 1장만 남음
			}
		}

		// 상대 티츄 선언 + 카드 적으면 → 적극 차단
		if (opponentTichuThreat && opponentWinning) {
			mod += 0.12;
		}

		// Aggressiveness modifier
		mod += effectiveRank * weights.aggressiveness * 0.005;

		// 약한 카드 선호 (강한 카드 보존)
		// 이길 수 있는 카드 중에서는 약한 카드 우선 → 강한 카드 보존
		mod -= effectiveRank * 0.025;
	}

	return clamp(mod, -0.5, 0.5);
}

// ===== Helpers =====

function clamp(v: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, v));
}

function getTrickPoints(cards: Card[]): number {
	let points = 0;
	for (const card of cards) {
		if (card.type === 'special') {
			if (card.special === 'dragon') points += 25;
			if (card.special === 'phoenix') points -= 25;
		} else {
			if (card.rank === 5) points += 5;
			if (card.rank === 10 || card.rank === 13) points += 10;
		}
	}
	return points;
}

/**
 * 풀하우스에서 강한 싱글톤을 페어로 낭비하는지 체크.
 * 감점값을 반환 (항상 0 이하).
 */
function applyFullHousePenalty(combo: Combination, hand: Card[]): number {
	let penalty = 0;
	// 풀하우스의 페어 파트 (rank !== combo.rank인 카드들)
	const pairCards = combo.cards.filter(c => {
		if (c.type !== 'normal') return false;
		return (c as NormalCard).rank !== combo.rank;
	});
	for (const pc of pairCards) {
		if (pc.type !== 'normal') continue;
		const pRank = (pc as NormalCard).rank;
		if (isSingletonInHand(pc, hand)) {
			if (pRank === 14) penalty -= 0.25;        // A 싱글톤 페어: 강한 페널티
			else if (pRank === 13) penalty -= 0.18;    // K 싱글톤 페어: 중간 페널티
			else if (pRank >= 11) penalty -= 0.06;
		}
	}
	return penalty;
}

/**
 * 카드가 핸드에서 싱글톤인지 (같은 랭크가 없는지).
 */
function isSingletonInHand(card: Card, hand: Card[]): boolean {
	if (card.type !== 'normal') return false;
	const rank = (card as NormalCard).rank;
	const sameRankCount = hand.filter(c => c.type === 'normal' && (c as NormalCard).rank === rank).length;
	return sameRankCount === 1;
}

