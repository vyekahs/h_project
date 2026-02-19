export type Cell = {
	row: number;
	col: number;
	value: number | null;
	isFixed: boolean;
	notes: number[];
    isError?: boolean;
};

export type Board = Cell[][];

/**
 * Creates an empty 9x9 board
 */
export function createEmptyBoard(): number[][] {
	return Array.from({ length: 9 }, () => Array(9).fill(0));
}

/**
 * Checks if placements is valid according to Sudoku rules
 */
export function isValid(board: number[][], row: number, col: number, num: number): boolean {
	// Check row
	for (let i = 0; i < 9; i++) {
		if (board[row][i] === num) return false;
	}

	// Check col
	for (let i = 0; i < 9; i++) {
		if (board[i][col] === num) return false;
	}

	// Check 3x3 box
	const startRow = Math.floor(row / 3) * 3;
	const startCol = Math.floor(col / 3) * 3;
	for (let i = 0; i < 3; i++) {
		for (let j = 0; j < 3; j++) {
			if (board[startRow + i][startCol + j] === num) return false;
		}
	}

	return true;
}

/**
 * Solves the board using backtracking.
 * Returns true if solvable, false otherwise.
 * Modifies board in-place.
 */
export function solve(board: number[][]): boolean {
	for (let row = 0; row < 9; row++) {
		for (let col = 0; col < 9; col++) {
			if (board[row][col] === 0) {
				// Try numbers 1-9
				// Shuffle them to ensure randomness in generation
				const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5);

				for (const num of nums) {
					if (isValid(board, row, col, num)) {
						board[row][col] = num;
						if (solve(board)) return true;
						board[row][col] = 0;
					}
				}
				return false;
			}
		}
	}
	return true;
}

/**
 * Counts number of solutions.
 * limit is used to stop early if we know there are already too many solutions (e.g. > 1)
 */
function countSolutions(board: number[][], limit: number = 2): number {
	let count = 0;

	function backtrack(r: number, c: number) {
		if (count >= limit) return;

		let nextR = r;
		let nextC = c + 1;
		if (nextC === 9) {
			nextR = r + 1;
			nextC = 0;
		}

		if (r === 9) {
			count++;
			return;
		}

		if (board[r][c] !== 0) {
			backtrack(nextR, nextC);
			return;
		}

		for (let num = 1; num <= 9; num++) {
			if (isValid(board, r, c, num)) {
				board[r][c] = num;
				backtrack(nextR, nextC);
				board[r][c] = 0;
			}
		}
	}

	// Clone board to avoid mutation during counting
	const boardCopy = board.map((row) => [...row]);
	backtrack(0, 0);
	return count;
}

/**
 * Difficulty Analysis — Technique-based solver
 * 1 = Naked Singles (Easy)
 * 2 = Hidden Singles (Medium)
 * 3 = Naked Pairs/Triples + Pointing/Claiming (Hard)
 * 4 = Hidden Pairs/Triples (Expert)
 * 5 = X-Wing / Swordfish / XY-Wing (Master)
 * 6 = Unsolvable with implemented techniques
 *
 * IMPORTANT: Keep in sync with scripts/generateSudokuSeeds.mjs
 */

type CandidateGrid = Set<number>[][];
type Coord = { r: number; c: number };

function initCandidates(board: number[][]): CandidateGrid {
    const cands: CandidateGrid = Array.from({ length: 9 }, () =>
        Array.from({ length: 9 }, () => new Set<number>())
    );
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (board[r][c] === 0) {
                const present = new Set<number>();
                for (let i = 0; i < 9; i++) {
                    if (board[r][i] !== 0) present.add(board[r][i]);
                    if (board[i][c] !== 0) present.add(board[i][c]);
                }
                const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
                for (let dr = 0; dr < 3; dr++)
                    for (let dc = 0; dc < 3; dc++)
                        if (board[br + dr][bc + dc] !== 0) present.add(board[br + dr][bc + dc]);
                for (let n = 1; n <= 9; n++) if (!present.has(n)) cands[r][c].add(n);
            }
        }
    }
    return cands;
}

function placeNumber(board: number[][], cands: CandidateGrid, r: number, c: number, num: number) {
    board[r][c] = num;
    cands[r][c].clear();
    for (let i = 0; i < 9; i++) { cands[r][i].delete(num); cands[i][c].delete(num); }
    const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    for (let dr = 0; dr < 3; dr++)
        for (let dc = 0; dc < 3; dc++)
            cands[br + dr][bc + dc].delete(num);
}

