import type { Card, Combination, NormalCard, Rank } from '../types';
import { detectCombination, canBeat, isBomb } from '../combinations';

// ===== Helper Functions =====

function isPhoenix(card: Card): boolean {
	return card.type === 'special' && card.special === 'phoenix';
}

function isDragon(card: Card): boolean {
	return card.type === 'special' && card.special === 'dragon';
}

function isMahjong(card: Card): boolean {
	return card.type === 'special' && card.special === 'mahjong';
}

function isDog(card: Card): boolean {
	return card.type === 'special' && card.special === 'dog';
}

function getNormalCards(hand: Card[]): NormalCard[] {
	return hand.filter(c => c.type === 'normal') as NormalCard[];
}

function groupByRank(cards: NormalCard[]): Map<number, NormalCard[]> {
	const groups = new Map<number, NormalCard[]>();
	for (const card of cards) {
		const group = groups.get(card.rank) || [];
		group.push(card);
		groups.set(card.rank, group);
	}
	return groups;
}

// ===== Hand Strength Evaluation =====

/**
 * Evaluate hand strength on a 0-100 scale.
 * Used for tichu declaration decisions.
 * Works with both 8-card (grand tichu) and 14-card (small tichu) hands.
 */
export function evaluateHandStrength(hand: Card[]): number {
	let score = 0;
	const normalCards = getNormalCards(hand);
	const rankGroups = groupByRank(normalCards);

	// Special cards bonus
	if (hand.some(isDragon)) score += 15;
	if (hand.some(isPhoenix)) score += 10;
	if (hand.some(isMahjong)) score += 5; // lead advantage

	// Bombs are extremely valuable — count each distinct bomb once
	const fourBombs = findFourBombs(hand);
	score += fourBombs.length * 20;

	// SF bombs: only count the longest per suit to avoid overcounting subsets
	const sfBombs = findStraightFlushBombs(hand);
	const sfBySuit = new Map<string, number>();
	for (const bomb of sfBombs) {
		const suit = (bomb.cards[0] as NormalCard).suit;
		sfBySuit.set(suit, Math.max(sfBySuit.get(suit) || 0, bomb.cards.length));
	}
	score += sfBySuit.size * 25;

	// Collect card IDs used in bombs so we don't double-count them as high cards
	const bombCardIds = new Set<string>();
	for (const b of fourBombs) b.cards.forEach(c => bombCardIds.add(c.id));
	for (const b of sfBombs) b.cards.forEach(c => bombCardIds.add(c.id));

	// High cards (A, K, Q) — skip cards already counted as bombs
	for (const card of normalCards) {
		if (bombCardIds.has(card.id)) continue;
		if (card.rank === 14) score += 6;      // A
		else if (card.rank === 13) score += 4;  // K
		else if (card.rank === 12) score += 3;  // Q
		else if (card.rank === 11) score += 2;  // J
	}

	// Pairs and triples of high cards — skip ranks used entirely in bombs
	for (const [rank, cards] of rankGroups) {
		if (rank >= 11) {
			const nonBombCards = cards.filter(c => !bombCardIds.has(c.id));
			if (nonBombCards.length >= 3) score += 8;
			else if (nonBombCards.length >= 2) score += 4;
		}
	}

	// Penalty for isolated low singles (hard to get rid of)
	for (const [rank, cards] of rankGroups) {
		if (rank <= 5 && cards.length === 1) score -= 3;
	}

	// Dog penalty (can't play it in combos, only as lead)
	if (hand.some(isDog)) score -= 2;

	// Normalize: scale by hand size (8 vs 14 cards)
	// For 8-card evaluation, the max possible is lower, so scale up
	if (hand.length <= 8) {
		score = Math.min(100, score * 1.3);
	}

	return Math.max(0, Math.min(100, score));
}

// ===== Combination Enumeration =====

/**
 * Find all possible single-card plays from a hand.
 */
export function findAllSingles(hand: Card[]): Combination[] {
	const results: Combination[] = [];
	for (const card of hand) {
		const combo = detectCombination([card]);
		if (combo) results.push(combo);
	}
	return results;
}

/**
 * Find all possible pairs from a hand.
 */
export function findAllPairs(hand: Card[]): Combination[] {
	const results: Combination[] = [];
	const normalCards = getNormalCards(hand);
	const rankGroups = groupByRank(normalCards);
	const hasPhoenix = hand.some(isPhoenix);
	const phoenixCard = hand.find(isPhoenix);

	// Natural pairs
	for (const [, cards] of rankGroups) {
		if (cards.length >= 2) {
			// Take first valid pair for each rank (don't enumerate all suit combos)
			const combo = detectCombination([cards[0], cards[1]]);
			if (combo) results.push(combo);
		}
	}

	// Phoenix pairs
	if (hasPhoenix && phoenixCard) {
		for (const [, cards] of rankGroups) {
			if (cards.length >= 1) {
				const combo = detectCombination([phoenixCard, cards[0]]);
				if (combo) results.push(combo);
			}
		}
	}

	return results;
}

