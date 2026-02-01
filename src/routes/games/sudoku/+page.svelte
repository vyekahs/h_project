<script lang="ts">
	import { onMount } from 'svelte';
	import { generateSudoku, type Board, type Cell } from '$lib/games/sudoku/logic';
	import BoardComponent from './Board.svelte';
	import Controls from './Controls.svelte';
    import { goto } from '$app/navigation';

    // Game States: 'start', 'playing', 'paused', 'finished'
    type GameState = 'start' | 'playing' | 'paused' | 'finished';

	let gameState: GameState = $state('start');
	let difficulty: 'easy' | 'medium' | 'hard' | 'expert' | 'master' = $state('medium');
	let board: Board = $state([]);
	let solution: number[][];
	let selectedCell: Cell | null = $state(null);
	let isNoteMode = $state(false);
	let mistakes = $state(0);
	let isWon = $state(false);
    let timer = $state(0);
    let timerInterval: any;
    
    // Simple history stack: stores JSON string of board state
    let history: string[] = $state([]);
    
    let showTutorial = $state(false);

    let completedNumbers = $derived.by(() => {
        const counts = Array(10).fill(0);
        if (board.length === 0) return [];
        for(let r=0; r<9; r++) {
            for(let c=0; c<9; c++) {
                const val = board[r][c].value;
                if (val !== null) counts[val]++;
            }
        }
        const completed: number[] = [];
        for(let i=1; i<=9; i++) {
            if (counts[i] >= 9) completed.push(i);
        }
        return completed;
    });

    // Start Screen Logic
    function startGame(force = false) {
        if (!force && difficulty === 'easy') {
            showTutorial = true;
            return;
        }
        
        showTutorial = false;
        const result = generateSudoku(difficulty);
		board = result.initialBoard;
		solution = result.solution;
		mistakes = 0;
		isWon = false;
		selectedCell = null;
        timer = 0;
        history = []; // Reset history
        
        gameState = 'playing';
        startTimer();
    }
    
    function addToHistory() {
        // Deep copy board logic to history
        // Optimize: limit history size if needed, but 81 cells is small enough
        history.push(JSON.stringify(board));
    }

    // Timer Logic
    function startTimer() {
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            if (gameState === 'playing') {
                timer++;
            }
        }, 1000);
    }

    function pauseGame() {
        gameState = 'paused';
        clearInterval(timerInterval);
    }

    function resumeGame() {
        gameState = 'playing';
        startTimer();
    }

    function quitGame() {
        clearInterval(timerInterval);
        gameState = 'start';
        // Optional: goto('/minigames');
    }

	function handleCellSelect(cell: Cell) {
		if (gameState !== 'playing') return;
		selectedCell = cell;
	}

    function removeNotes(r: number, c: number, num: number) {
        // Row
        for(let i=0; i<9; i++) {
            const idx = board[r][i].notes.indexOf(num);
            if (idx !== -1) board[r][i].notes.splice(idx, 1);
        }
        // Col
        for(let i=0; i<9; i++) {
            const idx = board[i][c].notes.indexOf(num);
            if (idx !== -1) board[i][c].notes.splice(idx, 1);
        }
        // Box
        const startRow = Math.floor(r/3)*3;
        const startCol = Math.floor(c/3)*3;
        for(let i=0; i<3; i++) {
            for(let j=0; j<3; j++) {
                const cell = board[startRow+i][startCol+j];
                const idx = cell.notes.indexOf(num);
                if (idx !== -1) cell.notes.splice(idx, 1);
            }
        }
    }

	function handleNumberInput(num: number) {
		if (gameState !== 'playing' || !selectedCell || selectedCell.isFixed) return;

        // Save state before modification
        addToHistory();

		// Note mode
		if (isNoteMode) {
            const idx = selectedCell.notes.indexOf(num);
            if (idx === -1) {
                selectedCell.notes.push(num);
                selectedCell.notes.sort();
            } else {
                selectedCell.notes.splice(idx, 1);
            }
			return;
		}

		// Normal mode
		if (selectedCell.value === num) return; 

        // If completed, ignore (though UI hides it)
        if (completedNumbers.includes(num)) return;

        const correctVal = solution[selectedCell.row][selectedCell.col];
        
        // Update value regardless of correctness
        selectedCell.value = num;
        selectedCell.notes = [];
        
        if (num === correctVal) {
            selectedCell.isError = false;
            removeNotes(selectedCell.row, selectedCell.col, num);
            checkWin();
        } else {
            selectedCell.isError = true;
            mistakes++;
            if (mistakes >= 3) {
                handleGameOver(false);
            }
        }
	}

    function checkWin() {
        let filled = 0;
        for(let r=0; r<9; r++) {
            for(let c=0; c<9; c++) {
                if (board[r][c].value !== null) filled++;
            }
        }
        if (filled === 81 && mistakes < 3) {
            handleGameOver(true);
        }
    }
    
    function handleGameOver(won: boolean) {
        clearInterval(timerInterval);
        isWon = won;
        gameState = 'finished';
    }

    function handleAction(action: 'undo' | 'erase' | 'hint') {
        if (gameState !== 'playing') return;
        
        if (action === 'erase') {
             if (selectedCell && !selectedCell.isFixed) {
                addToHistory();
                selectedCell.value = null;
                selectedCell.notes = [];
            }
        } else if (action === 'undo') {
            if (history.length > 0) {
                const previousState = history.pop();
                if (previousState) {
                    // Restore board
                    const parsed = JSON.parse(previousState);
                    // We need to match valid object structure if needed, or just replace
                    // Since we use Svelte 5 runes, reassigning 'board' might lose references if not careful?
                    // But 'board' is a $state variable, so updating it should trigger reactivity.
                    // However, we need to ensure selectedCell reference is still valid or re-select.
                    
                    // Reconstruct board to preserve reactivity if needed, or simply assign
                    // With $state, reassignment is fine.
                    board = parsed;
                    
                    // Fix selectedCell reference to point to new board object
                    if (selectedCell) {
                        selectedCell = board[selectedCell.row][selectedCell.col];
                    }
                }
            }
        }
    }
    
    function formatTime(seconds: number) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    const difficultyLabels = {
        easy: '쉬움',
        medium: '보통',
        hard: '어려움',
        expert: '전문가',
        master: '마스터'
    };
