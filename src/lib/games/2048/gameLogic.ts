import { GRID_SIZE, type Board, type Tile, type Direction, type MoveResult } from './types';

/**
 * Create a fresh board with 2 random tiles.
 */
export function createBoard(): Board {
	const board: Board = { tiles: [], score: 0, nextId: 0 };
	addRandomTile(board);
	addRandomTile(board);
	return board;
}

/**
 * Deep-clone a board (tiles are new objects).
 */
export function cloneBoard(board: Board): Board {
	return {
		tiles: board.tiles.map(t => ({ ...t })),
		score: board.score,
		nextId: board.nextId
	};
}

/**
 * Get all empty cell coordinates.
 */
function getEmptyCells(board: Board): { row: number; col: number }[] {
	const occupied = new Set<string>();
	for (const t of board.tiles) {
		occupied.add(`${t.row},${t.col}`);
	}
	const empty: { row: number; col: number }[] = [];
	for (let r = 0; r < GRID_SIZE; r++) {
		for (let c = 0; c < GRID_SIZE; c++) {
			if (!occupied.has(`${r},${c}`)) {
				empty.push({ row: r, col: c });
			}
		}
	}
	return empty;
}

/**
 * Add a random tile (90% chance of 2, 10% chance of 4) to an empty cell.
 * Mutates the board in place. Returns the new tile or null if no space.
 */
export function addRandomTile(board: Board): Tile | null {
	const empty = getEmptyCells(board);
	if (empty.length === 0) return null;

	const cell = empty[Math.floor(Math.random() * empty.length)];
	const value = Math.random() < 0.9 ? 2 : 4;
	const tile: Tile = {
		id: board.nextId++,
		value,
		row: cell.row,
		col: cell.col
	};
	board.tiles.push(tile);
	return tile;
}

/**
 * Execute a move in the given direction.
 * Returns a new board (immutable) plus metadata.
 */
export function move(board: Board, direction: Direction): MoveResult {
	const newBoard = cloneBoard(board);
	let moved = false;
	let mergeScore = 0;

	// Determine traversal order
	const rows = Array.from({ length: GRID_SIZE }, (_, i) => i);
	const cols = Array.from({ length: GRID_SIZE }, (_, i) => i);

	if (direction === 'down') rows.reverse();
	if (direction === 'right') cols.reverse();

	// Track which tiles were produced by a merge this turn (can't merge again)
	const mergedThisTurn = new Set<number>();

	if (direction === 'left' || direction === 'right') {
		for (const row of rows) {
			const rowTiles = newBoard.tiles
				.filter(t => t.row === row)
				.sort((a, b) => direction === 'left' ? a.col - b.col : b.col - a.col);

			for (const tile of rowTiles) {
				const { finalCol, mergeTarget } = findTarget(
					newBoard, tile, 0, direction === 'left' ? -1 : 1, mergedThisTurn
				);

				if (mergeTarget) {
					// Merge
					mergeTarget.value *= 2;
					mergeScore += mergeTarget.value;
					mergedThisTurn.add(mergeTarget.id);
					newBoard.tiles = newBoard.tiles.filter(t => t.id !== tile.id);
					moved = true;
				} else if (tile.col !== finalCol) {
					tile.col = finalCol;
					moved = true;
				}
			}
		}
	} else {
		// up or down
		for (const col of cols) {
			const colTiles = newBoard.tiles
				.filter(t => t.col === col)
				.sort((a, b) => direction === 'up' ? a.row - b.row : b.row - a.row);

			for (const tile of colTiles) {
				const { finalRow, mergeTarget } = findTargetVertical(
					newBoard, tile, direction === 'up' ? -1 : 1, 0, mergedThisTurn
				);

				if (mergeTarget) {
					mergeTarget.value *= 2;
					mergeScore += mergeTarget.value;
					mergedThisTurn.add(mergeTarget.id);
					newBoard.tiles = newBoard.tiles.filter(t => t.id !== tile.id);
					moved = true;
				} else if (tile.row !== finalRow) {
					tile.row = finalRow;
					moved = true;
				}
			}
		}
	}

	newBoard.score += mergeScore;

	let spawnedTile: Tile | null = null;
	if (moved) {
		spawnedTile = addRandomTile(newBoard);
	}

	return { board: newBoard, moved, mergeScore, spawnedTile };
}

/**
 * Find target position for horizontal movement.
 */
function findTarget(
	board: Board,
	tile: Tile,
	_dRow: number,
	dCol: number,
	mergedThisTurn: Set<number>
): { finalCol: number; mergeTarget: Tile | null } {
	let col = tile.col + dCol;

	while (col >= 0 && col < GRID_SIZE) {
		const blocking = board.tiles.find(t => t.row === tile.row && t.col === col && t.id !== tile.id);
		if (blocking) {
			if (blocking.value === tile.value && !mergedThisTurn.has(blocking.id)) {
				return { finalCol: col, mergeTarget: blocking };
			}
			// Blocked — stop one before
			return { finalCol: col - dCol, mergeTarget: null };
		}
		col += dCol;
	}
	// Reached edge
	return { finalCol: col - dCol, mergeTarget: null };
}

/**
 * Find target position for vertical movement.
 */
function findTargetVertical(
	board: Board,
	tile: Tile,
	dRow: number,
	_dCol: number,
	mergedThisTurn: Set<number>
): { finalRow: number; mergeTarget: Tile | null } {
	let row = tile.row + dRow;

	while (row >= 0 && row < GRID_SIZE) {
		const blocking = board.tiles.find(t => t.col === tile.col && t.row === row && t.id !== tile.id);
		if (blocking) {
			if (blocking.value === tile.value && !mergedThisTurn.has(blocking.id)) {
				return { finalRow: row, mergeTarget: blocking };
			}
			return { finalRow: row - dRow, mergeTarget: null };
		}
		row += dRow;
	}
	return { finalRow: row - dRow, mergeTarget: null };
}

/**
 * Check if any valid move exists.
 */
export function canMove(board: Board): boolean {
	// If there are empty cells, a move is always possible
	if (board.tiles.length < GRID_SIZE * GRID_SIZE) return true;

	// Check adjacent tiles for same values
	for (const tile of board.tiles) {
		for (const other of board.tiles) {
			if (tile.id === other.id) continue;
			const rowDiff = Math.abs(tile.row - other.row);
			const colDiff = Math.abs(tile.col - other.col);
			if ((rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1)) {
				if (tile.value === other.value) return true;
			}
		}
	}
	return false;
}

/**
 * Get the maximum tile value on the board.
 */
export function getMaxTile(board: Board): number {
	if (board.tiles.length === 0) return 0;
	return Math.max(...board.tiles.map(t => t.value));
}
