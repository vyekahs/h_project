import type { Card, Combination, SeatIndex, ExchangeCards, WishState, NormalCard } from '../types';
import type { AiDecisionContext, PersonalityWeights } from './types';
import type { PresetBehavior } from './presets/types';
import { getTeam, getPartnerSeat, getLeftSeat, getRightSeat } from '../constants';
import { canBeat, isBomb, detectCombination } from '../combinations';
import { mustPlayWishedRank, playFulfillsWish, canPlayWishedCombo } from '../wish';
import {
	evaluateHandStrength,
	findAllPlayableCombinations,
	findBeatablePlays,
	findBombs,
	getCardSortRank
} from './handEvaluator';
import {
	buildCardTracker,
	comboLikelyToWin,
	hasOpponentDeclaredTichu,
	type CardTracker
} from './cardTracker';
import { searchBestPlay, calcExitRate } from './playSearchGrid';

// ===== Hand Analysis Helpers =====

interface HandPlan {
	/** All possible combinations from hand */
	allCombos: Combination[];
	/** Multi-card combos (pairs, triples, straights, stairs, full houses) */
	multiCombos: Combination[];
	/** Singles */
	singles: Combination[];
	/** Bombs */
	bombs: Combination[];
	/** Count of cards that are "singletons" (rank appears only once, not in any multi-combo) */
	singletonCount: number;
	/** The worst cards (low singletons) */
	weakSingles: Combination[];
	/** Strong single cards (A, K, dragon, phoenix) */
	strongSingles: Combination[];
	/** Estimated number of turns to empty hand (lower = better) */
	turnsToEmpty: number;
	/** Cards that only exist as singletons (not part of any multi-combo) */
	singletonCards: Card[];
}

function analyzeHand(hand: Card[]): HandPlan {
	const allCombos = findAllPlayableCombinations(hand);
	const singles = allCombos.filter(c => c.type === 'single');
	const bombs = allCombos.filter(c => isBomb(c));
	const multiCombos = allCombos.filter(c => !isBomb(c) && c.type !== 'single');

	// Find cards that appear in multi-card combos
	const cardsInMulti = new Set<string>();
	for (const combo of multiCombos) {
		for (const card of combo.cards) {
			cardsInMulti.add(card.id);
		}
	}

	// Singletons: cards not part of any multi-card combo
	const singletonCards = hand.filter(c => !cardsInMulti.has(c.id));
	const singletonCount = singletonCards.filter(c => {
		if (c.type === 'special') return c.special !== 'dragon' && c.special !== 'phoenix';
		return true;
	}).length;

	const weakSingles = singles
		.filter(c => {
			const card = c.cards[0];
			if (card.type === 'special') return card.special === 'mahjong';
			return card.rank <= 8;
		})
		.sort((a, b) => a.rank - b.rank);

	const strongSingles = singles
		.filter(c => {
			const card = c.cards[0];
			if (card.type === 'special') return card.special === 'dragon' || card.special === 'phoenix';
			return card.rank >= 12;
		})
		.sort((a, b) => b.rank - a.rank);

	// Rough estimate: biggest combos first, then remaining as singles
	const turnsToEmpty = estimateTurnsToEmpty(hand, multiCombos, bombs);

	return { allCombos, multiCombos, singles, bombs, singletonCount, weakSingles, strongSingles, turnsToEmpty, singletonCards };
}

function estimateTurnsToEmpty(hand: Card[], multiCombos: Combination[], bombs: Combination[]): number {
	if (hand.length === 0) return 0;

	// Greedy: pick largest combos first, count turns
	const usedCards = new Set<string>();
	let turns = 0;

	// Sort multi-combos by size descending, then by rank ascending (prefer getting rid of low combos)
	const sorted = [...multiCombos, ...bombs].sort((a, b) => {
		if (b.cards.length !== a.cards.length) return b.cards.length - a.cards.length;
		return a.rank - b.rank;
	});

	for (const combo of sorted) {
		if (combo.cards.every(c => !usedCards.has(c.id))) {
			for (const c of combo.cards) usedCards.add(c.id);
			turns++;
		}
	}

	// Remaining cards are played as singles
	const remainingCount = hand.length - usedCards.size;
	turns += remainingCount;

	return turns;
}

/** Get trick point value */
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

// ===== Grand Tichu Decision =====

/**
 * Decide whether to declare Grand Tichu based on 8-card hand.
 */
export function decideGrandTichu(hand8: Card[], weights: PersonalityWeights, behavior: PresetBehavior = {}): boolean {
	// Behavior hook
	const override = behavior.shouldDeclareGrandTichu?.(hand8);
	if (override !== null && override !== undefined) return override;

	const strength = evaluateHandStrength(hand8);
	// Base threshold: 70. Lower tichoPropensity → higher threshold needed.
	const threshold = 70 - weights.tichoPropensity * 25;
	return strength >= threshold;
}

// ===== Small Tichu Decision =====

/**
 * Decide whether to declare Small Tichu based on full 14-card hand.
 */
export function decideSmallTichu(hand: Card[], weights: PersonalityWeights, context: AiDecisionContext, behavior: PresetBehavior = {}): boolean {
	// Behavior hook
	const override = behavior.shouldDeclareSmallTichu?.(hand, context);
	if (override !== null && override !== undefined) return override;

	const strength = evaluateHandStrength(hand);
	const threshold = 60 - weights.tichoPropensity * 20;

	// Don't declare if someone on opposing team already declared
	const myTeam = getTeam(context.currentSeat);
	const opponentDeclared = context.players.some(
		p => getTeam(p.seat) !== myTeam && (p.grandTichu === true || p.smallTichu)
	);
	if (opponentDeclared && weights.riskTolerance < 0.7) return false;

	// More likely if partner declared tichu (we want to help)
	const partner = context.players.find(p => p.seat === getPartnerSeat(context.currentSeat));
	if (partner?.grandTichu === true || partner?.smallTichu) return false; // partner already declared, don't double-up risk

	// Additional check: analyze hand structure
	const plan = analyzeHand(hand);
	// If too many singletons, hand is weak even if raw score is high
	if (plan.singletonCount >= 5 && weights.riskTolerance < 0.8) return false;
	// If we can empty in few turns, boost confidence
	if (plan.turnsToEmpty <= 5) return strength >= (threshold - 10);

	return strength >= threshold;
}