function getHouses(): Coord[][] {
    const houses: Coord[][] = [];
    for (let r = 0; r < 9; r++) { const h: Coord[] = []; for (let c = 0; c < 9; c++) h.push({ r, c }); houses.push(h); }
    for (let c = 0; c < 9; c++) { const h: Coord[] = []; for (let r = 0; r < 9; r++) h.push({ r, c }); houses.push(h); }
    for (let br = 0; br < 9; br += 3)
        for (let bc = 0; bc < 9; bc += 3) {
            const h: Coord[] = [];
            for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) h.push({ r: br + dr, c: bc + dc });
            houses.push(h);
        }
    return houses;
}

function cellSees(a: Coord, b: Coord): boolean {
    if (a.r === b.r && a.c === b.c) return false;
    return a.r === b.r || a.c === b.c ||
        (Math.floor(a.r / 3) === Math.floor(b.r / 3) && Math.floor(a.c / 3) === Math.floor(b.c / 3));
}

// === Level 1: Naked Singles ===
function tryNakedSingles(board: number[][], cands: CandidateGrid): boolean {
    let found = false;
    for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++)
            if (board[r][c] === 0 && cands[r][c].size === 1) {
                placeNumber(board, cands, r, c, [...cands[r][c]][0]);
                found = true;
            }
    return found;
}

// === Level 2: Hidden Singles ===
function tryHiddenSingles(board: number[][], cands: CandidateGrid, houses: Coord[][]): boolean {
    let found = false;
    for (const house of houses) {
        for (let num = 1; num <= 9; num++) {
            const cells = house.filter(({ r, c }) => cands[r][c].has(num));
            if (cells.length === 1) {
                const { r, c } = cells[0];
                if (board[r][c] === 0) {
                    placeNumber(board, cands, r, c, num);
                    found = true;
                }
            }
        }
    }
    return found;
}

// === Level 3: Naked Pairs ===
function tryNakedPairs(cands: CandidateGrid, houses: Coord[][]): boolean {
    let eliminated = false;
    for (const house of houses) {
        const emptyCells = house.filter(({ r, c }) => cands[r][c].size === 2);
        for (let i = 0; i < emptyCells.length; i++) {
            for (let j = i + 1; j < emptyCells.length; j++) {
                const a = emptyCells[i], b = emptyCells[j];
                const sa = cands[a.r][a.c], sb = cands[b.r][b.c];
                if (sa.size !== 2 || sb.size !== 2) continue;
                const av = [...sa], bv = [...sb];
                if (av[0] !== bv[0] || av[1] !== bv[1]) continue;
                for (const { r, c } of house) {
                    if ((r === a.r && c === a.c) || (r === b.r && c === b.c)) continue;
                    for (const n of av) if (cands[r][c].delete(n)) eliminated = true;
                }
            }
        }
    }
    return eliminated;
}

// === Level 3: Naked Triples ===
function tryNakedTriples(cands: CandidateGrid, houses: Coord[][]): boolean {
    let eliminated = false;
    for (const house of houses) {
        const emptyCells = house.filter(({ r, c }) => cands[r][c].size >= 2 && cands[r][c].size <= 3);
        if (emptyCells.length < 3) continue;
        for (let i = 0; i < emptyCells.length; i++) {
            for (let j = i + 1; j < emptyCells.length; j++) {
                for (let k = j + 1; k < emptyCells.length; k++) {
                    const union = new Set<number>();
                    for (const n of cands[emptyCells[i].r][emptyCells[i].c]) union.add(n);
                    for (const n of cands[emptyCells[j].r][emptyCells[j].c]) union.add(n);
                    for (const n of cands[emptyCells[k].r][emptyCells[k].c]) union.add(n);
                    if (union.size !== 3) continue;
                    const tripleSet = new Set([emptyCells[i], emptyCells[j], emptyCells[k]]);
                    for (const { r, c } of house) {
                        if (tripleSet.has({ r, c })) continue;
                        if (r === emptyCells[i].r && c === emptyCells[i].c) continue;
                        if (r === emptyCells[j].r && c === emptyCells[j].c) continue;
                        if (r === emptyCells[k].r && c === emptyCells[k].c) continue;
                        for (const n of union) if (cands[r][c].delete(n)) eliminated = true;
                    }
                }
            }
        }
    }
    return eliminated;
}

