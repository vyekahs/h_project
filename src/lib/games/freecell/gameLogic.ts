import {
	type Card,
	type FreecellState,
	type Location,
	type MoveAction,
	SUITS,
	RANKS,
	SUIT_INDEX,
	isOppositeColor
} from './types';

// ─── Deck & Dealing ───

export function createDeck(): Card[] {
	const deck: Card[] = [];
	for (const suit of SUITS) {
		for (let v = 1; v <= 13; v++) {
			deck.push({
				id: SUIT_INDEX[suit] * 13 + (v - 1),
				suit,
				rank: RANKS[v - 1],
				value: v
			});
		}
	}
	return deck;
}

/**
 * MS Freecell compatible seeded PRNG.
 * Linear congruential generator matching the classic Microsoft Freecell dealing algorithm.
 */
function msRandom(seed: number): { value: number; nextSeed: number } {
	seed = (seed * 214013 + 2531011) & 0x7fffffff;
	const value = (seed >> 16) & 0x7fff;
	return { value, nextSeed: seed };
}

/**
 * Deal cards using MS Freecell algorithm.
 * Columns 0-3 get 7 cards, columns 4-7 get 6 cards.
 */
export function dealCards(seed: number): FreecellState {
	const deck = createDeck();
	let currentSeed = seed;

	// Fisher-Yates shuffle with MS PRNG (deal from end)
	for (let i = deck.length - 1; i > 0; i--) {
		const result = msRandom(currentSeed);
		currentSeed = result.nextSeed;
		const j = result.value % (i + 1);
		[deck[i], deck[j]] = [deck[j], deck[i]];
	}

	// Deal into 8 columns (MS Freecell deals left to right, row by row)
	const tableau: Card[][] = Array.from({ length: 8 }, () => []);
	for (let i = 0; i < deck.length; i++) {
		tableau[i % 8].push(deck[i]);
	}

	return {
		tableau,
		freeCells: [null, null, null, null],
		foundations: [[], [], [], []], // spades, hearts, diamonds, clubs
		seed
	};
}

// ─── State Cloning ───

export function cloneState(state: FreecellState): FreecellState {
	return {
		tableau: state.tableau.map((col) => [...col]),
		freeCells: [...state.freeCells],
		foundations: state.foundations.map((f) => [...f]),
		seed: state.seed
	};
}

// ─── Move Validation ───

/**
 * Check if a card can move to a foundation pile.
 * Returns the foundation index or null.
 */
export function canMoveToFoundation(card: Card, foundations: Card[][]): number | null {
	const fIdx = SUIT_INDEX[card.suit];
	const pile = foundations[fIdx];

	if (pile.length === 0) {
		return card.value === 1 ? fIdx : null;
	}

	const top = pile[pile.length - 1];
	return top.suit === card.suit && card.value === top.value + 1 ? fIdx : null;
}

/**
 * Check if a card can be placed on top of a tableau column.
 */
export function canMoveToTableau(card: Card, column: Card[]): boolean {
	if (column.length === 0) return true;
	const top = column[column.length - 1];
	return isOppositeColor(card, top) && card.value === top.value - 1;
}

/**
 * Returns the first empty free cell index, or null.
 */
export function canMoveToFreeCell(freeCells: (Card | null)[]): number | null {
	const idx = freeCells.indexOf(null);
	return idx >= 0 ? idx : null;
}

/**
 * Calculate max movable cards as a super-move.
 * maxMovable = (1 + emptyFreeCells) * 2^(emptyTableauCols)
 * excludeCol: when moving TO an empty column, don't count it.
 */
export function getMaxMovableCards(state: FreecellState, excludeCol?: number): number {
	const emptyFreeCells = state.freeCells.filter((c) => c === null).length;
	let emptyTableauCols = 0;
	for (let i = 0; i < state.tableau.length; i++) {
		if (i !== excludeCol && state.tableau[i].length === 0) {
			emptyTableauCols++;
		}
	}
	return (1 + emptyFreeCells) * Math.pow(2, emptyTableauCols);
}