// ===== Exchange Card Selection =====

/**
 * Select 3 cards to exchange: one to partner, one to left, one to right.
 * Strategy: analyze hand structure and get rid of cards that hurt hand cohesion.
 */
export function selectExchangeCards(
	hand: Card[],
	seat: SeatIndex,
	weights: PersonalityWeights,
	behavior: PresetBehavior = {},
	partnerDeclaredTichu: boolean = false
): ExchangeCards {
	const normalCards = hand.filter(c => c.type === 'normal') as NormalCard[];
	const rankGroups = new Map<number, NormalCard[]>();
	for (const card of normalCards) {
		const group = rankGroups.get(card.rank) || [];
		group.push(card);
		rankGroups.set(card.rank, group);
	}

	// Identify singletons (rank with only 1 card) - these are hard to get rid of
	const singletons = normalCards.filter(c => (rankGroups.get(c.rank)?.length ?? 0) === 1);
	const lowSingletons = singletons
		.filter(c => c.rank <= 9)
		.sort((a, b) => a.rank - b.rank);

	// Cards NOT to give away
	const protectedIds = new Set<string>();
	// Protect dragon, phoenix
	for (const c of hand) {
		if (c.type === 'special' && (c.special === 'dragon' || c.special === 'phoenix')) {
			protectedIds.add(c.id);
		}
	}
	// Protect cards in bombs (four of a kind)
	for (const [, cards] of rankGroups) {
		if (cards.length === 4) {
			for (const c of cards) protectedIds.add(c.id);
		}
	}
	// Protect pairs of high cards (A, K, Q)
	for (const [rank, cards] of rankGroups) {
		if (rank >= 12 && cards.length >= 2) {
			for (const c of cards) protectedIds.add(c.id);
		}
	}

	// === Mahjong protection: 마작은 교환 대상에서 제외 ===
	const mahjongCard = hand.find(c => c.type === 'special' && c.special === 'mahjong');
	if (mahjongCard) {
		protectedIds.add(mahjongCard.id);
	}

	// === Card to give to partner ===
	let toPartner: Card | null = null;

	// Behavior hook: 마작을 파트너에게 줄지 결정 (변칙적만 해당)
	if (mahjongCard && behavior.shouldGiveMahjongToPartner?.(hand)) {
		toPartner = mahjongCard;
		protectedIds.delete(mahjongCard.id); // 마작을 주기로 했으므로 보호 해제
	}

	// 파트너가 티츄를 선언했으면 무조건 최고 카드를 줌 (behavior hook 스킵)
	// Behavior hook: 프리셋별 파트너 교환 카드 선택
	if (!toPartner && !partnerDeclaredTichu) {
		const behaviorCard = behavior.selectPartnerExchangeCard?.(hand, singletons, rankGroups, protectedIds);
		if (behaviorCard) {
			toPartner = behaviorCard;
		}
	}

	// Default: 용 > 봉 > A > K 순서로 가장 좋은 카드를 파트너에게 줌
	// (protectedIds 무시 — 파트너에게는 최고의 카드를 줘야 함)
	if (!toPartner) {
		const dragon = hand.find(c => c.type === 'special' && c.special === 'dragon');
		if (dragon) toPartner = dragon;
	}
	if (!toPartner) {
		const phoenix = hand.find(c => c.type === 'special' && c.special === 'phoenix');
		if (phoenix) toPartner = phoenix;
	}
	if (!toPartner) {
		// A가 있으면 무조건 1장 줌 (페어여도 파트너 지원이 더 중요)
		const aceGroup = rankGroups.get(14);
		if (aceGroup && aceGroup.length > 0) toPartner = aceGroup[0];
	}
	if (!toPartner) {
		// K가 있으면 무조건 1장 줌
		const kingGroup = rankGroups.get(13);
		if (kingGroup && kingGroup.length > 0) toPartner = kingGroup[0];
	}
	if (!toPartner) {
		// Fallback: 가장 강한 카드 (개, 마작 제외)
		const candidates = [...hand]
			.filter(c => !(c.type === 'special' && (c.special === 'dog' || c.special === 'mahjong')))
			.sort((a, b) => getCardSortRank(b) - getCardSortRank(a));
		if (candidates.length > 0) toPartner = candidates[0];
		else toPartner = hand[0];
	}

	// === Cards to give to opponents ===
	// 전략: 5점 카드(5) 선호, 낮은 싱글톤 → 상대에게 줘서 우리 핸드 정리
	const remaining = hand.filter(c => c.id !== toPartner!.id);
	const giveToOpponent: Card[] = [];

	// 5점 카드 싱글톤 우선: 콤보에 속하지 않는 5점 카드만 상대에게 줌
	const fivePointCards = remaining.filter(
		c => c.type === 'normal' && c.rank === 5
			&& !protectedIds.has(c.id)
			&& singletons.some(s => s.id === c.id)
	);
	for (const card of fivePointCards) {
		if (giveToOpponent.length >= 2) break;
		giveToOpponent.push(card);
	}

	// Low singletons
	for (const card of lowSingletons) {
		if (card.id === toPartner!.id) continue;
		if (protectedIds.has(card.id)) continue;
		if (giveToOpponent.some(g => g.id === card.id)) continue;
		if (giveToOpponent.length >= 2) break;
		giveToOpponent.push(card);
	}

	// Fill rest with lowest value cards (연속 랭크 피하기: 스트레이트 도움 방지)
	if (giveToOpponent.length < 2) {
		const sorted = remaining
			.filter(c => !giveToOpponent.some(g => g.id === c.id) && !protectedIds.has(c.id))
			.sort((a, b) => getCardSortRank(a) - getCardSortRank(b));
		// 연속 랭크 피하기: 이미 준 카드 랭크와 인접한 랭크 비선호
		const givenRanks = new Set<number>(giveToOpponent.filter(c => c.type === 'normal').map(c => (c as NormalCard).rank));
		const nonAdjacentFirst = sorted.sort((a, b) => {
			const aRank: number = a.type === 'normal' ? a.rank : 0;
			const bRank: number = b.type === 'normal' ? b.rank : 0;
			const aAdj = givenRanks.has(aRank - 1) || givenRanks.has(aRank + 1) ? 1 : 0;
			const bAdj = givenRanks.has(bRank - 1) || givenRanks.has(bRank + 1) ? 1 : 0;
			if (aAdj !== bAdj) return aAdj - bAdj; // 비인접 우선
			return getCardSortRank(a) - getCardSortRank(b);
		});
		for (const card of nonAdjacentFirst) {
			if (card.type === 'special' && (card.special === 'dragon' || card.special === 'phoenix' || card.special === 'mahjong')) continue;
			if (giveToOpponent.length >= 2) break;
			giveToOpponent.push(card);
		}
	}

	// Final fallback
	if (giveToOpponent.length < 2) {
		const sorted = remaining
			.filter(c => !giveToOpponent.some(g => g.id === c.id))
			.sort((a, b) => getCardSortRank(a) - getCardSortRank(b));
		while (giveToOpponent.length < 2 && sorted.length > 0) {
			giveToOpponent.push(sorted.shift()!);
		}
	}

	return {
		toPartner: toPartner!.id,
		toLeft: giveToOpponent[0].id,
		toRight: giveToOpponent[1].id
	};
}