// === Level 3: Pointing Pairs/Triples ===
function tryPointing(cands: CandidateGrid): boolean {
    let eliminated = false;
    for (let br = 0; br < 9; br += 3) {
        for (let bc = 0; bc < 9; bc += 3) {
            for (let num = 1; num <= 9; num++) {
                const cells: Coord[] = [];
                for (let dr = 0; dr < 3; dr++)
                    for (let dc = 0; dc < 3; dc++)
                        if (cands[br + dr][bc + dc].has(num)) cells.push({ r: br + dr, c: bc + dc });
                if (cells.length < 2) continue;
                // All in same row?
                if (cells.every(c => c.r === cells[0].r)) {
                    const row = cells[0].r;
                    for (let c = 0; c < 9; c++) {
                        if (c >= bc && c < bc + 3) continue;
                        if (cands[row][c].delete(num)) eliminated = true;
                    }
                }
                // All in same col?
                if (cells.every(c => c.c === cells[0].c)) {
                    const col = cells[0].c;
                    for (let r = 0; r < 9; r++) {
                        if (r >= br && r < br + 3) continue;
                        if (cands[r][col].delete(num)) eliminated = true;
                    }
                }
            }
        }
    }
    return eliminated;
}

// === Level 3: Claiming (Box/Line Reduction) ===
function tryClaiming(cands: CandidateGrid): boolean {
    let eliminated = false;
    // Row-based claiming
    for (let r = 0; r < 9; r++) {
        for (let num = 1; num <= 9; num++) {
            const cols: number[] = [];
            for (let c = 0; c < 9; c++) if (cands[r][c].has(num)) cols.push(c);
            if (cols.length < 2 || cols.length > 3) continue;
            const bc = Math.floor(cols[0] / 3) * 3;
            if (!cols.every(c => Math.floor(c / 3) * 3 === bc)) continue;
            const br = Math.floor(r / 3) * 3;
            for (let dr = 0; dr < 3; dr++) {
                const rr = br + dr;
                if (rr === r) continue;
                for (let dc = 0; dc < 3; dc++)
                    if (cands[rr][bc + dc].delete(num)) eliminated = true;
            }
        }
    }
    // Col-based claiming
    for (let c = 0; c < 9; c++) {
        for (let num = 1; num <= 9; num++) {
            const rows: number[] = [];
            for (let r = 0; r < 9; r++) if (cands[r][c].has(num)) rows.push(r);
            if (rows.length < 2 || rows.length > 3) continue;
            const br = Math.floor(rows[0] / 3) * 3;
            if (!rows.every(r => Math.floor(r / 3) * 3 === br)) continue;
            const bc = Math.floor(c / 3) * 3;
            for (let dc = 0; dc < 3; dc++) {
                const cc = bc + dc;
                if (cc === c) continue;
                for (let dr = 0; dr < 3; dr++)
                    if (cands[br + dr][cc].delete(num)) eliminated = true;
            }
        }
    }
    return eliminated;
}

// === Level 4: Hidden Pairs ===
function tryHiddenPairs(cands: CandidateGrid, houses: Coord[][]): boolean {
    let eliminated = false;
    for (const house of houses) {
        const numPositions = new Map<number, Coord[]>();
        for (let num = 1; num <= 9; num++) {
            const cells = house.filter(({ r, c }) => cands[r][c].has(num));
            if (cells.length >= 2 && cells.length <= 3) numPositions.set(num, cells);
        }
        const nums = [...numPositions.keys()];
        for (let i = 0; i < nums.length; i++) {
            for (let j = i + 1; j < nums.length; j++) {
                const posA = numPositions.get(nums[i])!;
                const posB = numPositions.get(nums[j])!;
                const combined = new Set<string>();
                for (const { r, c } of posA) combined.add(`${r},${c}`);
                for (const { r, c } of posB) combined.add(`${r},${c}`);
                if (combined.size !== 2) continue;
                const pairCells = [...combined].map(s => { const [r, c] = s.split(',').map(Number); return { r, c }; });
                const pairNums = new Set([nums[i], nums[j]]);
                for (const { r, c } of pairCells) {
                    for (const n of [...cands[r][c]]) {
                        if (!pairNums.has(n)) { cands[r][c].delete(n); eliminated = true; }
                    }
                }
            }
        }
    }
    return eliminated;
}

