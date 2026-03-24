/**
 * Freecell A* Solver — finds optimal (minimum move count) solutions.
 *
 * Used at build time to classify deal seeds by difficulty.
 * Run via: npx tsx scripts/freecell-classify-seeds.ts
 */

import {
	type Card,
	type FreecellState,
	SUITS,
	SUIT_INDEX,
	isOppositeColor
} from './types';
import { dealCards, canMoveToFoundation, canMoveToTableau, getMaxMovableCards } from './gameLogic';

// ─── State Hashing ───

function hashState(state: FreecellState): string {
	// Normalize free cells by sorting (order doesn't matter)
	const fc = state.freeCells
		.map((c) => (c ? `${c.id}` : '_'))
		.sort()
		.join(',');

	// Foundations: just the top value per suit (0 if empty)
	const fn = state.foundations.map((f) => (f.length > 0 ? f[f.length - 1].value : 0)).join(',');

	// Tableau: each column as card id sequence
	const tb = state.tableau.map((col) => col.map((c) => c.id).join('.')).join('|');

	return `${fc};${fn};${tb}`;
}

// ─── Move Generation ───

interface SolverMove {
	type: string;
	fromType: string;
	fromIndex: number;
	toType: string;
	toIndex: number;
	count: number; // number of cards moved
}

function applyMove(state: FreecellState, move: SolverMove): FreecellState {
	const newState: FreecellState = {
		tableau: state.tableau.map((col) => [...col]),
		freeCells: [...state.freeCells],
		foundations: state.foundations.map((f) => [...f]),
		seed: state.seed
	};

	let cards: Card[];

	// Remove from source
	if (move.fromType === 'tableau') {
		const col = newState.tableau[move.fromIndex];
		cards = col.splice(col.length - move.count, move.count);
	} else if (move.fromType === 'freecell') {
		cards = [newState.freeCells[move.fromIndex]!];
		newState.freeCells[move.fromIndex] = null;
	} else {
		// foundation (rare, but for completeness)
		const pile = newState.foundations[move.fromIndex];
		cards = [pile.pop()!];
	}

	// Add to destination
	if (move.toType === 'tableau') {
		newState.tableau[move.toIndex].push(...cards);
	} else if (move.toType === 'freecell') {
		newState.freeCells[move.toIndex] = cards[0];
	} else {
		newState.foundations[move.toIndex].push(...cards);
	}

	return newState;
}

