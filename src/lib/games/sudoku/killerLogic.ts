import type { Board, Cell } from './logic';
import {
    KILLER_EASY_SEEDS, KILLER_MEDIUM_SEEDS, KILLER_HARD_SEEDS,
    KILLER_EXPERT_SEEDS, KILLER_MASTER_SEEDS, type KillerSeed
} from './killerSeeds';

export type Cage = {
    id: number;
    cells: { row: number; col: number }[];
    sum: number;
};

export type KillerPuzzle = {
    initialBoard: Board;
    solution: number[][];
    cages: Cage[];
};

type Difficulty = 'easy' | 'medium' | 'hard' | 'expert' | 'master';

const INITIAL_REVEAL_COUNTS: Record<Difficulty, number> = {
    easy: 35,
    medium: 25,
    hard: 15,
    expert: 0,
    master: 0
};

const SEEDS_BY_DIFFICULTY: Record<Difficulty, KillerSeed[]> = {
    easy: KILLER_EASY_SEEDS,
    medium: KILLER_MEDIUM_SEEDS,
    hard: KILLER_HARD_SEEDS,
    expert: KILLER_EXPERT_SEEDS,
    master: KILLER_MASTER_SEEDS,
};

const CAGE_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ============================================================
// Seed Parsing
// ============================================================

function parseSolution(solStr: string): number[][] {
    const board: number[][] = [];
    for (let r = 0; r < 9; r++) {
        const row: number[] = [];
        for (let c = 0; c < 9; c++) {
            row.push(parseInt(solStr[r * 9 + c]));
        }
        board.push(row);
    }
    return board;
}

function parseCages(cageMapStr: string, sums: number[]): Cage[] {
    // Group cells by cage ID
    const cageGroups = new Map<number, { row: number; col: number }[]>();
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            const ch = cageMapStr[r * 9 + c];
            const cageId = CAGE_CHARS.indexOf(ch);
            if (!cageGroups.has(cageId)) {
                cageGroups.set(cageId, []);
            }
            cageGroups.get(cageId)!.push({ row: r, col: c });
        }
    }

    const cages: Cage[] = [];
    // Sort by cage ID to match sums order
    const sortedIds = [...cageGroups.keys()].sort((a, b) => a - b);
    for (let i = 0; i < sortedIds.length; i++) {
        cages.push({
            id: i,
            cells: cageGroups.get(sortedIds[i])!,
            sum: sums[i]
        });
    }

    return cages;
}

// ============================================================
// Board + Cage Transformation (synchronized via coordinate table)
// ============================================================

/**
 * Transforms a killer sudoku seed (solution + cages) using random
 * Sudoku-preserving transformations.
 *
 * Uses a 9×9 coordinate mapping table to track where each original
 * cell (r,c) ends up after all board transformations. This avoids
 * error-prone chained coordinate transform functions.
 */
function transformKillerSeed(
    solution: number[][],
    cages: Cage[]
): { solution: number[][]; cages: Cage[] } {
    // coordMap[r][c] = { row, col } in the NEW board
    // Initialized to identity mapping
    let coordMap: { row: number; col: number }[][] = Array.from({ length: 9 }, (_, r) =>
        Array.from({ length: 9 }, (_, c) => ({ row: r, col: c }))
    );

    let board = solution.map(row => [...row]);

    // Helper: apply the same transformation to both board and coordMap
    function applyTransform(
        boardFn: (b: number[][]) => number[][],
        mapFn: (m: { row: number; col: number }[][]) => { row: number; col: number }[][]
    ) {
        board = boardFn(board);
        coordMap = mapFn(coordMap);
    }

    // 1. Number relabeling (only affects values, not coordinates)
    const relabelMap = [1,2,3,4,5,6,7,8,9].sort(() => Math.random() - 0.5);
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (board[r][c] !== 0) {
                board[r][c] = relabelMap[board[r][c] - 1];
            }
        }
    }

    // 2. Rotation (0, 90, 180, 270)
    const rotations = Math.floor(Math.random() * 4);
    for (let i = 0; i < rotations; i++) {
        applyTransform(
            (b) => {
                const rotated = Array.from({ length: 9 }, () => Array(9).fill(0));
                for (let r = 0; r < 9; r++)
                    for (let c = 0; c < 9; c++)
                        rotated[c][8 - r] = b[r][c];
                return rotated;
            },
            (m) => {
                const rotated: { row: number; col: number }[][] = Array.from({ length: 9 }, () => Array(9).fill(null));
                for (let r = 0; r < 9; r++)
                    for (let c = 0; c < 9; c++)
                        rotated[c][8 - r] = m[r][c];
                return rotated;
            }
        );
    }

    // 3. Vertical flip
    if (Math.random() > 0.5) {
        applyTransform(
            (b) => [...b].reverse(),
            (m) => [...m].reverse()
        );
    }

    // 4. Horizontal flip
    if (Math.random() > 0.5) {
        applyTransform(
            (b) => b.map(row => [...row].reverse()),
            (m) => m.map(row => [...row].reverse())
        );
    }

    // NOTE: Band shuffle and stack shuffle are intentionally omitted.
    // These transforms swap rows/columns within bands/stacks, which breaks
    // cage adjacency (e.g., rows 0,1 cage becomes rows 2,1 after swap).
    // Relabel (9!) × rotation (4) × mirror (4) = 1,451,520 variants per seed,
    // which provides ample variety.

    // Build reverse lookup: original (r,c) → new (row, col)
    // coordMap[newR][newC] stores the ORIGINAL {row, col} that ended up here.
    // We need the inverse: for each original (r,c), find (newR, newC).
    const reverseMap: { row: number; col: number }[][] = Array.from({ length: 9 }, () =>
        Array(9).fill(null)
    );
    for (let newR = 0; newR < 9; newR++) {
        for (let newC = 0; newC < 9; newC++) {
            const orig = coordMap[newR][newC];
            reverseMap[orig.row][orig.col] = { row: newR, col: newC };
        }
    }

    // Apply coordinate mapping to cage cells
    const newCages: Cage[] = cages.map((cage, idx) => {
        const newCells = cage.cells.map(cell => reverseMap[cell.row][cell.col]);
        const sum = newCells.reduce((acc, c) => acc + board[c.row][c.col], 0);
        return { id: idx, cells: newCells, sum };
    });

    return { solution: board, cages: newCages };
}