/**
 * Find all possible triples from a hand.
 */
export function findAllTriples(hand: Card[]): Combination[] {
	const results: Combination[] = [];
	const normalCards = getNormalCards(hand);
	const rankGroups = groupByRank(normalCards);
	const hasPhoenix = hand.some(isPhoenix);
	const phoenixCard = hand.find(isPhoenix);

	// Natural triples
	for (const [, cards] of rankGroups) {
		if (cards.length >= 3) {
			const combo = detectCombination([cards[0], cards[1], cards[2]]);
			if (combo) results.push(combo);
		}
	}

	// Phoenix triples (phoenix + pair)
	if (hasPhoenix && phoenixCard) {
		for (const [, cards] of rankGroups) {
			if (cards.length >= 2) {
				const combo = detectCombination([phoenixCard, cards[0], cards[1]]);
				if (combo) results.push(combo);
			}
		}
	}

	return results;
}

/**
 * Find all four-card bombs in a hand.
 */
function findFourBombs(hand: Card[]): Combination[] {
	const results: Combination[] = [];
	const normalCards = getNormalCards(hand);
	const rankGroups = groupByRank(normalCards);

	for (const [, cards] of rankGroups) {
		if (cards.length === 4) {
			const combo = detectCombination(cards);
			if (combo && isBomb(combo)) results.push(combo);
		}
	}

	return results;
}

/**
 * Find all straight flush bombs in a hand.
 */
function findStraightFlushBombs(hand: Card[]): Combination[] {
	const results: Combination[] = [];
	const normalCards = getNormalCards(hand);

	// Group by suit
	const suitGroups = new Map<string, NormalCard[]>();
	for (const card of normalCards) {
		const group = suitGroups.get(card.suit) || [];
		group.push(card);
		suitGroups.set(card.suit, group);
	}

	for (const [, cards] of suitGroups) {
		if (cards.length < 5) continue;
		const sorted = [...cards].sort((a, b) => a.rank - b.rank);

		// Sliding window for consecutive runs of 5+
		for (let len = sorted.length; len >= 5; len--) {
			for (let start = 0; start <= sorted.length - len; start++) {
				const run = sorted.slice(start, start + len);
				// Check consecutive
				let consecutive = true;
				for (let i = 1; i < run.length; i++) {
					if (run[i].rank - run[i - 1].rank !== 1) {
						consecutive = false;
						break;
					}
				}
				if (consecutive) {
					const combo = detectCombination(run);
					if (combo && isBomb(combo)) results.push(combo);
				}
			}
		}
	}

	return results;
}

/**
 * Find all possible full houses from a hand.
 */
export function findAllFullHouses(hand: Card[]): Combination[] {
	const results: Combination[] = [];
	const normalCards = getNormalCards(hand);
	const rankGroups = groupByRank(normalCards);
	const hasPhoenix = hand.some(isPhoenix);
	const phoenixCard = hand.find(isPhoenix);

	const ranks = [...rankGroups.keys()];

	// Natural full houses: triple + pair from different ranks
	for (const tripleRank of ranks) {
		const tripleCards = rankGroups.get(tripleRank)!;
		if (tripleCards.length < 3) continue;

		for (const pairRank of ranks) {
			if (pairRank === tripleRank) continue;
			const pairCards = rankGroups.get(pairRank)!;
			if (pairCards.length < 2) continue;

			const cards = [tripleCards[0], tripleCards[1], tripleCards[2], pairCards[0], pairCards[1]];
			const combo = detectCombination(cards);
			if (combo) results.push(combo);
		}
	}

	// Phoenix full houses
	if (hasPhoenix && phoenixCard) {
		// Phoenix completes a pair to triple (3+1+phoenix → triple+pair)
		for (const tripleRank of ranks) {
			const tripleCards = rankGroups.get(tripleRank)!;
			if (tripleCards.length < 3) continue;

			// Phoenix + 1 card from another rank = pair
			for (const pairRank of ranks) {
				if (pairRank === tripleRank) continue;
				const pairCards = rankGroups.get(pairRank)!;
				if (pairCards.length < 1) continue;

				const cards = [tripleCards[0], tripleCards[1], tripleCards[2], pairCards[0], phoenixCard];
				const combo = detectCombination(cards);
				if (combo) results.push(combo);
			}
		}

		// Phoenix completes a pair to triple (2+2+phoenix → triple+pair)
		for (const rank1 of ranks) {
			const cards1 = rankGroups.get(rank1)!;
			if (cards1.length < 2) continue;

			for (const rank2 of ranks) {
				if (rank2 === rank1) continue;
				const cards2 = rankGroups.get(rank2)!;
				if (cards2.length < 2) continue;

				const cards = [cards1[0], cards1[1], cards2[0], cards2[1], phoenixCard];
				const combo = detectCombination(cards);
				if (combo) results.push(combo);
			}
		}
	}

	return results;
}

/**
 * Find all possible straights (5+ consecutive cards) from a hand.
 */
