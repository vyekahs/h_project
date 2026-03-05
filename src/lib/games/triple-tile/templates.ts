import type { LayoutTemplate, TilePosition } from './types';

/**
 * Generate a diamond/pyramid layout template.
 * Layer 0 is the widest, each subsequent layer shrinks inward.
 * Total positions must be a multiple of 3.
 */
function generatePyramidTemplate(
	name: string,
	baseCols: number,
	baseRows: number,
	layers: number
): LayoutTemplate {
	const positions: TilePosition[] = [];

	for (let layer = 0; layer < layers; layer++) {
		// Each layer shrinks by 1 on each side
		const cols = baseCols - layer * 2;
		const rows = baseRows - layer * 2;
		if (cols <= 0 || rows <= 0) break;

		for (let row = 0; row < rows; row++) {
			for (let col = 0; col < cols; col++) {
				positions.push({
					col: col + layer, // offset inward
					row: row + layer,
					layer,
				});
			}
		}
	}

	// Ensure total is a multiple of 3 by trimming from the top layer
	while (positions.length % 3 !== 0) {
		positions.pop();
	}

	return { name, positions };
}

/**
 * Generate a cross/plus layout template.
 */
function generateCrossTemplate(
	name: string,
	arm: number,
	width: number,
	layers: number
): LayoutTemplate {
	const positions: TilePosition[] = [];
	const center = arm; // center offset

	for (let layer = 0; layer < layers; layer++) {
		const shrink = layer;
		const w = Math.max(1, width - shrink * 2);
		const a = Math.max(1, arm - shrink);

		// Horizontal arm
		for (let row = 0; row < w; row++) {
			for (let col = 0; col < a * 2 + w; col++) {
				positions.push({
					col: col + shrink,
					row: row + center - Math.floor(w / 2) + shrink,
					layer,
				});
			}
		}

		// Vertical arm (excluding center overlap)
		for (let row = 0; row < a * 2 + w; row++) {
			if (row >= center - Math.floor(w / 2) + shrink && row < center + Math.ceil(w / 2) + shrink)
				continue; // already placed
			for (let col = center - Math.floor(w / 2) + shrink; col < center + Math.ceil(w / 2) + shrink; col++) {
				positions.push({ col, row: row + shrink, layer });
			}
		}
	}

	while (positions.length % 3 !== 0) {
		positions.pop();
	}

	return { name, positions };
}

// Pre-built templates per difficulty
// easy: ~24 tiles (8 types × 3)
const EASY_TEMPLATES: LayoutTemplate[] = [
	generatePyramidTemplate('easy-pyramid', 6, 4, 2), // 6×4=24 + top shrunk
	generatePyramidTemplate('easy-wide', 8, 3, 2),
];

// medium: ~36 tiles (12 types × 3)
const MEDIUM_TEMPLATES: LayoutTemplate[] = [
	generatePyramidTemplate('medium-pyramid', 6, 5, 3),
	generatePyramidTemplate('medium-wide', 8, 4, 3),
];

// hard: ~48 tiles (16 types × 3)
const HARD_TEMPLATES: LayoutTemplate[] = [
	generatePyramidTemplate('hard-pyramid', 8, 5, 3),
	generatePyramidTemplate('hard-wide', 10, 4, 3),
];

// expert: ~60 tiles (20 types × 3)
const EXPERT_TEMPLATES: LayoutTemplate[] = [
	generatePyramidTemplate('expert-pyramid', 8, 6, 4),
	generatePyramidTemplate('expert-wide', 10, 5, 4),
];

// master: ~78 tiles (26 types × 3)
const MASTER_TEMPLATES: LayoutTemplate[] = [
	generatePyramidTemplate('master-pyramid', 10, 6, 4),
	generatePyramidTemplate('master-wide', 12, 5, 4),
];

export const TEMPLATES: Record<string, LayoutTemplate[]> = {
	easy: EASY_TEMPLATES,
	medium: MEDIUM_TEMPLATES,
	hard: HARD_TEMPLATES,
	expert: EXPERT_TEMPLATES,
	master: MASTER_TEMPLATES,
};

/**
 * Pick a random template for the given difficulty and adjust
 * to have exactly the required number of tile positions.
 */
export function pickTemplate(difficulty: string, requiredCount: number): TilePosition[] {
	const templates = TEMPLATES[difficulty] || TEMPLATES.easy;
	const template = templates[Math.floor(Math.random() * templates.length)];
	let positions = [...template.positions];

	// If we have more positions than needed, trim from top layers first
	if (positions.length > requiredCount) {
		// Sort by layer descending, then by position
		positions.sort((a, b) => b.layer - a.layer || b.row - a.row || b.col - a.col);
		positions = positions.slice(0, requiredCount);
	}

	// If we have fewer positions than needed, add extra positions on existing layers
	while (positions.length < requiredCount) {
		// Find the max extent of the current layout
		const maxCol = Math.max(...positions.map((p) => p.col));
		const maxRow = Math.max(...positions.map((p) => p.row));
		const maxLayer = Math.max(...positions.map((p) => p.layer));

		// Try adding to layer 0 around the edges
		const existing = new Set(positions.map((p) => `${p.col},${p.row},${p.layer}`));

		let added = false;
		for (let layer = 0; layer <= maxLayer && !added; layer++) {
			for (let row = 0; row <= maxRow + 1 && !added; row++) {
				for (let col = 0; col <= maxCol + 1 && !added; col++) {
					const key = `${col},${row},${layer}`;
					if (!existing.has(key)) {
						// Check if this position is adjacent to an existing one
						const hasNeighbor = positions.some(
							(p) =>
								p.layer === layer &&
								Math.abs(p.col - col) <= 1 &&
								Math.abs(p.row - row) <= 1
						);
						if (hasNeighbor) {
							positions.push({ col, row, layer });
							existing.add(key);
							added = true;
						}
					}
				}
			}
		}

		// Fallback: add at layer 0 at next available position
		if (!added) {
			positions.push({ col: maxCol + 1, row: 0, layer: 0 });
		}
	}

	return positions;
}
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