// ===== Play Decision (Core) =====

/**
 * Decide what to play during the playing phase.
 * Returns card IDs to play, or 'pass'.
 */
export function decidePlay(
	context: AiDecisionContext,
	weights: PersonalityWeights,
	behavior: PresetBehavior = {}
): string[] | 'pass' {
	const { hand, trick, wish, currentSeat, players } = context;
	const myTeam = getTeam(currentSeat);
	const partnerSeat = getPartnerSeat(currentSeat);

	if (!trick || trick.plays.length === 0) {
		// === LEADING ===
		return decideLead(hand, wish, weights, context, behavior);
	}

	// === FOLLOWING ===
	const lastPlay = trick.plays[trick.plays.length - 1];
	const lastCombo = lastPlay.combination;
	const trickLeaderTeam = getTeam(lastPlay.seat);

	const partner = players[partnerSeat];
	const partnerWinning = lastPlay.seat === partnerSeat;

	// If partner is winning the trick
	if (partnerWinning && !isBomb(lastCombo)) {
		// Must play wish if enforced
		if (wish.active && wish.requestedRank !== null && mustPlayWishedRank(hand, wish)) {
			if (canPlayWishedCombo(hand, wish, lastCombo)) {
				return findWishedPlay(hand, wish, lastCombo);
			}
		}

		// 파트너 티츄 선언 or 파트너 카드 ≤3장이면 → 나갈 기회도 양보하고 패스
		const partnerDeclaredTichu = partner.grandTichu === true || partner.smallTichu;
		if (hand.length > 1 && partner.finishOrder === null &&
			(partnerDeclaredTichu || partner.hand.length <= 3)) {
			return 'pass';
		}

		// If I can finish by playing on partner's trick, do it
		if (hand.length === 1) {
			const myCombo = detectCombination([hand[0]]);
			if (myCombo && canBeat(lastCombo, myCombo)) {
				return [hand[0].id];
			}
		}

		// Behavior hook: 파트너가 이기고 있을 때 행동 오버라이드
		const partnerOverride = behavior.onPartnerWinning?.(hand, lastCombo, context);
		if (partnerOverride !== null && partnerOverride !== undefined) {
			return partnerOverride;
		}

		// partnerAwareness 기반 임계값: 높을수록 파트너 트릭을 더 존중 (낮은 threshold = 더 많이 패스)
		// 0.3(wild)→11, 0.4(aggressive)→10, 0.6(balanced)→8, 0.8(tricky)→6
		const passThreshold = Math.round(14 - weights.partnerAwareness * 10);
		if (lastCombo.rank >= passThreshold) {
			return 'pass';
		}

		// passThreshold 통과: 파트너 트릭을 뺏되, A/K 포함 콤보 및 봉황 포함 콤보는 사용 금지
		const beatableForPartner = findBeatablePlays(hand, lastCombo)
			.filter(c => !isBomb(c))
			.filter(c => !c.cards.some(card => card.type === 'normal' && (card as NormalCard).rank >= 13))
			.filter(c => !c.cards.some(card => card.type === 'special' && card.special === 'phoenix'));

		if (beatableForPartner.length === 0) {
			return 'pass';
		}
		// 가장 약한 카드로 뺏기
		beatableForPartner.sort((a, b) => a.rank - b.rank);
		return beatableForPartner[0].cards.map(c => c.id);
	}

	// Must play wish if active
	const wishEnforced = wish.active && wish.requestedRank !== null && mustPlayWishedRank(hand, wish);
	if (wishEnforced && canPlayWishedCombo(hand, wish, lastCombo)) {
		const wishedPlay = findWishedPlay(hand, wish, lastCombo);
		if (wishedPlay.length > 0) return wishedPlay;
	}

	// Find all plays that can beat the current trick
	let beatablePlays = findBeatablePlays(hand, lastCombo);
	if (beatablePlays.length === 0) return 'pass';

	// If wish enforcement active, prefer plays that include the wished rank
	if (wishEnforced && canPlayWishedCombo(hand, wish, lastCombo)) {
		const wishedPlays = beatablePlays.filter(c => playFulfillsWish(c.cards, wish));
		if (wishedPlays.length > 0) {
			beatablePlays = wishedPlays;
		}
	}

	// Filter out bombs (handle separately)
	// 파트너 티츄 선언 시 내가 먼저 나가기 억제
	const partnerTichuInFollow = partner.finishOrder === null &&
		(partner.grandTichu === true || partner.smallTichu);
	const iAmCloseToFinishing = hand.length <= 3 && !partnerTichuInFollow;
	// A 트리플/풀하우스는 나갈 수 있는 상황이 아니면 제외
	const nonBombPlays = beatablePlays.filter(c => {
		if (isBomb(c)) return false;
		if (!iAmCloseToFinishing && c.rank === 14 && (c.type === 'triple' || c.type === 'full_house' || c.type === 'stairs' || c.type === 'straight')) return false;
		return true;
	});
	// A 폭탄은 가능하면 사용하지 않음 (A는 싱글 선먹기용으로 보존)
	const allBombPlays = beatablePlays.filter(c => isBomb(c));
	const nonAceBombs = allBombPlays.filter(c => c.rank !== 14);
	const bombPlays = nonAceBombs.length > 0 ? nonAceBombs : allBombPlays;

	// === Situational awareness ===
	const opponentAboutToFinish = players.some(
		p => getTeam(p.seat) !== myTeam && p.finishOrder === null && p.hand.length <= 2
	);
	const partnerAboutToFinish = partner.finishOrder === null && partner.hand.length <= 2;

	// Calculate trick point value
	const trickCards = trick.plays.flatMap(p => p.combination.cards);
	const trickPoints = getTrickPoints(trickCards);

	// Is the opponent who played the last card about to finish?
	const lastPlayer = players[lastPlay.seat];
	const lastPlayerAboutToFinish = lastPlayer.finishOrder === null && lastPlayer.hand.length <= 2;

	// === Bomb decisions ===
	// Use bomb if opponent about to finish
	if (opponentAboutToFinish && bombPlays.length > 0 && weights.bombHolding < 0.8) {
		return bombPlays.sort((a, b) => a.rank - b.rank)[0].cards.map(c => c.id);
	}

	// Use bomb if the last player is about to go out and winning the trick
	if (lastPlayerAboutToFinish && trickLeaderTeam !== myTeam && bombPlays.length > 0) {
		return bombPlays.sort((a, b) => a.rank - b.rank)[0].cards.map(c => c.id);
	}

	// Use bomb if trick has very high points AND opponent is winning
	if (trickPoints >= 20 && trickLeaderTeam !== myTeam && bombPlays.length > 0 && weights.aggressiveness > 0.3) {
		return bombPlays.sort((a, b) => a.rank - b.rank)[0].cards.map(c => c.id);
	}

	// === 봉황 싱글 팔로우 제한 ===
	// 봉황 싱글은 "봉황이 탑(이길 카드가 게임에 없음)"일 때만 허용
	const isPhoenixSingle = (c: Combination) =>
		c.type === 'single' && c.cards[0].type === 'special' && c.cards[0].special === 'phoenix';

	let playsForFollow = nonBombPlays;
	if (nonBombPlays.some(isPhoenixSingle)) {
		let phoenixAllowed = hand.length === 1; // 마지막 카드면 무조건 허용

		if (!phoenixAllowed) {
			if (partnerWinning) {
				// 파트너가 이기고 있으면 봉황 싱글 금지 (파트너 트릭 보호)
				phoenixAllowed = false;
			} else {
				// 봉황이 탑인지 확인: 봉황 rank 이상의 카드가 다른 손에 없고 드래곤도 없어야 함
				const tracker = buildCardTracker(context);
				const phoenixRank = Math.ceil(lastCombo.rank + 0.5);
				let higherCardsOut = 0;
				for (let r = phoenixRank; r <= 14; r++) {
					higherCardsOut += tracker.remainingByRank.get(r) || 0;
				}
				if (!tracker.dragonPlayed && !tracker.dragonInMyHand) higherCardsOut++;
				phoenixAllowed = higherCardsOut === 0;
			}
		}

		if (!phoenixAllowed) {
			const filtered = nonBombPlays.filter(c => !isPhoenixSingle(c));
			playsForFollow = filtered;
		}
	}

	if (playsForFollow.length === 0) {
		// Only bombs available
		if (bombPlays.length > 0) {
			if (weights.bombHolding > 0.7 && !opponentAboutToFinish && trickPoints < 15) {
				return 'pass'; // Hold bomb for later
			}
			return bombPlays.sort((a, b) => a.rank - b.rank)[0].cards.map(c => c.id);
		}
		return 'pass';
	}

	// === Pick which non-bomb play to make ===
	return pickBestFollow(playsForFollow, hand, weights, context, iAmCloseToFinishing, partnerAboutToFinish, behavior);
}

