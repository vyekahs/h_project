/**
 * Card Tracking System for Tichu AI
 *
 * Tracks played cards, remaining cards, and opponent profiles
 * to enable smarter AI decisions. Built from AiDecisionContext.
 */
import type { Card, Combination, NormalCard, SeatIndex } from '../types';
import type { AiDecisionContext } from './types';
import { getTeam, getPartnerSeat } from '../constants';
import { findAllPlayableCombinations } from './handEvaluator';
import { isBomb, canBeat } from '../combinations';

// ===== Types =====

export interface OpponentProfile {
	seat: SeatIndex;
	cardsRemaining: number;
	declaredTichu: boolean;
	/** Ranks this player has played (observed) */
	playedRanks: Set<number>;
	/** Whether player has played any bombs */
	hasPlayedBomb: boolean;
	/** Already finished? */
	finished: boolean;
}

export interface CardTracker {
	/** How many of each rank (2-14) have been played */
	playedByRank: Map<number, number>;
	/** How many of each rank remain unknown (not in my hand, not played) */
	remainingByRank: Map<number, number>;
	/** Special card tracking */
	dragonPlayed: boolean;
	phoenixPlayed: boolean;
	dragonInMyHand: boolean;
	phoenixInMyHand: boolean;
	/** Total unknown cards (not mine, not played) */
	totalUnknownCards: number;
	/** Number of active opponents (not finished) */
	activeOpponents: number;
	/** Per-opponent profile */
	opponents: OpponentProfile[];
	/** Partner profile */
	partner: OpponentProfile;
}

// ===== Builder =====

/**
 * Build a CardTracker from AiDecisionContext.
 * Analyzes wonCards (completed tricks), current trick, and hand.
 */
export function buildCardTracker(context: AiDecisionContext): CardTracker {
	const { hand, trick, players, currentSeat } = context;
	const myTeam = getTeam(currentSeat);
	const partnerSeat = getPartnerSeat(currentSeat);

	// Count played cards by rank
	const playedByRank = new Map<number, number>();
	let dragonPlayed = false;
	let phoenixPlayed = false;

	// Per-seat tracking
	const seatPlayedRanks = new Map<SeatIndex, Set<number>>();
	const seatPlayedBomb = new Map<SeatIndex, boolean>();
	for (let i = 0; i < 4; i++) {
		seatPlayedRanks.set(i as SeatIndex, new Set());
		seatPlayedBomb.set(i as SeatIndex, false);
	}

	// Process won cards from all players
	for (const player of players) {
		for (const card of player.wonCards) {
			trackCard(card, playedByRank);
			if (card.type === 'special') {
				if (card.special === 'dragon') dragonPlayed = true;
				if (card.special === 'phoenix') phoenixPlayed = true;
			}
		}
	}

	// Process current trick plays (also track who played what)
	if (trick) {
		for (const play of trick.plays) {
			const seat = play.seat;
			for (const card of play.combination.cards) {
				trackCard(card, playedByRank);
				if (card.type === 'special') {
					if (card.special === 'dragon') dragonPlayed = true;
					if (card.special === 'phoenix') phoenixPlayed = true;
				}
				if (card.type === 'normal') {
					seatPlayedRanks.get(seat)!.add(card.rank);
				}
			}
			if (isBomb(play.combination)) {
				seatPlayedBomb.set(seat, true);
			}
		}
	}

	// Count my hand
	const myRankCounts = new Map<number, number>();
	let dragonInMyHand = false;
	let phoenixInMyHand = false;
	for (const card of hand) {
		if (card.type === 'normal') {
			myRankCounts.set(card.rank, (myRankCounts.get(card.rank) || 0) + 1);
		} else if (card.type === 'special') {
			if (card.special === 'dragon') dragonInMyHand = true;
			if (card.special === 'phoenix') phoenixInMyHand = true;
		}
	}

	// Remaining by rank = 4 - played - inMyHand
	const remainingByRank = new Map<number, number>();
	for (let rank = 2; rank <= 14; rank++) {
		const played = playedByRank.get(rank) || 0;
		const inHand = myRankCounts.get(rank) || 0;
		remainingByRank.set(rank, Math.max(0, 4 - played - inHand));
	}

	// Total unknown cards
	let totalUnknown = 0;
	for (const [, count] of remainingByRank) {
		totalUnknown += count;
	}
	// Add unknown specials
	if (!dragonPlayed && !dragonInMyHand) totalUnknown++;
	if (!phoenixPlayed && !phoenixInMyHand) totalUnknown++;

	// Build opponent profiles
	const opponents: OpponentProfile[] = [];
	let partner: OpponentProfile | null = null;
	let activeOpponents = 0;

	for (const player of players) {
		if (player.seat === currentSeat) continue;

		const profile: OpponentProfile = {
			seat: player.seat,
			cardsRemaining: player.hand.length,
			declaredTichu: player.grandTichu === true || player.smallTichu,
			playedRanks: seatPlayedRanks.get(player.seat) || new Set(),
			hasPlayedBomb: seatPlayedBomb.get(player.seat) || false,
			finished: player.finishOrder !== null
		};

		if (player.seat === partnerSeat) {
			partner = profile;
		} else {
			opponents.push(profile);
			if (player.finishOrder === null) activeOpponents++;
		}
	}

	return {
		playedByRank,
		remainingByRank,
		dragonPlayed,
		phoenixPlayed,
		dragonInMyHand,
		phoenixInMyHand,
		totalUnknownCards: totalUnknown,
		activeOpponents,
		opponents,
		partner: partner!
	};
}