export function findAllStraights(hand: Card[]): Combination[] {
	const results: Combination[] = [];
	const normalCards = getNormalCards(hand);
	const hasPhoenix = hand.some(isPhoenix);
	const phoenixCard = hand.find(isPhoenix);
	const mahjongCard = hand.find(isMahjong);

	// Build rank → cards map (including mahjong as rank 1)
	const rankCards = new Map<number, Card[]>();
	for (const card of normalCards) {
		const group = rankCards.get(card.rank) || [];
		group.push(card);
		rankCards.set(card.rank, group);
	}
	if (mahjongCard) {
		rankCards.set(1, [mahjongCard]);
	}

	const availableRanks = [...rankCards.keys()].sort((a, b) => a - b);
	const minRank = availableRanks.length > 0 ? availableRanks[0] : 2;
	const maxRank = availableRanks.length > 0 ? availableRanks[availableRanks.length - 1] : 14;

	// Try all possible straight lengths (5 to 14) and starting ranks
	for (let len = 5; len <= 14; len++) {
		for (let startRank = Math.max(1, minRank); startRank + len - 1 <= 14; startRank++) {
			const cards: Card[] = [];
			let gaps = 0;
			let phoenixUsed = false;

			for (let r = startRank; r < startRank + len; r++) {
				const available = rankCards.get(r);
				if (available && available.length > 0) {
					cards.push(available[0]);
				} else {
					gaps++;
					if (hasPhoenix && !phoenixUsed && gaps <= 1) {
						phoenixUsed = true;
						cards.push(phoenixCard!);
					}
				}
			}

			if (cards.length === len && gaps <= (hasPhoenix ? 1 : 0)) {
				const combo = detectCombination(cards);
				if (combo) results.push(combo);
			}
		}
	}

	return results;
}

/**
 * Find all possible stairs (consecutive pairs) from a hand.
 */
export function findAllStairs(hand: Card[]): Combination[] {
	const results: Combination[] = [];
	const normalCards = getNormalCards(hand);
	const hasPhoenix = hand.some(isPhoenix);
	const phoenixCard = hand.find(isPhoenix);
	const mahjongCard = hand.find(isMahjong);

	// Build rank → cards map
	const rankCards = new Map<number, Card[]>();
	for (const card of normalCards) {
		const group = rankCards.get(card.rank) || [];
		group.push(card);
		rankCards.set(card.rank, group);
	}
	if (mahjongCard) {
		const group = rankCards.get(1) || [];
		group.push(mahjongCard);
		rankCards.set(1, group);
	}

	// Try all possible stair lengths (2+ pairs = 4+ cards) and starting ranks
	for (let pairCount = 2; pairCount <= 7; pairCount++) {
		for (let startRank = 1; startRank + pairCount - 1 <= 14; startRank++) {
			const cards: Card[] = [];
			let phoenixUsed = false;
			let valid = true;

			for (let r = startRank; r < startRank + pairCount; r++) {
				const available = rankCards.get(r) || [];
				if (available.length >= 2) {
					cards.push(available[0], available[1]);
				} else if (available.length === 1 && hasPhoenix && !phoenixUsed) {
					cards.push(available[0], phoenixCard!);
					phoenixUsed = true;
				} else {
					valid = false;
					break;
				}
			}

			if (valid && cards.length === pairCount * 2) {
				const combo = detectCombination(cards);
				if (combo) results.push(combo);
			}
		}
	}

	return results;
}

/**
 * Find ALL possible playable combinations from a hand.
 * This is the master function that enumerates every valid play.
 */
export function findAllPlayableCombinations(hand: Card[]): Combination[] {
	const results: Combination[] = [];

	results.push(...findAllSingles(hand));
	results.push(...findAllPairs(hand));
	results.push(...findAllTriples(hand));
	results.push(...findAllFullHouses(hand));
	results.push(...findAllStraights(hand));
	results.push(...findAllStairs(hand));
	results.push(...findFourBombs(hand));
	results.push(...findStraightFlushBombs(hand));

	return results;
}

/**
 * Find all combinations from hand that can beat the current trick.
 */
export function findBeatablePlays(hand: Card[], currentCombo: Combination): Combination[] {
	const allCombos = findAllPlayableCombinations(hand);
	return allCombos.filter(combo => canBeat(currentCombo, combo));
}

/**
 * Find all valid leading plays (when starting a new trick).
 * Everything except passing.
 */
export function findLeadPlays(hand: Card[]): Combination[] {
	return findAllPlayableCombinations(hand);
}

/**
 * Find all bombs in a hand (four-bombs and straight flush bombs).
 */
export function findBombs(hand: Card[]): Combination[] {
	return [...findFourBombs(hand), ...findStraightFlushBombs(hand)];
}

/**
 * Get the effective rank of a card for sorting purposes.
 */
export function getCardSortRank(card: Card): number {
	if (card.type === 'normal') return card.rank;
	switch (card.special) {
		case 'mahjong': return 1;
		case 'dog': return 0;
		case 'phoenix': return 1.5;
		case 'dragon': return 15;
		default: return 0;
	}
}