/**
 * Pick the best card to play when following a trick.
 * Enhanced with situational awareness: seat position, card strength, opponent threat.
 */
function pickBestFollow(
	plays: Combination[],
	hand: Card[],
	weights: PersonalityWeights,
	context: AiDecisionContext,
	iAmClose: boolean,
	partnerClose: boolean,
	behavior: PresetBehavior = {}
): string[] | 'pass' {
	const myTeam = getTeam(context.currentSeat);
	const trick = context.trick!;
	const lastPlay = trick.plays[trick.plays.length - 1];
	const opponentWinning = getTeam(lastPlay.seat) !== myTeam;

	// Sort by rank ascending (weakest first)
	const sorted = [...plays].sort((a, b) => a.rank - b.rank);

	// If I can finish with this play, always play strongest to guarantee the win
	if (iAmClose) {
		const finishingPlays = sorted.filter(p => p.cards.length >= hand.length);
		if (finishingPlays.length > 0) {
			return finishingPlays[finishingPlays.length - 1].cards.map(c => c.id);
		}
		// 1장만 남는 경우: 남는 카드가 리드로 이길 수 있으면 약한 카드로 팔로우
		if (hand.length - sorted[0].cards.length === 1) {
			for (let i = 0; i < sorted.length; i++) {
				const remaining = hand.filter(c => !sorted[i].cards.some(pc => pc.id === c.id));
				if (remaining.length !== 1) continue;
				const lastCard = remaining[0];
				const lastRank = lastCard.type === 'normal'
					? lastCard.rank
					: (lastCard.type === 'special' && lastCard.special === 'dragon') ? 16
					: 0; // Phoenix/Mahjong/Dog은 리드용으로 약함
				// 남는 카드가 A/K/Dragon이면 약한 것으로 팔로우하고 강한 카드 보존
				if (lastRank >= 13) return sorted[i].cards.map(c => c.id);
			}
			// 남는 카드가 약하면 가장 강한 카드로 팔로우 (이번 트릭이라도 확실히 이김)
			return sorted[sorted.length - 1].cards.map(c => c.id);
		}
	}

	// If partner is about to finish, play weakest to let partner get the lead
	if (partnerClose && !opponentWinning) {
		return sorted[0].cards.map(c => c.id);
	}

	// === 그리드 확률 탐색: 팔로우 후보 평가 ===
	const tracker = buildCardTracker(context);
	const gridResults = searchBestPlay(hand, plays, tracker, context, weights, behavior, 'follow');

	if (gridResults.length === 0) {
		return sorted[0].cards.map(c => c.id); // fallback: 가장 약한 카드
	}

	const bestResult = gridResults[0];

	// 나갈 수 있으면 무조건 냄
	if (iAmClose) {
		return bestResult.combo.cards.map(c => c.id);
	}

	// === 전략적 패스: 확률이 낮으면 패스 ===
	const passThreshold = 0.15 + weights.aggressiveness * 0.1;

	if (bestResult.totalScore < passThreshold) {
		// 단, 패스하면 안 되는 상황 체크
		const trickCards = context.trick!.plays.flatMap(p => p.combination.cards);
		const trickPoints = getTrickPoints(trickCards);

		const mustPlay =
			// 상대가 나가기 직전이면 뺏어야 함 (4장 이하로 확대)
			context.players.some(p => getTeam(p.seat) !== myTeam && p.finishOrder === null && p.hand.length <= 4) ||
			// 티츄 선언 상대가 있으면 반드시 차단
			context.players.some(p =>
				getTeam(p.seat) !== myTeam &&
				(p.grandTichu === true || p.smallTichu) &&
				p.finishOrder === null
			) ||
			// 트릭 포인트가 높으면 뺏어야 함
			(trickPoints >= 15 && getTeam(lastPlay.seat) !== myTeam);

		if (!mustPlay) {
			return 'pass';
		}
	}

	return bestResult.combo.cards.map(c => c.id);
}