// === Level 4: Hidden Triples ===
function tryHiddenTriples(cands: CandidateGrid, houses: Coord[][]): boolean {
    let eliminated = false;
    for (const house of houses) {
        const numPositions = new Map<number, Coord[]>();
        for (let num = 1; num <= 9; num++) {
            const cells = house.filter(({ r, c }) => cands[r][c].has(num));
            if (cells.length >= 2 && cells.length <= 3) numPositions.set(num, cells);
        }
        const nums = [...numPositions.keys()];
        if (nums.length < 3) continue;
        for (let i = 0; i < nums.length; i++) {
            for (let j = i + 1; j < nums.length; j++) {
                for (let k = j + 1; k < nums.length; k++) {
                    const combined = new Set<string>();
                    for (const { r, c } of numPositions.get(nums[i])!) combined.add(`${r},${c}`);
                    for (const { r, c } of numPositions.get(nums[j])!) combined.add(`${r},${c}`);
                    for (const { r, c } of numPositions.get(nums[k])!) combined.add(`${r},${c}`);
                    if (combined.size !== 3) continue;
                    const tripleNums = new Set([nums[i], nums[j], nums[k]]);
                    const tripleCells = [...combined].map(s => { const [r, c] = s.split(',').map(Number); return { r, c }; });
                    for (const { r, c } of tripleCells) {
                        for (const n of [...cands[r][c]]) {
                            if (!tripleNums.has(n)) { cands[r][c].delete(n); eliminated = true; }
                        }
                    }
                }
            }
        }
    }
    return eliminated;
}

// === Level 5: X-Wing ===
function tryXWing(cands: CandidateGrid): boolean {
    let eliminated = false;
    for (let num = 1; num <= 9; num++) {
        // Row-based
        const rowPositions: { row: number; cols: number[] }[] = [];
        for (let r = 0; r < 9; r++) {
            const cols: number[] = [];
            for (let c = 0; c < 9; c++) if (cands[r][c].has(num)) cols.push(c);
            if (cols.length === 2) rowPositions.push({ row: r, cols });
        }
        for (let i = 0; i < rowPositions.length; i++) {
            for (let j = i + 1; j < rowPositions.length; j++) {
                const a = rowPositions[i], b = rowPositions[j];
                if (a.cols[0] === b.cols[0] && a.cols[1] === b.cols[1]) {
                    for (const col of a.cols) {
                        for (let r = 0; r < 9; r++) {
                            if (r === a.row || r === b.row) continue;
                            if (cands[r][col].delete(num)) eliminated = true;
                        }
                    }
                }
            }
        }
        // Col-based
        const colPositions: { col: number; rows: number[] }[] = [];
        for (let c = 0; c < 9; c++) {
            const rows: number[] = [];
            for (let r = 0; r < 9; r++) if (cands[r][c].has(num)) rows.push(r);
            if (rows.length === 2) colPositions.push({ col: c, rows });
        }
        for (let i = 0; i < colPositions.length; i++) {
            for (let j = i + 1; j < colPositions.length; j++) {
                const a = colPositions[i], b = colPositions[j];
                if (a.rows[0] === b.rows[0] && a.rows[1] === b.rows[1]) {
                    for (const row of a.rows) {
                        for (let c = 0; c < 9; c++) {
                            if (c === a.col || c === b.col) continue;
                            if (cands[row][c].delete(num)) eliminated = true;
                        }
                    }
                }
            }
        }
    }
    return eliminated;
}

