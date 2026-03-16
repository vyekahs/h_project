import type { Card, Rank, WishState, NormalCard, Combination } from './types';
import { detectCombination, canBeat } from './combinations';

/**
 * Check if a player's hand can fulfill the wish.
 * The wish requires playing a card of the requested rank if possible.
 */
export function canFulfillWish(hand: Card[], wish: WishState): boolean {
	if (!wish.active || wish.requestedRank === null) return false;
	return hand.some(c =>
		c.type === 'normal' && c.rank === wish.requestedRank
	);
}

/**
 * Check if a specific play fulfills the wish.
 */
export function playFulfillsWish(cards: Card[], wish: WishState): boolean {
	if (!wish.active || wish.requestedRank === null) return false;
	return cards.some(c =>
		c.type === 'normal' && c.rank === wish.requestedRank
	);
}

/**
 * Check if a player MUST include the wished rank in their play.
 * Returns true if:
 * - Wish is active
 * - Player has the wished rank in hand
 */
export function mustPlayWishedRank(
	hand: Card[],
	wish: WishState
): boolean {
	if (!wish.active || wish.requestedRank === null) return false;
	return canFulfillWish(hand, wish);
}

/**
 * Check if a player can form any valid combination that includes the wished rank
 * AND can beat the current trick. Used to enforce wish rule on pass.
 *
 * Tichu rule: You must play the wished rank IF you can form a legal combination
 * containing it that beats the current trick. If no such combination exists, you may pass.
 */
