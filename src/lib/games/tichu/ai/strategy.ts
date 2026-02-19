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

// ===== Card Counting / Awareness =====

/** Count how many cards of each rank have been played in completed tricks */
function countPlayedCards(context: AiDecisionContext): Map<number, number> {
	const played = new Map<number, number>();
	// Cards in won piles
	for (const player of context.players) {
		for (const card of player.wonCards) {
			if (card.type === 'normal') {
				played.set(card.rank, (played.get(card.rank) || 0) + 1);
			}
		}
	}
	// Cards in current trick
	if (context.trick) {
		for (const play of context.trick.plays) {
			for (const card of play.combination.cards) {
				if (card.type === 'normal') {
					played.set(card.rank, (played.get(card.rank) || 0) + 1);
				}
			}
		}
	}
	return played;
}

/** Estimate how many cards of a given rank are still out (not in my hand, not played) */
function cardsStillOut(rank: number, myHand: Card[], playedCounts: Map<number, number>): number {
	const total = 4; // 4 suits per rank
	const played = playedCounts.get(rank) || 0;
	const inMyHand = myHand.filter(c => c.type === 'normal' && c.rank === rank).length;
	return Math.max(0, total - played - inMyHand);
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

/** Check if my single of rank X is likely to win (few or no higher cards still out) */
function isSingleLikelyToWin(rank: number, myHand: Card[], playedCounts: Map<number, number>): boolean {
	// Count how many higher-rank singles are still out among opponents
	let higherCardsOut = 0;
	for (let r = rank + 1; r <= 14; r++) {
		higherCardsOut += cardsStillOut(r, myHand, playedCounts);
	}
	// Dragon is always out if not in my hand and not played
	const dragonInHand = myHand.some(c => c.type === 'special' && c.special === 'dragon');
	const dragonPlayed = [...playedCounts.entries()].length; // rough proxy
	if (!dragonInHand) higherCardsOut += 1; // dragon beats any single

	return higherCardsOut <= 1;
}

/** Total remaining cards across all opponents */
function totalOpponentCards(context: AiDecisionContext): number {
	const myTeam = getTeam(context.currentSeat);
	return context.players
		.filter(p => getTeam(p.seat) !== myTeam && p.finishOrder === null)
		.reduce((sum, p) => sum + p.hand.length, 0);
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
	// Give weakest cards, preferring low singletons (hardest for US to get rid of)
	const remaining = hand.filter(c => c.id !== toPartner!.id);
	const giveToOpponent: Card[] = [];

	// First priority: low singletons
	for (const card of lowSingletons) {
		if (card.id === toPartner!.id) continue;
		if (protectedIds.has(card.id)) continue;
		if (giveToOpponent.length >= 2) break;
		giveToOpponent.push(card);
	}

	// Fill rest with lowest value cards
	if (giveToOpponent.length < 2) {
		const sorted = remaining
			.filter(c => !giveToOpponent.some(g => g.id === c.id) && !protectedIds.has(c.id))
			.sort((a, b) => getCardSortRank(a) - getCardSortRank(b));
		for (const card of sorted) {
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
	const nonBombPlays = beatablePlays.filter(c => !isBomb(c));
	const bombPlays = beatablePlays.filter(c => isBomb(c));

	// === Situational awareness ===
	const opponentAboutToFinish = players.some(
		p => getTeam(p.seat) !== myTeam && p.finishOrder === null && p.hand.length <= 2
	);
	const partnerAboutToFinish = partner.finishOrder === null && partner.hand.length <= 2;
	const iAmCloseToFinishing = hand.length <= 3;
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
	const activePlayers = context.players.filter(p => p.finishOrder === null);
	const nextAfterMe = getNextActiveSeat(context.currentSeat, context.players);
	const amLastBeforeTrickWinner = nextAfterMe === lastPlay.seat;

	// If partner is about to finish, play weakest to let partner get the lead
	if (partnerClose && !opponentWinning) {
		return sorted[0].cards.map(c => c.id);
	}

	// Score each play option
	const playedCounts = countPlayedCards(context);
	const plan = analyzeHand(hand);
	const scored = sorted.map(play => {
		// Behavior hook: 프리셋별 팔로우 스코어링 오버라이드
		const behaviorScore = behavior.scoreFollowCandidate?.(play, hand, context, trickPoints, opponentWinning);
		if (behaviorScore !== null && behaviorScore !== undefined) {
			return { play, score: behaviorScore };
		}

		let score = 0;
		const effectiveRank = getScoringRank(play);

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
	const myTeam = getTeam(context.currentSeat);
	const partnerSeat = getPartnerSeat(context.currentSeat);
	const partner = context.players[partnerSeat];
	const plan = analyzeHand(hand);
	const playedCounts = countPlayedCards(context);

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
	let candidates = plan.allCombos.filter(c => {
		if (isDogCombo(c)) return false;
		if (isBomb(c) && weights.bombHolding > 0.3) return false;
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

	// === Strategy: score each candidate ===
	const scored = candidates.map(combo => {
		// Behavior hook: 프리셋별 리드 스코어링 오버라이드
		const behaviorScore = behavior.scoreLeadCandidate?.(combo, hand, context);
		if (behaviorScore !== null && behaviorScore !== undefined) {
			return { combo, score: behaviorScore };
		}

		let score = 0;
		const effectiveRank = getScoringRank(combo);

		// === 싱글 우선 리드 전략 ===
		// 싱글을 먼저 내서 처리하고, 멀티카드 콤보는 나중에 사용
		if (combo.type === 'single') {
			score += 20; // 싱글 기본 보너스 — 조합보다 먼저 나감
			score -= effectiveRank * 1.2;
		} else {
			score -= effectiveRank * 2;
		}

		// === Penalty for wasting dragon as lead ===
		if (combo.cards.some(c => c.type === 'special' && c.special === 'dragon')) {
			score -= 15; // Dragon should be used to take tricks, not lead
			// Exception: if I have very few cards and dragon is my only way to lead strong
			if (hand.length <= 3) score += 10;
		}

		// === Bonus for straights and stairs (clear many cards efficiently) ===
		if (combo.type === 'straight' || combo.type === 'stairs') {
			score += combo.cards.length * 3;
			// Extra bonus for low straights/stairs (opponents less likely to beat)
			if (combo.rank <= 8) score += 4;
			// 마작이 포함된 스트레이트: 마작 소모 + 여러 장 처리 → 큰 보너스
			if (combo.cards.some(c => c.type === 'special' && c.special === 'mahjong')) {
				score += 30;
			}
		}

		// === Bonus for low pairs/triples (get rid of weak combos) ===
		if ((combo.type === 'pair' || combo.type === 'triple') && combo.rank <= 8) {
			score += 6;
		}
		// 중간 랭크 페어/트리플도 약간의 보너스 (너무 아끼면 안 됨)
		if ((combo.type === 'pair' || combo.type === 'triple') && combo.rank >= 9 && combo.rank <= 11) {
			score += 2;
		}

		// === Bonus for full house (clears 5 cards) ===
		if (combo.type === 'full_house') {
			score += 10;
			if (combo.rank <= 9) score += 3; // low full house even better

			// Penalty: 풀하우스 페어에 강한 싱글톤(A, K 등)이 포함되면 감점
			// 강한 싱글은 나중에 선먹기용으로 보존해야 함
			const pairCards = combo.cards.filter(c => {
				if (c.type !== 'normal') return false;
				return (c as NormalCard).rank !== combo.rank;
			});
			for (const pc of pairCards) {
				if (pc.type !== 'normal') continue;
				const pRank = (pc as NormalCard).rank;
				// 페어에 사용된 카드가 싱글톤(다른 멀티콤보에 안 쓰이는 카드)이고 높은 랭크면 페널티
				const isSingleton = plan.singletonCards.some(s => s.id === pc.id);
				if (isSingleton && pRank >= 13) {
					score -= 15; // A, K 싱글톤을 페어로 낭비하면 큰 감점
				} else if (isSingleton && pRank >= 11) {
					score -= 8; // Q, J 싱글톤도 감점
				}
			}
		}

		// === Singletons: context-aware ===
		if (combo.type === 'single') {
			const card = combo.cards[0];
			if (card.type === 'special' && card.special === 'mahjong') {
				score += 50; // 마작은 최우선 소모 — 리드 기회에 반드시 먼저 냄
			} else if (card.type === 'normal') {
				const isSingleton = plan.singletonCards.some(s => s.id === card.id);
				const lowSingletonCount = plan.singletonCards.filter(
					c => c.type === 'normal' && (c as NormalCard).rank <= 8
				).length;

				// 낮은 싱글 리드: 뺏기기 쉽지만 처리해야 할 패
				if (isSingleton && card.rank <= 5) {
					score += 3;
				} else if (isSingleton && card.rank >= 6 && card.rank <= 8) {
					score += 4;
				} else if (isSingleton && card.rank >= 9 && card.rank <= 10) {
					score += 5;
				} else if (!isSingleton && card.rank <= 6) {
					score += 1;
				}

				// 높은 카드 싱글: "선먹기" 패턴
				// 높은 카드로 선을 잡은 후 → 다음 리드에서 낮은 싱글톤 처리
				if (card.rank >= 13) {
					const likelyWins = isSingleLikelyToWin(card.rank, hand, playedCounts);
					if (likelyWins && lowSingletonCount >= 3) {
						score += 12; // 낮은 싱글 3장 이상 → 선먹기 매우 적극적
					} else if (likelyWins && lowSingletonCount >= 1) {
						score += 7; // 낮은 싱글 1~2장 → 선먹기 적극적
					} else if (likelyWins) {
						score += 3;
					} else {
						score -= 5;
					}
				} else if (card.rank >= 11) {
					// Q, J도 선먹기 가능 — 낮은 싱글이 많으면 적극 사용
					if (lowSingletonCount >= 3 && isSingleton) {
						const likelyWins = isSingleLikelyToWin(card.rank, hand, playedCounts);
						if (likelyWins) {
							score += 5;
						}
					} else {
						score -= 2;
					}
				}
			}
		}

		// === If I declared tichu, play aggressively to go out ===
		if (iDeclaredTichu) {
			score += combo.cards.length * 3; // Favor bigger combos
			// Don't be too careful about saving cards
			if (combo.rank >= 11) score += 2;
		}

		// === If partner declared tichu, play more conservatively to help partner ===
		if (partnerDeclaredTichu && !partnerFinished) {
			// Prefer smaller combos that let partner contribute
			score -= combo.rank * 0.5;
		}

		// === Aggressiveness modifier ===
		score += combo.rank * weights.aggressiveness * 0.8;
		score += combo.cards.length * weights.aggressiveness * 1.5;

		return { combo, score };
	});

	scored.sort((a, b) => b.score - a.score);
	return scored[0].combo.cards.map(c => c.id);
}

/**
 * Lead decision when close to finishing (5 or fewer cards).
 * Focus on finding a sequence of plays that empties the hand.
 */
function decideLeadEndgame(
	hand: Card[],
	plan: HandPlan,
	weights: PersonalityWeights,
	context: AiDecisionContext
): string[] {
	// If we can play all remaining cards in one combo, do it!
	const allAtOnce = plan.allCombos.find(c => c.cards.length === hand.length && !isDogCombo(c));
	if (allAtOnce) {
		return allAtOnce.cards.map(c => c.id);
	}

	// Try to find a combo that leaves the rest playable in one more turn
	const bestEndgameLead = findBestEndgameLead(hand, plan);
	if (bestEndgameLead) {
		return bestEndgameLead.cards.map(c => c.id);
	}

	// Try 2-step finish: play A, leaving B+C as valid combo
	const twoStepResult = findTwoStepFinish(hand, plan);
	if (twoStepResult) {
		return twoStepResult.cards.map(c => c.id);
	}

	// Fallback: play the largest possible combo to reduce hand size
	const nonDog = plan.allCombos.filter(c => !isDogCombo(c) && !isBomb(c));
	if (nonDog.length > 0) {
		// Among largest combos, prefer lower rank (more likely to succeed as lead)
		const maxLen = Math.max(...nonDog.map(c => c.cards.length));
		const biggest = nonDog.filter(c => c.cards.length === maxLen);
		biggest.sort((a, b) => a.rank - b.rank);
		return biggest[0].cards.map(c => c.id);
	}

	return [hand[0].id];
}

/**
 * Find the best lead in endgame that leaves remaining cards as a valid combo.
 * Fixed: always return the combo when remaining forms valid play regardless of rank comparison.
 */
function findBestEndgameLead(hand: Card[], plan: HandPlan): Combination | null {
	const validSplits: { lead: Combination; remainderSize: number; leadRank: number }[] = [];

	for (const combo of plan.allCombos) {
		if (isDogCombo(combo)) continue;
		if (isBomb(combo)) continue;

		const remainingCards = hand.filter(c => !combo.cards.some(cc => cc.id === c.id));
		if (remainingCards.length === 0) {
			// Plays all cards — this is the best!
			return combo;
		}

		if (remainingCards.length === 1) {
			// Single card remaining: always valid as a follow-up
			validSplits.push({ lead: combo, remainderSize: 1, leadRank: combo.rank });
			continue;
		}

		const remainingCombo = detectCombination(remainingCards);
		if (remainingCombo) {
			validSplits.push({ lead: combo, remainderSize: remainingCards.length, leadRank: combo.rank });
		}
	}

	if (validSplits.length === 0) return null;

	// Prefer: lead the weaker combo first (save strong for taking trick later)
	// Then prefer leaving fewer remaining cards (closer to finish)
	validSplits.sort((a, b) => {
		// Prefer leading low rank first
		if (a.leadRank !== b.leadRank) return a.leadRank - b.leadRank;
		// Then prefer bigger lead (leaves less remaining)
		return a.remainderSize - b.remainderSize;
	});

	return validSplits[0].lead;
}

/**
 * Try to find a 2-step finish: play combo A, then remaining can be split into 2 valid combos.
 */
function findTwoStepFinish(hand: Card[], plan: HandPlan): Combination | null {
	for (const combo of plan.allCombos) {
		if (isDogCombo(combo)) continue;
		if (isBomb(combo)) continue;

		const remainingCards = hand.filter(c => !combo.cards.some(cc => cc.id === c.id));
		if (remainingCards.length <= 1) continue; // Already handled by findBestEndgameLead
		if (remainingCards.length > 6) continue; // Too many cards to analyze

		// Check if remaining can be emptied in 2 turns
		const remainingCombos = findAllPlayableCombinations(remainingCards);
		for (const rc of remainingCombos) {
			const afterFirst = remainingCards.filter(c => !rc.cards.some(cc => cc.id === c.id));
			if (afterFirst.length === 0) continue; // Would need 2 turns total including combo

			if (afterFirst.length === 1) {
				// Last card is a valid single: 3 turns total
				return combo;
			}
			const lastCombo = detectCombination(afterFirst);
			if (lastCombo) {
				return combo; // 3 turns total: combo + rc + lastCombo
			}
		}
	}
	return null;
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

	const myRanks = new Set(
		hand.filter(c => c.type === 'normal').map(c => (c as NormalCard).rank as number)
	);

	const normalCards = hand.filter(c => c.type === 'normal') as NormalCard[];
	const rankCounts = new Map<number, number>();
	for (const c of normalCards) {
		rankCounts.set(c.rank, (rankCounts.get(c.rank) || 0) + 1);
	}

	const playedCounts = countPlayedCards(context);

	// Strategy 1: Wish for a rank where we have 2+ copies AND opponents likely have some too
	const goodWishRanks: { rank: number; score: number }[] = [];
	for (const [rank, count] of rankCounts) {
		if (rank <= 5) continue; // Low ranks not worth wishing for
		const stillOut = cardsStillOut(rank, hand, playedCounts);
		if (count >= 2 && stillOut >= 1) {
			// Having 2+ copies means we benefit; opponents forced to play theirs
			goodWishRanks.push({ rank, score: rank + count * 5 + stillOut * 3 });
		}
	}

	if (goodWishRanks.length > 0) {
		goodWishRanks.sort((a, b) => b.score - a.score);
		return goodWishRanks[0].rank;
	}

	// Strategy 2: Wish for a high rank we DON'T have that opponents likely have
	const highRanks = [14, 13, 12, 11];
	for (const rank of highRanks) {
		if (!myRanks.has(rank)) {
			const stillOut = cardsStillOut(rank, hand, playedCounts);
			if (stillOut >= 2) {
				return rank; // Likely opponents have it
			}
		}
	}

	// Strategy 3: Any high rank we don't have
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

	// Give to opponent with MORE cards (further from finishing)
	// Secondary: give to one who has already won fewer points
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

	// Primary: more cards left (further from finishing, will hold dragon points longer)
	// Secondary: fewer won points (give dragon to the one who hasn't collected much yet — more damage)
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

	// Check if trick has lots of points
	const trickCards = context.trick?.plays.flatMap(p => p.combination.cards) || [];
	const trickPoints = getTrickPoints(trickCards);

	if (trickPoints >= 20 && weights.aggressiveness > 0.3) {
		return beatable[0];
	}

	// If I'm close to finishing and bombing would let me lead
	if (hand.length <= 4 && weights.aggressiveness > 0.3) {
		return beatable[0];
	}

	// If opponent played dragon as single and we can bomb it — always do it
	if (lastPlay.combination.type === 'single' &&
		lastPlay.combination.cards.some(c => c.type === 'special' && c.special === 'dragon')) {
		return beatable[0]; // Bomb the dragon to prevent 25-point trick
	}

	return null;
}
