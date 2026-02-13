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

        // Check Cols
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

        // Check 3x3 Boxes
        for(let boxR=0; boxR<9; boxR+=3) {
            for(let boxC=0; boxC<9; boxC+=3) {
                const counts = Array(10).fill(0);
                const positions = Array(10).fill(null).map(() => [] as {r:number,c:number}[]);
                for(let dr=0; dr<3; dr++) {
                    for(let dc=0; dc<3; dc++) {
                        const r = boxR+dr, c = boxC+dc;
                        if(board[r][c] === 0) {
                            const cands = getCandidates(board, r, c);
                            cands.forEach(num => {
                                counts[num]++;
                                positions[num].push({r, c});
                            });
                        }
                    }
                }
                for(let num=1; num<=9; num++) {
                    if(counts[num] === 1) {
                        const {r, c} = positions[num][0];
                        board[r][c] = num;
                        madeProgress = true;
                        maxTechnique = Math.max(maxTechnique, 2);
                    }
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
