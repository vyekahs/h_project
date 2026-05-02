import { BOARD_SIZE, TILE_COLORS, TileType, type Board, type Tile, type MatchResult } from './types';

let nextId = 0;

export function resetIdCounter(start = 0) {
	nextId = start;
}

function randomColor(): number {
	return Math.floor(Math.random() * TILE_COLORS) + 1;
}

function createTile(color?: number): Tile {
	return { color: color ?? randomColor(), type: TileType.NORMAL, id: nextId++ };
}

export function createBoard(): Board {
	resetIdCounter();
	const board: Board = [];
	for (let r = 0; r < BOARD_SIZE; r++) {
		board[r] = [];
		for (let c = 0; c < BOARD_SIZE; c++) {
			board[r][c] = createTile();
		}
	}

	// Remove initial matches
	let hasMatch = true;
	while (hasMatch) {
		const result = findMatches(board);
		if (result.matchedCells.size === 0) {
			hasMatch = false;
		} else {
			for (const key of result.matchedCells) {
				const [r, c] = key.split(',').map(Number);
				board[r][c] = createTile();
			}
		}
	}

	// Ensure at least one valid move
	if (!hasValidMoves(board)) {
		shuffleBoard(board);
	}

	return board;
}

export function cloneBoard(board: Board): Board {
	return board.map(row => row.map(t => (t ? { ...t } : null)));
}

export function findMatches(board: Board): MatchResult {
	const matchedCells = new Set<string>();
	const hMatches: { cells: [number, number][]; length: number }[] = [];
	const vMatches: { cells: [number, number][]; length: number }[] = [];
	const cellInH = new Set<string>();
	const cellInV = new Set<string>();

	// Horizontal scan
	for (let r = 0; r < BOARD_SIZE; r++) {
		let c = 0;
		while (c < BOARD_SIZE) {
			const tile = board[r][c];
			if (!tile || tile.color === 0) { c++; continue; }

			let end = c + 1;
			while (end < BOARD_SIZE && board[r][end]?.color === tile.color) end++;
			const len = end - c;

			if (len >= 3) {
				const cells: [number, number][] = [];
				for (let i = c; i < end; i++) {
					const key = `${r},${i}`;
					matchedCells.add(key);
					cellInH.add(key);
					cells.push([r, i]);
				}
				hMatches.push({ cells, length: len });
			}
			c = end;
		}
	}

	// Vertical scan
	for (let c = 0; c < BOARD_SIZE; c++) {
		let r = 0;
		while (r < BOARD_SIZE) {
			const tile = board[r][c];
			if (!tile || tile.color === 0) { r++; continue; }

			let end = r + 1;
			while (end < BOARD_SIZE && board[end]?.[c]?.color === tile.color) end++;
			const len = end - r;

			if (len >= 3) {
				const cells: [number, number][] = [];
				for (let i = r; i < end; i++) {
					const key = `${i},${c}`;
					matchedCells.add(key);
					cellInV.add(key);
					cells.push([i, c]);
				}
				vMatches.push({ cells, length: len });
			}
			r = end;
		}
	}

	// Determine special tiles
	const specialTiles: MatchResult['specialTiles'] = [];
	const usedForSpecial = new Set<string>();

	// L/T shapes: intersection of H and V
	for (const key of cellInH) {
		if (cellInV.has(key)) {
			const [r, c] = key.split(',').map(Number);
			const color = board[r][c]?.color ?? 1;
			specialTiles.push({ row: r, col: c, type: TileType.BLAST, color });
			usedForSpecial.add(key);
		}
	}

	// 5+ match → RAINBOW
	const allRuns = [...hMatches, ...vMatches];
	for (const run of allRuns) {
		if (run.length >= 5) {
			// Place at middle of run
			const mid = Math.floor(run.cells.length / 2);
			const [mr, mc] = run.cells[mid];
			const mKey = `${mr},${mc}`;
			if (!usedForSpecial.has(mKey)) {
				const color = board[mr][mc]?.color ?? 1;
				specialTiles.push({ row: mr, col: mc, type: TileType.RAINBOW, color });
				usedForSpecial.add(mKey);
			}
		}
	}

	// 4 match → BOMB
	for (const run of allRuns) {
		if (run.length === 4) {
			const mid = Math.floor(run.cells.length / 2);
			const [mr, mc] = run.cells[mid];
			const mKey = `${mr},${mc}`;
			if (!usedForSpecial.has(mKey)) {
				const color = board[mr][mc]?.color ?? 1;
				specialTiles.push({ row: mr, col: mc, type: TileType.BOMB, color });
				usedForSpecial.add(mKey);
			}
		}
	}

	return { matchedCells, specialTiles, runs: allRuns };
}

