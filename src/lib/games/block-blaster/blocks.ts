import { BLOCKS_PER_SET, COLOR_COUNT, type BlockShape, type CellColor } from './types';

/**
 * All block shape templates — each is an array of [row, col] offsets.
 * Shapes are organized by category for readability.
 */
export const BLOCK_SHAPES: [number, number][][] = [
	// === Singles ===
	[[0, 0]],

	// === Horizontal bars ===
	[[0, 0], [0, 1]],
	[[0, 0], [0, 1], [0, 2]],
	[[0, 0], [0, 1], [0, 2], [0, 3]],
	[[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],

	// === Vertical bars ===
	[[0, 0], [1, 0]],
	[[0, 0], [1, 0], [2, 0]],
	[[0, 0], [1, 0], [2, 0], [3, 0]],
	[[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],

	// === Squares ===
	[[0, 0], [0, 1], [1, 0], [1, 1]],
	[[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]],

	// === L-shapes (small, 4 rotations) ===
	[[0, 0], [1, 0], [1, 1]],
	[[0, 0], [0, 1], [1, 0]],
	[[0, 0], [0, 1], [1, 1]],
	[[0, 1], [1, 0], [1, 1]],

	// === L-shapes (large, 4 rotations) ===
	[[0, 0], [1, 0], [2, 0], [2, 1]],
	[[0, 0], [0, 1], [0, 2], [1, 0]],
	[[0, 0], [0, 1], [1, 1], [2, 1]],
	[[0, 2], [1, 0], [1, 1], [1, 2]],

	// === Reverse L (large, 4 rotations) ===
	[[0, 0], [0, 1], [1, 0], [2, 0]],
	[[0, 0], [1, 0], [1, 1], [1, 2]],
	[[0, 1], [1, 1], [2, 0], [2, 1]],
	[[0, 0], [0, 1], [0, 2], [1, 2]],

	// === T-shapes (4 rotations) ===
	[[0, 0], [0, 1], [0, 2], [1, 1]],
	[[0, 0], [1, 0], [1, 1], [2, 0]],
	[[0, 1], [1, 0], [1, 1], [1, 2]],
	[[0, 1], [1, 0], [1, 1], [2, 1]],

	// === S/Z shapes ===
	[[0, 1], [0, 2], [1, 0], [1, 1]],
	[[0, 0], [0, 1], [1, 1], [1, 2]],
	[[0, 0], [1, 0], [1, 1], [2, 1]],
	[[0, 1], [1, 0], [1, 1], [2, 0]]
];

function randomColor(): CellColor {
	return (Math.floor(Math.random() * COLOR_COUNT) + 1) as CellColor;
}

function randomShape(): [number, number][] {
	return BLOCK_SHAPES[Math.floor(Math.random() * BLOCK_SHAPES.length)]
		.map(c => [...c] as [number, number]);
}

export function generateBlockSet(): BlockShape[] {
	const blocks: BlockShape[] = [];
	for (let i = 0; i < BLOCKS_PER_SET; i++) {
		blocks.push({
			cells: randomShape(),
			color: randomColor()
		});
	}
	return blocks;
}
