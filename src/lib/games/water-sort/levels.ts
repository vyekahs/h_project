import { type Tube, type Difficulty, TUBE_CAPACITY } from './types';
import {
	EASY_SEEDS, MEDIUM_SEEDS, HARD_SEEDS, EXPERT_SEEDS, MASTER_SEEDS,
	type WaterSortSeed
} from './seeds';

function shuffle<T>(arr: T[]): T[] {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

/** Get top color index and count of consecutive same-color layers from top */
export function getTopGroup(tube: Tube): { color: number; count: number } | null {
	if (tube.layers.length === 0) return null;
	const color = tube.layers[tube.layers.length - 1];
	let count = 1;
	for (let i = tube.layers.length - 2; i >= 0; i--) {
		if (tube.layers[i] === color) count++;
		else break;
	}
	return { color, count };
}

/** Check if pouring from source to target is valid */
export function canPour(source: Tube, target: Tube): boolean {
	if (source.layers.length === 0) return false;
	const space = TUBE_CAPACITY - target.layers.length;
	if (space === 0) return false;
	if (target.layers.length === 0) return true;
	const sourceTop = source.layers[source.layers.length - 1];
	const targetTop = target.layers[target.layers.length - 1];
	return sourceTop === targetTop;
}

/** Pour water from source to target, returns number of layers moved */
export function pourWater(source: Tube, target: Tube): number {
	if (!canPour(source, target)) return 0;
	const group = getTopGroup(source)!;
	const space = TUBE_CAPACITY - target.layers.length;
	const moveCount = Math.min(group.count, space);
	for (let i = 0; i < moveCount; i++) {
		target.layers.push(source.layers.pop()!);
	}
	return moveCount;
}

/** Check if all non-empty tubes have a single color with 4 layers */
export function checkWin(tubes: Tube[]): boolean {
	for (const tube of tubes) {
		if (tube.layers.length === 0) continue;
		if (tube.layers.length !== TUBE_CAPACITY) return false;
		const color = tube.layers[0];
		if (!tube.layers.every(l => l === color)) return false;
	}
	return true;
}

/** Check if no valid moves remain (stuck/deadlock) */
export function isStuck(tubes: Tube[]): boolean {
	for (let i = 0; i < tubes.length; i++) {
		if (tubes[i].layers.length === 0) continue;
		// Skip already-complete tubes
		if (tubes[i].layers.length === TUBE_CAPACITY && tubes[i].layers.every(l => l === tubes[i].layers[0])) continue;
		for (let j = 0; j < tubes.length; j++) {
			if (i === j) continue;
			if (canPour(tubes[i], tubes[j])) return false;
		}
	}
	return true;
}

/**
 * BFS solver: check if the current tube state is solvable.
 * Returns true (solvable), false (proven unsolvable), or null (search limit exceeded).
 */
export function checkSolvable(tubes: Tube[], maxStates = 500_000): boolean | null {
	const initial = tubes.map(t => [...t.layers]);

	// Quick check: already won
	if (checkWinRaw(initial)) return true;

	const visited = new Set<string>();
	visited.add(normalizeState(initial));
	let frontier: number[][][] = [initial];

	while (frontier.length > 0) {
		const next: number[][][] = [];
		for (const state of frontier) {
			const moves = generateSolverMoves(state);
			for (const move of moves) {
				const ns = applySolverMove(state, move);
				const key = normalizeState(ns);
				if (visited.has(key)) continue;
				visited.add(key);
				if (checkWinRaw(ns)) return true;
				next.push(ns);
				if (visited.size > maxStates) return null;
			}
		}
		frontier = next;
	}

	// BFS exhausted all reachable states without finding a win
	return false;
}

function checkWinRaw(state: number[][]): boolean {
	for (const tube of state) {
		if (tube.length === 0) continue;
		if (tube.length !== TUBE_CAPACITY) return false;
		if (!tube.every(l => l === tube[0])) return false;
	}
	return true;
}

function normalizeState(state: number[][]): string {
	return state.map(t => t.join(',')).sort().join('|');
}

function isCompleteTube(tube: number[]): boolean {
	return tube.length === TUBE_CAPACITY && tube.every(l => l === tube[0]);
}

function getTopGroupRaw(tube: number[]): { color: number; count: number } | null {
	if (tube.length === 0) return null;
	const color = tube[tube.length - 1];
	let count = 1;
	for (let i = tube.length - 2; i >= 0; i--) {
		if (tube[i] === color) count++;
		else break;
	}
	return { color, count };
}

function generateSolverMoves(state: number[][]): { src: number; tgt: number }[] {
	const moves: { src: number; tgt: number }[] = [];

	for (let s = 0; s < state.length; s++) {
		const src = state[s];
		if (src.length === 0) continue;
		if (isCompleteTube(src)) continue;

		const srcGroup = getTopGroupRaw(src)!;
		const isSingleColor = src.every(l => l === src[0]);
		let hasEmptyTarget = false;

		for (let t = 0; t < state.length; t++) {
			if (s === t) continue;
			const tgt = state[t];

			if (tgt.length === 0) {
				// Skip moving single-color tube to empty (pointless)
				if (isSingleColor) continue;
				// Only allow one empty tube target (they're interchangeable)
				if (hasEmptyTarget) continue;
				hasEmptyTarget = true;
				moves.push({ src: s, tgt: t });
				continue;
			}

			if (tgt.length >= TUBE_CAPACITY) continue;
			if (isCompleteTube(tgt)) continue;

			const tgtTop = tgt[tgt.length - 1];
			if (srcGroup.color === tgtTop) {
				moves.push({ src: s, tgt: t });
			}
		}
	}
	return moves;
}

function applySolverMove(state: number[][], move: { src: number; tgt: number }): number[][] {
	const newState = state.map(t => [...t]);
	const src = newState[move.src];
	const tgt = newState[move.tgt];
	const group = getTopGroupRaw(src)!;
	const space = TUBE_CAPACITY - tgt.length;
	const count = Math.min(group.count, space);
	for (let i = 0; i < count; i++) {
		tgt.push(src.pop()!);
	}
	return newState;
}

export interface WaterSortLevel {
	tubes: Tube[];
	moveLimit: number;
}

const SEEDS_BY_DIFFICULTY: Record<Difficulty, WaterSortSeed[]> = {
	easy: EASY_SEEDS,
	medium: MEDIUM_SEEDS,
	hard: HARD_SEEDS,
	expert: EXPERT_SEEDS,
	master: MASTER_SEEDS,
};

/**
 * Generate a level from pre-computed seeds.
 * Applies color permutation + tube order shuffle for variety.
 */
export function generateLevel(difficulty: Difficulty): WaterSortLevel {
	const seeds = SEEDS_BY_DIFFICULTY[difficulty];
	const seed = seeds[Math.floor(Math.random() * seeds.length)];

	// 1. Deep copy layers from seed
	const layers = seed.t.map(l => [...l]);

	// 2. Apply random color permutation (same structure, different colors)
	const colorSet = new Set<number>();
	for (const tube of layers) {
		for (const c of tube) colorSet.add(c);
	}
	const numColors = colorSet.size;
	const colorPerm = shuffle([...Array(numColors).keys()]);
	const remapped = layers.map(tube =>
		tube.map(c => colorPerm[c])
	);

	// 3. Shuffle tube order + assign ids
	const tubes: Tube[] = remapped.map((l, i) => ({ id: i, layers: l }));
	shuffle(tubes);
	tubes.forEach((t, i) => { t.id = i; });

	return { tubes, moveLimit: seed.m };
}
