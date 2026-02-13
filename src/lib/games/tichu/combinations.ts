import type { Card, Combination, Rank, NormalCard } from './types';
import { getEffectiveRank } from './constants';

// Get numeric rank for sorting/comparison
function cardRank(card: Card): number {
	return getEffectiveRank(card);
}

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

/**
 * Detect what combination a set of cards forms.
 * Returns null if invalid.
 */
export function detectCombination(cards: Card[]): Combination | null {
	if (cards.length === 0) return null;

	// Single
	if (cards.length === 1) {
		const card = cards[0];
		if (isDog(card)) return { type: 'single', cards, rank: 0, length: 1 };
		return { type: 'single', cards, rank: cardRank(card), length: 1 };
	}

	const hasPhoenix = cards.some(isPhoenix);
	const normalCards = cards.filter(c => c.type === 'normal') as NormalCard[];
	const mahjongCard = cards.find(isMahjong);
	const dragonCard = cards.find(isDragon);

	// Dragon can only be played as single
	if (dragonCard && cards.length > 1) return null;
	// Dog can only be played as single
	if (cards.some(isDog) && cards.length > 1) return null;

	// Pair (2 cards)
	if (cards.length === 2) {
		return detectPair(cards, normalCards, hasPhoenix);
	}

	// Triple (3 cards)
	if (cards.length === 3) {
		return detectTriple(cards, normalCards, hasPhoenix);
	}

	// Full house (5 cards: triple + pair)
	if (cards.length === 5) {
		const fh = detectFullHouse(cards, normalCards, hasPhoenix);
		if (fh) return fh;
	}

	// Four bomb (4 cards, same rank, no phoenix)
	if (cards.length === 4 && !hasPhoenix) {
		const bomb = detectFourBomb(cards, normalCards);
		if (bomb) return bomb;
	}

	// Stairs (consecutive pairs, 4+ cards, even count)
	if (cards.length >= 4 && cards.length % 2 === 0) {
		const stairs = detectStairs(cards, normalCards, hasPhoenix, mahjongCard);
		if (stairs) return stairs;
	}

	// Straight flush bomb must be checked BEFORE regular straight
	// (otherwise same-suit consecutive cards get detected as a regular straight)
	if (cards.length >= 5 && !hasPhoenix) {
		const sfb = detectStraightFlushBomb(cards, normalCards, mahjongCard);
		if (sfb) return sfb;
	}

	// Straight (5+ cards)
	if (cards.length >= 5) {
		const straight = detectStraight(cards, normalCards, hasPhoenix, mahjongCard);
		if (straight) return straight;
	}

	return null;
}

function detectPair(cards: Card[], normalCards: NormalCard[], hasPhoenix: boolean): Combination | null {
	if (hasPhoenix) {
		// Phoenix + one normal card = pair of that rank
		if (normalCards.length === 1) {
			return { type: 'pair', cards, rank: normalCards[0].rank, length: 2 };
		}
		return null;
	}
	// Two normal cards same rank
	if (normalCards.length === 2 && normalCards[0].rank === normalCards[1].rank) {
		return { type: 'pair', cards, rank: normalCards[0].rank, length: 2 };
	}
	return null;
}

function detectTriple(cards: Card[], normalCards: NormalCard[], hasPhoenix: boolean): Combination | null {
	if (hasPhoenix) {
		// Phoenix + pair
		if (normalCards.length === 2 && normalCards[0].rank === normalCards[1].rank) {
			return { type: 'triple', cards, rank: normalCards[0].rank, length: 3 };
		}
		return null;
	}
	// Three normal cards same rank
	if (normalCards.length === 3 && normalCards[0].rank === normalCards[1].rank && normalCards[1].rank === normalCards[2].rank) {
		return { type: 'triple', cards, rank: normalCards[0].rank, length: 3 };
	}
	return null;
}

function detectFullHouse(cards: Card[], normalCards: NormalCard[], hasPhoenix: boolean): Combination | null {
	const rankCounts = new Map<Rank, number>();
	for (const c of normalCards) {
		rankCounts.set(c.rank, (rankCounts.get(c.rank) || 0) + 1);
	}

	const entries = [...rankCounts.entries()].sort((a, b) => b[1] - a[1]);

	if (hasPhoenix) {
		// Phoenix can fill either the pair or the triple
		if (entries.length === 2) {
			const [high, low] = entries;
			// 3+1 → phoenix makes the 1 into a pair → FH with triple = high
			if (high[1] === 3 && low[1] === 1) {
				return { type: 'full_house', cards, rank: high[0], length: 5 };
			}
			// 2+2 → phoenix makes one pair into triple
			if (high[1] === 2 && low[1] === 2) {
				// Triple rank is the higher pair
				const tripleRank = Math.max(high[0], low[0]) as Rank;
				return { type: 'full_house', cards, rank: tripleRank, length: 5 };
			}
		}
		return null;
	}

	// No phoenix: need exactly 3 + 2
	if (entries.length === 2 && entries[0][1] === 3 && entries[1][1] === 2) {
		return { type: 'full_house', cards, rank: entries[0][0], length: 5 };
	}

	return null;
}

