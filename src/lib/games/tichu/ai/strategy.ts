import type { Card, Combination, SeatIndex, ExchangeCards, WishState } from '../types';
import type { AiDecisionContext, PersonalityWeights } from './types';
import { getTeam, getPartnerSeat, getLeftSeat, getRightSeat, getEffectiveRank } from '../constants';
import { canBeat, isBomb, detectCombination } from '../combinations';
import { mustPlayWishedRank, playFulfillsWish, canPlayWishedCombo } from '../wish';
import { findCardById } from '../deck';
import {
	evaluateHandStrength,
	findAllPlayableCombinations,
	findBeatablePlays,
	findBombs,
	getCardSortRank,
	findAllSingles,
	findAllPairs,
	findAllTriples,
	findAllFullHouses,
	findAllStraights,
	findAllStairs
} from './handEvaluator';

// ===== Grand Tichu Decision =====

/**
 * Decide whether to declare Grand Tichu based on 8-card hand.
 */
export function decideGrandTichu(hand8: Card[], weights: PersonalityWeights): boolean {
	const strength = evaluateHandStrength(hand8);
	// Base threshold: 70. Lower tichoPropensity → higher threshold needed.
	const threshold = 70 - weights.tichoPropensity * 25;
	return strength >= threshold;
}

// ===== Small Tichu Decision =====

/**
 * Decide whether to declare Small Tichu based on full 14-card hand.
 */
export function decideSmallTichu(hand: Card[], weights: PersonalityWeights, context: AiDecisionContext): boolean {
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

	return strength >= threshold;
}

// ===== Exchange Card Selection =====

/**
 * Select 3 cards to exchange: one to partner, one to left, one to right.
 */
export function selectExchangeCards(
	hand: Card[],
	seat: SeatIndex,
	weights: PersonalityWeights
): ExchangeCards {
	const sorted = [...hand].sort((a, b) => getCardSortRank(a) - getCardSortRank(b));

	// Cards to give to opponents (low value, weak cards)
	const weakCards = sorted.filter(c => {
		// Don't give away bombs
		if (c.type === 'special' && c.special === 'dragon') return false;
		if (c.type === 'special' && c.special === 'phoenix') return false;
		return true;
	});

	// Card to give to partner (helpful card)
	const strongCards = [...sorted].reverse().filter(c => {
		if (c.type === 'special' && c.special === 'dog') return false;
		return true;
	});

	// To partner: give a strong card (higher partnerAwareness → stronger card)
	let toPartner: Card;
	if (weights.partnerAwareness > 0.6 && strongCards.length > 0) {
		// Give one of the best cards
		toPartner = strongCards[0];
	} else {
		// Give a mid-range card
		const midIdx = Math.floor(sorted.length / 2);
		toPartner = sorted[midIdx];
	}

	// To opponents: give weakest cards (skip the one already chosen)
	const remaining = hand.filter(c => c.id !== toPartner.id);
	const remainingSorted = remaining.sort((a, b) => getCardSortRank(a) - getCardSortRank(b));

	// Pick two weakest that aren't special valuable cards
	let toLeft: Card | null = null;
	let toRight: Card | null = null;

	for (const card of remainingSorted) {
		if (card.type === 'special' && (card.special === 'dragon' || card.special === 'phoenix')) continue;
		if (!toLeft) { toLeft = card; continue; }
		if (!toRight) { toRight = card; break; }
	}

	// Fallback: if couldn't find suitable cards, just pick first available
	if (!toLeft) toLeft = remainingSorted[0];
	if (!toRight) toRight = remainingSorted.find(c => c.id !== toLeft!.id) || remainingSorted[1];

	return {
		toPartner: toPartner.id,
		toLeft: toLeft.id,
		toRight: toRight.id
	};
}

// ===== Play Decision (Core) =====

/**
 * Decide what to play during the playing phase.
 * Returns card IDs to play, or 'pass'.
 */