export function canPlayWishedCombo(
	hand: Card[],
	wish: WishState,
	currentCombo: Combination
): boolean {
	if (!wish.active || wish.requestedRank === null) return false;

	const wishedRank = wish.requestedRank;

	// Get all cards of the wished rank in hand
	const wishedCards = hand.filter(
		c => c.type === 'normal' && c.rank === wishedRank
	);
	if (wishedCards.length === 0) return false;

	const hasPhoenix = hand.some(c => c.type === 'special' && c.special === 'phoenix');
	const phoenix = hand.find(c => c.type === 'special' && c.special === 'phoenix');

	// Check based on current trick type
	switch (currentCombo.type) {
		case 'single': {
			// Can any wished card beat it?
			for (const card of wishedCards) {
				const combo = detectCombination([card]);
				if (combo && canBeat(currentCombo, combo)) return true;
			}
			return canPlayWishedBomb(hand, wishedRank, currentCombo);
		}

		case 'pair': {
			// Need 2 cards of wished rank, or 1 + phoenix
			if (wishedCards.length >= 2) {
				const combo = detectCombination([wishedCards[0], wishedCards[1]]);
				if (combo && canBeat(currentCombo, combo)) return true;
			}
			if (wishedCards.length >= 1 && hasPhoenix) {
				const combo = detectCombination([wishedCards[0], phoenix!]);
				if (combo && canBeat(currentCombo, combo)) return true;
			}
			return canPlayWishedBomb(hand, wishedRank, currentCombo);
		}

		case 'triple': {
			// Need 3 cards of wished rank, or 2 + phoenix
			if (wishedCards.length >= 3) {
				const combo = detectCombination([wishedCards[0], wishedCards[1], wishedCards[2]]);
				if (combo && canBeat(currentCombo, combo)) return true;
			}
			if (wishedCards.length >= 2 && hasPhoenix) {
				const combo = detectCombination([wishedCards[0], wishedCards[1], phoenix!]);
				if (combo && canBeat(currentCombo, combo)) return true;
			}
			return canPlayWishedBomb(hand, wishedRank, currentCombo);
		}

		case 'full_house': {
			// Wished rank must be part of a full house (in triple or pair portion)
			// Try all possible full houses from hand that include the wished rank
			const normalCards = hand.filter((c): c is NormalCard => c.type === 'normal');
			const rankGroups = new Map<number, NormalCard[]>();
			for (const c of normalCards) {
				const group = rankGroups.get(c.rank) || [];
				group.push(c);
				rankGroups.set(c.rank, group);
			}

			// Wished rank as triple
			const wishedGroup = rankGroups.get(wishedRank) || [];
			if (wishedGroup.length >= 3) {
				// Find any pair for the other portion
				for (const [rank, group] of rankGroups) {
					if (rank === wishedRank) continue;
					const pairCards = group.slice(0, 2);
					if (pairCards.length >= 2) {
						const combo = detectCombination([...wishedGroup.slice(0, 3), ...pairCards]);
						if (combo && canBeat(currentCombo, combo)) return true;
					}
					if (pairCards.length >= 1 && hasPhoenix) {
						const combo = detectCombination([...wishedGroup.slice(0, 3), pairCards[0], phoenix!]);
						if (combo && canBeat(currentCombo, combo)) return true;
					}
				}
			}
			if (wishedGroup.length >= 2 && hasPhoenix) {
				// Wished 2 + phoenix = triple, find pair
				for (const [rank, group] of rankGroups) {
					if (rank === wishedRank) continue;
					if (group.length >= 2) {
						const combo = detectCombination([...wishedGroup.slice(0, 2), phoenix!, ...group.slice(0, 2)]);
						if (combo && canBeat(currentCombo, combo)) return true;
					}
				}
			}

			// Wished rank as pair portion
			if (wishedGroup.length >= 2) {
				for (const [rank, group] of rankGroups) {
					if (rank === wishedRank) continue;
					if (group.length >= 3) {
						const combo = detectCombination([...group.slice(0, 3), ...wishedGroup.slice(0, 2)]);
						if (combo && canBeat(currentCombo, combo)) return true;
					}
					if (group.length >= 2 && hasPhoenix) {
						const combo = detectCombination([...group.slice(0, 2), phoenix!, ...wishedGroup.slice(0, 2)]);
						if (combo && canBeat(currentCombo, combo)) return true;
					}
				}
			}
			if (wishedGroup.length >= 1 && hasPhoenix) {
				// Wished 1 + phoenix = pair, find triple
				for (const [rank, group] of rankGroups) {
					if (rank === wishedRank) continue;
					if (group.length >= 3) {
						const combo = detectCombination([...group.slice(0, 3), wishedGroup[0], phoenix!]);
						if (combo && canBeat(currentCombo, combo)) return true;
					}
				}
			}
			return canPlayWishedBomb(hand, wishedRank, currentCombo);
		}

		case 'straight': {
			// Try to form straights of same length that include the wished rank
			if (canFormSequenceWithRank(hand, wishedRank, currentCombo.length, 'straight', currentCombo)) return true;
			return canPlayWishedBomb(hand, wishedRank, currentCombo);
		}

		case 'stairs': {
			// Try to form stairs of same length that include the wished rank
			if (canFormSequenceWithRank(hand, wishedRank, currentCombo.length, 'stairs', currentCombo)) return true;
			return canPlayWishedBomb(hand, wishedRank, currentCombo);
		}

		default: {
			// Bombs: 소원 카드를 포함한 폭탄이 현재 트릭을 이길 수 있는지 체크
			return canPlayWishedBomb(hand, wishedRank, currentCombo);
		}
	}
}

/**
 * Check if a bomb containing the wished rank can beat the current combo.
 * Used as fallback in each switch case of canPlayWishedCombo.
 */