// === Level 5: Swordfish ===
function trySwordfish(cands: CandidateGrid): boolean {
    let eliminated = false;
    for (let num = 1; num <= 9; num++) {
        // Row-based
        const rowPositions: { row: number; cols: number[] }[] = [];
        for (let r = 0; r < 9; r++) {
            const cols: number[] = [];
            for (let c = 0; c < 9; c++) if (cands[r][c].has(num)) cols.push(c);
            if (cols.length >= 2 && cols.length <= 3) rowPositions.push({ row: r, cols });
        }
        for (let i = 0; i < rowPositions.length; i++) {
            for (let j = i + 1; j < rowPositions.length; j++) {
                for (let k = j + 1; k < rowPositions.length; k++) {
                    const allCols = new Set<number>();
                    for (const c of rowPositions[i].cols) allCols.add(c);
                    for (const c of rowPositions[j].cols) allCols.add(c);
                    for (const c of rowPositions[k].cols) allCols.add(c);
                    if (allCols.size !== 3) continue;
                    const baseRows = new Set([rowPositions[i].row, rowPositions[j].row, rowPositions[k].row]);
                    for (const col of allCols) {
                        for (let r = 0; r < 9; r++) {
                            if (baseRows.has(r)) continue;
                            if (cands[r][col].delete(num)) eliminated = true;
                        }
                    }
                }
            }
        }
        // Col-based
        const colPositions: { col: number; rows: number[] }[] = [];
        for (let c = 0; c < 9; c++) {
            const rows: number[] = [];
            for (let r = 0; r < 9; r++) if (cands[r][c].has(num)) rows.push(r);
            if (rows.length >= 2 && rows.length <= 3) colPositions.push({ col: c, rows });
        }
        for (let i = 0; i < colPositions.length; i++) {
            for (let j = i + 1; j < colPositions.length; j++) {
                for (let k = j + 1; k < colPositions.length; k++) {
                    const allRows = new Set<number>();
                    for (const r of colPositions[i].rows) allRows.add(r);
                    for (const r of colPositions[j].rows) allRows.add(r);
                    for (const r of colPositions[k].rows) allRows.add(r);
                    if (allRows.size !== 3) continue;
                    const baseCols = new Set([colPositions[i].col, colPositions[j].col, colPositions[k].col]);
                    for (const row of allRows) {
                        for (let c = 0; c < 9; c++) {
                            if (baseCols.has(c)) continue;
                            if (cands[row][c].delete(num)) eliminated = true;
                        }
                    }
                }
            }
        }
    }
    return eliminated;
}

// === Level 5: XY-Wing ===
function tryXYWing(cands: CandidateGrid): boolean {
    let eliminated = false;
    const biValueCells: Coord[] = [];
    for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++)
            if (cands[r][c].size === 2) biValueCells.push({ r, c });

    for (const pivot of biValueCells) {
        const [a, b] = [...cands[pivot.r][pivot.c]];
        for (const w1 of biValueCells) {
            if (!cellSees(pivot, w1)) continue;
            const w1v = [...cands[w1.r][w1.c]];
            let shared1: number, other1: number;
            if (w1v.includes(a) && !w1v.includes(b)) { shared1 = a; other1 = w1v.find(n => n !== a)!; }
            else if (w1v.includes(b) && !w1v.includes(a)) { shared1 = b; other1 = w1v.find(n => n !== b)!; }
            else continue;

            const neededShared = shared1 === a ? b : a;
            for (const w2 of biValueCells) {
                if (w2.r === w1.r && w2.c === w1.c) continue;
                if (!cellSees(pivot, w2)) continue;
                const w2v = [...cands[w2.r][w2.c]];
                if (!w2v.includes(neededShared) || !w2v.includes(other1)) continue;
                // XY-Wing found: eliminate other1 from cells that see both w1 and w2
                for (let r = 0; r < 9; r++) {
                    for (let c = 0; c < 9; c++) {
                        if (r === w1.r && c === w1.c) continue;
                        if (r === w2.r && c === w2.c) continue;
                        if (r === pivot.r && c === pivot.c) continue;
                        if (!cands[r][c].has(other1)) continue;
                        if (cellSees({ r, c }, w1) && cellSees({ r, c }, w2)) {
                            cands[r][c].delete(other1);
                            eliminated = true;
                        }
                    }
                }
            }
        }
    }
    return eliminated;
}

// === Main Difficulty Analyzer ===
function analyzeDifficulty(boardInput: number[][]): number {
    const board = boardInput.map(r => [...r]);
    const cands = initCandidates(board);
    const houses = getHouses();
    let maxTechnique = 0;

    while (true) {
        // Level 1: Naked Singles
        if (tryNakedSingles(board, cands)) { maxTechnique = Math.max(maxTechnique, 1); continue; }
        // Level 2: Hidden Singles
        if (tryHiddenSingles(board, cands, houses)) { maxTechnique = Math.max(maxTechnique, 2); continue; }
        // Level 3: Naked Pairs/Triples + Pointing + Claiming
        if (tryNakedPairs(cands, houses) || tryNakedTriples(cands, houses) || tryPointing(cands) || tryClaiming(cands)) {
            maxTechnique = Math.max(maxTechnique, 3); continue;
        }
        // Level 4: Hidden Pairs/Triples
        if (tryHiddenPairs(cands, houses) || tryHiddenTriples(cands, houses)) {
            maxTechnique = Math.max(maxTechnique, 4); continue;
        }
        // Level 5: X-Wing / Swordfish / XY-Wing
        if (tryXWing(cands) || trySwordfish(cands) || tryXYWing(cands)) {
            maxTechnique = Math.max(maxTechnique, 5); continue;
        }
        // No progress
        let solved = true;
        for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (board[r][c] === 0) solved = false;
        if (!solved) return 6;
        break;
    }
    return maxTechnique || 0;
}