export function decidePlay(
	context: AiDecisionContext,
	weights: PersonalityWeights
): string[] | 'pass' {
	const { hand, trick, wish, currentSeat, players } = context;
	const myTeam = getTeam(currentSeat);
	const partnerSeat = getPartnerSeat(currentSeat);

	if (!trick || trick.plays.length === 0) {
		// === LEADING ===
		return decideLead(hand, wish, weights, context);
	}

	// === FOLLOWING ===
	const lastPlay = trick.plays[trick.plays.length - 1];
	const lastCombo = lastPlay.combination;
	const trickLeaderTeam = getTeam(lastPlay.seat);

	// If partner is winning the trick, consider passing
	if (lastPlay.seat === partnerSeat && !isBomb(lastCombo)) {
		// Partner is winning - usually pass unless we need to play wish
		if (wish.active && wish.requestedRank !== null && mustPlayWishedRank(hand, wish)) {
			if (canPlayWishedCombo(hand, wish, lastCombo)) {
				return findWishedPlay(hand, wish, lastCombo);
			}
		}
		// Pass if partner is winning, with some probability based on aggressiveness
		if (Math.random() > weights.aggressiveness * 0.3) {
			return 'pass';
		}
	}

	// Must play wish if active
	const wishEnforced = wish.active && wish.requestedRank !== null && mustPlayWishedRank(hand, wish);
	if (wishEnforced && canPlayWishedCombo(hand, wish, lastCombo)) {
		const wishedPlay = findWishedPlay(hand, wish, lastCombo);
		if (wishedPlay.length > 0) return wishedPlay;
		// findWishedPlay failed — fall through to filter beatablePlays
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

	// Check if opponent is about to finish (1 or 2 cards left)
	const opponentAboutToFinish = players.some(
		p => getTeam(p.seat) !== myTeam && p.finishOrder === null && p.hand.length <= 2
	);

	// Use bomb if opponent about to finish
	if (opponentAboutToFinish && bombPlays.length > 0 && weights.bombHolding < 0.7) {
		// Use weakest bomb
		const weakestBomb = bombPlays.sort((a, b) => a.rank - b.rank)[0];
		return weakestBomb.cards.map(c => c.id);
	}

	if (nonBombPlays.length === 0) {
		// Only bombs available
		if (bombPlays.length > 0) {
			// Use bomb based on strategy
			if (weights.bombHolding > 0.7 && !opponentAboutToFinish) {
				return 'pass'; // Hold bomb for later
			}
			return bombPlays.sort((a, b) => a.rank - b.rank)[0].cards.map(c => c.id);
		}
		return 'pass';
	}

	// Pick which non-bomb play to make
	// Aggressive: play strongest available. Defensive: play weakest that still wins.
	if (weights.aggressiveness > 0.6) {
		// Aggressive: play strong but not strongest (save some power)
		const sorted = nonBombPlays.sort((a, b) => b.rank - a.rank);
		const idx = Math.min(Math.floor(sorted.length * 0.3), sorted.length - 1);
		return sorted[idx].cards.map(c => c.id);
	} else {
		// Defensive/balanced: play the weakest winning combo
		const sorted = nonBombPlays.sort((a, b) => a.rank - b.rank);
		return sorted[0].cards.map(c => c.id);
	}
}

/**
 * Decide what to lead with when starting a new trick.
 */
function decideLead(
	hand: Card[],
	wish: WishState,
	weights: PersonalityWeights,
	context: AiDecisionContext
): string[] {
	const myTeam = getTeam(context.currentSeat);

	// If wish is active, must lead with wished rank if possible
	if (wish.active && wish.requestedRank !== null && mustPlayWishedRank(hand, wish)) {
		const wishedCards = hand.filter(c => c.type === 'normal' && c.rank === wish.requestedRank);
		if (wishedCards.length > 0) {
			// Lead with a combo containing the wished rank
			const allCombos = findAllPlayableCombinations(hand);
			const wishedCombos = allCombos.filter(c => playFulfillsWish(c.cards, wish));
			if (wishedCombos.length > 0) {
				// Pick smallest combo with the wished rank
				const sorted = wishedCombos.sort((a, b) => a.cards.length - b.cards.length);
				return sorted[0].cards.map(c => c.id);
			}
			// Just play the wished single
			return [wishedCards[0].id];
		}
	}

	// Check for dog play - pass lead to partner
	const dogCard = hand.find(c => c.type === 'special' && c.special === 'dog');
	const partner = context.players.find(p => p.seat === getPartnerSeat(context.currentSeat));
	if (dogCard && partner && partner.finishOrder === null && weights.partnerAwareness > 0.4) {
		// Play dog to give lead to partner, especially if partner has fewer cards
		if (partner.hand.length <= 5 || Math.random() < weights.partnerAwareness * 0.5) {
			return [dogCard.id];
		}
	}

	// Get all possible leads
	const allCombos = findAllPlayableCombinations(hand);
	if (allCombos.length === 0) return [hand[0].id]; // fallback

	// Filter out dog (handled above), bombs (save for later usually)
	let candidates = allCombos.filter(c => {
		if (c.cards.length === 1 && c.cards[0].type === 'special' && c.cards[0].special === 'dog') return false;
		if (isBomb(c) && weights.bombHolding > 0.5) return false;
		return true;
	});

	if (candidates.length === 0) candidates = allCombos.filter(c => !isDogCombo(c));
	if (candidates.length === 0) candidates = allCombos;

	// Strategy-based lead selection
	if (weights.aggressiveness > 0.7) {
		// Aggressive: lead with multi-card combos to get rid of cards fast
		const multiCard = candidates.filter(c => c.cards.length >= 2);
		if (multiCard.length > 0) {
			// Pick the largest combo
			const sorted = multiCard.sort((a, b) => b.cards.length - a.cards.length);
			return sorted[0].cards.map(c => c.id);
		}
	}

	if (weights.aggressiveness < 0.3) {
		// Defensive: lead with weakest singles
		const singles = candidates.filter(c => c.type === 'single');
		if (singles.length > 0) {
			const sorted = singles.sort((a, b) => a.rank - b.rank);
			return sorted[0].cards.map(c => c.id);
		}
	}

	// Balanced: prefer mid-range combos, mix singles and multi-card
	// Try to play combos that clear weak spots from hand
	const sorted = candidates.sort((a, b) => {
		// Prefer multi-card combos slightly
		const sizeScore = (a.cards.length - b.cards.length) * 0.3;
		// Prefer lower rank plays
		const rankScore = a.rank - b.rank;
		return rankScore + sizeScore * (weights.aggressiveness - 0.5);
	});

	return sorted[0].cards.map(c => c.id);
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
 * Returns a rank (2-14) or null (no wish).
 */
export function decideWish(
	hand: Card[],
	weights: PersonalityWeights,
	context: AiDecisionContext
): number | null {
	// Less aggressive players might skip wish
	if (Math.random() > weights.aggressiveness + 0.3) return null;

	const myTeam = getTeam(context.currentSeat);

	// Look for ranks that we DON'T have but opponents might struggle with
	// Prefer mid-high ranks that are common
	const myRanks = new Set(
		hand.filter(c => c.type === 'normal').map(c => (c as any).rank as number)
	);

	// Prioritize ranks we have (so opponents must give us their cards)
	// Actually, wish the rank we want opponents to play
	// Good strategy: wish a high rank we don't have many of, forcing opponents to waste high cards
	const candidateRanks = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];

	for (const rank of candidateRanks) {
		// Wish for ranks we DON'T have - forces opponents to play them
		if (!myRanks.has(rank)) {
			return rank;
		}
	}

	// Fallback: wish for a high rank
	return 14;
}

// ===== Dragon Gift Decision =====

/**
 * Decide which opponent to give the dragon trick to.
 * Must give to an opponent (not partner or self).
 */
export function decideDragonGift(
	context: AiDecisionContext,
	seat: SeatIndex,
	weights: PersonalityWeights
): SeatIndex {
	const myTeam = getTeam(seat);
	const opponents = context.players.filter(p => getTeam(p.seat) !== myTeam && p.finishOrder === null);

	if (opponents.length === 0) {
		// All opponents finished, give to any opponent seat
		const leftSeat = getLeftSeat(seat) as SeatIndex;
		const rightSeat = getRightSeat(seat) as SeatIndex;
		return getTeam(leftSeat) !== myTeam ? leftSeat : rightSeat;
	}

	if (opponents.length === 1) return opponents[0].seat;

	// Give to opponent with fewer won card points (less damage)
	// Or give to opponent who has more cards left (further from finishing)
	const scored = opponents.map(opp => {
		const wonPoints = opp.wonCards.reduce((sum, card) => {
			if (card.type === 'special' && card.special === 'dragon') return sum + 25;
			if (card.type === 'special' && card.special === 'phoenix') return sum - 25;
			if (card.type === 'normal') {
				if (card.rank === 5) return sum + 5;
				if (card.rank === 10 || card.rank === 13) return sum + 10;
			}
			return sum;
		}, 0);
		return { seat: opp.seat, wonPoints, cardsLeft: opp.hand.length };
	});

	// Give to opponent with fewer won points (less additional damage)
	scored.sort((a, b) => a.wonPoints - b.wonPoints);
	return scored[0].seat;
}

// ===== Bomb Interrupt Decision =====

/**
 * Decide whether to play a bomb out of turn.
 * Called when another player makes a play and we have bombs.
 */
export function shouldPlayBomb(
	context: AiDecisionContext,
	weights: PersonalityWeights,
	lastPlay: { seat: SeatIndex; combination: Combination }
): Combination | null {
	const { hand, currentSeat, players } = context;
	const myTeam = getTeam(currentSeat);
	const playTeam = getTeam(lastPlay.seat);

	// Don't bomb our own team (includes partner)
	if (playTeam === myTeam) return null;

	const bombs = findBombs(hand);
	if (bombs.length === 0) return null;

	// Filter to only bombs that can beat the last play
	const beatable = bombs.filter(b => canBeat(lastPlay.combination, b));
	if (beatable.length === 0) return null;

	// Sort by strength (weakest first) to preserve stronger bombs
	beatable.sort((a, b) => a.rank - b.rank);

	// Counter-bomb scenario: the last play is already a bomb
	if (isBomb(lastPlay.combination)) {
		// Only counter-bomb if opponent is about to finish or very aggressive
		const attacker = players[lastPlay.seat];
		if (attacker.hand.length <= 2) {
			return beatable[0]; // Must stop them
		}
		// Counter-bomb only if very aggressive and low bombHolding
		if (weights.aggressiveness > 0.7 && weights.bombHolding < 0.4) {
			return beatable[0];
		}
		// Generally don't waste bombs counter-bombing
		return null;
	}

	// High bomb holding = reluctant to use bombs
	if (weights.bombHolding > 0.8 && Math.random() > 0.2) return null;

	// Check if opponent is about to finish — always bomb
	const player = players[lastPlay.seat];
	if (player.hand.length <= 2) {
		return beatable[0];
	}

	// Check if trick has lots of points
	const trickCards = context.trick?.plays.flatMap(p => p.combination.cards) || [];
	const trickPoints = trickCards.reduce((sum, card) => {
		if (card.type === 'special' && card.special === 'dragon') return sum + 25;
		if (card.type === 'normal' && (card.rank === 5)) return sum + 5;
		if (card.type === 'normal' && (card.rank === 10 || card.rank === 13)) return sum + 10;
		return sum;
	}, 0);

	if (trickPoints >= 20 && weights.aggressiveness > 0.5) {
		return beatable[0];
	}

	return null;
}