export function removeMatches(board: Board, result: MatchResult): Board {
	const newBoard = cloneBoard(board);

	// Remove matched cells
	for (const key of result.matchedCells) {
		const [r, c] = key.split(',').map(Number);
		newBoard[r][c] = null;
	}

	// Create special tiles at their positions
	for (const sp of result.specialTiles) {
		newBoard[sp.row][sp.col] = {
			color: sp.color,
			type: sp.type,
			id: nextId++
		};
	}

	return newBoard;
}

export function activateSpecial(board: Board, row: number, col: number, matchColor: number): Set<string> {
	const tile = board[row][col];
	if (!tile) return new Set();

	const cleared = new Set<string>();

	switch (tile.type) {
		case TileType.BOMB:
			// Cross clear: entire row + column
			for (let i = 0; i < BOARD_SIZE; i++) {
				cleared.add(`${row},${i}`);
				cleared.add(`${i},${col}`);
			}
			break;

		case TileType.RAINBOW:
			// Clear all tiles of the matched color
			for (let r = 0; r < BOARD_SIZE; r++) {
				for (let c = 0; c < BOARD_SIZE; c++) {
					if (board[r][c]?.color === matchColor) {
						cleared.add(`${r},${c}`);
					}
				}
			}
			break;

		case TileType.BLAST:
			// 3x3 area
			for (let dr = -1; dr <= 1; dr++) {
				for (let dc = -1; dc <= 1; dc++) {
					const nr = row + dr;
					const nc = col + dc;
					if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
						cleared.add(`${nr},${nc}`);
					}
				}
			}
			break;
	}

	return cleared;
}

export function applyGravity(board: Board): Board {
	const newBoard = cloneBoard(board);

	for (let c = 0; c < BOARD_SIZE; c++) {
		let writeRow = BOARD_SIZE - 1;
		for (let r = BOARD_SIZE - 1; r >= 0; r--) {
			if (newBoard[r][c] !== null) {
				if (writeRow !== r) {
					newBoard[writeRow][c] = newBoard[r][c];
					newBoard[r][c] = null;
				}
				writeRow--;
			}
		}
	}

	return newBoard;
}

export function fillEmpty(board: Board): Board {
	const newBoard = cloneBoard(board);

	for (let c = 0; c < BOARD_SIZE; c++) {
		for (let r = 0; r < BOARD_SIZE; r++) {
			if (newBoard[r][c] === null) {
				newBoard[r][c] = createTile();
			}
		}
	}

	return newBoard;
}

export function isValidSwap(board: Board, r1: number, c1: number, r2: number, c2: number): boolean {
	if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return false;
	if (!board[r1][c1] || !board[r2][c2]) return false;

	// Temporarily swap
	const temp = cloneBoard(board);
	const t = temp[r1][c1];
	temp[r1][c1] = temp[r2][c2];
	temp[r2][c2] = t;

	const result = findMatches(temp);
	return result.matchedCells.size > 0;
}

export function swapTiles(board: Board, r1: number, c1: number, r2: number, c2: number): Board {
	const newBoard = cloneBoard(board);
	const t = newBoard[r1][c1];
	newBoard[r1][c1] = newBoard[r2][c2];
	newBoard[r2][c2] = t;
	return newBoard;
}

export function hasValidMoves(board: Board): boolean {
	for (let r = 0; r < BOARD_SIZE; r++) {
		for (let c = 0; c < BOARD_SIZE; c++) {
			// Try swap with right
			if (c + 1 < BOARD_SIZE && isValidSwap(board, r, c, r, c + 1)) return true;
			// Try swap with bottom
			if (r + 1 < BOARD_SIZE && isValidSwap(board, r, c, r + 1, c)) return true;
		}
	}
	return false;
}

export function shuffleBoard(board: Board): void {
	const tiles: Tile[] = [];
	for (let r = 0; r < BOARD_SIZE; r++) {
		for (let c = 0; c < BOARD_SIZE; c++) {
			if (board[r][c]) tiles.push(board[r][c]!);
		}
	}

	let attempts = 0;
	do {
		// Fisher-Yates shuffle
		for (let i = tiles.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[tiles[i], tiles[j]] = [tiles[j], tiles[i]];
		}

		let idx = 0;
		for (let r = 0; r < BOARD_SIZE; r++) {
			for (let c = 0; c < BOARD_SIZE; c++) {
				board[r][c] = tiles[idx++];
			}
		}
		attempts++;
	} while ((findMatches(board).matchedCells.size > 0 || !hasValidMoves(board)) && attempts < 100);
}

/** Flatten board to array for Svelte keyed rendering */
export function flattenBoard(board: Board): (Tile & { row: number; col: number })[] {
	const flat: (Tile & { row: number; col: number })[] = [];
	for (let r = 0; r < BOARD_SIZE; r++) {
		for (let c = 0; c < BOARD_SIZE; c++) {
			const tile = board[r][c];
			if (tile) {
				flat.push({ ...tile, row: r, col: c });
			}
		}
	}
	return flat;
}