/**
 * Decide what to lead with when starting a new trick.
 *
 * Key principles:
 * 1. Get rid of weak combos first (low pairs, short straights)
 * 2. Lead singletons from bottom (low singles) so you don't get stuck with them
 * 3. Save strong cards (A, K, dragon) to take tricks when needed
 * 4. Play dog to give lead to partner when strategic
 * 5. Play large combos to clear hand efficiently
 * 6. Consider what cards opponents likely still have
 */
function decideLead(
	hand: Card[],
	wish: WishState,
	weights: PersonalityWeights,
	context: AiDecisionContext,
	behavior: PresetBehavior = {}
): string[] {
	const partnerSeat = getPartnerSeat(context.currentSeat);
	const partner = context.players[partnerSeat];
	const plan = analyzeHand(hand);
	const tracker = buildCardTracker(context);

	// If wish is active, must lead with wished rank if possible
	if (wish.active && wish.requestedRank !== null && mustPlayWishedRank(hand, wish)) {
		const wishedCards = hand.filter(c => c.type === 'normal' && c.rank === wish.requestedRank);
		if (wishedCards.length > 0) {
			const allCombos = findAllPlayableCombinations(hand);
			const wishedCombos = allCombos.filter(c => playFulfillsWish(c.cards, wish));
			if (wishedCombos.length > 0) {
				// Pick combo that uses the most cards (empty hand faster)
				const sorted = wishedCombos.sort((a, b) => b.cards.length - a.cards.length);
				return sorted[0].cards.map(c => c.id);
			}
			return [wishedCards[0].id];
		}
	}

	// === 마작 최우선 소모: 개(dog)보다 먼저 처리 ===
	const hasMahjong = hand.some(c => c.type === 'special' && c.special === 'mahjong');
	if (hasMahjong) {
		// 마작이 포함된 스트레이트가 있으면 그것을 우선 사용
		const mahjongStraights = plan.allCombos.filter(
			c => c.type === 'straight' && c.cards.some(card => card.type === 'special' && card.special === 'mahjong')
		);
		if (mahjongStraights.length > 0) {
			// 가장 긴 스트레이트 선택 (카드 많이 처리)
			mahjongStraights.sort((a, b) => b.cards.length - a.cards.length);
			return mahjongStraights[0].cards.map(c => c.id);
		}
		// 스트레이트가 없으면 마작 싱글
		const mahjongCard = hand.find(c => c.type === 'special' && c.special === 'mahjong')!;
		return [mahjongCard.id];
	}

	// === Dog play: give lead to partner ===
	const dogCard = hand.find(c => c.type === 'special' && c.special === 'dog');
	if (dogCard && partner && partner.finishOrder === null) {
		// Behavior hook: dog 플레이 오버라이드
		const dogOverride = behavior.shouldPlayDog?.(hand, partner, context);
		if (dogOverride === true) {
			return [dogCard.id];
		} else if (dogOverride === false) {
			// Don't play dog — skip to normal lead
		} else {
			// null = default logic
			const partnerDeclaredTichu = partner.grandTichu === true || partner.smallTichu;
			const partnerHasFewCards = partner.hand.length <= 5;
			const myHandIsBad = plan.singletonCount >= 4;

			// Play dog when partner declared tichu
			if (partnerDeclaredTichu) {
				return [dogCard.id];
			}
			// Play dog when partner has few cards and we're aware
			if (partnerHasFewCards && weights.partnerAwareness > 0.3) {
				return [dogCard.id];
			}
			// Play dog when our hand is bad and we trust partner
			if (myHandIsBad && weights.partnerAwareness > 0.5 && hand.length > 3) {
				return [dogCard.id];
			}
			// Play dog when we have many cards and partner has fewer (partner is in better position)
			if (hand.length >= 10 && partner.hand.length <= 8 && weights.partnerAwareness > 0.4) {
				return [dogCard.id];
			}
		}
	}

	// === Close to finishing: play the combo that empties our hand ===
	// 파트너가 티츄 선언하고 아직 안 나갔으면 → 내가 먼저 나가지 않음
	const partnerForEndgame = context.players[getPartnerSeat(context.currentSeat)];
	const partnerTichuActive = partnerForEndgame.finishOrder === null &&
		(partnerForEndgame.grandTichu === true || partnerForEndgame.smallTichu);
	if (hand.length <= 5 && !partnerTichuActive) {
		const endgameResult = decideLeadEndgame(hand, plan, weights, context);
		if (endgameResult.length > 0) return endgameResult;
	}

	// Behavior hook: 드래곤 리드 사용 조건
	const dragonLeadAllowed = behavior.shouldLeadDragon?.(hand, context);

	// Get all lead candidates (exclude dog, handled above; exclude bombs unless aggressive)
	const canFinishSoon = hand.length <= 5;
	let candidates = plan.allCombos.filter(c => {
		if (isDogCombo(c)) return false;
		if (isBomb(c) && weights.bombHolding > 0.3) return false;
		// A 포함 트리플/풀하우스/연속페어 리드 금지 (나갈 수 있는 상황 제외)
		if (!canFinishSoon && c.rank === 14 && (c.type === 'triple' || c.type === 'full_house' || c.type === 'stairs' || c.type === 'straight')) return false;
		// 드래곤 리드 금지 시 드래곤 싱글 제외
		if (dragonLeadAllowed === false &&
			c.type === 'single' &&
			c.cards[0].type === 'special' &&
			c.cards[0].special === 'dragon') return false;
		// 봉황 싱글 리드 금지: 봉황은 팔로우에서 선 먹기용으로만 사용
		if (c.type === 'single' &&
			c.cards[0].type === 'special' &&
			c.cards[0].special === 'phoenix') return false;
		return true;
	});

	if (candidates.length === 0) {
		candidates = plan.allCombos.filter(c => !isDogCombo(c));
	}
	if (candidates.length === 0) candidates = plan.allCombos;
	if (candidates.length === 0) return [hand[0].id]; // ultimate fallback

	// === 그리드 확률 탐색: 각 후보의 winProb × exitRate + contextMod ===
	const gridResults = searchBestPlay(hand, candidates, tracker, context, weights, behavior, 'lead');
	if (gridResults.length === 0) return [hand[0].id]; // fallback
	return gridResults[0].combo.cards.map(c => c.id);
}

