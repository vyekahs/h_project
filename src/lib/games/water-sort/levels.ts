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

/** Check if no *meaningful* moves remain (stuck/deadlock) */
export function isStuck(tubes: Tube[]): boolean {
	for (let i = 0; i < tubes.length; i++) {
		if (tubes[i].layers.length === 0) continue;
		if (isCompleteTube(tubes[i])) continue;

		const srcGroup = getTopGroup(tubes[i])!;

		for (let j = 0; j < tubes.length; j++) {
			if (i === j) continue;
			if (!canPour(tubes[i], tubes[j])) continue;

			// A pour is meaningful only if it exposes a different color underneath
			const exposesNewColor = srcGroup.count < tubes[i].layers.length;

			// Or if target already has same color (consolidation toward completion)
			const consolidates = tubes[j].layers.length > 0;

			if (exposesNewColor || consolidates) return false;
		}
	}
	return true;
}

function isCompleteTube(tube: Tube): boolean {
	return tube.layers.length === TUBE_CAPACITY && tube.layers.every(l => l === tube.layers[0]);
}

/**
 * Shallow search: check if ALL paths within `depth` moves lead to a dead end.
 */
export function isEffectivelyStuck(tubes: Tube[], depth = 3): boolean {
	if (depth === 0) return isStuck(tubes);

	for (let i = 0; i < tubes.length; i++) {
		if (tubes[i].layers.length === 0) continue;
		if (isCompleteTube(tubes[i])) continue;

		for (let j = 0; j < tubes.length; j++) {
			if (i === j) continue;
			if (!canPour(tubes[i], tubes[j])) continue;

			// Prune: moving a single-color tube to an empty tube is pointless (just relocation)
			if (tubes[j].layers.length === 0) {
				const srcGroup = getTopGroup(tubes[i])!;
				if (srcGroup.count === tubes[i].layers.length) continue;
			}

			// Simulate pour on a copy
			const copy = tubes.map(t => ({ ...t, layers: [...t.layers] }));
			pourWater(copy[i], copy[j]);

			if (checkWin(copy)) return false;
			if (!isEffectivelyStuck(copy, depth - 1)) return false;
		}
	}
	return true;
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
