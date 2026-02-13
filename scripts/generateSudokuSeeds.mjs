/**
 * Sudoku Seed Generator
 *
 * Generates pre-verified sudoku puzzles classified by difficulty.
 * Difficulty is determined by solving technique analysis:
 *   1 = Easy (Naked Singles only)
 *   2 = Medium (Hidden Singles needed)
 *   3 = Hard (solver gets stuck - needs advanced techniques)
 *
 * Hard/Expert/Master are differentiated by empty cell count:
 *   Easy:   ~39 empty cells
 *   Medium: ~49 empty cells
 *   Hard:   ~55 empty cells
 *   Expert: ~57 empty cells
 *   Master: ~59 empty cells
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

// Empty cell targets per difficulty
const EMPTY_CELL_TARGETS = {
    easy:   { min: 36, max: 42 },
    medium: { min: 46, max: 52 },
    hard:   { min: 53, max: 56 },
    expert: { min: 56, max: 59 },
    master: { min: 58, max: 62 },
};

// Required technique level (from analyzeDifficulty)
const REQUIRED_TECHNIQUE = {
    easy:   1,  // Naked Singles only
    medium: 2,  // Hidden Singles needed
    hard:   3,  // Gets stuck (advanced techniques needed)
    expert: 3,
    master: 3,
};

const MAX_ATTEMPTS_PER_SEED = 500;

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
// Difficulty Analyzer (matches logic.ts analyzeDifficulty)
// ============================================================

function getCandidates(board, r, c) {
    if (board[r][c] !== 0) return [];
    const present = new Set();
    for (let i = 0; i < 9; i++) {
        if (board[r][i] !== 0) present.add(board[r][i]);
        if (board[i][c] !== 0) present.add(board[i][c]);
    }
    const startRow = Math.floor(r / 3) * 3;
    const startCol = Math.floor(c / 3) * 3;
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            const val = board[startRow + i][startCol + j];
            if (val !== 0) present.add(val);
        }
    }
    const candidates = [];
    for (let i = 1; i <= 9; i++) if (!present.has(i)) candidates.push(i);
    return candidates;
}

function analyzeDifficulty(boardInput) {
    const board = boardInput.map(r => [...r]);
    let maxTechnique = 0;
    let stuck = false;

    while (true) {
        let madeProgress = false;

        // 1. Naked Singles
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (board[r][c] === 0) {
                    const cands = getCandidates(board, r, c);
                    if (cands.length === 1) {
                        board[r][c] = cands[0];
                        madeProgress = true;
                        maxTechnique = Math.max(maxTechnique, 1);
                    }
                }
            }
        }
        if (madeProgress) continue;

        // 2. Hidden Singles - Rows
        for (let r = 0; r < 9; r++) {
            const counts = Array(10).fill(0);
            const positions = Array(10).fill(null).map(() => []);
            for (let c = 0; c < 9; c++) {
                if (board[r][c] === 0) {
                    const cands = getCandidates(board, r, c);
                    cands.forEach(num => { counts[num]++; positions[num].push(c); });
                }
            }
            for (let num = 1; num <= 9; num++) {
                if (counts[num] === 1) {
                    board[r][positions[num][0]] = num;
                    madeProgress = true;
                    maxTechnique = Math.max(maxTechnique, 2);
                }
            }
        }
        if (madeProgress) continue;

        // 2b. Hidden Singles - Cols
        for (let c = 0; c < 9; c++) {
            const counts = Array(10).fill(0);
            const positions = Array(10).fill(null).map(() => []);
            for (let r = 0; r < 9; r++) {
                if (board[r][c] === 0) {
                    const cands = getCandidates(board, r, c);
                    cands.forEach(num => { counts[num]++; positions[num].push(r); });
                }
            }
            for (let num = 1; num <= 9; num++) {
                if (counts[num] === 1) {
                    board[positions[num][0]][c] = num;
                    madeProgress = true;
                    maxTechnique = Math.max(maxTechnique, 2);
                }
            }
        }
        if (madeProgress) continue;

        // 2c. Hidden Singles - Boxes
        for (let boxR = 0; boxR < 9; boxR += 3) {
            for (let boxC = 0; boxC < 9; boxC += 3) {
                const counts = Array(10).fill(0);
                const positions = Array(10).fill(null).map(() => []);
                for (let dr = 0; dr < 3; dr++) {
                    for (let dc = 0; dc < 3; dc++) {
                        const r = boxR + dr, c = boxC + dc;
                        if (board[r][c] === 0) {
                            const cands = getCandidates(board, r, c);
                            cands.forEach(num => { counts[num]++; positions[num].push({ r, c }); });
                        }
                    }
                }
                for (let num = 1; num <= 9; num++) {
                    if (counts[num] === 1) {
                        const { r, c } = positions[num][0];
                        board[r][c] = num;
                        madeProgress = true;
                        maxTechnique = Math.max(maxTechnique, 2);
                    }
                }
            }
        }
        if (madeProgress) continue;

        // Stuck check
        let isSolved = true;
        for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (board[r][c] === 0) isSolved = false;
        if (!isSolved) stuck = true;
        break;
    }

    if (stuck) return 3;
    if (maxTechnique === 0) return 0;
    return maxTechnique;
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

        // Target empty cells: random within range
        const targetEmpty = target.min + Math.floor(Math.random() * (target.max - target.min + 1));

        // Randomly remove cells
        const allCells = [];
        for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) allCells.push({ r, c });
        allCells.sort(() => Math.random() - 0.5);

        let removed = 0;
        for (const { r, c } of allCells) {
            if (removed >= targetEmpty) break;

            const backup = puzzle[r][c];
            puzzle[r][c] = 0;

            // Check unique solution
            if (countSolutions(puzzle) !== 1) {
                puzzle[r][c] = backup;
                continue;
            }

            removed++;
        }

        // Check empty count is in range
        let emptyCount = 0;
        for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (puzzle[r][c] === 0) emptyCount++;
        if (emptyCount < target.min) continue;

        // Check difficulty matches
        const diff = analyzeDifficulty(puzzle);
        if (diff !== requiredTechnique) continue;

        // Encode as string
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
        const maxTotalAttempts = target * 100;

        console.log(`\nGenerating ${target} ${diff} seeds...`);

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

    // Summary
    console.log('\n=== Summary ===');
    for (const diff of difficulties) {
        console.log(`  ${diff}: ${results[diff].length} seeds`);
    }
}

main();