function trackCard(card: Card, playedByRank: Map<number, number>): void {
	if (card.type === 'normal') {
		playedByRank.set(card.rank, (playedByRank.get(card.rank) || 0) + 1);
	}
}

// ===== Analysis Functions =====

/**
 * Estimate how likely a single of the given rank will win the trick.
 * Returns 0.0 ~ 1.0 probability.
 */
export function rankStrengthInContext(rank: number, tracker: CardTracker): number {
	// Count how many higher-rank singles are still out
	let higherCardsOut = 0;
	for (let r = rank + 1; r <= 14; r++) {
		higherCardsOut += tracker.remainingByRank.get(r) || 0;
	}
	// Dragon beats any single
	if (!tracker.dragonPlayed && !tracker.dragonInMyHand) {
		higherCardsOut += 1;
	}

	if (higherCardsOut === 0) return 1.0;

	// Probability depends on how many higher cards vs total unknowns
	// and how many active opponents could play
	const activeOpps = Math.max(1, tracker.activeOpponents);

	// Each opponent draws from the unknown pool
	// Probability no opponent has a higher card:
	// Rough model: each higher card has (totalUnknown - higherCardsOut) / totalUnknown
	// chance of NOT being in a specific opponent's hand
	if (tracker.totalUnknownCards <= 0) return rank >= 14 ? 0.9 : 0.5;

	// Simple heuristic: fewer higher cards out = higher win probability
	const ratio = higherCardsOut / tracker.totalUnknownCards;
	// With N opponents, probability at least one has a higher card ≈ 1 - (1-ratio)^N (simplified)
	const probBeaten = 1 - Math.pow(1 - ratio, activeOpps);

	return Math.max(0, Math.min(1, 1 - probBeaten));
}

/**
 * Estimate how likely a combo will win the trick (not be beaten).
 * Considers: rank relative to what's still out, combo type, and bombs.
 */
