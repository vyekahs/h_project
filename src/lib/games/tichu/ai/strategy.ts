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
	rankStrengthInContext,
	comboLikelyToWin,
	hasOpponentDeclaredTichu,
	type CardTracker
} from './cardTracker';

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

/**
 * 콤보의 스코어링용 실효 랭크.
 * 봉황 싱글은 실제 게임에서 현재 트릭 +0.5로 동작하지만,
 * AI 스코어링에서는 14.5(A급)로 취급하여 쉽게 낭비하지 않도록 함.
 */
function getScoringRank(combo: Combination): number {
	if (combo.type === 'single' && combo.cards[0].type === 'special' && combo.cards[0].special === 'phoenix') {
		return 14.5;
	}
	return combo.rank;
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
	behavior: PresetBehavior = {}
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

	// Behavior hook: 프리셋별 파트너 교환 카드 선택
	if (!toPartner) {
		const behaviorCard = behavior.selectPartnerExchangeCard?.(hand, singletons, rankGroups, protectedIds);
		if (behaviorCard) {
			toPartner = behaviorCard;
		}
	}

	// Default: give partner a strong card, preferring one that is a singleton for US
	if (!toPartner && weights.partnerAwareness > 0.4) {
		// Prefer giving a high singleton (A or K that we have only one of)
		const highSingletons = singletons
			.filter(c => c.rank >= 13 && !protectedIds.has(c.id))
			.sort((a, b) => b.rank - a.rank);
		if (highSingletons.length > 0) {
			toPartner = highSingletons[0];
		}
	}

	if (!toPartner) {
		// Give strongest non-protected card
		const candidates = [...hand]
			.filter(c => !protectedIds.has(c.id))
			.sort((a, b) => getCardSortRank(b) - getCardSortRank(a));

		// For partner: give strong card but not from a pair/triple we want to keep
		for (const card of candidates) {
			if (card.type === 'special' && card.special === 'dog') continue;
			if (card.type === 'special' && card.special === 'mahjong') continue;
			const rank = card.type === 'normal' ? card.rank : 0;
			const groupSize = rank > 0 ? (rankGroups.get(rank)?.length ?? 0) : 0;
			// Prefer giving singletons or from groups of 3+ (won't break pair)
			if (groupSize !== 2) {
				toPartner = card;
				break;
			}
		}
		if (!toPartner) {
			toPartner = candidates[0] || hand[0];
		}
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

		// Pass when partner is winning
		return 'pass';
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
	const iAmCloseToFinishing = hand.length <= 3;
	// A 트리플/풀하우스는 나갈 수 있는 상황이 아니면 제외
	const nonBombPlays = beatablePlays.filter(c => {
		if (isBomb(c)) return false;
		if (!iAmCloseToFinishing && c.rank === 14 && (c.type === 'triple' || c.type === 'full_house' || c.type === 'stairs')) return false;
		return true;
	});
	// A 폭탄은 가능하면 사용하지 않음 (A는 싱글 선먹기용으로 보존)
	const allBombPlays = beatablePlays.filter(c => isBomb(c));
	const nonAceBombs = allBombPlays.filter(c => c.rank !== 14);
	const bombPlays = nonAceBombs.length > 0 ? nonAceBombs : allBombPlays;

	// === Situational awareness ===
	const tracker = buildCardTracker(context);
	const opponentAboutToFinish = players.some(
		p => getTeam(p.seat) !== myTeam && p.finishOrder === null && p.hand.length <= 2
	);
	const partnerAboutToFinish = partner.finishOrder === null && partner.hand.length <= 2;
	const partnerFinished = partner.finishOrder !== null;

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
	// 봉황 싱글은 "무조건 선을 먹을 수 있는 상황"에서만 허용:
	// 1) 내가 마지막 기회(다음이 트릭 주인)이고 상대가 이기고 있을 때
	// 2) 봉황이 마지막 카드일 때 (hand.length === 1)
	const isPhoenixSingle = (c: Combination) =>
		c.type === 'single' && c.cards[0].type === 'special' && c.cards[0].special === 'phoenix';
	const amLastBeforeTrickWinner = getNextActiveSeat(currentSeat, players) === lastPlay.seat;
	const opponentWinning = trickLeaderTeam !== myTeam;

	let playsForFollow = nonBombPlays;
	if (nonBombPlays.some(isPhoenixSingle)) {
		const phoenixAllowed =
			(amLastBeforeTrickWinner && opponentWinning) || // 선 먹기 보장
			hand.length === 1; // 마지막 카드
		if (!phoenixAllowed) {
			const filtered = nonBombPlays.filter(c => !isPhoenixSingle(c));
			playsForFollow = filtered;
			// filtered가 비면 봉황 싱글밖에 없으므로 패스 (아래 length===0 처리)
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
	return pickBestFollow(playsForFollow, hand, weights, context, iAmCloseToFinishing, partnerAboutToFinish, partnerFinished, trickPoints, behavior);
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
	partnerFinished: boolean,
	trickPoints: number,
	behavior: PresetBehavior = {}
): string[] | 'pass' {
	const myTeam = getTeam(context.currentSeat);
	const trick = context.trick!;
	const lastPlay = trick.plays[trick.plays.length - 1];
	const opponentWinning = getTeam(lastPlay.seat) !== myTeam;
	const partnerSeat = getPartnerSeat(context.currentSeat);

	// Sort by rank ascending (weakest first)
	const sorted = [...plays].sort((a, b) => a.rank - b.rank);

	// If I can finish with this play, always play strongest to guarantee the win
	if (iAmClose) {
		const finishingPlays = sorted.filter(p => p.cards.length >= hand.length);
		if (finishingPlays.length > 0) {
			return finishingPlays[finishingPlays.length - 1].cards.map(c => c.id);
		}
		// If playing leaves me with 1 card, play the weakest option to save the stronger last card
		if (hand.length - sorted[0].cards.length === 1) {
			// Check: will I be able to play my last card? Only if I win this trick and lead
			// Play strong enough to actually win the trick
			return sorted[sorted.length - 1].cards.map(c => c.id);
		}
	}

	// Am I the last player before the trick winner gets another chance?
	// If so, I should try harder to take the trick when opponent is winning
	const nextAfterMe = getNextActiveSeat(context.currentSeat, context.players);
	const amLastBeforeTrickWinner = nextAfterMe === lastPlay.seat;

	// If partner is about to finish, play weakest to let partner get the lead
	if (partnerClose && !opponentWinning) {
		return sorted[0].cards.map(c => c.id);
	}

	// Score each play option
	const tracker = buildCardTracker(context);
	const plan = analyzeHand(hand);
	const scored = sorted.map(play => {
		// 봉황 싱글은 rank=0이지만 실제로는 A급(14.5) → 프리셋 훅에도 보정된 rank 전달
		const effectiveRank = getScoringRank(play);
		const playForScoring = effectiveRank !== play.rank
			? { ...play, rank: effectiveRank }
			: play;

		// Behavior hook: 프리셋별 팔로우 스코어링 오버라이드
		const behaviorScore = behavior.scoreFollowCandidate?.(playForScoring, hand, context, trickPoints, opponentWinning);
		if (behaviorScore !== null && behaviorScore !== undefined) {
			return { play, score: behaviorScore };
		}

		let score = 0;

		// Base: prefer weaker plays (save strong cards)
		score -= effectiveRank * 1.5;

		// If opponent is winning
		if (opponentWinning) {
			// 선을 뺏으면 다음 리드에서 낮은 카드를 처리할 수 있음
			score += 12;

			// 낮은 싱글톤이 많으면 선을 뺏는 가치가 더 높음
			const lowSingletonCount = plan.singletonCards.filter(
				c => c.type === 'normal' && (c as NormalCard).rank <= 8
			).length;
			if (lowSingletonCount >= 2) score += lowSingletonCount * 2;

			// More bonus if trick has points
			if (trickPoints >= 10) score += trickPoints * 0.5;

			// If I'm the last chance to take the trick, must play strong enough
			if (amLastBeforeTrickWinner) {
				score += 8;
				// Play stronger card to ensure we win
				score += effectiveRank * 0.5;
			}

			// Extra motivation if opponent is close to finishing
			const lastPlayerCards = context.players[lastPlay.seat].hand.length;
			if (lastPlayerCards <= 3) score += 15;
		}

		// Avoid wasting dragon as follow (it gives points to opponents)
		if (play.cards.some(c => c.type === 'special' && c.special === 'dragon')) {
			score -= 10;
			// But if trick has lots of points from opponents, worth taking
			if (trickPoints >= 15 && opponentWinning) score += 20;
		}

		// If partner finished, I should try to go out fast — prefer plays that reduce hand quickly
		if (partnerFinished) {
			score += play.cards.length * 2;
		}

		// Aggressiveness modifier
		score += effectiveRank * weights.aggressiveness * 0.5;

		// Penalty: 풀하우스 페어에 강한 싱글톤이 포함되면 감점
		if (play.type === 'full_house') {
			const pairCards = play.cards.filter(c => {
				if (c.type !== 'normal') return false;
				return (c as NormalCard).rank !== play.rank;
			});
			for (const pc of pairCards) {
				if (pc.type !== 'normal') continue;
				const pRank = (pc as NormalCard).rank;
				const isSingleton = plan.singletonCards.some(s => s.id === pc.id);
				if (isSingleton && pRank >= 13) {
					score -= 15;
				} else if (isSingleton && pRank >= 11) {
					score -= 8;
				}
			}
		}

		// === 엔드게임 체크: 이 트릭 이기면 나갈 수 있나? ===
		if (hand.length <= 5) {
			const afterPlay = hand.filter(c => !play.cards.some(pc => pc.id === c.id));
			if (afterPlay.length > 0) {
				const afterCombo = detectCombination(afterPlay);
				if (afterCombo) {
					// 이 플레이 후 남은 카드가 한 콤보로 나갈 수 있음!
					score += 25;
				} else if (afterPlay.length === 1) {
					score += 20; // 1장만 남음
				}
			}
		}

		return { play, score };
	});

	scored.sort((a, b) => b.score - a.score);

	const bestScore = scored[0].score;
	const bestPlay = scored[0].play;

	// === 전략적 패스: 낼 수 있어도 패스가 나은 상황 ===
	// 나갈 수 있으면 무조건 냄
	if (iAmClose) {
		return bestPlay.cards.map(c => c.id);
	}

	// 패스 임계값: 최고 점수가 이 값 이하면 패스
	// (aggressiveness가 높으면 임계값 낮아져서 덜 패스함)
	const passThreshold = -12 + weights.aggressiveness * 8;

	if (bestScore < passThreshold) {
		// 단, 패스하면 안 되는 상황 체크
		const mustPlay =
			// 상대가 나가기 직전이면 뺏어야 함
			context.players.some(p => getTeam(p.seat) !== myTeam && p.finishOrder === null && p.hand.length <= 2) ||
			// 트릭 포인트가 높으면 뺏어야 함
			(trickPoints >= 15 && getTeam(lastPlay.seat) !== myTeam);

		if (!mustPlay) {
			return 'pass';
		}
	}

	return bestPlay.cards.map(c => c.id);
}

/**
 * Get the next active seat after a given seat.
 */
function getNextActiveSeat(seat: SeatIndex, players: AiDecisionContext['players']): SeatIndex {
	for (let i = 1; i <= 4; i++) {
		const next = ((seat + i) % 4) as SeatIndex;
		if (players[next].finishOrder === null) return next;
	}
	return seat;
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
	if (hand.length <= 5) {
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
		if (!canFinishSoon && c.rank === 14 && (c.type === 'triple' || c.type === 'full_house' || c.type === 'stairs')) return false;
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

	// Partner state
	const partnerFinished = partner.finishOrder !== null;
	const partnerDeclaredTichu = partner.grandTichu === true || partner.smallTichu;
	const iDeclaredTichu = context.players[context.currentSeat].grandTichu === true || context.players[context.currentSeat].smallTichu;

	// === Strategy: "나가기 경로" 기반 스코어링 ===
	// 핵심: 각 리드 후보를 냈을 때 남은 손패의 나가기 효율을 평가
	const scored = candidates.map(combo => {
		// Behavior hook: 프리셋별 리드 스코어링 오버라이드
		const behaviorScore = behavior.scoreLeadCandidate?.(combo, hand, context);
		if (behaviorScore !== null && behaviorScore !== undefined) {
			return { combo, score: behaviorScore };
		}

		// 이 콤보를 리드했을 때의 나가기 경로 점수
		const { leadWinProb, exitScore } = scoreLeadWithExitPath(combo, hand, tracker);
		// exitScore가 핵심: 이 콤보를 낸 후 남은 손패 나가기 효율
		// leadWinProb가 높은 카드(A, K)는 팔로우에서도 이길 수 있으니 리드에서 소모 불필요
		// → 이길 확률이 낮은 콤보일수록 리드에서 먼저 처리해야 함
		let score = exitScore * 3 + (1 - leadWinProb) * 8;

		// === 특수 카드 보정 ===
		if (combo.type === 'single' && combo.cards[0].type === 'special') {
			const special = combo.cards[0].special;
			if (special === 'mahjong') {
				score += 50; // 마작은 최우선 소모
			} else if (special === 'dragon') {
				score -= 20; // 드래곤은 팔로우 트릭 탈취용
				if (hand.length <= 3) score += 10;
			} else if (special === 'phoenix') {
				score -= 15; // 봉황도 팔로우용
			}
		}

		// === 마작 포함 스트레이트: 마작 소모 + 여러 장 처리 ===
		if ((combo.type === 'straight' || combo.type === 'stairs') &&
			combo.cards.some(c => c.type === 'special' && c.special === 'mahjong')) {
			score += 30;
		}

		// === A 폭탄 리드 페널티 ===
		if (isBomb(combo) && combo.rank === 14) {
			score -= 50;
		}

		// === 풀하우스: 강한 싱글톤을 페어로 낭비하면 감점 ===
		if (combo.type === 'full_house') {
			const pairCards = combo.cards.filter(c => {
				if (c.type !== 'normal') return false;
				return (c as NormalCard).rank !== combo.rank;
			});
			for (const pc of pairCards) {
				if (pc.type !== 'normal') continue;
				const pRank = (pc as NormalCard).rank;
				const isSingleton = plan.singletonCards.some(s => s.id === pc.id);
				if (isSingleton && pRank >= 13) score -= 15;
				else if (isSingleton && pRank >= 11) score -= 8;
			}
		}

		// === 싱글: 멀티콤보 구성 카드를 싱글로 내면 감점 ===
		if (combo.type === 'single' && combo.cards[0].type === 'normal') {
			const card = combo.cards[0] as NormalCard;
			const isSingleton = plan.singletonCards.some(s => s.id === card.id);
			if (!isSingleton && card.rank <= 8) {
				score -= 5; // 멀티콤보에 속한 낮은 카드 보존
			}
		}

		// === 티츄 보정 ===
		if (iDeclaredTichu) {
			score += combo.cards.length * 3;
			if (combo.rank >= 11) score += 2;
		}
		if (partnerDeclaredTichu && !partnerFinished) {
			score -= combo.rank * 1.5;
			if (combo.rank <= 6) score += 8;
			if (combo.cards.length >= 3) score -= 5;
		}

		// === 파트너 카드 1~3장 → 낮은 리드로 지원 ===
		if (!partnerFinished && partner.hand.length <= 3 && partner.hand.length > 0) {
			if (combo.rank <= 8) score += 6;
		}

		// === Aggressiveness modifier ===
		// rank 보너스 제거: comboLikelyToWin이 이미 rank를 반영하고,
		// rank 보너스는 높은 카드를 먼저 내게 만들어 전략에 역행함
		score += combo.cards.length * weights.aggressiveness * 1.5;

		return { combo, score };
	});

	scored.sort((a, b) => b.score - a.score);
	return scored[0].combo.cards.map(c => c.id);
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

// ===== Exit Path Planning =====

interface ExitPath {
	/** Combos to play in order (multi-card combos first, then singles) */
	combos: Combination[];
	/** Remaining singleton cards played as singles */
	remainingSingles: Card[];
	/** Total turns needed to empty hand */
	totalTurns: number;
	/** Average win probability across all turns */
	avgWinProb: number;
	/** Overall exit path score (higher = better) */
	score: number;
}

/**
 * Plan how to empty the hand: partition into combos + singles,
 * evaluate each turn's win probability, score the plan.
 *
 * Generates multiple greedy variants and picks the best.
 * Used by decideLead to choose the optimal first move.
 */
function planExitPath(hand: Card[], tracker: CardTracker): ExitPath {
	const allCombos = findAllPlayableCombinations(hand);
	const multiCombos = allCombos.filter(c => !isBomb(c) && c.type !== 'single' && !isDogCombo(c));
	const bombs = allCombos.filter(c => isBomb(c));

	// Generate candidate paths by trying different greedy strategies
	const candidates: ExitPath[] = [];

	// Strategy 1: Largest combos first (maximize cards per turn)
	candidates.push(buildGreedyPath(hand, multiCombos, bombs, tracker, 'largest'));

	// Strategy 2: Most-cards but skip the largest combo (try alternative partition)
	if (multiCombos.length > 1) {
		candidates.push(buildGreedyPath(hand, multiCombos, bombs, tracker, 'skip_largest'));
	}

	// Strategy 3: Weakest combos first (prioritize hard-to-win combos)
	candidates.push(buildGreedyPath(hand, multiCombos, bombs, tracker, 'weakest'));

	// Pick best path
	candidates.sort((a, b) => b.score - a.score);
	return candidates[0];
}

function buildGreedyPath(
	hand: Card[],
	multiCombos: Combination[],
	bombs: Combination[],
	tracker: CardTracker,
	strategy: 'largest' | 'skip_largest' | 'weakest'
): ExitPath {
	let sorted: Combination[];

	if (strategy === 'largest') {
		sorted = [...multiCombos].sort((a, b) => {
			if (b.cards.length !== a.cards.length) return b.cards.length - a.cards.length;
			return a.rank - b.rank;
		});
	} else if (strategy === 'skip_largest') {
		const bySize = [...multiCombos].sort((a, b) => b.cards.length - a.cards.length);
		// Skip the first (largest), re-sort rest
		sorted = bySize.slice(1).sort((a, b) => {
			if (b.cards.length !== a.cards.length) return b.cards.length - a.cards.length;
			return a.rank - b.rank;
		});
	} else {
		// weakest: low win probability first
		sorted = [...multiCombos].sort((a, b) => {
			const aWin = comboLikelyToWin(a, tracker, hand);
			const bWin = comboLikelyToWin(b, tracker, hand);
			if (aWin !== bWin) return aWin - bWin; // weakest first
			if (b.cards.length !== a.cards.length) return b.cards.length - a.cards.length;
			return a.rank - b.rank;
		});
	}

	// Greedily pick non-overlapping combos
	const usedCards = new Set<string>();
	const selectedCombos: Combination[] = [];

	for (const combo of sorted) {
		if (combo.cards.every(c => !usedCards.has(c.id))) {
			for (const c of combo.cards) usedCards.add(c.id);
			selectedCombos.push(combo);
		}
	}

	// Remaining cards become singles
	const remainingSingles = hand.filter(c => !usedCards.has(c.id));
	const totalTurns = selectedCombos.length + remainingSingles.length;

	if (totalTurns === 0) {
		return { combos: [], remainingSingles: [], totalTurns: 0, avgWinProb: 1, score: 100 };
	}

	// Calculate win probabilities
	let totalWinProb = 0;
	for (const combo of selectedCombos) {
		totalWinProb += comboLikelyToWin(combo, tracker, hand);
	}
	for (const card of remainingSingles) {
		const rank = card.type === 'normal' ? card.rank
			: (card.type === 'special' && card.special === 'dragon') ? 15
			: (card.type === 'special' && card.special === 'phoenix') ? 0
			: 1;
		totalWinProb += rankStrengthInContext(rank, tracker);
	}

	const avgWinProb = totalWinProb / totalTurns;

	// Score: fewer turns + higher win probability = better
	// Turn efficiency: 14 cards in 3 turns >> 14 cards in 10 turns
	const turnEfficiency = hand.length / Math.max(1, totalTurns);
	const score = avgWinProb * 10 + turnEfficiency * 3;

	return {
		combos: selectedCombos,
		remainingSingles,
		totalTurns,
		avgWinProb,
		score
	};
}

/**
 * For a given lead candidate, compute the exit path score
 * assuming we play that combo first, then plan the rest.
 */
function scoreLeadWithExitPath(
	combo: Combination,
	hand: Card[],
	tracker: CardTracker
): { leadWinProb: number; exitScore: number } {
	const leadWinProb = comboLikelyToWin(combo, tracker, hand);
	const remainingHand = hand.filter(c => !combo.cards.some(cc => cc.id === c.id));

	if (remainingHand.length === 0) {
		return { leadWinProb, exitScore: 100 }; // Can finish in one move!
	}

	const exitPath = planExitPath(remainingHand, tracker);
	return { leadWinProb, exitScore: exitPath.score };
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

	// Less aggressive players might skip wish
	if (Math.random() > weights.aggressiveness + 0.3) return null;

	const tracker = buildCardTracker(context);

	const myRanks = new Set(
		hand.filter(c => c.type === 'normal').map(c => (c as NormalCard).rank as number)
	);

	const normalCards = hand.filter(c => c.type === 'normal') as NormalCard[];
	const rankCounts = new Map<number, number>();
	for (const c of normalCards) {
		rankCounts.set(c.rank, (rankCounts.get(c.rank) || 0) + 1);
	}

	// Strategy 1: Wish for a rank where we have 2+ copies AND opponents likely have some too
	const goodWishRanks: { rank: number; score: number }[] = [];
	for (const [rank, count] of rankCounts) {
		if (rank <= 5) continue;
		const stillOut = tracker.remainingByRank.get(rank) || 0;
		if (count >= 2 && stillOut >= 1) {
			goodWishRanks.push({ rank, score: rank + count * 5 + stillOut * 3 });
		}
	}

	if (goodWishRanks.length > 0) {
		goodWishRanks.sort((a, b) => b.score - a.score);
		return goodWishRanks[0].rank;
	}

	// Strategy 2: 상대가 플레이한 랭크 추적 → 상대 스트레이트 방해하는 랭크 위시
	// 상대가 안 플레이한 높은 랭크를 위시하면 강제로 내게 됨
	const highRanks = [14, 13, 12, 11];
	for (const rank of highRanks) {
		if (!myRanks.has(rank)) {
			const stillOut = tracker.remainingByRank.get(rank) || 0;
			if (stillOut >= 2) {
				return rank;
			}
		}
	}

	// Strategy 3: 내 팀이 많이 가진 랭크 위시 (정보 우위)
	for (const [rank, count] of rankCounts) {
		if (rank >= 8 && count >= 3) {
			// 3장 가지고 있으면 상대는 1장뿐 → 강제 소모
			return rank;
		}
	}

	// Strategy 4: Any high rank we don't have
	for (const rank of highRanks) {
		if (!myRanks.has(rank)) {
			return rank;
		}
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
		if (weights.aggressiveness > 0.7 && weights.bombHolding < 0.4) {
			return beatable[0];
		}
		return null;
	}

	// High bomb holding = reluctant to use bombs
	if (weights.bombHolding > 0.8) return null;

	// Opponent about to finish — always bomb
	const player = players[lastPlay.seat];
	if (player.hand.length <= 2) {
		return beatable[0];
	}

	// 상대 티츄 선언 + 카드 적으면 → 무조건 폭탄
	if (hasOpponentDeclaredTichu(tracker)) {
		const tichuer = tracker.opponents.find(o => o.declaredTichu && !o.finished);
		if (tichuer && tichuer.cardsRemaining <= 5) {
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

	// If I'm close to finishing and bombing would let me lead
	if (hand.length <= 4 && weights.aggressiveness > 0.3) {
		return beatable[0];
	}

	return null;
}