/**
 * Get the length of the valid descending alternating-color sequence
 * from the bottom of a tableau column.
 */
export function getMovableSequenceLength(column: Card[]): number {
	if (column.length === 0) return 0;
	let count = 1;
	for (let i = column.length - 1; i > 0; i--) {
		const lower = column[i];
		const upper = column[i - 1];
		if (isOppositeColor(lower, upper) && lower.value === upper.value - 1) {
			count++;
		} else {
			break;
		}
	}
	return count;
}

// ─── Move Execution ───

/**
 * Execute a move and return a new state. Does NOT validate — caller must validate first.
 */
export function executeMove(state: FreecellState, action: MoveAction): FreecellState {
	const newState = cloneState(state);
	const { from, to, cards } = action;

	// Remove cards from source
	if (from.type === 'tableau') {
		newState.tableau[from.col].splice(from.cardIndex, cards.length);
	} else if (from.type === 'freecell') {
		newState.freeCells[from.index] = null;
	} else if (from.type === 'foundation') {
		newState.foundations[from.index].pop();
	}

	// Add cards to destination
	if (to.type === 'tableau') {
		newState.tableau[to.col].push(...cards);
	} else if (to.type === 'freecell') {
		newState.freeCells[to.index] = cards[0];
	} else if (to.type === 'foundation') {
		newState.foundations[to.index].push(...cards);
	}

	return newState;
}

/**
 * Try to build a valid MoveAction for moving card(s) from `from` to `to`.
 * Returns null if the move is invalid.
 */
export function tryMove(state: FreecellState, from: Location, to: Location): MoveAction | null {
	// Get the card(s) to move
	let cards: Card[];

	if (from.type === 'tableau') {
		const col = state.tableau[from.col];
		if (from.cardIndex < 0 || from.cardIndex >= col.length) return null;
		cards = col.slice(from.cardIndex);

		// Validate the sequence is properly ordered
		for (let i = 1; i < cards.length; i++) {
			if (!isOppositeColor(cards[i], cards[i - 1]) || cards[i].value !== cards[i - 1].value - 1) {
				return null;
			}
		}
	} else if (from.type === 'freecell') {
		const card = state.freeCells[from.index];
		if (!card) return null;
		cards = [card];
	} else if (from.type === 'foundation') {
		const pile = state.foundations[from.index];
		if (pile.length === 0) return null;
		cards = [pile[pile.length - 1]];
	} else {
		return null;
	}

	// Validate destination
	if (to.type === 'foundation') {
		if (cards.length !== 1) return null;
		const fIdx = canMoveToFoundation(cards[0], state.foundations);
		if (fIdx === null || fIdx !== to.index) return null;
	} else if (to.type === 'tableau') {
		if (cards.length === 1) {
			if (!canMoveToTableau(cards[0], state.tableau[to.col])) return null;
		} else {
			// Multi-card move: check max movable and destination validity
			const excludeCol = state.tableau[to.col].length === 0 ? to.col : undefined;
			const maxMovable = getMaxMovableCards(state, excludeCol);
			if (cards.length > maxMovable) return null;
			if (!canMoveToTableau(cards[0], state.tableau[to.col])) return null;
		}
	} else if (to.type === 'freecell') {
		if (cards.length !== 1) return null;
		if (state.freeCells[to.index] !== null) return null;
	}

	return { from, to, cards };
}

// ─── Auto-Move & Win Detection ───

/**
 * Check if the game is won (all foundations have 13 cards).
 */
export function isWon(state: FreecellState): boolean {
	return state.foundations.every((f) => f.length === 13);
}

/**
 * Check if a card can be safely auto-moved to foundation.
 * A card is safe if both cards of the opposite color with value-1
 * are already on foundations (won't be needed for tableau building).
 */