import { EASY_SEEDS, MEDIUM_SEEDS, HARD_SEEDS, EXPERT_SEEDS, MASTER_SEEDS } from './seeds';

const VALID_SEEDS_BY_DIFF = {
    easy: EASY_SEEDS,
    medium: MEDIUM_SEEDS,
    hard: HARD_SEEDS,
    expert: EXPERT_SEEDS,
    master: MASTER_SEEDS
};

/**
 * Transforms a board to create variety
 */
export function transformBoard(board: number[][]): number[][] {
    let newBoard = board.map(row => [...row]);

    // 1. Relabeling (Map 1-9 to random 1-9)
    const map = [1,2,3,4,5,6,7,8,9].sort(() => Math.random() - 0.5);
    for(let r=0; r<9; r++) {
        for(let c=0; c<9; c++) {
            if (newBoard[r][c] !== 0) {
                newBoard[r][c] = map[newBoard[r][c] - 1];
            }
        }
    }

    // 2. Rotation (0, 90, 180, 270)
    const rotations = Math.floor(Math.random() * 4);
    for(let i=0; i<rotations; i++) {
        const rotated = Array.from({length: 9}, () => Array(9).fill(0));
        for(let r=0; r<9; r++) {
            for(let c=0; c<9; c++) {
                rotated[c][8-r] = newBoard[r][c];
            }
        }
        newBoard = rotated;
    }

    // 3. Mirroring (Horizontal / Vertical)
    if (Math.random() > 0.5) {
        newBoard.reverse(); // Vertical flip
    }
    if (Math.random() > 0.5) {
        newBoard.forEach(row => row.reverse()); // Horizontal flip
    }

    // NOTE: Band/Stack 셔플링은 의도적으로 제외.
    // 밴드 내 행이나 스택 내 열을 섞으면 빈 칸의 위치가 변경되어
    // 퍼즐의 논리적 풀이 경로와 난이도가 달라질 수 있음.
    // 숫자 재배치(9!) × 회전(4) × 거울(4) = 1,451,520가지 변형으로 충분한 다양성 확보.

    return newBoard;
}

/**
 * Generates a playable Sudoku board
 * difficulty: 'easy' | 'medium' | 'hard' | 'expert' | 'master'
 */
export function generateSudoku(difficulty: 'easy' | 'medium' | 'hard' | 'expert' | 'master' = 'medium'): {
	initialBoard: Board;
	solution: number[][];
} {
    // 1. Select a Seed
    const seeds = VALID_SEEDS_BY_DIFF[difficulty] || MEDIUM_SEEDS;
    const seedString = seeds[Math.floor(Math.random() * seeds.length)];

    // 2. Convert Seed String (or array) to 2D Array
    let seedBoard: number[][] = [];
    if (typeof seedString === 'string') {
        // Handle "000...000" or simple strings
        const cleaned = seedString.replace(/[^0-9]/g, '').replace(/\./g, '0');
        for(let i=0; i<9; i++) {
            const row: number[] = [];
            for(let j=0; j<9; j++) {
                row.push(parseInt(cleaned[i*9 + j] || '0'));
            }
            seedBoard.push(row);
        }
    } else {
        // Fallback if we added array seeds
        const flat = seedString as number[];
        for(let i=0; i<9; i++) {
            seedBoard.push(flat.slice(i*9, (i+1)*9));
        }
    }

    // 3. Transform to create variety
    const puzzle = transformBoard(seedBoard);
    
    // 4. Solve to get the full solution
    const solutionBoard = puzzle.map(row => [...row]);
    solve(solutionBoard);

	// 5. Convert to Cell objects
	const initialBoard: Board = puzzle.map((row, rIdx) =>
		row.map((val, cIdx) => ({
			row: rIdx,
			col: cIdx,
			value: val === 0 ? null : val,
			isFixed: val !== 0,
			notes: []
		}))
	);

	return { initialBoard, solution: solutionBoard };
}