/**
 * Lead decision when close to finishing (5 or fewer cards).
 * Uses CardTracker to evaluate win probability and find optimal play sequences.
 */
function decideLeadEndgame(
	hand: Card[],
	plan: HandPlan,
	weights: PersonalityWeights,
	context: AiDecisionContext
): string[] {
	const tracker = buildCardTracker(context);

	// If we can play all remaining cards in one combo, do it!
	const allAtOnce = plan.allCombos.find(c => c.cards.length === hand.length && !isDogCombo(c));
	if (allAtOnce) {
		return allAtOnce.cards.map(c => c.id);
	}

	// Find all valid 2-turn finishes and score them by win probability
	const twoTurnFinishes = findAllTwoTurnFinishes(hand, plan, tracker);
	if (twoTurnFinishes.length > 0) {
		// Sort by combined win probability (lead * remainder)
		twoTurnFinishes.sort((a, b) => b.score - a.score);
		return twoTurnFinishes[0].lead.cards.map(c => c.id);
	}

	// Try 3-turn finishes
	const twoStepResult = findTwoStepFinishScored(hand, plan, tracker);
	if (twoStepResult) {
		return twoStepResult.cards.map(c => c.id);
	}

	// Fallback: 이기기 어려운 콤보부터 처리, 강한 카드는 팔로우용으로 보존
	// 멀티카드 콤보(페어, 스트레이트 등)는 같은 타입의 더 높은 조합이 필요하므로
	// 나중에 리드해서 이기기가 싱글보다 훨씬 어려움 → 먼저 처리
	const nonDog = plan.allCombos.filter(c => !isDogCombo(c) && !isBomb(c));
	if (nonDog.length > 0) {
		const scored = nonDog.map(c => {
			let score = 0;
			const winProb = comboLikelyToWin(c, tracker, hand);
			// 이길 확률이 낮은 콤보 = 먼저 내야 함 (나중에 이기기 더 어려우니까)
			score += (1 - winProb) * 10;
			// 멀티카드 콤보 보너스: 여러 장 한번에 처리
			score += c.cards.length * 2;
			// 남은 패 나가기 효율 평가: 이 콤보를 내고 남은 패가 효율적인지
			const remaining = hand.filter(card => !c.cards.some(cc => cc.id === card.id));
			if (remaining.length > 0) {
				const exitInfo = calcExitRate(remaining, tracker);
				score += exitInfo.rate * 8;       // 효율 높으면 보너스
				score -= exitInfo.turns * 1.5;    // 턴 많으면 페널티
			} else {
				score += 15; // 이 콤보로 나갈 수 있음
			}
			// 드래곤/봉황 싱글 리드 강한 페널티 (보존해야 할 강한 카드)
			if (c.type === 'single' && c.cards[0].type === 'special') {
				if (c.cards[0].special === 'dragon') score -= 20;
				if (c.cards[0].special === 'phoenix') score -= 15;
			}
			return { combo: c, score };
		});
		scored.sort((a, b) => b.score - a.score);
		return scored[0].combo.cards.map(c => c.id);
	}

	return [hand[0].id];
}

/**
 * Find all 2-turn finishes and score them by win probability.
 * Each result: lead combo → remainder combo, scored by how likely both will win.
 */
function findAllTwoTurnFinishes(
	hand: Card[],
	plan: HandPlan,
	tracker: CardTracker
): { lead: Combination; remainder: Combination; score: number }[] {
	const results: { lead: Combination; remainder: Combination; score: number }[] = [];

	for (const combo of plan.allCombos) {
		if (isDogCombo(combo)) continue;
		if (isBomb(combo)) continue;

		const remainingCards = hand.filter(c => !combo.cards.some(cc => cc.id === c.id));
		if (remainingCards.length === 0) continue; // handled before this function

		// Check if remaining forms a single valid combo
		const remainderCombo = detectCombination(remainingCards);
		if (!remainderCombo) continue;

		const leadWinProb = comboLikelyToWin(combo, tracker, hand);
		const remainderWinProb = comboLikelyToWin(remainderCombo, tracker, remainingCards);

		// Strategy: lead with the weaker combo (more likely to get beaten but ok),
		// save strong combo for second turn when we hopefully have lead.
		// But actually: lead with the one that WILL win, then play remainder.
		// Score = leadWinProb * (1 + remainderWinProb)
		// Leading with high win prob combo first → we get lead → play remainder
		const score = leadWinProb * (1 + remainderWinProb * 0.8);

		results.push({ lead: combo, remainder: remainderCombo, score });
	}

	return results;
}

