
const fs = require('fs');
const path = require('path');

// --- Solver & Validator ---
function createEmptyBoard() { return Array.from({ length: 9 }, () => Array(9).fill(0)); }

function isValid(board, row, col, num) {
    for (let i = 0; i < 9; i++) if (board[row][i] === num) return false;
    for (let i = 0; i < 9; i++) if (board[i][col] === num) return false;
    const startRow = Math.floor(row / 3) * 3;
    const startCol = Math.floor(col / 3) * 3;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (board[startRow + i][startCol + j] === num) return false;
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
    function backtrack(r, c) {
        if (count >= limit) return;
        let nextR = r, nextC = c + 1;
        if (nextC === 9) { nextR = r + 1; nextC = 0; }
        if (r === 9) { count++; return; }
        if (board[r][c] !== 0) { backtrack(nextR, nextC); return; }
        for (let num = 1; num <= 9; num++) {
            if (isValid(board, r, c, num)) {
                board[r][c] = num;
                backtrack(nextR, nextC);
                board[r][c] = 0;
            }
        }
    }
    const copy = board.map(r => [...r]);
    // Optimization: check validity before backtracking
    backtrack(0, 0);
    return count;
}

function boardToString(board) {
    return board.map(row => row.join('')).join('');
}

// --- Generator ---
function generate(targetClues) {
    let attempts = 0;
    while (attempts < 2000) { // Limit attempts to prevent hangs
        attempts++;
        const full = createEmptyBoard();
        solve(full);
        const puzzle = full.map(r => [...r]);
        const positions = [];
        for(let r=0; r<9; r++) for(let c=0; c<9; c++) positions.push([r,c]);
        positions.sort(() => Math.random() - 0.5);

        for (const [r, c] of positions) {
            let filled = 0;
            for(let i=0; i<9; i++) for(let j=0; j<9; j++) if(puzzle[i][j] !== 0) filled++;
            if (filled <= targetClues) break;

            const saved = puzzle[r][c];
            puzzle[r][c] = 0;
            if (countSolutions(puzzle, 2) !== 1) {
                puzzle[r][c] = saved;
            }
        }
        
        let filled = 0;
        for(let i=0; i<9; i++) for(let j=0; j<9; j++) if(puzzle[i][j] !== 0) filled++;
        
        // Relaxed constraints for speed
        // Easy: ~45, Medium: ~35, Hard: ~28, Expert: ~24, Master: ~19
        if (filled <= targetClues + 4) {
             return boardToString(puzzle);
        }
    }
    return null;
}

const TARGETS = {
    EASY: 42,
    MEDIUM: 32,
    HARD: 26,
    EXPERT: 22,
    // Master is hard to generate fast. We will generate fewer or use stricter logic if needed.
    // For now, let's try to get close to 20 clues for Master.
    MASTER: 19 
};

// Generate Library
const LIBRARY = {
    EASY: [],
    MEDIUM: [],
    HARD: [],
    EXPERT: [],
    MASTER: []
};

const COUNT_PER_DIFF = 10; // Generate 10 per diff for now (speed)

console.log(`Generating ${COUNT_PER_DIFF} seeds per difficulty...`);

for (const [diff, target] of Object.entries(TARGETS)) {
    console.log(`Generating ${diff} (Target ~${target})...`);
    while (LIBRARY[diff].length < COUNT_PER_DIFF) {
        const seed = generate(target);
        if (seed) {
            LIBRARY[diff].push(seed);
            process.stdout.write('.');
        }
    }
    console.log(` Done!`);
}

// Output File Content
const fileContent = `
// Auto-generated Sudoku Seed Library
// Generated at: ${new Date().toISOString()}

export const EASY_SEEDS = ${JSON.stringify(LIBRARY.EASY, null, 4)};

export const MEDIUM_SEEDS = ${JSON.stringify(LIBRARY.MEDIUM, null, 4)};

export const HARD_SEEDS = ${JSON.stringify(LIBRARY.HARD, null, 4)};

export const EXPERT_SEEDS = ${JSON.stringify(LIBRARY.EXPERT, null, 4)};

export const MASTER_SEEDS = ${JSON.stringify(LIBRARY.MASTER, null, 4)};
`;

const outputPath = path.join(__dirname, '../src/lib/games/sudoku/seeds.ts');
fs.writeFileSync(outputPath, fileContent);
console.log(`Library saved to ${outputPath}`);
