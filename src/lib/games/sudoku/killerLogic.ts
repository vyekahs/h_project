import { createEmptyBoard, solve, transformBoard, isValid, type Board, type Cell } from './logic';

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

// Cage size distribution by difficulty
// Smaller cages = more constrained = easier
const CAGE_SIZE_WEIGHTS: Record<Difficulty, number[]> = {
    //           size: 1    2    3    4    5    6
    easy:           [  2,  40,  40,  18,   0,   0],
    medium:         [  1,  25,  35,  30,   9,   0],
    hard:           [  1,  15,  25,  30,  22,   7],
    expert:         [  0,  10,  20,  25,  25,  20],
    master:         [  0,   5,  15,  25,  30,  25],
};

const INITIAL_REVEAL_COUNTS: Record<Difficulty, number> = {
    easy: 35,
    medium: 25,
    hard: 15,
    expert: 0,
    master: 0
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
 * Check if placing num at (row, col) violates cage constraints
 */
function checkCageConstraint(board: Board, cages: Cage[], row: number, col: number, num: number): boolean {
    // Find the cage this cell belongs to
    // Optimization: logic could be faster if we had a map of cell->cage, 
    // but with 9x9 and few cages, linear search is okay or we can pre-calc map in solver.
    const cage = cages.find(c => c.cells.some(cell => cell.row === row && cell.col === col));
    if (!cage) return true; // Should ideally always be in a cage, but if not, no constraint.

    let currentSum = 0;
    let filledCount = 0;
    
    for (const cell of cage.cells) {
        // Skip the current cell we are trying to fill (it's not in board yet or is 0/null)
        if (cell.row === row && cell.col === col) continue;

        const val = board[cell.row][cell.col].value;
        if (val !== null) {
            if (val === num) return false; // Duplicate in cage
            currentSum += val;
            filledCount++;
        }
    }

    const newSum = currentSum + num;
    
    // 1. Sum must not exceed target
    if (newSum > cage.sum) return false;

    // 2. If this is the last empty cell in the cage, sum must match exactly
    if (filledCount + 1 === cage.cells.length) {
        if (newSum !== cage.sum) return false;
    }

    return true;
}

/**
 * Count solutions for a Killer Sudoku Setup
 * Returns number of solutions (stops at > 1)
 */
function countKillerSolutions(board: Board, cages: Cage[], limit: number = 2): number {
    let count = 0;
    
    // Create a simplified number[][] for isValid checking from logic.ts
    // or just use the Board structure directly if we reimplement isValid.
    // logic.ts `isValid` takes number[][]. Let's create one.
    const simpleBoard: number[][] = board.map(row => row.map(c => c.value || 0));

    function backtrack(): boolean { // returns true if we should stop (limit reached)
        // Find first empty
        let r = -1, c = -1;
        for (let i = 0; i < 9; i++) {
            for (let j = 0; j < 9; j++) {
                if (simpleBoard[i][j] === 0) {
                    r = i; c = j;
                    break;
                }
            }
            if (r !== -1) break;
        }

        if (r === -1) {
            // Full board
            count++;
            return count >= limit;
        }

        // Try 1-9
        for (let num = 1; num <= 9; num++) {
            // Check Standard Sudoku Rules
            if (isValid(simpleBoard, r, c, num)) {
                // Check Killer Rules
                if (checkCageConstraint(board, cages, r, c, num)) {
                    
                    // Place
                    simpleBoard[r][c] = num;
                    board[r][c].value = num; // Update main board for checkCageConstraint

                    if (backtrack()) return true;

                    // Backtrack
                    simpleBoard[r][c] = 0;
                    board[r][c].value = null;
                }
            }
        }
        return false;
    }

    backtrack();
    return count;
}


/**
 * Generate a Killer Sudoku puzzle
 */
export function generateKillerSudoku(difficulty: Difficulty = 'medium'): KillerPuzzle {
    let bestPuzzle: KillerPuzzle | null = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 20;

    while (attempts < MAX_ATTEMPTS) {
        attempts++;

        // 1. Generate a complete solved board
        const emptyBoard = createEmptyBoard();
        solve(emptyBoard);

        // 2. Transform for variety
        const solution = transformBoard(emptyBoard);

        // 3. Generate cages
        const cages = generateCages(solution, difficulty);

        // 4. Create initial board with hybrid difficulty (revealed cells)
        const revealCount = INITIAL_REVEAL_COUNTS[difficulty];
        
        // Create random list of coordinates to reveal
        const coords: {r: number, c: number}[] = [];
        for(let r=0; r<9; r++) for(let c=0; c<9; c++) coords.push({r, c});
        coords.sort(() => Math.random() - 0.5);
        
        const revealed = new Set<string>();
        for(let i=0; i<revealCount; i++) {
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
        
        const puzzle = { initialBoard, solution, cages };

        // 5. Verify Uniqueness (Skip for Easy/Medium if performance is bad? Usually needed for Hard+)
        // For now, check all.
        // We need to pass a Deep Copy of initialBoard to solver because solver mutates it temporarily
        const boardForSolver = JSON.parse(JSON.stringify(initialBoard)); // Simple deep copy
        const solutions = countKillerSolutions(boardForSolver, cages, 2);

        if (solutions === 1) {
            return puzzle;
        }

        // Keep the last generated one as fallback
        bestPuzzle = puzzle;
        
        // If we are in 'easy' or 'medium' and failed? 
        // With 35/25 reveals, it should be unique.
        // The issue is mostly Expert/Master with 0 reveals.
    }

    console.warn(`Failed to generate unique Killer Sudoku after ${MAX_ATTEMPTS} attempts. Returning best effort.`);
    return bestPuzzle!;
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
