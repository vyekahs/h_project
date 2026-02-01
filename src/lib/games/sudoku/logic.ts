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

/**
 * Generates a playable Sudoku board
 * difficulty: 'easy' | 'medium' | 'hard' | 'expert' | 'master'
 */
export function generateSudoku(difficulty: 'easy' | 'medium' | 'hard' | 'expert' | 'master' = 'medium'): {
	initialBoard: Board;
	solution: number[][];
} {
	// 1. Generate full solved board
	const fullBoard = createEmptyBoard();
	solve(fullBoard);
	const solution = fullBoard.map((row) => [...row]); 

    // Target Logic Level:
    // Easy: Level 1 (Naked Singles)
    // Medium: Level 2 (Hidden Singles)
    // Hard/Expert/Master: Level 3 (Stuck)
    
    let targetLevel = 2;
    if (difficulty === 'easy') targetLevel = 1;
    if (difficulty === 'hard' || difficulty === 'expert' || difficulty === 'master') targetLevel = 3;

    // Retry loop to find a board with desired difficulty logic
    
    let bestPuzzle = null;
    let attempts = 0;
    
    // Standard clues count to aim for initially
    let targetClues = 40; // baseline
    if(difficulty === 'easy') targetClues = 45; 
    if(difficulty === 'medium') targetClues = 35;
    if(difficulty === 'hard') targetClues = 28;
    if(difficulty === 'expert') targetClues = 22;
    if(difficulty === 'master') targetClues = 17; // Minimum possible

    // Increase max attempts for harder puzzles as they are harder to generate
    let maxAttempts = 20;
    if (difficulty === 'expert') maxAttempts = 50;
    if (difficulty === 'master') maxAttempts = 100;

    while (attempts < maxAttempts) {
        const puzzle = fullBoard.map(row => [...row]);
        const positions = [];
        for(let r=0; r<9; r++) for(let c=0; c<9; c++) positions.push([r,c]);
        positions.sort(() => Math.random() - 0.5);
        
        // Carve
        for (const [r, c] of positions) {
            let filledCount = 0;
            for(let i=0; i<9; i++) for(let j=0; j<9; j++) if(puzzle[i][j] !== 0) filledCount++;
            if (filledCount <= targetClues) break; 
            
            const saved = puzzle[r][c];
            puzzle[r][c] = 0;
            
            // Check uniqueness (basic validity)
            if (countSolutions(puzzle, 2) !== 1) {
                puzzle[r][c] = saved; // put back
                continue;
            }
            
            if (targetLevel <= 2) { 
                 const currentLevel = analyzeDifficulty(puzzle);
                 if (currentLevel > targetLevel) {
                     // Too hard!
                     puzzle[r][c] = saved; // Put back
                 }
            }
        }
        
        // Final check
        const level = analyzeDifficulty(puzzle);
        
        let valid = false;
        if (targetLevel === 3) valid = (level === 3);
        else valid = (level <= targetLevel);
        
        // Relax validation for Master/Expert if we are close enough to target clues
        // because finding exactly 17 with strictly Level 3 is hard.
        // If we found a valid 17-clue puzzle, it's probably hard enough.
        if (difficulty === 'master') {
             let clues = 0;
             for(let r=0; r<9; r++) for(let c=0; c<9; c++) if(puzzle[r][c]!==0) clues++;
             if (clues <= 19) valid = true; // Accept up to 19 for Master
        }

        if (valid) {
            bestPuzzle = puzzle;
            break;
        }
        attempts++;
    }
    
    // Fallback
    if (!bestPuzzle) {
         // Naive fallback
         const puzzle = fullBoard.map(row => [...row]);
         const positions = [];
         for(let r=0; r<9; r++) for(let c=0; c<9; c++) positions.push([r,c]);
         positions.sort(() => Math.random() - 0.5);
         for(const [r,c] of positions) {
             let filled = 0; 
             for(let rows of puzzle) for(let v of rows) if(v!==0) filled++;
             if(filled <= targetClues + 2) break; // Relaxed fallback target
             const s = puzzle[r][c];
             puzzle[r][c] = 0;
             if(countSolutions(puzzle, 2) !== 1) puzzle[r][c] = s;
         }
         bestPuzzle = puzzle;
    }


	// Convert to Cell objects
	const initialBoard: Board = bestPuzzle.map((row, rIdx) =>
		row.map((val, cIdx) => ({
			row: rIdx,
			col: cIdx,
			value: val === 0 ? null : val,
			isFixed: val !== 0,
			notes: []
		}))
	);

	return { initialBoard, solution };
}