// ============================================================
// Puzzle Generation (seed-based)
// ============================================================

/**
 * Generate a Killer Sudoku puzzle from pre-verified seeds
 */
export function generateKillerSudoku(difficulty: Difficulty = 'medium'): KillerPuzzle {
    const seeds = SEEDS_BY_DIFFICULTY[difficulty];
    const seed = seeds[Math.floor(Math.random() * seeds.length)];

    // 1. Parse seed data
    const baseSolution = parseSolution(seed.solution);
    const baseCages = parseCages(seed.cageMap, seed.sums);

    // 2. Apply random transformations (solution + cages synchronized)
    const { solution, cages } = transformKillerSeed(baseSolution, baseCages);

    // 3. Create initial board with random reveals
    const revealCount = INITIAL_REVEAL_COUNTS[difficulty];

    const coords: { r: number; c: number }[] = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) coords.push({ r, c });
    coords.sort(() => Math.random() - 0.5);

    const revealed = new Set<string>();
    for (let i = 0; i < revealCount; i++) {
        revealed.add(`${coords[i].r},${coords[i].c}`);
    }

    const initialBoard: Board = Array.from({ length: 9 }, (_, rIdx) =>
        Array.from({ length: 9 }, (_, cIdx) => {
            const isRevealed = revealed.has(`${rIdx},${cIdx}`);
            const val = isRevealed ? solution[rIdx][cIdx] : null;
            return {
                row: rIdx,
                col: cIdx,
                value: val,
                isFixed: isRevealed,
                notes: []
            };
        })
    );

    return { initialBoard, solution, cages };
}

// ============================================================
// Cage Error Checking (unchanged)
// ============================================================

/**
 * Get cage errors for visual feedback
 * Returns set of cell keys ("row,col") that have cage-level issues
 */
export function getCageErrors(board: Board, cages: Cage[]): Set<string> {
    const errorCells = new Set<string>();

    for (const cage of cages) {
        const values: number[] = [];
        let allFilled = true;

        for (const { row, col } of cage.cells) {
            const val = board[row][col].value;
            if (val === null) {
                allFilled = false;
            } else {
                values.push(val);
            }
        }

        // Check for duplicates within cage
        const seen = new Set<number>();
        for (const v of values) {
            if (seen.has(v)) {
                for (const { row, col } of cage.cells) {
                    if (board[row][col].value === v) {
                        errorCells.add(`${row},${col}`);
                    }
                }
            }
            seen.add(v);
        }

        // Check if sum exceeded (partial sum check)
        const currentSum = values.reduce((a, b) => a + b, 0);
        if (currentSum > cage.sum) {
            for (const { row, col } of cage.cells) {
                if (board[row][col].value !== null) {
                    errorCells.add(`${row},${col}`);
                }
            }
        }

        // Check if all filled but sum doesn't match
        if (allFilled && currentSum !== cage.sum) {
            for (const { row, col } of cage.cells) {
                errorCells.add(`${row},${col}`);
            }
        }
    }

    return errorCells;
}

/**
 * Find which cage a cell belongs to
 */
export function findCageForCell(row: number, col: number, cages: Cage[]): Cage | undefined {
    return cages.find(cage => cage.cells.some(c => c.row === row && c.col === col));
}
