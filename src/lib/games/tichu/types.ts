// ===== Card Types =====

export type Suit = 'jade' | 'sword' | 'pagoda' | 'star';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14; // 11=J, 12=Q, 13=K, 14=A
export type SpecialCard = 'dragon' | 'phoenix' | 'mahjong' | 'dog';

export interface NormalCard {
	type: 'normal';
	suit: Suit;
	rank: Rank;
	id: string; // e.g. "jade_5"
}

export interface SpecialCardObj {
	type: 'special';
	special: SpecialCard;
	id: string; // e.g. "dragon"
}

export type Card = NormalCard | SpecialCardObj;

// ===== Combination Types =====

export type CombinationType =
	| 'single'
	| 'pair'
	| 'triple'
	| 'full_house'
	| 'straight'
	| 'stairs' // consecutive pairs
	| 'four_bomb'
	| 'straight_flush_bomb';

export interface Combination {
	type: CombinationType;
	cards: Card[];
	rank: number; // primary comparison rank
	length: number; // for straights/stairs
}

// ===== Game Phases =====

export type GamePhase =
	| 'lobby'
	| 'ready_check'
	| 'dealing_8'
	| 'grand_tichu_window'
	| 'dealing_6'
	| 'exchange'
	| 'playing'
	| 'trick_resolve'
	| 'wish_declare'
	| 'dragon_gift'
	| 'round_end'
	| 'game_end';

// ===== Player & Team =====

export type TeamId = 'A' | 'B';
export type SeatIndex = 0 | 1 | 2 | 3;

export interface TichuPlayer {
	userId: number;
	name: string;
	seat: SeatIndex;
	team: TeamId;
	hand: Card[];
	wonCards: Card[]; // cards won in tricks
	grandTichu: boolean | null; // null = not decided, true = declared, false = passed
	smallTichu: boolean;
	hasPlayedFirstCard: boolean;
	finishOrder: number | null; // 1st, 2nd, 3rd, 4th
	connected: boolean;
}

// ===== Trick =====

export interface TrickPlay {
	seat: SeatIndex;
	combination: Combination;
}

export interface Trick {
	plays: TrickPlay[];
	passCount: number;
	leadSeat: SeatIndex;
	currentSeat: SeatIndex;
}

// ===== Wish System =====

export interface WishState {
	active: boolean;
	requestedRank: Rank | null;
	requestedBy: SeatIndex | null;
}

// ===== Round State =====

export interface RoundState {
	roundNumber: number;
	players: TichuPlayer[];
	trick: Trick | null;
	wish: WishState;
	currentSeat: SeatIndex;
	finishedCount: number;
	finishOrder: SeatIndex[];
	dragonGiftPending: boolean;
	dragonGiftSeat: SeatIndex | null; // who needs to gift
	turnDeadline: number | null; // timestamp when current turn expires
}

// ===== Completed Round =====

export interface TichuRoundResult {
	roundNumber: number;
	teamAScore: number;
	teamBScore: number;
	oneTwo: TeamId | null; // which team did 1-2, or null
	finishOrder: SeatIndex[]; // order in which players finished (1st, 2nd, 3rd, 4th)
	grandTichuDeclarations: { seat: SeatIndex; success: boolean }[];
	smallTichuDeclarations: { seat: SeatIndex; success: boolean }[];
}

// ===== Room State =====

export interface RoomConfig {
	targetScore: number;
}

export interface TichuRoomState {
	roomId: string;
	phase: GamePhase;
	config: RoomConfig;
	players: TichuPlayer[];
	readyStatus: boolean[];
	round: RoundState | null;
	completedRounds: TichuRoundResult[];
	cumulativeScoreA: number;
	cumulativeScoreB: number;
	winner: TeamId | null;
	createdAt: number;
}

export interface ExchangeCards {
	toPartner: string; // card id
	toLeft: string;
	toRight: string;
}
