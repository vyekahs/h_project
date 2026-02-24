/**
 * Killer Sudoku Seed Generator
 *
 * Generates pre-verified unique killer sudoku puzzles and saves them as seeds.
 * Uses an optimized solver with MRV heuristic + constraint propagation.
 *
 * Usage: node scripts/generateKillerSeeds.mjs
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================
// Base Sudoku Logic (from logic.ts)
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

function transformBoard(board) {
    let newBoard = board.map(row => [...row]);

    const map = [1,2,3,4,5,6,7,8,9].sort(() => Math.random() - 0.5);
    for(let r=0; r<9; r++) {
        for(let c=0; c<9; c++) {
            if (newBoard[r][c] !== 0) {
                newBoard[r][c] = map[newBoard[r][c] - 1];
            }
        }
    }

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

    if (Math.random() > 0.5) {
        newBoard.reverse();
    }
    if (Math.random() > 0.5) {
        newBoard.forEach(row => row.reverse());
    }

    for (let b=0; b<3; b++) {
        if (Math.random() > 0.5) {
            const rows = [0,1,2].sort(() => Math.random() - 0.5);
            const bandStart = b * 3;
            const bandRows = [newBoard[bandStart], newBoard[bandStart+1], newBoard[bandStart+2]];
            newBoard[bandStart] = bandRows[rows[0]];
            newBoard[bandStart+1] = bandRows[rows[1]];
            newBoard[bandStart+2] = bandRows[rows[2]];
        }
    }

    for (let s=0; s<3; s++) {
        if (Math.random() > 0.5) {
            const cols = [0,1,2].sort(() => Math.random() - 0.5);
            const stackStart = s * 3;
            const oldBoard = newBoard.map(row => [...row]);
            for(let r=0; r<9; r++) {
                newBoard[r][stackStart] = oldBoard[r][stackStart + cols[0]];
                newBoard[r][stackStart+1] = oldBoard[r][stackStart + cols[1]];
                newBoard[r][stackStart+2] = oldBoard[r][stackStart + cols[2]];
            }
        }
    }

    return newBoard;
}

// ============================================================
// Cage Generation (from killerLogic.ts)
// ============================================================

const CAGE_SIZE_WEIGHTS = {
    easy:   [2, 40, 40, 18, 0,  0],
    medium: [1, 25, 35, 30, 9,  0],
    hard:   [1, 15, 25, 30, 22, 7],
    expert: [2, 35, 35, 20, 8,  0],
    master: [2, 30, 35, 23, 10, 0],
};

function pickCageSize(difficulty) {
    const weights = CAGE_SIZE_WEIGHTS[difficulty];
    const total = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
        rand -= weights[i];
        if (rand <= 0) return i + 1;
    }
    return 2;
}

function getNeighbors(row, col) {
    const neighbors = [];
    if (row > 0) neighbors.push({ row: row - 1, col });
    if (row < 8) neighbors.push({ row: row + 1, col });
    if (col > 0) neighbors.push({ row, col: col - 1 });
    if (col < 8) neighbors.push({ row, col: col + 1 });
    return neighbors;
}

function generateCages(solution, difficulty) {
    const visited = Array.from({ length: 9 }, () => Array(9).fill(false));
    const cages = [];
    let cageId = 0;

    const allCells = [];
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            allCells.push({ row: r, col: c });
        }
    }
    allCells.sort(() => Math.random() - 0.5);

    for (const startCell of allCells) {
        if (visited[startCell.row][startCell.col]) continue;

        const targetSize = pickCageSize(difficulty);
        const cageCells = [startCell];
        visited[startCell.row][startCell.col] = true;

        while (cageCells.length < targetSize) {
            const frontier = [];
            for (const cell of cageCells) {
                for (const n of getNeighbors(cell.row, cell.col)) {
                    if (!visited[n.row][n.col] && !frontier.some(f => f.row === n.row && f.col === n.col)) {
                        frontier.push(n);
                    }
                }
            }
            if (frontier.length === 0) break;
            const next = frontier[Math.floor(Math.random() * frontier.length)];
            cageCells.push(next);
            visited[next.row][next.col] = true;
        }

        const sum = cageCells.reduce((acc, c) => acc + solution[c.row][c.col], 0);
        cages.push({ id: cageId++, cells: cageCells, sum });
    }

    return cages;
}

// ============================================================
// Optimized Solver with MRV + Constraint Propagation
// ============================================================

function buildCageMap(cages) {
    const map = Array.from({ length: 9 }, () => Array(9).fill(null));
    for (const cage of cages) {
        for (const { row, col } of cage.cells) {
            map[row][col] = cage;
        }
    }
    return map;
}

function getKillerCandidates(board, cageMap, row, col) {
    if (board[row][col] !== 0) return [];

    const excluded = new Set();
    for (let i = 0; i < 9; i++) {
        if (board[row][i] !== 0) excluded.add(board[row][i]);
        if (board[i][col] !== 0) excluded.add(board[i][col]);
    }
    const boxR = Math.floor(row / 3) * 3;
    const boxC = Math.floor(col / 3) * 3;
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            const v = board[boxR + i][boxC + j];
            if (v !== 0) excluded.add(v);
        }
    }

    const cage = cageMap[row][col];
    if (!cage) {
        const candidates = [];
        for (let n = 1; n <= 9; n++) {
            if (!excluded.has(n)) candidates.push(n);
        }
        return candidates;
    }

    let filledSum = 0;
    let emptyCount = 0;
    for (const cell of cage.cells) {
        if (cell.row === row && cell.col === col) continue;
        const v = board[cell.row][cell.col];
        if (v !== 0) {
            filledSum += v;
            excluded.add(v);
        } else {
            emptyCount++;
        }
    }

    const remainingSum = cage.sum - filledSum;

    const candidates = [];
    for (let n = 1; n <= 9; n++) {
        if (excluded.has(n)) continue;

        const afterPlacing = remainingSum - n;
        if (afterPlacing < 0) continue;

        if (emptyCount === 0) {
            // Last empty cell in cage
            if (afterPlacing !== 0) continue;
        } else {
            // Check if remaining cells can achieve afterPlacing
            if (afterPlacing < emptyCount) continue;
            // Tighter upper bound: max from remaining available values
            if (afterPlacing > emptyCount * 9) continue;
        }

        candidates.push(n);
    }
    return candidates;
}

function countKillerSolutionsOptimized(board, cages, limit = 2) {
    let count = 0;
    const simpleBoard = board.map(row => [...row]);
    const cageMap = buildCageMap(cages);
    let ops = 0;
    const MAX_OPS = 5_000_000;

    function findMRVCell() {
        let best = null;
        let bestCount = 10;

        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (simpleBoard[r][c] !== 0) continue;
                const cands = getKillerCandidates(simpleBoard, cageMap, r, c);
                if (cands.length === 0) return { row: r, col: c, candidates: [] };
                if (cands.length < bestCount) {
                    bestCount = cands.length;
                    best = { row: r, col: c, candidates: cands };
                    if (bestCount === 1) return best;
                }
            }
        }
        return best;
    }

    function propagateNakedSingles() {
        const placed = [];
        let changed = true;

        while (changed) {
            changed = false;
            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 9; c++) {
                    if (simpleBoard[r][c] !== 0) continue;
                    const cands = getKillerCandidates(simpleBoard, cageMap, r, c);
                    if (cands.length === 0) return { placed, contradiction: true };
                    if (cands.length === 1) {
                        simpleBoard[r][c] = cands[0];
                        placed.push({ r, c });
                        changed = true;
                    }
                }
            }
        }
        return { placed, contradiction: false };
    }

    function backtrack() {
        ops++;
        if (ops > MAX_OPS) return true;

        // Propagate forced cells
        const { placed, contradiction } = propagateNakedSingles();

        if (contradiction) {
            for (const p of placed) simpleBoard[p.r][p.c] = 0;
            return false;
        }

        const mrv = findMRVCell();
        if (mrv === null) {
            count++;
            for (const p of placed) simpleBoard[p.r][p.c] = 0;
            return count >= limit;
        }

        if (mrv.candidates.length === 0) {
            for (const p of placed) simpleBoard[p.r][p.c] = 0;
            return false;
        }

        const { row, col, candidates } = mrv;
        for (const num of candidates) {
            simpleBoard[row][col] = num;
            if (backtrack()) {
                simpleBoard[row][col] = 0;
                for (const p of placed) simpleBoard[p.r][p.c] = 0;
                return true;
            }
            simpleBoard[row][col] = 0;
        }

        for (const p of placed) simpleBoard[p.r][p.c] = 0;
        return false;
    }

    backtrack();
    if (ops > MAX_OPS) return 2;
    return count;
}

// ============================================================
// Puzzle Generation (with optimized solver)
// ============================================================

function generateOnePuzzle(difficulty) {
    const MAX_ATTEMPTS = 100;

    // Generate solution once
    const emptyBoard = createEmptyBoard();
    solve(emptyBoard);
    const solution = transformBoard(emptyBoard);

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const cages = generateCages(solution, difficulty);

        // Verify uniqueness with 0 reveals (cage constraints only)
        // This ensures the puzzle has exactly one solution for all difficulties
        const emptySimple = Array.from({ length: 9 }, () => Array(9).fill(0));
        const solutions = countKillerSolutionsOptimized(emptySimple, cages, 2);

        if (solutions === 1) {
            return { solution, cages };
        }
    }

    return null; // Failed
}

// ============================================================
// Seed Encoding
// ============================================================

// Encode cage IDs: 0-9 a-z A-Z (max 62 cages, typical is 15-25)
const CAGE_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function encodeSeed(solution, cages) {
    // Solution string
    const solStr = solution.flat().join('');

    // Build cage ID map
    const cageIdMap = Array.from({ length: 9 }, () => Array(9).fill(-1));
    for (let i = 0; i < cages.length; i++) {
        for (const { row, col } of cages[i].cells) {
            cageIdMap[row][col] = i;
        }
    }

    // Cage map string
    const cageStr = cageIdMap.flat().map(id => CAGE_CHARS[id]).join('');

    // Sums array
    const sums = cages.map(c => c.sum);

    return { solution: solStr, cageMap: cageStr, sums };
}

// ============================================================
// Main Generation Loop
// ============================================================

const SEED_COUNTS = {
    easy: 1000,
    medium: 500,
    hard: 300,
    expert: 500,
    master: 300,
};

const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert', 'master'];

async function main() {
    console.log('=== Killer Sudoku Seed Generator ===\n');

    const allSeeds = {};

    for (const diff of DIFFICULTIES) {
        const target = SEED_COUNTS[diff];
        const seeds = [];
        let failures = 0;

        console.log(`\n[${diff.toUpperCase()}] Generating ${target} seeds...`);
        const startTime = Date.now();

        for (let i = 0; i < target; i++) {
            const result = generateOnePuzzle(diff);

            if (result) {
                seeds.push(encodeSeed(result.solution, result.cages));
            } else {
                failures++;
                i--; // Retry
                if (failures > target * 2) {
                    console.log(`  Too many failures (${failures}), stopping at ${seeds.length} seeds`);
                    break;
                }
            }

            if ((i + 1) % 10 === 0 || i + 1 === target) {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                const rate = ((i + 1) / ((Date.now() - startTime) / 1000)).toFixed(1);
                console.log(`  ${i + 1}/${target} generated (${elapsed}s, ${rate}/s, ${failures} failures)`);
            }
        }

        allSeeds[diff] = seeds;
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[${diff.toUpperCase()}] Done: ${seeds.length} seeds in ${totalTime}s`);
    }

    // Write output file
    const outputPath = join(__dirname, '..', 'src', 'lib', 'games', 'sudoku', 'killerSeeds.ts');

    let output = `// Auto-generated Killer Sudoku Seed Library\n`;
    output += `// Generated at: ${new Date().toISOString()}\n`;
    output += `// DO NOT EDIT - regenerate with: node scripts/generateKillerSeeds.mjs\n\n`;

    output += `export type KillerSeed = {\n`;
    output += `    solution: string;\n`;
    output += `    cageMap: string;\n`;
    output += `    sums: number[];\n`;
    output += `};\n\n`;

    for (const diff of DIFFICULTIES) {
        const varName = `KILLER_${diff.toUpperCase()}_SEEDS`;
        output += `export const ${varName}: KillerSeed[] = [\n`;
        for (const seed of allSeeds[diff]) {
            output += `    {solution:"${seed.solution}",cageMap:"${seed.cageMap}",sums:[${seed.sums.join(',')}]},\n`;
        }
        output += `];\n\n`;
    }

    writeFileSync(outputPath, output);
    console.log(`\nOutput written to: ${outputPath}`);
    console.log(`File size: ${(Buffer.byteLength(output) / 1024).toFixed(1)} KB`);
}

main().catch(console.error);
