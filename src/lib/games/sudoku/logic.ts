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
function createEmptyBoard(): number[][] {
	return Array.from({ length: 9 }, () => Array(9).fill(0));
}

/**
 * Checks if placements is valid according to Sudoku rules
 */
function isValid(board: number[][], row: number, col: number, num: number): boolean {
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
function solve(board: number[][]): boolean {
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
 * logical solver helper
 */

function getCandidates(board: number[][], r: number, c: number): number[] {
    if (board[r][c] !== 0) return [];
    
    const present = new Set<number>();
    
    // Check row/col
    for (let i = 0; i < 9; i++) {
        if (board[r][i] !== 0) present.add(board[r][i]);
        if (board[i][c] !== 0) present.add(board[i][c]);
    }
    
    // Check box
    const startRow = Math.floor(r/3)*3;
    const startCol = Math.floor(c/3)*3;
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            const val = board[startRow+i][startCol+j];
            if (val !== 0) present.add(val);
        }
    }
    
    const candidates = [];
    for(let i=1; i<=9; i++) if(!present.has(i)) candidates.push(i);
    return candidates;
}

// Returns difficulty based on what logic was needed
// 1 = Naked Single (Easy)
// 2 = Hidden Single (Medium)
// 3 = Hard/Expert (Stuck)
function analyzeDifficulty(boardInput: number[][]): number {
    const board = boardInput.map(r => [...r]);
    let moves = 0;
    let maxTechnique = 0; // 0=none, 1=naked, 2=hidden
    let stuck = false;
    
    while (true) {
        let madeProgress = false;
        
        // 1. Check Naked Singles
        // (Cell has only 1 candidate)
        for (let r=0; r<9; r++) {
            for (let c=0; c<9; c++) {
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
        
        // 2. Check Hidden Singles
        // (A number can only go in one cell in a house)
        // Check Rows
        for(let r=0; r<9; r++) {
            const counts = Array(10).fill(0);
            const positions = Array(10).fill(null).map(() => [] as number[]);
            
            for(let c=0; c<9; c++) {
                 if(board[r][c] === 0) {
                     const cands = getCandidates(board, r, c);
                     cands.forEach(num => {
                         counts[num]++;
                         positions[num].push(c);
                     });
                 }
            }
            
            for(let num=1; num<=9; num++) {
                if(counts[num] === 1) {
                    const c = positions[num][0];
                    board[r][c] = num;
                    madeProgress = true;
                    maxTechnique = Math.max(maxTechnique, 2);
                }
            }
        }
        if (madeProgress) continue;

        // Check Cols (Skipping for brevity if Row suffices, usually mixed)
        // Check Boxes... (omitted for speed, adds to '2')
        
        // If we really want full Hidden Single check we need cols/boxes too.
        // Let's adding Cols quickly.
        for(let c=0; c<9; c++) {
            const counts = Array(10).fill(0);
            const positions = Array(10).fill(null).map(() => [] as number[]);
             for(let r=0; r<9; r++) {
                 if(board[r][c] === 0) {
                     const cands = getCandidates(board, r, c);
                     cands.forEach(num => {
                         counts[num]++;
                         positions[num].push(r);
                     });
                 }
            }
             for(let num=1; num<=9; num++) {
                if(counts[num] === 1) {
                    const r = positions[num][0];
                    board[r][c] = num;
                    madeProgress = true;
                    maxTechnique = Math.max(maxTechnique, 2);
                }
            }
        }
        if (madeProgress) continue;

        // If no progress, we are stuck
        // Check if solved
        let isSolved = true;
        for(let r=0; r<9; r++) for(let c=0; c<9; c++) if(board[r][c]===0) isSolved = false;
        
        if (!isSolved) stuck = true;
        break;
    }
    
    if (stuck) return 3; // Hard/Expert
    if (maxTechnique === 0) return 0; // Already solved?
    return maxTechnique;
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
function transformBoard(board: number[][]): number[][] {
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

    // 4. Band/Stack Shuffling
    for (let b=0; b<3; b++) {
        if (Math.random() > 0.5) { // Shuffle rows in band
            const rows = [0,1,2].sort(() => Math.random() - 0.5);
            const bandStart = b * 3;
            const bandRows = [newBoard[bandStart], newBoard[bandStart+1], newBoard[bandStart+2]];
            newBoard[bandStart] = bandRows[rows[0]];
            newBoard[bandStart+1] = bandRows[rows[1]];
            newBoard[bandStart+2] = bandRows[rows[2]];
        }
    }
    
    // Shuffle columns in stack
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
