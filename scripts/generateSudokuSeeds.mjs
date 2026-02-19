/**
 * Sudoku Seed Generator
 *
 * Generates pre-verified sudoku puzzles classified by difficulty.
 * Difficulty is determined by solving technique analysis:
 *   1 = Easy (Naked Singles only)
 *   2 = Medium (Hidden Singles needed)
 *   3 = Hard (Naked Pairs/Triples + Pointing/Claiming)
 *   4 = Expert (Hidden Pairs/Triples)
 *   5 = Master (X-Wing / Swordfish / XY-Wing)
 *
 * IMPORTANT: Keep analyzeDifficulty in sync with src/lib/games/sudoku/logic.ts
 *
 * Usage: node scripts/generateSudokuSeeds.mjs
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================
// Configuration
// ============================================================

const SEED_COUNTS = {
    easy: 50,
    medium: 50,
    hard: 50,
    expert: 50,
    master: 50,
};

const EMPTY_CELL_TARGETS = {
    easy:   { min: 36, max: 42 },
    medium: { min: 46, max: 52 },
    hard:   { min: 50, max: 56 },
    expert: { min: 52, max: 58 },
    master: { min: 54, max: 62 },
};

const REQUIRED_TECHNIQUE = {
    easy:   1,
    medium: 2,
    hard:   3,
    expert: 4,
    master: 5,
};

const MAX_ATTEMPTS_PER_SEED = 2000;

// ============================================================
// Sudoku Logic
// ============================================================

function createEmptyBoard() {
    return Array.from({ length: 9 }, () => Array(9).fill(0));
}

function isValid(board, row, col, num) {
    for (let i = 0; i < 9; i++) {
        if (board[row][i] === num) return false;
    }
    for (let i = 0; i < 9; i++) {
        if (board[i][col] === num) return false;
    }
    const startRow = Math.floor(row / 3) * 3;
    const startCol = Math.floor(col / 3) * 3;
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            if (board[startRow + i][startCol + j] === num) return false;
        }
    }
    return true;
}

function solve(board) {
    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
            if (board[row][col] === 0) {
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

function countSolutions(board, limit = 2) {
    let count = 0;
    const b = board.map(r => [...r]);

    function backtrack(r, c) {
        if (count >= limit) return;
        let nextR = r, nextC = c + 1;
        if (nextC === 9) { nextR = r + 1; nextC = 0; }
        if (r === 9) { count++; return; }
        if (b[r][c] !== 0) { backtrack(nextR, nextC); return; }
        for (let num = 1; num <= 9; num++) {
            if (isValid(b, r, c, num)) {
                b[r][c] = num;
                backtrack(nextR, nextC);
                b[r][c] = 0;
            }
        }
    }

    backtrack(0, 0);
    return count;
}

// ============================================================
// Technique-based Difficulty Analyzer
// Matches logic.ts analyzeDifficulty exactly
// ============================================================

function initCandidates(board) {
    const cands = Array.from({ length: 9 }, () =>
        Array.from({ length: 9 }, () => new Set())
    );
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (board[r][c] === 0) {
                const present = new Set();
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

function placeNumber(board, cands, r, c, num) {
    board[r][c] = num;
    cands[r][c].clear();
    for (let i = 0; i < 9; i++) { cands[r][i].delete(num); cands[i][c].delete(num); }
    const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    for (let dr = 0; dr < 3; dr++)
        for (let dc = 0; dc < 3; dc++)
            cands[br + dr][bc + dc].delete(num);
}

function getHouses() {
    const houses = [];
    for (let r = 0; r < 9; r++) { const h = []; for (let c = 0; c < 9; c++) h.push({ r, c }); houses.push(h); }
    for (let c = 0; c < 9; c++) { const h = []; for (let r = 0; r < 9; r++) h.push({ r, c }); houses.push(h); }
    for (let br = 0; br < 9; br += 3)
        for (let bc = 0; bc < 9; bc += 3) {
            const h = [];
            for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) h.push({ r: br + dr, c: bc + dc });
            houses.push(h);
        }
    return houses;
}

function cellSees(a, b) {
    if (a.r === b.r && a.c === b.c) return false;
    return a.r === b.r || a.c === b.c ||
        (Math.floor(a.r / 3) === Math.floor(b.r / 3) && Math.floor(a.c / 3) === Math.floor(b.c / 3));
}

// Level 1: Naked Singles
function tryNakedSingles(board, cands) {
    let found = false;
    for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++)
            if (board[r][c] === 0 && cands[r][c].size === 1) {
                placeNumber(board, cands, r, c, [...cands[r][c]][0]);
                found = true;
            }
    return found;
}

// Level 2: Hidden Singles
function tryHiddenSingles(board, cands, houses) {
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

// Level 3: Naked Pairs
function tryNakedPairs(cands, houses) {
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

// Level 3: Naked Triples
function tryNakedTriples(cands, houses) {
    let eliminated = false;
    for (const house of houses) {
        const emptyCells = house.filter(({ r, c }) => cands[r][c].size >= 2 && cands[r][c].size <= 3);
        if (emptyCells.length < 3) continue;
        for (let i = 0; i < emptyCells.length; i++) {
            for (let j = i + 1; j < emptyCells.length; j++) {
                for (let k = j + 1; k < emptyCells.length; k++) {
                    const union = new Set();
                    for (const n of cands[emptyCells[i].r][emptyCells[i].c]) union.add(n);
                    for (const n of cands[emptyCells[j].r][emptyCells[j].c]) union.add(n);
                    for (const n of cands[emptyCells[k].r][emptyCells[k].c]) union.add(n);
                    if (union.size !== 3) continue;
                    for (const { r, c } of house) {
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

// Level 3: Pointing Pairs/Triples
function tryPointing(cands) {
    let eliminated = false;
    for (let br = 0; br < 9; br += 3) {
        for (let bc = 0; bc < 9; bc += 3) {
            for (let num = 1; num <= 9; num++) {
                const cells = [];
                for (let dr = 0; dr < 3; dr++)
                    for (let dc = 0; dc < 3; dc++)
                        if (cands[br + dr][bc + dc].has(num)) cells.push({ r: br + dr, c: bc + dc });
                if (cells.length < 2) continue;
                if (cells.every(c => c.r === cells[0].r)) {
                    const row = cells[0].r;
                    for (let c = 0; c < 9; c++) {
                        if (c >= bc && c < bc + 3) continue;
                        if (cands[row][c].delete(num)) eliminated = true;
                    }
                }
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

// Level 3: Claiming (Box/Line Reduction)
function tryClaiming(cands) {
    let eliminated = false;
    for (let r = 0; r < 9; r++) {
        for (let num = 1; num <= 9; num++) {
            const cols = [];
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
    for (let c = 0; c < 9; c++) {
        for (let num = 1; num <= 9; num++) {
            const rows = [];
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

// Level 4: Hidden Pairs
function tryHiddenPairs(cands, houses) {
    let eliminated = false;
    for (const house of houses) {
        const numPositions = new Map();
        for (let num = 1; num <= 9; num++) {
            const cells = house.filter(({ r, c }) => cands[r][c].has(num));
            if (cells.length >= 2 && cells.length <= 3) numPositions.set(num, cells);
        }
        const nums = [...numPositions.keys()];
        for (let i = 0; i < nums.length; i++) {
            for (let j = i + 1; j < nums.length; j++) {
                const posA = numPositions.get(nums[i]);
                const posB = numPositions.get(nums[j]);
                const combined = new Set();
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

// Level 4: Hidden Triples
function tryHiddenTriples(cands, houses) {
    let eliminated = false;
    for (const house of houses) {
        const numPositions = new Map();
        for (let num = 1; num <= 9; num++) {
            const cells = house.filter(({ r, c }) => cands[r][c].has(num));
            if (cells.length >= 2 && cells.length <= 3) numPositions.set(num, cells);
        }
        const nums = [...numPositions.keys()];
        if (nums.length < 3) continue;
        for (let i = 0; i < nums.length; i++) {
            for (let j = i + 1; j < nums.length; j++) {
                for (let k = j + 1; k < nums.length; k++) {
                    const combined = new Set();
                    for (const { r, c } of numPositions.get(nums[i])) combined.add(`${r},${c}`);
                    for (const { r, c } of numPositions.get(nums[j])) combined.add(`${r},${c}`);
                    for (const { r, c } of numPositions.get(nums[k])) combined.add(`${r},${c}`);
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

// Level 5: X-Wing
function tryXWing(cands) {
    let eliminated = false;
    for (let num = 1; num <= 9; num++) {
        const rowPositions = [];
        for (let r = 0; r < 9; r++) {
            const cols = [];
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
        const colPositions = [];
        for (let c = 0; c < 9; c++) {
            const rows = [];
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

// Level 5: Swordfish
function trySwordfish(cands) {
    let eliminated = false;
    for (let num = 1; num <= 9; num++) {
        const rowPositions = [];
        for (let r = 0; r < 9; r++) {
            const cols = [];
            for (let c = 0; c < 9; c++) if (cands[r][c].has(num)) cols.push(c);
            if (cols.length >= 2 && cols.length <= 3) rowPositions.push({ row: r, cols });
        }
        for (let i = 0; i < rowPositions.length; i++) {
            for (let j = i + 1; j < rowPositions.length; j++) {
                for (let k = j + 1; k < rowPositions.length; k++) {
                    const allCols = new Set();
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
        const colPositions = [];
        for (let c = 0; c < 9; c++) {
            const rows = [];
            for (let r = 0; r < 9; r++) if (cands[r][c].has(num)) rows.push(r);
            if (rows.length >= 2 && rows.length <= 3) colPositions.push({ col: c, rows });
        }
        for (let i = 0; i < colPositions.length; i++) {
            for (let j = i + 1; j < colPositions.length; j++) {
                for (let k = j + 1; k < colPositions.length; k++) {
                    const allRows = new Set();
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

// Level 5: XY-Wing
function tryXYWing(cands) {
    let eliminated = false;
    const biValueCells = [];
    for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++)
            if (cands[r][c].size === 2) biValueCells.push({ r, c });

    for (const pivot of biValueCells) {
        const [a, b] = [...cands[pivot.r][pivot.c]];
        for (const w1 of biValueCells) {
            if (!cellSees(pivot, w1)) continue;
            const w1v = [...cands[w1.r][w1.c]];
            let shared1, other1;
            if (w1v.includes(a) && !w1v.includes(b)) { shared1 = a; other1 = w1v.find(n => n !== a); }
            else if (w1v.includes(b) && !w1v.includes(a)) { shared1 = b; other1 = w1v.find(n => n !== b); }
            else continue;

            const neededShared = shared1 === a ? b : a;
            for (const w2 of biValueCells) {
                if (w2.r === w1.r && w2.c === w1.c) continue;
                if (!cellSees(pivot, w2)) continue;
                const w2v = [...cands[w2.r][w2.c]];
                if (!w2v.includes(neededShared) || !w2v.includes(other1)) continue;
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

// Main analyzer
function analyzeDifficulty(boardInput) {
    const board = boardInput.map(r => [...r]);
    const cands = initCandidates(board);
    const houses = getHouses();
    let maxTechnique = 0;

    while (true) {
        if (tryNakedSingles(board, cands)) { maxTechnique = Math.max(maxTechnique, 1); continue; }
        if (tryHiddenSingles(board, cands, houses)) { maxTechnique = Math.max(maxTechnique, 2); continue; }
        if (tryNakedPairs(cands, houses) || tryNakedTriples(cands, houses) || tryPointing(cands) || tryClaiming(cands)) {
            maxTechnique = Math.max(maxTechnique, 3); continue;
        }
        if (tryHiddenPairs(cands, houses) || tryHiddenTriples(cands, houses)) {
            maxTechnique = Math.max(maxTechnique, 4); continue;
        }
        if (tryXWing(cands) || trySwordfish(cands) || tryXYWing(cands)) {
            maxTechnique = Math.max(maxTechnique, 5); continue;
        }
        let solved = true;
        for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (board[r][c] === 0) solved = false;
        if (!solved) return 6;
        break;
    }
    return maxTechnique || 0;
}

// ============================================================
// Puzzle Generation
// ============================================================

function generateFullBoard() {
    const board = createEmptyBoard();
    solve(board);
    return board;
}

function generatePuzzle(difficulty) {
    const target = EMPTY_CELL_TARGETS[difficulty];
    const requiredTechnique = REQUIRED_TECHNIQUE[difficulty];

    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_SEED; attempt++) {
        const solution = generateFullBoard();
        const puzzle = solution.map(r => [...r]);

        const targetEmpty = target.min + Math.floor(Math.random() * (target.max - target.min + 1));

        const allCells = [];
        for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) allCells.push({ r, c });
        allCells.sort(() => Math.random() - 0.5);

        let removed = 0;
        for (const { r, c } of allCells) {
            if (removed >= targetEmpty) break;

            const backup = puzzle[r][c];
            puzzle[r][c] = 0;

            if (countSolutions(puzzle) !== 1) {
                puzzle[r][c] = backup;
                continue;
            }

            removed++;
        }

        let emptyCount = 0;
        for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (puzzle[r][c] === 0) emptyCount++;
        if (emptyCount < target.min) continue;

        const diff = analyzeDifficulty(puzzle);
        if (diff !== requiredTechnique) continue;

        let seedStr = '';
        for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) seedStr += puzzle[r][c];

        return { seed: seedStr, emptyCells: emptyCount };
    }

    return null;
}

// ============================================================
// Main
// ============================================================

function main() {
    const results = {};
    const difficulties = ['easy', 'medium', 'hard', 'expert', 'master'];

    for (const diff of difficulties) {
        results[diff] = [];
        const target = SEED_COUNTS[diff];
        let attempts = 0;
        const maxTotalAttempts = target * 500;

        console.log(`\nGenerating ${target} ${diff} seeds (technique level ${REQUIRED_TECHNIQUE[diff]})...`);

        while (results[diff].length < target && attempts < maxTotalAttempts) {
            attempts++;
            const result = generatePuzzle(diff);
            if (result) {
                results[diff].push(result.seed);
                process.stdout.write(`  [${results[diff].length}/${target}] (${result.emptyCells} empty cells)\r`);
            }
        }

        console.log(`  ${diff}: ${results[diff].length}/${target} seeds generated (${attempts} attempts)`);
    }

    // Write output file
    const timestamp = new Date().toISOString();
    let output = `\n// Auto-generated Sudoku Seed Library\n`;
    output += `// Generated at: ${timestamp}\n`;
    output += `// DO NOT EDIT - regenerate with: node scripts/generateSudokuSeeds.mjs\n\n`;

    const exportNames = {
        easy: 'EASY_SEEDS',
        medium: 'MEDIUM_SEEDS',
        hard: 'HARD_SEEDS',
        expert: 'EXPERT_SEEDS',
        master: 'MASTER_SEEDS',
    };

    for (const diff of difficulties) {
        output += `export const ${exportNames[diff]} = [\n`;
        for (const seed of results[diff]) {
            output += `    "${seed}",\n`;
        }
        output += `];\n\n`;
    }

    const outPath = join(__dirname, '..', 'src', 'lib', 'games', 'sudoku', 'seeds.ts');
    writeFileSync(outPath, output);
    console.log(`\nWritten to: ${outPath}`);

    console.log('\n=== Summary ===');
    for (const diff of difficulties) {
        console.log(`  ${diff}: ${results[diff].length} seeds`);
    }
}

main();