export function isSafeForFoundation(card: Card, foundations: Card[][]): boolean {
	if (canMoveToFoundation(card, foundations) === null) return false;

	// Aces and 2s are always safe
	if (card.value <= 2) return true;

	// Check if both opposite-color suits have at least value-2 on foundation
	const neededValue = card.value - 1;
	for (let i = 0; i < 4; i++) {
		const suit = SUITS[i];
		if (
			(card.suit === 'spades' || card.suit === 'clubs') &&
			(suit === 'hearts' || suit === 'diamonds')
		) {
			const topValue = foundations[i].length > 0 ? foundations[i][foundations[i].length - 1].value : 0;
			if (topValue < neededValue) return false;
		}
		if (
			(card.suit === 'hearts' || card.suit === 'diamonds') &&
			(suit === 'spades' || suit === 'clubs')
		) {
			const topValue = foundations[i].length > 0 ? foundations[i][foundations[i].length - 1].value : 0;
			if (topValue < neededValue) return false;
		}
	}
	return true;
}

/**
 * Get all safe auto-foundation moves from tableau bottoms and free cells.
 */
export function getAutoFoundationMoves(state: FreecellState): MoveAction[] {
	const moves: MoveAction[] = [];

	// Check free cells
	for (let i = 0; i < state.freeCells.length; i++) {
		const card = state.freeCells[i];
		if (card && isSafeForFoundation(card, state.foundations)) {
			const fIdx = canMoveToFoundation(card, state.foundations)!;
			moves.push({
				from: { type: 'freecell', index: i },
				to: { type: 'foundation', index: fIdx },
				cards: [card]
			});
		}
	}

	// Check tableau bottoms
	for (let col = 0; col < state.tableau.length; col++) {
		const column = state.tableau[col];
		if (column.length === 0) continue;
		const card = column[column.length - 1];
		if (isSafeForFoundation(card, state.foundations)) {
			const fIdx = canMoveToFoundation(card, state.foundations)!;
			moves.push({
				from: { type: 'tableau', col, cardIndex: column.length - 1 },
				to: { type: 'foundation', index: fIdx },
				cards: [card]
			});
		}
	}

	return moves;
}

/**
 * Check if all remaining cards can be auto-completed to foundations.
 * True when all tableau columns are in descending order (no card blocks a lower card of the same suit).
 */
export function canAutoComplete(state: FreecellState): boolean {
	// Check: every card in tableau & freecells can eventually go to foundation
	// Simple heuristic: all tableau columns are sorted (each card's value >= card above it)
	for (const col of state.tableau) {
		for (let i = 1; i < col.length; i++) {
			if (col[i].value > col[i - 1].value) return false;
		}
	}

	// Free cells must all be movable to foundation eventually
	// (this is implied if tableau is sorted, but let's be safe)
	for (const card of state.freeCells) {
		if (card === null) continue;
		// Check this card's value isn't blocking anything
		const foundationTop =
			state.foundations[SUIT_INDEX[card.suit]].length > 0
				? state.foundations[SUIT_INDEX[card.suit]][
						state.foundations[SUIT_INDEX[card.suit]].length - 1
					].value
				: 0;
		if (card.value !== foundationTop + 1) {
			// Card can't go directly — check if it's blocking
			// Allow if all cards below its value in same suit are already on foundation
			if (card.value > foundationTop + 2) return false;
		}
	}

	return true;
}

/**
 * Run auto-complete: repeatedly move the lowest available card to its foundation.
 * Returns array of states for animation.
 */
export function autoComplete(state: FreecellState): FreecellState[] {
	const states: FreecellState[] = [];
	let current = cloneState(state);

	for (let safety = 0; safety < 52; safety++) {
		let moved = false;

		// Try free cells first
		for (let i = 0; i < current.freeCells.length; i++) {
			const card = current.freeCells[i];
			if (!card) continue;
			const fIdx = canMoveToFoundation(card, current.foundations);
			if (fIdx !== null) {
				current = executeMove(current, {
					from: { type: 'freecell', index: i },
					to: { type: 'foundation', index: fIdx },
					cards: [card]
				});
				states.push(cloneState(current));
				moved = true;
				break;
			}
		}
		if (moved) continue;

		// Try tableau bottoms
		for (let col = 0; col < current.tableau.length; col++) {
			const column = current.tableau[col];
			if (column.length === 0) continue;
			const card = column[column.length - 1];
			const fIdx = canMoveToFoundation(card, current.foundations);
			if (fIdx !== null) {
				current = executeMove(current, {
					from: { type: 'tableau', col, cardIndex: column.length - 1 },
					to: { type: 'foundation', index: fIdx },
					cards: [card]
				});
				states.push(cloneState(current));
				moved = true;
				break;
			}
		}

		if (!moved || isWon(current)) break;
	}

	return states;
}

