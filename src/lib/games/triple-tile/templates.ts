import type { TilePosition } from './types';

/**
 * Seeded pseudo-random number generator (mulberry32).
 * Allows reproducible layouts from a seed.
 */
function mulberry32(seed: number): () => number {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// ── Shape functions ──────────────────────────────────────────────
// Each returns a 2D boolean grid [row][col] where true = tile exists.

type ShapeFn = (cols: number, rows: number, rand: () => number) => boolean[][];

/** Full rectangle (original shape) */
function rectangle(cols: number, rows: number): boolean[][] {
	return Array.from({ length: rows }, () => Array(cols).fill(true));
}

/** Diamond (rhombus) based on Manhattan distance from center */
function diamond(cols: number, rows: number): boolean[][] {
	const cx = (cols - 1) / 2;
	const cy = (rows - 1) / 2;
	const radius = Math.min(cx, cy);
	return Array.from({ length: rows }, (_, r) =>
		Array.from({ length: cols }, (_, c) =>
			Math.abs(c - cx) / Math.max(cx, 1) + Math.abs(r - cy) / Math.max(cy, 1) <= 1.05
		)
	);
}

/** Cross / plus shape (center band horizontally + vertically) */
function cross(cols: number, rows: number): boolean[][] {
	const cx = Math.floor(cols / 2);
	const cy = Math.floor(rows / 2);
	// Arm width: at least 2 for small boards
	const armW = Math.max(2, Math.floor(cols * 0.4));
	const armH = Math.max(2, Math.floor(rows * 0.4));
	const left = cx - Math.floor(armW / 2);
	const right = left + armW - 1;
	const top = cy - Math.floor(armH / 2);
	const bottom = top + armH - 1;
	return Array.from({ length: rows }, (_, r) =>
		Array.from({ length: cols }, (_, c) =>
			(c >= left && c <= right) || (r >= top && r <= bottom)
		)
	);
}

/** Hollow rectangle — border only, center empty. Falls back to rectangle if too small. */
function hollow(cols: number, rows: number): boolean[][] {
	if (cols <= 3 || rows <= 3) return rectangle(cols, rows);
	return Array.from({ length: rows }, (_, r) =>
		Array.from({ length: cols }, (_, c) =>
			r === 0 || r === rows - 1 || c === 0 || c === cols - 1
		)
	);
}

/** Random scattered — each cell has ~80% chance */
function scattered(cols: number, rows: number, rand: () => number): boolean[][] {
	return Array.from({ length: rows }, () =>
		Array.from({ length: cols }, () => rand() < 0.8)
	);
}

const SHAPES: ShapeFn[] = [rectangle, diamond, cross, hollow, scattered];

// ── Layout generation ────────────────────────────────────────────

/**
 * Generate a multi-layer layout with a given base shape.
 *
 * - Layer 0 uses the shape function to determine tile placement.
 * - Upper layers use 0.5-offset stacking with support checks and density decay.
 * - Total is trimmed to a multiple of 3.
 */
function generateLayout(
	baseCols: number,
	baseRows: number,
	layers: number,
	seed: number,
	shapeFn: ShapeFn
): TilePosition[] {
	const rand = mulberry32(seed);
	const positions: TilePosition[] = [];

	// Generate base shape
	const baseShape = shapeFn(baseCols, baseRows, rand);

	// Track which positions have tiles per layer (key: "col,row")
	const layerTiles: Set<string>[] = [];

	for (let layer = 0; layer < layers; layer++) {
		const cols = baseCols - layer;
		const rows = baseRows - layer;
		if (cols <= 0 || rows <= 0) break;

		const density = layer === 0 ? 1.0 : Math.max(0.3, 1.0 - layer * 0.18);
		const tileSet = new Set<string>();

		for (let row = 0; row < rows; row++) {
			for (let col = 0; col < cols; col++) {
				if (layer === 0) {
					// Use the shape mask for the base layer
					if (baseShape[row]?.[col]) {
						positions.push({ col, row, layer: 0 });
						tileSet.add(`${col},${row}`);
					}
					continue;
				}

				// Upper layers: support check
				const absCol = col + layer * 0.5;
				const absRow = row + layer * 0.5;
				const prevSet = layerTiles[layer - 1];
				let hasSupport = false;

				const prevLayerOffset = (layer - 1) * 0.5;
				for (let dr = 0; dr <= 1; dr++) {
					for (let dc = 0; dc <= 1; dc++) {
						const supportCol = absCol - 0.5 + dc;
						const supportRow = absRow - 0.5 + dr;
						const localCol = supportCol - prevLayerOffset;
						const localRow = supportRow - prevLayerOffset;
						if (prevSet.has(`${localCol},${localRow}`)) {
							hasSupport = true;
							break;
						}
					}
					if (hasSupport) break;
				}

				if (!hasSupport) continue;

				if (rand() < density) {
					positions.push({ col: absCol, row: absRow, layer });
					tileSet.add(`${col},${row}`);
				}
			}
		}

		layerTiles.push(tileSet);
	}

	// Trim to multiple of 3
	while (positions.length % 3 !== 0) {
		positions.pop();
	}

	return positions;
}

// ── Difficulty specs & public API ────────────────────────────────

interface DifficultySpec {
	baseCols: number;
	baseRows: number;
	layers: number;
}

const DIFFICULTY_SPECS: Record<string, DifficultySpec[]> = {
	easy: [
		{ baseCols: 5, baseRows: 4, layers: 5 },
		{ baseCols: 4, baseRows: 4, layers: 5 },
	],
	medium: [
		{ baseCols: 5, baseRows: 5, layers: 5 },
		{ baseCols: 6, baseRows: 4, layers: 5 },
	],
	hard: [
		{ baseCols: 6, baseRows: 5, layers: 5 },
		{ baseCols: 7, baseRows: 5, layers: 5 },
	],
	expert: [
		{ baseCols: 7, baseRows: 5, layers: 5 },
		{ baseCols: 8, baseRows: 5, layers: 5 },
	],
	master: [
		{ baseCols: 7, baseRows: 6, layers: 5 },
		{ baseCols: 8, baseRows: 6, layers: 5 },
	],
};

/**
 * Pick a random layout for the given difficulty.
 * Each call generates a unique layout with a random shape.
 * Returns positions (always a multiple of 3).
 */
export function pickTemplate(difficulty: string): TilePosition[] {
	const specs = DIFFICULTY_SPECS[difficulty] || DIFFICULTY_SPECS.easy;
	const spec = specs[Math.floor(Math.random() * specs.length)];
	const seed = Math.floor(Math.random() * 2147483647);

	// Pick a random shape
	const shapeFn = SHAPES[Math.floor(Math.random() * SHAPES.length)];

	const positions = generateLayout(spec.baseCols, spec.baseRows, spec.layers, seed, shapeFn);

	// If the shape produced too few tiles (< 12), fall back to rectangle
	if (positions.length < 12) {
		return generateLayout(spec.baseCols, spec.baseRows, spec.layers, seed, rectangle);
	}

	return positions;
}
