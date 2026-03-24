export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
export type CardColor = 'red' | 'black';

export interface Card {
	id: number; // 0-51: suitIndex * 13 + (value - 1)
	suit: Suit;
	rank: Rank;
	value: number; // 1(A) ~ 13(K)
}

export interface FreecellState {
	tableau: Card[][]; // 8 columns
	freeCells: (Card | null)[]; // 4 slots
	foundations: Card[][]; // 4 piles (spades, hearts, diamonds, clubs)
	seed: number;
}

export type Location =
	| { type: 'tableau'; col: number; cardIndex: number }
	| { type: 'freecell'; index: number }
	| { type: 'foundation'; index: number };

export interface MoveAction {
	from: Location;
	to: Location;
	cards: Card[];
}

export type GameState = 'start' | 'playing' | 'paused' | 'finished';

// Constants
export const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const SUIT_SYMBOL: Record<Suit, string> = {
	spades: '♠',
	hearts: '♥',
	diamonds: '♦',
	clubs: '♣'
};

export const SUIT_COLOR: Record<Suit, CardColor> = {
	spades: 'black',
	hearts: 'red',
	diamonds: 'red',
	clubs: 'black'
};

export const SUIT_INDEX: Record<Suit, number> = {
	spades: 0,
	hearts: 1,
	diamonds: 2,
	clubs: 3
};

// Helpers
export function isRed(card: Card): boolean {
	return SUIT_COLOR[card.suit] === 'red';
}

export function isBlack(card: Card): boolean {
	return SUIT_COLOR[card.suit] === 'black';
}

export function getCardColor(card: Card): CardColor {
	return SUIT_COLOR[card.suit];
}

export function isOppositeColor(a: Card, b: Card): boolean {
	return getCardColor(a) !== getCardColor(b);
}

export function cardToString(card: Card): string {
	return `${card.rank}${SUIT_SYMBOL[card.suit]}`;
}

export function locationsEqual(a: Location | null, b: Location | null): boolean {
	if (a === null || b === null) return a === b;
	if (a.type !== b.type) return false;
	if (a.type === 'tableau' && b.type === 'tableau') {
		return a.col === b.col && a.cardIndex === b.cardIndex;
	}
	if (a.type === 'freecell' && b.type === 'freecell') {
		return a.index === b.index;
	}
	if (a.type === 'foundation' && b.type === 'foundation') {
		return a.index === b.index;
	}
	return false;
}
