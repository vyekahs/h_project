export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
export type CardColor = 'red' | 'black';

export interface Card {
	id: number; // unique identifier
	suit: Suit;
	rank: Rank;
}

export interface Enemy {
	card: Card;
	maxHp: number;
	currentHp: number;
	attack: number;
	shieldReduction: number; // cumulative spade shield
}

export type TurnPhase =
	| 'select_cards' // Step 1: choose card(s)
	| 'resolve_powers' // Step 2: suit powers
	| 'deal_damage' // Step 3: damage
	| 'enemy_attacks' // Step 4: discard to survive
	| 'enemy_defeated' // transition
	| 'game_over';

export type GamePhase = 'start' | 'playing' | 'paused' | 'finished';

export type VictoryTier = 'gold' | 'silver' | 'bronze';

export interface CombatLogEntry {
	type: 'play' | 'power' | 'damage' | 'enemy_attack' | 'discard' | 'defeat' | 'jester' | 'draw' | 'heal';
	message: string;
}

// Constants
export const MAX_HAND_SIZE = 8;
export const TOTAL_ENEMIES = 12;
export const JESTER_COUNT = 2;

export const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const SUIT_SYMBOL: Record<Suit, string> = {
	spades: '\u2660',
	hearts: '\u2665',
	diamonds: '\u2666',
	clubs: '\u2663'
};

export const SUIT_COLOR: Record<Suit, CardColor> = {
	spades: 'black',
	hearts: 'red',
	diamonds: 'red',
	clubs: 'black'
};

export const SUIT_NAME_KO: Record<Suit, string> = {
	spades: '\uC2A4\uD398\uC774\uB4DC',
	hearts: '\uD558\uD2B8',
	diamonds: '\uB2E4\uC774\uC544\uBAAC\uB4DC',
	clubs: '\uD074\uB7FD'
};

export const SUIT_POWER_NAME: Record<Suit, string> = {
	hearts: '\uCE58\uC720',
	diamonds: '\uB4DC\uB85C\uC6B0',
	clubs: '\uB354\uBE14 \uB370\uBBF8\uC9C0',
	spades: '\uBC29\uC5B4'
};

export const CARD_VALUE: Record<Rank, number> = {
	A: 1,
	'2': 2,
	'3': 3,
	'4': 4,
	'5': 5,
	'6': 6,
	'7': 7,
	'8': 8,
	'9': 9,
	'10': 10,
	J: 10,
	Q: 15,
	K: 20
};

export const RANK_LABEL: Record<Rank, string> = {
	A: 'A',
	'2': '2',
	'3': '3',
	'4': '4',
	'5': '5',
	'6': '6',
	'7': '7',
	'8': '8',
	'9': '9',
	'10': '10',
	J: 'J',
	Q: 'Q',
	K: 'K'
};

export type EnemyRank = 'J' | 'Q' | 'K';

export const ENEMY_STATS: Record<EnemyRank, { attack: number; hp: number }> = {
	J: { attack: 10, hp: 20 },
	Q: { attack: 15, hp: 30 },
	K: { attack: 20, hp: 40 }
};

// Helper functions
export function getCardValue(card: Card): number {
	return CARD_VALUE[card.rank];
}

export function cardToString(card: Card): string {
	return `${RANK_LABEL[card.rank]}${SUIT_SYMBOL[card.suit]}`;
}

export function isEnemyRank(rank: Rank): rank is EnemyRank {
	return rank === 'J' || rank === 'Q' || rank === 'K';
}
