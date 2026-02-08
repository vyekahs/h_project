import { createEmptyBoard, solve, transformBoard, type Board, type Cell } from './logic';

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

type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

// Cage size distribution by difficulty
// Smaller cages = more constrained = easier
const CAGE_SIZE_WEIGHTS: Record<Difficulty, number[]> = {
    //           size: 1    2    3    4    5    6
    easy:           [  2,  40,  40,  18,   0,   0],
    medium:         [  1,  25,  35,  30,   9,   0],
    hard:           [  1,  15,  25,  30,  22,   7],
    expert:         [  0,  10,  20,  25,  25,  20],
};

function pickCageSize(difficulty: Difficulty): number {
    const weights = CAGE_SIZE_WEIGHTS[difficulty];
    const total = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
        rand -= weights[i];
        if (rand <= 0) return i + 1; // sizes are 1-indexed
    }
    return 2; // fallback
}

function getNeighbors(row: number, col: number): { row: number; col: number }[] {
    const neighbors: { row: number; col: number }[] = [];
    if (row > 0) neighbors.push({ row: row - 1, col });
    if (row < 8) neighbors.push({ row: row + 1, col });
    if (col > 0) neighbors.push({ row, col: col - 1 });
    if (col < 8) neighbors.push({ row, col: col + 1 });
    return neighbors;
}

function generateCages(solution: number[][], difficulty: Difficulty): Cage[] {
    const visited: boolean[][] = Array.from({ length: 9 }, () => Array(9).fill(false));
    const cages: Cage[] = [];
    let cageId = 0;

    // Collect all cells and shuffle
    const allCells: { row: number; col: number }[] = [];
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            allCells.push({ row: r, col: c });
        }
    }
    allCells.sort(() => Math.random() - 0.5);

    for (const startCell of allCells) {
        if (visited[startCell.row][startCell.col]) continue;

        const targetSize = pickCageSize(difficulty);
        const cageCells: { row: number; col: number }[] = [startCell];
        visited[startCell.row][startCell.col] = true;

        // Grow cage via random walk
        while (cageCells.length < targetSize) {
            // Collect all unvisited neighbors of current cage
            const frontier: { row: number; col: number }[] = [];
            for (const cell of cageCells) {
                for (const n of getNeighbors(cell.row, cell.col)) {
                    if (!visited[n.row][n.col] && !frontier.some(f => f.row === n.row && f.col === n.col)) {
                        frontier.push(n);
                    }
                }
            }

            if (frontier.length === 0) break; // No room to grow

            // Pick random neighbor
            const next = frontier[Math.floor(Math.random() * frontier.length)];
            cageCells.push(next);
            visited[next.row][next.col] = true;
        }

        // Calculate sum
        const sum = cageCells.reduce((acc, c) => acc + solution[c.row][c.col], 0);

        cages.push({
            id: cageId++,
            cells: cageCells,
            sum
        });
    }

    return cages;
}

/**
 * Generate a Killer Sudoku puzzle
 */
export function generateKillerSudoku(difficulty: Difficulty = 'medium'): KillerPuzzle {
    // 1. Generate a complete solved board
    const emptyBoard = createEmptyBoard();
    solve(emptyBoard);

    // 2. Transform for variety
    const solution = transformBoard(emptyBoard);

    // 3. Generate cages
    const cages = generateCages(solution, difficulty);

    // 4. Create empty initial board (no pre-filled numbers)
    const initialBoard: Board = Array.from({ length: 9 }, (_, rIdx) =>
        Array.from({ length: 9 }, (_, cIdx) => ({
            row: rIdx,
            col: cIdx,
            value: null,
            isFixed: false,
            notes: []
        }))
    );

    return { initialBoard, solution, cages };
}

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
                // Mark all cells in this cage with this duplicate value
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