function detectFourBomb(cards: Card[], normalCards: NormalCard[]): Combination | null {
	if (normalCards.length === 4 &&
		normalCards[0].rank === normalCards[1].rank &&
		normalCards[1].rank === normalCards[2].rank &&
		normalCards[2].rank === normalCards[3].rank) {
		return { type: 'four_bomb', cards, rank: normalCards[0].rank, length: 4 };
	}
	return null;
}

function detectStairs(cards: Card[], normalCards: NormalCard[], hasPhoenix: boolean, mahjongCard: Card | undefined): Combination | null {
	// Stairs = consecutive pairs
	const allRanks = getRanksWithSpecials(normalCards, mahjongCard);
	const rankCounts = new Map<number, number>();
	for (const r of allRanks) {
		rankCounts.set(r, (rankCounts.get(r) || 0) + 1);
	}

	const pairCount = cards.length / 2;
	const sortedRanks = [...rankCounts.keys()].sort((a, b) => a - b);

	// Check if we can form consecutive pairs
	// With phoenix, one rank might have count 1 instead of 2
	let phoenixUsed = false;
	let phoenixAvailable = hasPhoenix;

	// Try to find a sequence of pairCount consecutive ranks
	if (sortedRanks.length < pairCount && !(sortedRanks.length === pairCount - 1 && phoenixAvailable)) {
		return null;
	}

	// Check consecutive
	for (let start = 0; start <= sortedRanks.length - pairCount + (phoenixAvailable ? 1 : 0); start++) {
		const result = tryStairsSequence(sortedRanks, start, pairCount, rankCounts, phoenixAvailable);
		if (result) {
			return { type: 'stairs', cards, rank: result.highRank, length: pairCount };
		}
	}

	return null;
}

function tryStairsSequence(sortedRanks: number[], start: number, pairCount: number, rankCounts: Map<number, number>, phoenixAvailable: boolean): { highRank: number } | null {
	let phoenixUsed = false;
	const startRank = sortedRanks[start];

	for (let i = 0; i < pairCount; i++) {
		const expectedRank = startRank + i;
		const count = rankCounts.get(expectedRank) || 0;

		if (count >= 2) continue;
		if (count === 1 && phoenixAvailable && !phoenixUsed) {
			phoenixUsed = true;
			continue;
		}
		// Phoenix cannot fill a completely missing rank in stairs
		return null;
	}

	return { highRank: startRank + pairCount - 1 };
}

function detectStraight(cards: Card[], normalCards: NormalCard[], hasPhoenix: boolean, mahjongCard: Card | undefined): Combination | null {
	const allRanks = getRanksWithSpecials(normalCards, mahjongCard);

	if (hasPhoenix) {
		// Phoenix acts as any rank
		const sorted = [...new Set(allRanks)].sort((a, b) => a - b);
		const needed = cards.length;
		const uniqueCount = sorted.length; // phoenix counted separately

		// Try to form a straight of 'needed' length
		// We have uniqueCount real ranks + 1 phoenix
		if (uniqueCount < needed - 1) return null;

		for (let start = 0; start <= sorted.length - (needed - 1); start++) {
			let gaps = 0;
			const base = sorted[start];
			for (let i = 0; i < needed; i++) {
				const expectedRank = base + i;
				if (!sorted.includes(expectedRank)) gaps++;
			}
			if (gaps <= 1) {
				const highRank = base + needed - 1;
				if (highRank <= 14) { // A is max in straights
					return { type: 'straight', cards, rank: highRank, length: needed };
				}
			}
		}
		return null;
	}

	// No phoenix
	const sorted = [...new Set(allRanks)].sort((a, b) => a - b);
	if (sorted.length !== cards.length) return null; // duplicates

	// Check consecutive
	for (let i = 1; i < sorted.length; i++) {
		if (sorted[i] - sorted[i - 1] !== 1) return null;
	}

	const highRank = sorted[sorted.length - 1];
	if (highRank > 14) return null; // A is max

	// Check: no special cards besides mahjong
	if (cards.some(c => c.type === 'special' && c.special !== 'mahjong')) return null;

	return { type: 'straight', cards, rank: highRank, length: cards.length };
}

