import type { Card, NormalCard, SpecialCardObj, Suit, Rank } from './types';

export const SUITS: Suit[] = ['jade', 'sword', 'pagoda', 'star'];

export const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export const RANK_NAMES: Record<Rank, string> = {
	2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
	11: 'J', 12: 'Q', 13: 'K', 14: 'A'
};

export const SUIT_NAMES: Record<Suit, string> = {
	jade: '옥', sword: '검', pagoda: '탑', star: '별'
};

export const SUIT_COLORS: Record<Suit, string> = {
	jade: '#22c55e',
	sword: '#1e293b',
	pagoda: '#3b82f6',
	star: '#ef4444'
};

// Card point values
export function getCardPoints(card: Card): number {
	if (card.type === 'special') {
		if (card.special === 'dragon') return 25;
		if (card.special === 'phoenix') return -25;
		return 0;
	}
	if (card.rank === 5) return 5;
	if (card.rank === 10 || card.rank === 13) return 10;
	return 0;
}

// Generate all 56 cards
export function createAllCards(): Card[] {
	const cards: Card[] = [];

	// 52 normal cards
	for (const suit of SUITS) {
		for (const rank of RANKS) {
			cards.push({
				type: 'normal',
				suit,
				rank,
				id: `${suit}_${rank}`
			} as NormalCard);
		}
	}

	// 4 special cards
	const specials: SpecialCardObj[] = [
		{ type: 'special', special: 'dragon', id: 'dragon' },
		{ type: 'special', special: 'phoenix', id: 'phoenix' },
		{ type: 'special', special: 'mahjong', id: 'mahjong' },
		{ type: 'special', special: 'dog', id: 'dog' }
	];
	cards.push(...specials);

	return cards;
}

// Effective rank for comparison (phoenix adapts, mahjong = 1, dragon = highest)
export function getEffectiveRank(card: Card): number {
	if (card.type === 'normal') return card.rank;
	switch (card.special) {
		case 'mahjong': return 1;
		case 'dragon': return 15; // highest
		case 'phoenix': return 0; // set dynamically
		case 'dog': return 0; // can't be played in combinations
	}
}

// Seat arrangement: 0,1,2,3 clockwise. 0&2 = Team A, 1&3 = Team B
export function getPartnerSeat(seat: number): number {
	return (seat + 2) % 4;
}

export function getLeftSeat(seat: number): number {
	return (seat + 1) % 4;
}

export function getRightSeat(seat: number): number {
	return (seat + 3) % 4;
}

export function getTeam(seat: number): 'A' | 'B' {
	return seat % 2 === 0 ? 'A' : 'B';
}

export const GRAND_TICHU_WINDOW_MS = 30000;
export const TURN_TIMEOUT_MS = 30000;
export const RECONNECT_TIMEOUT_MS = 60000;
export const ABANDONED_ROOM_TIMEOUT_MS = 120000; // 2 minutes with no connected players
export const DEFAULT_TARGET_SCORE = 1000;