export function comboLikelyToWin(combo: Combination, tracker: CardTracker, hand: Card[]): number {
	if (isBomb(combo)) {
		// Bombs are very strong — only beaten by higher bombs
		if (combo.type === 'straight_flush_bomb') return 0.95;
		// Four bomb: check if higher four bombs possible
		let higherBombPossible = false;
		for (let r = combo.rank + 1; r <= 14; r++) {
			if ((tracker.remainingByRank.get(r) || 0) >= 4) {
				higherBombPossible = true;
				break;
			}
		}
		return higherBombPossible ? 0.75 : 0.9;
	}

	if (combo.type === 'single') {
		const card = combo.cards[0];
		if (card.type === 'special') {
			if (card.special === 'dragon') return 0.95; // only bomb beats dragon
			if (card.special === 'phoenix') return 0.3; // phoenix single is weak as lead
		}
		return rankStrengthInContext(combo.rank, tracker);
	}

	if (combo.type === 'pair') {
		// How many higher pairs are possible?
		let higherPairsOut = 0;
		for (let r = combo.rank + 1; r <= 14; r++) {
			const remaining = tracker.remainingByRank.get(r) || 0;
			// Count how many of this rank I have
			const inMyHand = hand.filter(c => c.type === 'normal' && c.rank === r).length;
			const outThere = remaining; // already excludes my hand
			if (outThere >= 2) higherPairsOut++;
			// Phoenix can make a pair from 1 card
			if (outThere >= 1 && !tracker.phoenixPlayed && !tracker.phoenixInMyHand) {
				higherPairsOut += 0.5; // partial credit for phoenix pair
			}
		}
		if (higherPairsOut === 0) return 0.9;
		return Math.max(0.1, 0.9 - higherPairsOut * 0.15);
	}

	if (combo.type === 'triple' || combo.type === 'full_house') {
		let higherTriplesOut = 0;
		for (let r = combo.rank + 1; r <= 14; r++) {
			const remaining = tracker.remainingByRank.get(r) || 0;
			if (remaining >= 3) higherTriplesOut++;
			if (remaining >= 2 && !tracker.phoenixPlayed && !tracker.phoenixInMyHand) {
				higherTriplesOut += 0.3;
			}
		}
		if (higherTriplesOut === 0) return 0.9;
		return Math.max(0.15, 0.9 - higherTriplesOut * 0.2);
	}

	if (combo.type === 'straight') {
		// Straights are harder to beat — need same length, higher rank
		// High-rank straights are very strong
		const maxPossibleRank = 14;
		const slotsAbove = maxPossibleRank - combo.rank;
		if (slotsAbove <= 0) return 0.85; // max rank straight
		// Each slot above: need all ranks present among unknowns
		let canBeatCount = 0;
		for (let topRank = combo.rank + 1; topRank <= 14; topRank++) {
			const startRank = topRank - combo.length + 1;
			if (startRank < 1) continue;
			let possible = true;
			for (let r = startRank; r <= topRank; r++) {
				if ((tracker.remainingByRank.get(r) || 0) < 1) {
					possible = false;
					break;
				}
			}
			if (possible) canBeatCount++;
		}
		if (canBeatCount === 0) return 0.85;
		return Math.max(0.2, 0.85 - canBeatCount * 0.1);
	}

	if (combo.type === 'stairs') {
		// Similar to straight analysis but for consecutive pairs
		let canBeatCount = 0;
		for (let topRank = combo.rank + 1; topRank <= 14; topRank++) {
			const startRank = topRank - combo.length + 1;
			if (startRank < 1) continue;
			let possible = true;
			for (let r = startRank; r <= topRank; r++) {
				if ((tracker.remainingByRank.get(r) || 0) < 2) {
					possible = false;
					break;
				}
			}
			if (possible) canBeatCount++;
		}
		if (canBeatCount === 0) return 0.85;
		return Math.max(0.2, 0.85 - canBeatCount * 0.12);
	}

	return 0.5; // default
}

/**
 * Check if an opponent is threatening (close to finishing, declared tichu).
 */
export function isOpponentThreatening(tracker: CardTracker): boolean {
	return tracker.opponents.some(
		opp => !opp.finished && (opp.cardsRemaining <= 3 || opp.declaredTichu)
	);
}

/**
 * Check if an opponent has declared tichu and hasn't finished yet.
 */
export function hasOpponentDeclaredTichu(tracker: CardTracker): boolean {
	return tracker.opponents.some(opp => !opp.finished && opp.declaredTichu);
}

/**
 * Check if partner has declared tichu and hasn't finished yet.
 */
export function hasPartnerDeclaredTichu(tracker: CardTracker): boolean {
	return !tracker.partner.finished && tracker.partner.declaredTichu;
}

/**
 * Estimate how many turns it would take to empty the hand,
 * weighting by win probability for each combo.
 * Lower = closer to going out. Accounts for needing to win tricks.
 */
export function estimateWeightedTurns(hand: Card[], tracker: CardTracker): number {
	if (hand.length === 0) return 0;

	const combos = findAllPlayableCombinations(hand);
	const bombs = combos.filter(c => isBomb(c));
	const nonBombs = combos.filter(c => !isBomb(c) && c.type !== 'single');

	// Greedy: use biggest combos first
	const usedCards = new Set<string>();
	let weightedTurns = 0;

	const sorted = [...nonBombs, ...bombs].sort((a, b) => {
		if (b.cards.length !== a.cards.length) return b.cards.length - a.cards.length;
		return a.rank - b.rank;
	});

	for (const combo of sorted) {
		if (combo.cards.every(c => !usedCards.has(c.id))) {
			for (const c of combo.cards) usedCards.add(c.id);
			const winProb = comboLikelyToWin(combo, tracker, hand);
			// A combo that's likely to win = 1 effective turn
			// A combo unlikely to win = need to win it another way = more turns
			weightedTurns += 1 + (1 - winProb) * 0.5;
		}
	}

	// Remaining singles
	const remainingCards = hand.filter(c => !usedCards.has(c.id));
	for (const card of remainingCards) {
		const rank = card.type === 'normal' ? card.rank : (card.type === 'special' && card.special === 'dragon' ? 15 : 1);
		const winProb = rankStrengthInContext(rank, tracker);
		weightedTurns += 1 + (1 - winProb) * 0.5;
	}

	return weightedTurns;
}