function generateMoves(state: FreecellState): SolverMove[] {
	const moves: SolverMove[] = [];

	// 1. Tableau → Foundation
	for (let col = 0; col < 8; col++) {
		const column = state.tableau[col];
		if (column.length === 0) continue;
		const card = column[column.length - 1];
		const fIdx = canMoveToFoundation(card, state.foundations);
		if (fIdx !== null) {
			moves.push({
				type: 'tab→fnd',
				fromType: 'tableau',
				fromIndex: col,
				toType: 'foundation',
				toIndex: fIdx,
				count: 1
			});
		}
	}

	// 2. FreeCell → Foundation
	for (let i = 0; i < 4; i++) {
		const card = state.freeCells[i];
		if (!card) continue;
		const fIdx = canMoveToFoundation(card, state.foundations);
		if (fIdx !== null) {
			moves.push({
				type: 'fc→fnd',
				fromType: 'freecell',
				fromIndex: i,
				toType: 'foundation',
				toIndex: fIdx,
				count: 1
			});
		}
	}

	// 3. Tableau → Tableau (single and multi-card)
	for (let fromCol = 0; fromCol < 8; fromCol++) {
		const column = state.tableau[fromCol];
		if (column.length === 0) continue;

		// Find sequence length from bottom
		let seqLen = 1;
		for (let i = column.length - 1; i > 0; i--) {
			const lower = column[i];
			const upper = column[i - 1];
			if (isOppositeColor(lower, upper) && lower.value === upper.value - 1) {
				seqLen++;
			} else {
				break;
			}
		}

		for (let toCol = 0; toCol < 8; toCol++) {
			if (toCol === fromCol) continue;
			const destCol = state.tableau[toCol];

			for (let count = 1; count <= seqLen; count++) {
				const cardIndex = column.length - count;
				const card = column[cardIndex];

				if (destCol.length === 0) {
					// Moving to empty column — only worth it if we're moving more than one card
					// or freeing a card underneath
					if (count === column.length) continue; // Don't move entire column to empty column
					const excludeCol = toCol;
					const maxMovable = getMaxMovableCards(state, excludeCol);
					if (count > maxMovable) continue;
					moves.push({
						type: 'tab→tab',
						fromType: 'tableau',
						fromIndex: fromCol,
						toType: 'tableau',
						toIndex: toCol,
						count
					});
					break; // Only one move to each empty column (largest sequence)
				} else {
					if (!canMoveToTableau(card, destCol)) continue;
					const maxMovable = getMaxMovableCards(state);
					if (count > maxMovable) continue;
					moves.push({
						type: 'tab→tab',
						fromType: 'tableau',
						fromIndex: fromCol,
						toType: 'tableau',
						toIndex: toCol,
						count
					});
					break; // Only the largest valid sequence to this column
				}
			}
		}
	}

	// 4. Tableau → FreeCell
	const emptyFC = state.freeCells.indexOf(null);
	if (emptyFC >= 0) {
		for (let col = 0; col < 8; col++) {
			const column = state.tableau[col];
			if (column.length === 0) continue;
			moves.push({
				type: 'tab→fc',
				fromType: 'tableau',
				fromIndex: col,
				toType: 'freecell',
				toIndex: emptyFC,
				count: 1
			});
		}
	}

	// 5. FreeCell → Tableau
	for (let i = 0; i < 4; i++) {
		const card = state.freeCells[i];
		if (!card) continue;
		let movedToEmpty = false;
		for (let col = 0; col < 8; col++) {
			const destCol = state.tableau[col];
			if (destCol.length === 0) {
				if (!movedToEmpty) {
					moves.push({
						type: 'fc→tab',
						fromType: 'freecell',
						fromIndex: i,
						toType: 'tableau',
						toIndex: col,
						count: 1
					});
					movedToEmpty = true;
				}
			} else if (canMoveToTableau(card, destCol)) {
				moves.push({
					type: 'fc→tab',
					fromType: 'freecell',
					fromIndex: i,
					toType: 'tableau',
					toIndex: col,
					count: 1
				});
			}
		}
	}

	return moves;
}

// ─── Heuristic ───

function heuristic(state: FreecellState): number {
	// h(s) = 52 - total cards on foundations (admissible: each card needs at least 1 move)
	const onFoundation = state.foundations.reduce((sum, f) => sum + f.length, 0);
	return 52 - onFoundation;
}

// ─── A* Solver ───

interface AStarNode {
	state: FreecellState;
	g: number; // moves so far
	f: number; // g + h
	hash: string;
}

/**
 * Solve a freecell deal and return the minimum number of moves, or -1 if unsolvable within limits.
 */
export function solve(seed: number, maxNodes: number = 500000): number {
	const initial = dealCards(seed);
	const initialHash = hashState(initial);
	const h = heuristic(initial);

	if (h === 0) return 0; // Already won

	const visited = new Set<string>();
	visited.add(initialHash);

	// Priority queue using sorted array (simple but sufficient for this use case)
	// For better performance, use a proper min-heap
	const open: AStarNode[] = [
		{ state: initial, g: 0, f: h, hash: initialHash }
	];

	let nodesExplored = 0;

	while (open.length > 0 && nodesExplored < maxNodes) {
		// Find node with lowest f
		let bestIdx = 0;
		for (let i = 1; i < open.length; i++) {
			if (open[i].f < open[bestIdx].f || (open[i].f === open[bestIdx].f && open[i].g > open[bestIdx].g)) {
				bestIdx = i;
			}
		}
		const current = open[bestIdx];
		open[bestIdx] = open[open.length - 1];
		open.pop();

		nodesExplored++;

		const moves = generateMoves(current.state);

		for (const move of moves) {
			const newState = applyMove(current.state, move);
			const newG = current.g + 1;

			// Check win
			const onFoundation = newState.foundations.reduce((sum, f) => sum + f.length, 0);
			if (onFoundation === 52) {
				return newG;
			}

			const newHash = hashState(newState);
			if (visited.has(newHash)) continue;
			visited.add(newHash);

			const newH = 52 - onFoundation;
			const newF = newG + newH;

			open.push({ state: newState, g: newG, f: newF, hash: newHash });
		}

		// Keep open list manageable — if too large, prune highest-f nodes
		if (open.length > 100000) {
			open.sort((a, b) => a.f - b.f);
			open.length = 50000;
		}
	}

	return -1; // Unsolvable within limits
}
