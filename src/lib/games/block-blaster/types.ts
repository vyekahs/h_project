export const GRID_SIZE = 8;
export const BLOCKS_PER_SET = 3;
export const COLOR_COUNT = 5;

/** 0 = empty, 1–5 = colored */
export type CellColor = 0 | 1 | 2 | 3 | 4 | 5;

export interface BlockShape {
	/** Relative [row, col] offsets from anchor (top-left of bounding box) */
	cells: [number, number][];
	color: CellColor;
}

/** 8×8 grid, grid[row][col] */
export type BoardGrid = CellColor[][];