// ─── Find Best Move (for click-to-move) ───

/**
 * Find the best destination for a card/sequence from a given location.
 * Priority: foundation > non-empty tableau > empty tableau > free cell
 */
export function findBestMove(state: FreecellState, from: Location): MoveAction | null {
	let cards: Card[];
	if (from.type === 'tableau') {
		const col = state.tableau[from.col];
		cards = col.slice(from.cardIndex);
	} else if (from.type === 'freecell') {
		const card = state.freeCells[from.index];
		if (!card) return null;
		cards = [card];
	} else {
		return null; // Don't auto-move from foundation
	}

	const topCard = cards[0];

	// 1. Try foundation (single card only)
	if (cards.length === 1) {
		const fIdx = canMoveToFoundation(topCard, state.foundations);
		if (fIdx !== null) {
			return { from, to: { type: 'foundation', index: fIdx }, cards };
		}
	}

	// 2. Try non-empty tableau columns
	let emptyCol: number | null = null;
	for (let col = 0; col < state.tableau.length; col++) {
		if (from.type === 'tableau' && col === from.col) continue;
		if (state.tableau[col].length === 0) {
			if (emptyCol === null) emptyCol = col;
			continue;
		}
		const move = tryMove(state, from, { type: 'tableau', col, cardIndex: 0 });
		if (move) return move;
	}

	// 3. Try empty tableau column
	if (emptyCol !== null) {
		const move = tryMove(state, from, { type: 'tableau', col: emptyCol, cardIndex: 0 });
		if (move) return move;
	}

	// 4. Try free cell (single card only)
	if (cards.length === 1) {
		const fcIdx = canMoveToFreeCell(state.freeCells);
		if (fcIdx !== null) {
			return { from, to: { type: 'freecell', index: fcIdx }, cards };
		}
	}

	return null;
}

/**
 * Check if the game is stuck (no valid moves).
 */
export function isStuck(state: FreecellState): boolean {
	// Check all tableau bottom cards and sequences
	for (let col = 0; col < state.tableau.length; col++) {
		const column = state.tableau[col];
		if (column.length === 0) continue;

		// Check moving sequences of various lengths from the bottom
		const seqLen = getMovableSequenceLength(column);
		for (let len = 1; len <= seqLen; len++) {
			const cardIndex = column.length - len;
			const from: Location = { type: 'tableau', col, cardIndex };

			// Try foundations
			if (len === 1) {
				if (canMoveToFoundation(column[cardIndex], state.foundations) !== null) return false;
			}

			// Try other tableau columns
			for (let toCol = 0; toCol < state.tableau.length; toCol++) {
				if (toCol === col) continue;
				if (tryMove(state, from, { type: 'tableau', col: toCol, cardIndex: 0 })) return false;
			}

			// Try free cell
			if (len === 1 && canMoveToFreeCell(state.freeCells) !== null) return false;
		}
	}

	// Check free cell cards
	for (let i = 0; i < state.freeCells.length; i++) {
		const card = state.freeCells[i];
		if (!card) continue;

		const from: Location = { type: 'freecell', index: i };

		// Try foundation
		if (canMoveToFoundation(card, state.foundations) !== null) return false;

		// Try tableau
		for (let col = 0; col < state.tableau.length; col++) {
			if (tryMove(state, from, { type: 'tableau', col, cardIndex: 0 })) return false;
		}
	}

	return true;
}