/**
 * Try 3-turn finishes with win probability scoring.
 */
function findTwoStepFinishScored(hand: Card[], plan: HandPlan, tracker: CardTracker): Combination | null {
	const candidates: { combo: Combination; score: number }[] = [];

	for (const combo of plan.allCombos) {
		if (isDogCombo(combo)) continue;
		if (isBomb(combo)) continue;

		const remainingCards = hand.filter(c => !combo.cards.some(cc => cc.id === c.id));
		if (remainingCards.length <= 1) continue;
		if (remainingCards.length > 6) continue;

		const remainingCombos = findAllPlayableCombinations(remainingCards);
		let bestSubScore = -Infinity;

		for (const rc of remainingCombos) {
			const afterFirst = remainingCards.filter(c => !rc.cards.some(cc => cc.id === c.id));
			if (afterFirst.length === 0) continue;

			const lastCombo = detectCombination(afterFirst);
			if (lastCombo) {
				const subScore =
					comboLikelyToWin(rc, tracker, remainingCards) *
					comboLikelyToWin(lastCombo, tracker, afterFirst);
				bestSubScore = Math.max(bestSubScore, subScore);
			}
		}

		if (bestSubScore > -Infinity) {
			const leadScore = comboLikelyToWin(combo, tracker, hand);
			candidates.push({ combo, score: leadScore * (1 + bestSubScore * 0.6) });
		}
	}

	if (candidates.length === 0) return null;
	candidates.sort((a, b) => b.score - a.score);
	return candidates[0].combo;
}

function isDogCombo(combo: Combination): boolean {
	return combo.cards.length === 1 && combo.cards[0].type === 'special' && combo.cards[0].special === 'dog';
}

/**
 * Find a play containing the wished rank that beats the current combo.
 */
function findWishedPlay(hand: Card[], wish: WishState, currentCombo: Combination): string[] {
	if (!wish.requestedRank) return [];

	const allCombos = findAllPlayableCombinations(hand);
	const wishedBeatable = allCombos.filter(c =>
		playFulfillsWish(c.cards, wish) && canBeat(currentCombo, c)
	);

	if (wishedBeatable.length > 0) {
		// Play the weakest combo that fulfills the wish
		const sorted = wishedBeatable.sort((a, b) => a.rank - b.rank);
		return sorted[0].cards.map(c => c.id);
	}

	return [];
}

// ===== Wish Decision =====

/**
 * Decide what rank to wish for after playing the Mahjong.
 * Strategy: Wish for a rank that forces opponents to waste cards
 * while being unlikely to hurt us or our partner.
 */
export function decideWish(
	hand: Card[],
	weights: PersonalityWeights,
	context: AiDecisionContext,
	behavior: PresetBehavior = {},
	givenToOpponents: number[] = []
): number | null {
	// Behavior hook: wish 오버라이드
	const wishOverride = behavior.decideWishOverride?.(hand, context, givenToOpponents);
	if (wishOverride !== 'default' && wishOverride !== undefined) {
		return wishOverride;
	}

	// 참새를 조합(스트레이트 등)으로 냈을 때만 확률로 소원 스킵
	// 싱글로 냈으면 무조건 소원 선언
	const mahjongPlay = context.trick?.plays[0]?.combination;
	if (mahjongPlay && mahjongPlay.type !== 'single') {
		// 조합: aggressiveness 기반 확률로 스킵 가능
		if (Math.random() > weights.aggressiveness + 0.3) return null;
	}

	const tracker = buildCardTracker(context);

	const myRanks = new Set(
		hand.filter(c => c.type === 'normal').map(c => (c as NormalCard).rank as number)
	);

	const normalCards = hand.filter(c => c.type === 'normal') as NormalCard[];
	const rankCounts = new Map<number, number>();
	for (const c of normalCards) {
		rankCounts.set(c.rank, (rankCounts.get(c.rank) || 0) + 1);
	}

	// Strategy 1: 내가 가진 랭크 + 상대도 가지고 있을 가능성 높은 랭크
	const goodWishRanks: { rank: number; score: number }[] = [];
	for (const [rank, count] of rankCounts) {
		if (rank <= 3) continue; // 2,3은 너무 낮아서 제외
		const stillOut = tracker.remainingByRank.get(rank) || 0;
		if (count >= 1 && stillOut >= 1) {
			// 높은 랭크 + 내가 많이 가진 + 밖에 많이 남은 → 좋은 소원
			goodWishRanks.push({ rank, score: rank * 2 + count * 5 + stillOut * 3 });
		}
	}

	if (goodWishRanks.length > 0) {
		goodWishRanks.sort((a, b) => b.score - a.score);
		return goodWishRanks[0].rank;
	}

	// Strategy 2: 내가 안 가진 높은 랭크 → 상대가 강제로 내게 됨
	const highRanks = [14, 13, 12, 11];
	for (const rank of highRanks) {
		if (!myRanks.has(rank)) {
			const stillOut = tracker.remainingByRank.get(rank) || 0;
			if (stillOut >= 1) {
				return rank;
			}
		}
	}

	// Strategy 3: 아무 높은 랭크라도 (A → K → Q → J)
	for (const rank of highRanks) {
		return rank;
	}

	return null;
}

// ===== Dragon Gift Decision =====

/**
 * Decide which opponent to give the dragon trick to.
 * Give to the opponent who is FURTHER from finishing (more cards = less likely to go out first)
 */
