/**
 * Water Sort Seed Generator
 *
 * Generates pre-verified water sort puzzles with BFS-computed optimal solutions.
 * Each seed stores the puzzle state and minimum moves needed to solve.
 *
 * Generation: Random shuffle of color pool into tubes (guaranteed random distribution).
 * Solver: Forward BFS with state normalization + move pruning + IDA* fallback.
 *
 * Usage: node scripts/generateWaterSortSeeds.mjs
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================
// Configuration
// ============================================================

const TUBE_CAPACITY = 4;

const SEED_COUNTS = {
	easy: 100,
	medium: 100,
	hard: 100,
	expert: 100,
	master: 50,
};

// Difficulty is controlled by number of colors.
// Empty tubes = 2 for all (ensures solvability while maintaining challenge).
const DIFFICULTY_CONFIG = {
	easy:   { numColorsRange: [4, 5],   emptyTubes: 2 },
	medium: { numColorsRange: [6, 7],   emptyTubes: 2 },
	hard:   { numColorsRange: [8, 9],   emptyTubes: 2 },
	expert: { numColorsRange: [10, 11], emptyTubes: 2 },
	master: { numColorsRange: [12, 14], emptyTubes: 2 },
};

// BFS limits (offline — generous)
const BFS_MAX_STATES = 2_000_000;
const IDA_TIME_LIMIT = 10_000; // 10 seconds per puzzle
const IDA_MAX_DEPTH = 60;

// ============================================================
// Utility
// ============================================================

function shuffle(arr) {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

function randInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ============================================================
// Puzzle Generation (random shuffle)
// ============================================================

function isGoal(state) {
	for (const t of state) {
		if (t.length === 0) continue;
		if (t.length !== TUBE_CAPACITY) return false;
		if (!t.every(l => l === t[0])) return false;
	}
	return true;
}

function generatePuzzle(numColors, emptyTubes) {
	const pool = [];
	for (let i = 0; i < numColors; i++) {
		for (let j = 0; j < TUBE_CAPACITY; j++) {
			pool.push(i);
		}
	}
	shuffle(pool);

	const tubes = [];
	for (let i = 0; i < numColors; i++) {
		tubes.push(pool.slice(i * TUBE_CAPACITY, (i + 1) * TUBE_CAPACITY));
	}
	for (let i = 0; i < emptyTubes; i++) {
		tubes.push([]);
	}

	// Reject if already solved
	if (isGoal(tubes)) return null;
	return tubes;
}

// ============================================================
// BFS Solver with Optimizations
// ============================================================

// Optimization 1: State Normalization
function normalizeState(state) {
	return state.map(t => t.join(',')).sort().join('|');
}

function isComplete(tube) {
	return tube.length === TUBE_CAPACITY && tube.every(l => l === tube[0]);
}

function getTopGroup(tube) {
	if (tube.length === 0) return null;
	const color = tube[tube.length - 1];
	let count = 1;
	for (let i = tube.length - 2; i >= 0; i--) {
		if (tube[i] === color) count++;
		else break;
	}
	return { color, count };
}

// Optimization 2: Pruned move generation
function generateMoves(state) {
	const moves = [];
	let hasEmptyTarget = false;

	for (let s = 0; s < state.length; s++) {
		const src = state[s];
		if (src.length === 0) continue;
		if (isComplete(src)) continue;

		const srcGroup = getTopGroup(src);
		const isSingleColor = src.every(l => l === src[0]);

		for (let t = 0; t < state.length; t++) {
			if (s === t) continue;
			const tgt = state[t];

			if (tgt.length === 0) {
				if (isSingleColor) continue;
				if (hasEmptyTarget) continue;
				hasEmptyTarget = true;
				moves.push({ src: s, tgt: t });
				continue;
			}

			if (tgt.length >= TUBE_CAPACITY) continue;
			if (isComplete(tgt)) continue;

			const tgtTop = tgt[tgt.length - 1];
			if (srcGroup.color === tgtTop) {
				moves.push({ src: s, tgt: t });
			}
		}
	}
	return moves;
}

// Apply move (pure function — returns new state)
function applyMove(state, move) {
	const newState = state.map(t => [...t]);
	const src = newState[move.src];
	const tgt = newState[move.tgt];

	// Pour all consecutive same-color layers from top (same as game's pourWater)
	const group = getTopGroup(src);
	const space = TUBE_CAPACITY - tgt.length;
	const count = Math.min(group.count, space);
	for (let i = 0; i < count; i++) {
		tgt.push(src.pop());
	}
	return newState;
}

// Forward BFS
function bfs(initialState) {
	if (isGoal(initialState)) return { solved: true, optimal: 0, method: 'bfs', states: 1 };

	const visited = new Set();
	visited.add(normalizeState(initialState));
	let frontier = [{ state: initialState, depth: 0 }];

	while (frontier.length > 0 && visited.size <= BFS_MAX_STATES) {
		const next = [];
		for (const { state, depth } of frontier) {
			const moves = generateMoves(state);
			for (const move of moves) {
				const ns = applyMove(state, move);
				const key = normalizeState(ns);
				if (visited.has(key)) continue;
				visited.add(key);
				if (isGoal(ns)) {
					return { solved: true, optimal: depth + 1, method: 'bfs', states: visited.size };
				}
				next.push({ state: ns, depth: depth + 1 });
				if (visited.size > BFS_MAX_STATES) break;
			}
			if (visited.size > BFS_MAX_STATES) break;
		}
		frontier = next;
	}

	return { solved: false, method: 'bfs', states: visited.size };
}

// IDA* fallback
function heuristic(state) {
	let misplaced = 0;
	for (const tube of state) {
		if (tube.length === 0) continue;
		const bottom = tube[0];
		for (let i = 1; i < tube.length; i++) {
			if (tube[i] !== bottom) misplaced++;
		}
	}
	return Math.ceil(misplaced / TUBE_CAPACITY);
}

function idaStar(initialState) {
	const deadline = Date.now() + IDA_TIME_LIMIT;

	let found = false;
	let foundDepth = -1;

	function search(state, g, bound, visited) {
		if (Date.now() > deadline || found) return Infinity;

		const h = heuristic(state);
		const f = g + h;
		if (f > bound) return f;

		if (isGoal(state)) {
			found = true;
			foundDepth = g;
			return g;
		}

		if (g >= IDA_MAX_DEPTH) return Infinity;

		const key = normalizeState(state);
		if (visited.has(key)) return Infinity;
		visited.add(key);

		let minExceeded = Infinity;
		const moves = generateMoves(state);

		for (const move of moves) {
			if (found) break;
			const newState = applyMove(state, move);
			const t = search(newState, g + 1, bound, visited);
			if (t < minExceeded) minExceeded = t;
		}

		visited.delete(key);
		return minExceeded;
	}

	let bound = heuristic(initialState);

	while (!found && bound <= IDA_MAX_DEPTH && Date.now() < deadline) {
		const visited = new Set();
		const t = search(initialState, 0, bound, visited);
		if (found) {
			return { solved: true, optimal: foundDepth, method: 'ida*' };
		}
		if (t === Infinity) break;
		bound = t;
	}

	return { solved: false, method: 'ida*' };
}

// Main solver
function solve(tubes) {
	const state = tubes.map(t => [...t]);

	// 1st: Forward BFS
	const bfsResult = bfs(state);
	if (bfsResult.solved) return bfsResult;

	// 2nd: IDA* fallback
	const idaResult = idaStar(state);
	if (idaResult.solved) return idaResult;

	return null;
}

// ============================================================
// Main Generation Loop
// ============================================================

async function main() {
	console.log('Water Sort Seed Generator');
	console.log('========================\n');

	const allSeeds = {};

	for (const [diff, count] of Object.entries(SEED_COUNTS)) {
		const config = DIFFICULTY_CONFIG[diff];
		const seeds = [];
		let attempts = 0;
		let solverFails = 0;

		console.log(`[${diff}] Generating ${count} seeds (colors: ${config.numColorsRange}, empty: ${config.emptyTubes})`);

		while (seeds.length < count) {
			attempts++;
			const numColors = randInt(config.numColorsRange[0], config.numColorsRange[1]);

			const tubes = generatePuzzle(numColors, config.emptyTubes);
			if (!tubes) continue;

			const startTime = Date.now();
			const result = solve(tubes);
			const elapsed = Date.now() - startTime;

			if (!result) {
				solverFails++;
				if (solverFails % 10 === 0) {
					process.stdout.write(`  [${diff}] solver fails: ${solverFails}, attempts: ${attempts}\r`);
				}
				continue;
			}

			seeds.push({
				t: tubes.map(t => [...t]),
				m: result.optimal,
			});

			console.log(`  [${diff}] ${seeds.length}/${count} - colors: ${numColors}, empty: ${config.emptyTubes}, optimal: ${result.optimal}, method: ${result.method}, time: ${elapsed}ms`);
		}

		console.log(`  [${diff}] Done! ${count} seeds in ${attempts} attempts (${solverFails} solver fails)\n`);
		allSeeds[diff] = seeds;
	}

	// Write output
	const outputPath = join(__dirname, '..', 'src', 'lib', 'games', 'water-sort', 'seeds.ts');

	const diffNames = ['easy', 'medium', 'hard', 'expert', 'master'];

	let output = `// Auto-generated Water Sort Seed Library
// Generated at: ${new Date().toISOString()}
// DO NOT EDIT - regenerate with: node scripts/generateWaterSortSeeds.mjs

export interface WaterSortSeed {
\tt: number[][];
\tm: number;
}

`;

	for (const diff of diffNames) {
		const varName = `${diff.toUpperCase()}_SEEDS`;
		const json = JSON.stringify(allSeeds[diff]);
		output += `export const ${varName}: WaterSortSeed[] = ${json};\n\n`;
	}

	writeFileSync(outputPath, output, 'utf-8');
	console.log(`\nWrote ${outputPath}`);

	// Summary
	console.log('\nSummary:');
	for (const diff of diffNames) {
		const seeds = allSeeds[diff];
		const optimalValues = seeds.map(s => s.m);
		const min = Math.min(...optimalValues);
		const max = Math.max(...optimalValues);
		const avg = (optimalValues.reduce((a, b) => a + b, 0) / optimalValues.length).toFixed(1);
		console.log(`  ${diff}: ${seeds.length} seeds, optimal range: ${min}-${max}, avg: ${avg}`);
	}
}

main().catch(console.error);