function canPlayWishedBomb(hand: Card[], wishedRank: number, currentCombo: Combination): boolean {
	const wishedCards = hand.filter(
		c => c.type === 'normal' && c.rank === wishedRank
	) as NormalCard[];

	// 4폭탄 체크
	if (wishedCards.length === 4) {
		const bombCombo = detectCombination(wishedCards);
		if (bombCombo && bombCombo.type === 'four_bomb' && canBeat(currentCombo, bombCombo)) {
			return true;
		}
	}

	// Straight flush 폭탄 체크 (소원 카드를 포함한 연속된 같은 무늬 5장+)
	const normalCards = hand.filter((c): c is NormalCard => c.type === 'normal');
	const suitGroups = new Map<string, NormalCard[]>();
	for (const c of normalCards) {
		const group = suitGroups.get(c.suit) || [];
		group.push(c);
		suitGroups.set(c.suit, group);
	}

	for (const [, cards] of suitGroups) {
		const wishedInSuit = cards.filter(c => c.rank === wishedRank);
		if (wishedInSuit.length === 0) continue;

		const sorted = [...cards].sort((a, b) => a.rank - b.rank);
		for (let len = 5; len <= sorted.length; len++) {
			for (let start = 0; start <= sorted.length - len; start++) {
				const segment = sorted.slice(start, start + len);
				let consecutive = true;
				let hasWished = false;
				for (let i = 0; i < segment.length; i++) {
					if (i > 0 && segment[i].rank - segment[i-1].rank !== 1) {
						consecutive = false;
						break;
					}
					if (segment[i].rank === wishedRank) hasWished = true;
				}
				if (consecutive && hasWished) {
					const bombCombo = detectCombination(segment);
					if (bombCombo && bombCombo.type === 'straight_flush_bomb' && canBeat(currentCombo, bombCombo)) {
						return true;
					}
				}
			}
		}
	}

	return false;
}

/**
 * Check if we can form a straight or stairs containing the wished rank
 * that beats the current combo. Uses brute-force over possible start ranks.
 */
function canFormSequenceWithRank(
	hand: Card[],
	wishedRank: number,
	length: number,
	type: 'straight' | 'stairs',
	currentCombo: Combination
): boolean {
	const hasPhoenix = hand.some(c => c.type === 'special' && c.special === 'phoenix');
	const hasMahjong = hand.some(c => c.type === 'special' && c.special === 'mahjong');

	if (type === 'straight') {
		// Straight of `length` cards, must include wishedRank
		// Possible start ranks: wishedRank - (length-1) to wishedRank
		for (let start = Math.max(1, wishedRank - length + 1); start <= wishedRank; start++) {
			const end = start + length - 1;
			if (end > 14) continue; // A is max

			const cards: Card[] = [];
			let phoenixUsed = false;
			let valid = true;

			for (let r = start; r <= end; r++) {
				if (r === 1 && hasMahjong) {
					cards.push(hand.find(c => c.type === 'special' && c.special === 'mahjong')!);
				} else {
					const card = hand.find(c => c.type === 'normal' && c.rank === r);
					if (card) {
						cards.push(card);
					} else if (hasPhoenix && !phoenixUsed) {
						cards.push(hand.find(c => c.type === 'special' && c.special === 'phoenix')!);
						phoenixUsed = true;
					} else {
						valid = false;
						break;
					}
				}
			}

			if (valid && cards.length === length) {
				const combo = detectCombination(cards);
				if (combo && combo.type === 'straight' && canBeat(currentCombo, combo)) return true;
			}
		}
	} else {
		// Stairs: `length` consecutive pairs, must include wishedRank
		const pairCount = length;
		for (let start = Math.max(2, wishedRank - pairCount + 1); start <= wishedRank; start++) {
			const end = start + pairCount - 1;
			if (end > 14) continue;

			const cards: Card[] = [];
			let phoenixUsed = false;
			let valid = true;

			for (let r = start; r <= end; r++) {
				const rankCards = hand.filter(c => c.type === 'normal' && c.rank === r);
				if (rankCards.length >= 2) {
					cards.push(rankCards[0], rankCards[1]);
				} else if (rankCards.length === 1 && hasPhoenix && !phoenixUsed) {
					cards.push(rankCards[0], hand.find(c => c.type === 'special' && c.special === 'phoenix')!);
					phoenixUsed = true;
				} else {
					valid = false;
					break;
				}
			}

			if (valid && cards.length === pairCount * 2) {
				const combo = detectCombination(cards);
				if (combo && combo.type === 'stairs' && canBeat(currentCombo, combo)) return true;
			}
		}
	}

	return false;
}

/**
 * Valid wish ranks: 2-14 (A)
 */
export function isValidWishRank(rank: number): rank is Rank {
	return Number.isInteger(rank) && rank >= 2 && rank <= 14;
}

export function createWishState(): WishState {
	return {
		active: false,
		requestedRank: null,
		requestedBy: null
	};
}
