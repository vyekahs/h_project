import { GRID_SIZE, type BoardGrid, type BlockShape, type CellColor } from './types';

export function createEmptyGrid(): BoardGrid {
	return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0) as CellColor[]);
}

export function cloneGrid(grid: BoardGrid): BoardGrid {
	return grid.map(row => [...row]);
}

export function canPlaceBlock(grid: BoardGrid, block: BlockShape, row: number, col: number): boolean {
	for (const [dr, dc] of block.cells) {
		const r = row + dr;
		const c = col + dc;
		if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
		if (grid[r][c] !== 0) return false;
	}
	return true;
}

export function placeBlock(grid: BoardGrid, block: BlockShape, row: number, col: number): BoardGrid {
	const newGrid = cloneGrid(grid);
	for (const [dr, dc] of block.cells) {
		newGrid[row + dr][col + dc] = block.color;
	}
	return newGrid;
}

export function findCompletedLines(grid: BoardGrid): { rows: number[]; cols: number[] } {
	const rows: number[] = [];
	const cols: number[] = [];

	for (let r = 0; r < GRID_SIZE; r++) {
		if (grid[r].every(c => c !== 0)) {
			rows.push(r);
		}
	}

	for (let c = 0; c < GRID_SIZE; c++) {
		let full = true;
		for (let r = 0; r < GRID_SIZE; r++) {
			if (grid[r][c] === 0) {
				full = false;
				break;
			}
		}
		if (full) cols.push(c);
	}

	return { rows, cols };
}

export function clearLines(grid: BoardGrid, rows: number[], cols: number[]): BoardGrid {
	const newGrid = cloneGrid(grid);
	for (const r of rows) {
		for (let c = 0; c < GRID_SIZE; c++) {
			newGrid[r][c] = 0;
		}
	}
	for (const c of cols) {
		for (let r = 0; r < GRID_SIZE; r++) {
			newGrid[r][c] = 0;
		}
	}
	return newGrid;
}

export function calculateScore(cellCount: number, linesCleared: number, combo: number): number {
	let points = cellCount;
	if (linesCleared > 0) {
		points += linesCleared * linesCleared * 10;
		points += combo * 5;
	}
	return points;
}

export function canPlaceAnyBlock(grid: BoardGrid, blocks: (BlockShape | null)[]): boolean {
	for (const block of blocks) {
		if (!block) continue;
		for (let r = 0; r < GRID_SIZE; r++) {
			for (let c = 0; c < GRID_SIZE; c++) {
				if (canPlaceBlock(grid, block, r, c)) return true;
			}
		}
	}
	return false;
}