export function decideDragonGift(
	context: AiDecisionContext,
	seat: SeatIndex,
	weights: PersonalityWeights,
	behavior: PresetBehavior = {}
): SeatIndex {
	// Behavior hook: 드래곤 선물 오버라이드
	const override = behavior.decideDragonGiftOverride?.(context, seat);
	if (override !== null && override !== undefined) return override;

	const myTeam = getTeam(seat);
	const opponents = context.players.filter(p => getTeam(p.seat) !== myTeam && p.finishOrder === null);

	if (opponents.length === 0) {
		const leftSeat = getLeftSeat(seat) as SeatIndex;
		const rightSeat = getRightSeat(seat) as SeatIndex;
		return getTeam(leftSeat) !== myTeam ? leftSeat : rightSeat;
	}

	if (opponents.length === 1) return opponents[0].seat;

	// 티츄 선언한 상대에게 주기 (추가 카드가 나가기 방해)
	const tichuerOpponent = opponents.find(opp => (opp.grandTichu === true || opp.smallTichu) && opp.finishOrder === null);
	if (tichuerOpponent) {
		return tichuerOpponent.seat;
	}

	// Give to opponent with MORE cards (further from finishing)
	const scored = opponents.map(opp => ({
		seat: opp.seat,
		cardsLeft: opp.hand.length,
		wonPoints: opp.wonCards.reduce((sum, card) => {
			if (card.type === 'special' && card.special === 'dragon') return sum + 25;
			if (card.type === 'special' && card.special === 'phoenix') return sum - 25;
			if (card.type === 'normal') {
				if (card.rank === 5) return sum + 5;
				if (card.rank === 10 || card.rank === 13) return sum + 10;
			}
			return sum;
		}, 0)
	}));

	scored.sort((a, b) => {
		if (b.cardsLeft !== a.cardsLeft) return b.cardsLeft - a.cardsLeft;
		return a.wonPoints - b.wonPoints;
	});

	return scored[0].seat;
}

// ===== Bomb Interrupt Decision =====

/**
 * Decide whether to play a bomb out of turn.
 */
export function shouldPlayBomb(
	context: AiDecisionContext,
	weights: PersonalityWeights,
	lastPlay: { seat: SeatIndex; combination: Combination },
	behavior: PresetBehavior = {}
): Combination | null {
	const { hand, currentSeat, players } = context;
	const myTeam = getTeam(currentSeat);
	const playTeam = getTeam(lastPlay.seat);

	// Don't bomb our own team
	if (playTeam === myTeam) return null;

	const bombs = findBombs(hand);
	if (bombs.length === 0) return null;

	// Behavior hook: 폭탄 사용 오버라이드
	const bombOverride = behavior.shouldUseBomb?.(hand, bombs, context, lastPlay);
	if (bombOverride === 'skip') return null;
	if (bombOverride !== null && bombOverride !== undefined) return bombOverride;

	const beatable = bombs.filter(b => canBeat(lastPlay.combination, b));
	if (beatable.length === 0) return null;

	beatable.sort((a, b) => a.rank - b.rank);

	const tracker = buildCardTracker(context);

	// Counter-bomb scenario
	if (isBomb(lastPlay.combination)) {
		const attacker = players[lastPlay.seat];
		if (attacker.hand.length <= 2) {
			return beatable[0]; // Must stop them
		}
		// 카운터폭탄은 트릭 포인트가 충분할 때만 (10점 이상)
		const counterTrickCards = context.trick?.plays.flatMap(p => p.combination.cards) || [];
		const counterTrickPoints = getTrickPoints(counterTrickCards);
		if (weights.aggressiveness > 0.7 && weights.bombHolding < 0.4 && counterTrickPoints >= 10) {
			return beatable[0];
		}
		return null;
	}

	// 소원이 활성화된 상태에서 낮은 포인트 트릭에 폭탄 자제
	// (소원이 아직 충족 안 됐으면 상대가 결국 소원 카드를 내야 하므로 기다리는 게 유리)
	if (context.wish.active && context.wish.requestedRank !== null) {
		const wishTrickCards = context.trick?.plays.flatMap(p => p.combination.cards) || [];
		const wishTrickPoints = getTrickPoints(wishTrickCards);
		if (wishTrickPoints < 15) return null;
	}

	// High bomb holding = reluctant to use bombs
	if (weights.bombHolding > 0.8) return null;

	// Opponent about to finish — always bomb
	const player = players[lastPlay.seat];
	if (player.hand.length <= 2) {
		return beatable[0];
	}

	// 상대 티츄 선언 → 적극 폭탄 (카드 7장 이하)
	if (hasOpponentDeclaredTichu(tracker)) {
		const tichuer = tracker.opponents.find(o => o.declaredTichu && !o.finished);
		if (tichuer && tichuer.cardsRemaining <= 7) {
			return beatable[0];
		}
	}

	// Check if trick has lots of points
	const trickCards = context.trick?.plays.flatMap(p => p.combination.cards) || [];
	const trickPoints = getTrickPoints(trickCards);

	// 드래곤(25점) 포함 트릭은 적극 폭탄
	if (lastPlay.combination.type === 'single' &&
		lastPlay.combination.cards.some(c => c.type === 'special' && c.special === 'dragon')) {
		return beatable[0];
	}

	// 포인트 임계값 하향: 15점 이상 + 상대가 이기고 있으면
	if (trickPoints >= 15 && weights.aggressiveness > 0.2) {
		return beatable[0];
	}

	// 나갈 수 있으면 폭탄: 폭탄 후 나머지 카드로 나갈 수 있으면 적극 사용
	if (hand.length <= 6) {
		for (const bomb of beatable) {
			const afterBomb = hand.filter(c => !bomb.cards.some(bc => bc.id === c.id));
			if (afterBomb.length === 0) return bomb; // 폭탄으로 나감!
			const afterCombo = detectCombination(afterBomb);
			if (afterCombo) return bomb; // 폭탄 후 1턴에 나갈 수 있음
			// 2턴 체크
			if (afterBomb.length <= 3) {
				const afterCombos = findAllPlayableCombinations(afterBomb);
				for (const ac of afterCombos) {
					const remaining = afterBomb.filter(c => !ac.cards.some(acc => acc.id === c.id));
					if (remaining.length === 0 || (remaining.length === 1)) return bomb;
					const lastC = detectCombination(remaining);
					if (lastC) return bomb;
				}
			}
		}
	}

	// If I'm close to finishing and bombing would let me lead (최소 5점 트릭)
	if (hand.length <= 4 && weights.aggressiveness > 0.3 && trickPoints >= 5) {
		return beatable[0];
	}

	return null;
}