function detectStraightFlushBomb(cards: Card[], normalCards: NormalCard[], mahjongCard: Card | undefined): Combination | null {
	// All must be same suit (mahjong doesn't have a suit, so it can't be in a SF bomb... actually in Tichu mahjong IS in straights but not suit-specific)
	// Straight flush bomb: 5+ normal cards, all same suit, consecutive ranks
	if (mahjongCard) return null; // mahjong has no suit
	if (normalCards.length !== cards.length) return null;

	const suit = normalCards[0].suit;
	if (!normalCards.every(c => c.suit === suit)) return null;

	const sorted = normalCards.map(c => c.rank).sort((a, b) => a - b);
	for (let i = 1; i < sorted.length; i++) {
		if (sorted[i] - sorted[i - 1] !== 1) return null;
	}

	return {
		type: 'straight_flush_bomb',
		cards,
		rank: sorted[sorted.length - 1],
		length: cards.length
	};
}

function getRanksWithSpecials(normalCards: NormalCard[], mahjongCard: Card | undefined): number[] {
	const ranks = normalCards.map(c => c.rank as number);
	if (mahjongCard) ranks.push(1); // mahjong = rank 1
	return ranks;
}

/**
 * Can this combination beat the current one?
 * Bombs beat anything. Same type + higher rank beats same type.
 * Phoenix single beats any single except dragon (rank = current + 0.5).
 */
export function canBeat(current: Combination, played: Combination): boolean {
	// Bombs beat everything
	if (isBomb(played)) {
		if (!isBomb(current)) return true;
		return compareBombs(current, played) > 0;
	}

	// Non-bomb can't beat bomb
	if (isBomb(current)) return false;

	// Same type and length required
	if (current.type !== played.type) return false;
	if (current.length !== played.length) return false;

	// Phoenix single: beats everything except dragon
	if (played.type === 'single' && played.cards.length === 1 && isPhoenix(played.cards[0])) {
		return !isDragon(current.cards[0]);
	}

	// Higher rank wins
	return played.rank > current.rank;
}

export function isBomb(combo: Combination): boolean {
	return combo.type === 'four_bomb' || combo.type === 'straight_flush_bomb';
}

/**
 * Compare two bombs. Returns positive if 'played' beats 'current'.
 * SF bomb > 4-bomb. Among same type, higher rank wins.
 * Among SF bombs, longer wins. Same length → higher rank wins.
 */
function compareBombs(current: Combination, played: Combination): number {
	if (played.type === 'straight_flush_bomb' && current.type === 'four_bomb') return 1;
	if (played.type === 'four_bomb' && current.type === 'straight_flush_bomb') return -1;

	// Same type
	if (played.type === 'straight_flush_bomb' && current.type === 'straight_flush_bomb') {
		if (played.length !== current.length) return played.length - current.length;
		return played.rank - current.rank;
	}

	// Both four bombs
	return played.rank - current.rank;
}

/**
 * Resolve Phoenix single rank for trick storage.
 * When Phoenix is played as a single on top of another single with rank X,
 * its effective rank is X + 0.5. When leading, rank is 1.5.
 */
export function resolvePhoenixSingleRank(played: Combination, currentCombo: Combination | null): Combination {
	if (played.type === 'single' && played.cards.length === 1 && isPhoenix(played.cards[0])) {
		if (currentCombo && currentCombo.type === 'single') {
			return { ...played, rank: currentCombo.rank + 0.5 };
		}
		// Leading with Phoenix single: just above Mahjong (rank 1)
		return { ...played, rank: 1.5 };
	}
	return played;
}

/**
 * Get all valid single card plays from a hand, given the current trick state.
 */
export function getPlayableCards(hand: Card[], currentCombo: Combination | null, wish: { active: boolean; requestedRank: number | null }): Card[][] {
	if (!currentCombo) {
		// Leading: can play any single card or combination
		return hand.map(c => [c]);
	}

	// Must follow type and beat
	const results: Card[][] = [];

	// For simplicity, return individual card options for singles
	// Full combination detection would be done separately
	for (const card of hand) {
		const combo = detectCombination([card]);
		if (combo && canBeat(currentCombo, combo)) {
			results.push([card]);
		}
	}

	return results;
}