</script>

<div class="game-container">
    {#if showTutorial}
        <div class="overlay">
            <div class="modal tutorial-modal">
                <h2>스도쿠 배우기 🎓</h2>
                <div class="tutorial-content">
                    <p>스도쿠는 논리 퍼즐입니다. 다음 규칙을 따라 빈칸을 채워보세요!</p>
                    <ul>
                        <li>👉 <strong>가로줄</strong>에 1부터 9까지 중복 없이 채우기</li>
                        <li>👉 <strong>세로줄</strong>에 1부터 9까지 중복 없이 채우기</li>
                        <li>👉 <strong>3x3 박스</strong> 안에 1부터 9까지 중복 없이 채우기</li>
                    </ul>
                    <p class="tip">💡 <strong>팁:</strong> 확실한 숫자부터 채워나가세요!</p>
                </div>
                <button class="btn-primary" onclick={() => startGame(true)}>알겠어요! 시작하기</button>
            </div>
        </div>
        
    {:else if gameState === 'start'}
        <div class="screen start-screen">
            <h1>Sudoku</h1>
            <div class="difficulty-select">
                <h2>난이도 선택</h2>
                <div class="options">
                    <label class:selected={difficulty === 'easy'}>
                        <input type="radio" name="difficulty" value="easy" bind:group={difficulty}>
                    쉬움
                    </label>
                    <label class:selected={difficulty === 'medium'}>
                        <input type="radio" name="difficulty" value="medium" bind:group={difficulty}>
                    보통
                    </label>
                    <label class:selected={difficulty === 'hard'}>
                        <input type="radio" name="difficulty" value="hard" bind:group={difficulty}>
                    어려움
                    </label>
                    <label class:selected={difficulty === 'expert'}>
                        <input type="radio" name="difficulty" value="expert" bind:group={difficulty}>
                    전문가
                    </label>
                    <label class:selected={difficulty === 'master'}>
                        <input type="radio" name="difficulty" value="master" bind:group={difficulty}>
                    마스터
                    </label>
                </div>
            </div>
            <button class="btn-primary huge" onclick={() => startGame()}>게임 시작</button>
            <a href="/minigames" class="btn-text">오락실로 돌아가기</a>
        </div>
    
    {:else}
        <!-- Game Header -->
        <header>
            <div class="header-info">
                <span class="difficulty-badge">{difficultyLabels[difficulty]} MODE</span>
                <span class="mistakes">{mistakes}/3 실수</span>
            </div>
            
            <div class="timer-controls">
                <div class="timer">{formatTime(timer)}</div>
                <button class="icon-btn" onclick={pauseGame} aria-label="Pause">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="2" height="6"/><rect x="13" y="9" width="2" height="6"/></svg>
                </button>
            </div>
        </header>

        <!-- Game Board -->
        <div class="game-area" class:blurred={gameState === 'paused'}>
            <BoardComponent
                {board}
                {selectedCell}
                isGameOver={gameState !== 'playing'}
                onselect={handleCellSelect}
            />
        </div>

        <!-- Controls -->
        <div class="controls-area" class:hidden={gameState !== 'playing'}>
            <Controls
                bind:isNoteMode
                {completedNumbers}
                onnumber={handleNumberInput}
                onaction={handleAction}
                onnewgame={() => {}} 
            />
        </div>
    {/if}

    <!-- Pause Overlay -->
    {#if gameState === 'paused'}
        <div class="overlay">
            <div class="modal">
                <h2>일시정지</h2>
                <button class="btn-primary" onclick={resumeGame}>계속하기</button>
                <button class="btn-danger" onclick={quitGame}>그만두기</button>
            </div>
        </div>
    {/if}

    <!-- Game Over / Win Overlay -->
    {#if gameState === 'finished'}
        <div class="overlay">
            <div class="modal">
                <h2>{isWon ? '승리! 🎉' : '게임 오버 💀'}</h2>
                <div class="result-stats">
                     <p>시간: {formatTime(timer)}</p>
                     <p>난이도: {difficultyLabels[difficulty]}</p>
                     <p>실수: {mistakes}</p>
                </div>
                <button class="btn-primary" onclick={() => gameState = 'start'}>다시 하기</button>
                <button class="btn-text" onclick={quitGame}>나가기</button>
            </div>
        </div>
    {/if}
</div>

<style>
	/* Wrapper for the whole page */
    .game-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 2rem 1rem;
		gap: 2rem;
		max-width: 500px; /* Tighter width for focus */
		margin: 0 auto;
        min-height: 100vh;
        color: #333;
        position: relative;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
	}
    
    .screen {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2.5rem;
        height: 80vh;
        width: 100%;
    }
    
    .start-screen h1 {
        font-size: 3.5rem;
        font-weight: 200; /* Thinner sophisticated font */
        color: #333;
        margin-bottom: 1rem;
    }
    
    .difficulty-select {
        text-align: center;
        width: 100%;
    }
    
    .difficulty-select h2 {
        font-size: 1.1rem;
        font-weight: 500;
        color: #888;
        margin-bottom: 1rem;
        text-transform: uppercase;
        letter-spacing: 1px;
    }
    
    .options {
        display: flex;
        flex-wrap: wrap; 
        justify-content: center;
        gap: 0.8rem;
        width: 100%;
    }

    @media (max-width: 600px) {
        .options {
            flex-direction: column;
            align-items: stretch;
            gap: 0.5rem;
        }
        
        .options label {
            justify-content: center;
            padding: 0.8rem 1.5rem; /* Reduced padding */
            font-size: 1rem; /* Smaller font */
        }
    }
    
    .options label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 1rem 2rem;
        background: #f5f5f7;
        border-radius: 16px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        border: 2px solid transparent;
        color: #555;
        font-size: 1.1rem;
    }
    
    .options label:hover {
        background: #f0f0f0;
    }
    
    .options label.selected {
        background: #333;
        border-color: #333;
        color: white;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    
    .options input {
        display: none;
    }

	header {
		width: 100%;
		display: flex;
        flex-direction: row; /* Single row header */
        justify-content: space-between;
        align-items: flex-end;
		gap: 0.5rem;
        padding-bottom: 1rem;
	}
    
    .header-info {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
    }
    
    .difficulty-badge {
        font-size: 0.85rem;
        font-weight: 600;
        color: #8e8e93;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    
    .mistakes {
        font-size: 0.9rem;
        font-weight: 500;
        color: #d32f2f; /* Red for errors */
    }
    
    .timer-controls {
        display: flex;
        align-items: center;
        gap: 1rem;
    }
    
    .timer {
        font-size: 1.5rem;
        font-weight: 300;
        font-variant-numeric: tabular-nums;
        color: #333;
    }
    
    /* Pause Button Icon */
    .icon-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px;
        border-radius: 50%;
        transition: background 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .icon-btn:hover {
        background: #f0f0f0;
    }

	.game-area {
		display: flex;
		justify-content: center;
        width: 100%;
        transition: filter 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}
    
    .game-area.blurred {
        filter: blur(15px);
        opacity: 0.5;
    }

	.controls-area {
		width: 100%;
        transition: opacity 0.3s;
	}
    
    .controls-area.hidden {
        opacity: 0;
        pointer-events: none;
    }
    
    .overlay {
        position: absolute;
        top:0; left:0; right:0; bottom:0;
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .modal {
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        padding: 3rem;
        border-radius: 24px;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0,0,0,0.15);
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        min-width: 300px;
        border: 1px solid rgba(0,0,0,0.05);
    }
    
    .modal h2 {
        font-size: 2rem;
        font-weight: 700;
        margin-bottom: 1rem;
    }
    
    .btn-primary {
        background: #333;
        color: white;
        border: none;
        padding: 1rem 2.5rem;
        border-radius: 50px;
        font-weight: 600;
        font-size: 1.1rem;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
    
    .btn-primary:active {
        transform: scale(0.98);
        box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    }
    
    .btn-primary.huge {
        font-size: 1.2rem;
        padding: 1.2rem 4rem;
    }
    
    .btn-danger {
        background: transparent;
        color: #ff3b30;
        border: 1px solid #ff3b30;
        padding: 0.8rem 2rem;
        border-radius: 50px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .btn-danger:hover {
        background: #fff0f0;
    }
    
    .start-screen .btn-primary {
        margin-top: 1rem;
    }

    @media (max-width: 600px) {
        .start-screen .btn-primary {
            width: 100%; /* Match the width of stretched difficulty buttons */
        }
    }
    
    .btn-text {
        background: none;
        border: none;
        color: #8e8e93;
        cursor: pointer;
        text-decoration: none;
        font-size: 0.95rem;
        transition: color 0.2s;
    }
    
    .btn-text:hover {
        color: #333;
    }
    
    .tutorial-modal {
        max-width: 400px;
        text-align: left;
    }
    
    .tutorial-content {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        font-size: 1rem;
        line-height: 1.5;
        color: #444;
    }
    
    .tutorial-content ul {
        list-style: none;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        background: #f9f9f9;
        padding: 1rem;
        border-radius: 12px;
    }
    
    .tutorial-content .tip {
        background: #e3f2fd;
        color: #1565c0;
        padding: 0.8rem;
        border-radius: 8px;
        margin-top: 0.5rem;
        font-size: 0.95rem;
    }
    
</style>
