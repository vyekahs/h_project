<script lang="ts">
	import { onMount } from 'svelte';
	import { generateSudoku, type Board, type Cell } from '$lib/games/sudoku/logic';
	import BoardComponent from './Board.svelte';
	import Controls from './Controls.svelte';
    import { goto } from '$app/navigation';
    import RankingBoard from '$lib/components/gamification/RankingBoard.svelte';
    import RewardedAd from '$lib/components/ads/RewardedAd.svelte';
    import { user } from '$lib/stores/user';

    // Game States: 'start', 'playing', 'paused', 'finished'
    type GameState = 'start' | 'playing' | 'paused' | 'finished';

    async function handleAdReward() {
         try {
            await fetch('/api/points/reward', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: 20, source: 'rewarded_ad' })
            });
            alert('보너스 포인트 20P를 획득했습니다!');
         } catch (e) {
             console.error('Reward failed', e);
         }
    }

	let gameState: GameState = $state('start');
	let difficulty: 'easy' | 'medium' | 'hard' | 'expert' | 'master' = $state('medium');
	let board: Board = $state([]);
	let solution: number[][];
	let selectedCell: Cell | null = $state(null);
	let isNoteMode = $state(false);
	let mistakes = $state(0);
	let isWon = $state(false);
    let timerValue = 0; // Non-reactive timer value
    let displayTimer = $state(0); // Reactive display value
    let timerInterval: any;
    
    // View state for Start Screen
    let view: 'game' | 'ranking' = $state('game');
    
    // Simple history stack: stores JSON string of board state
    let history: string[] = $state([]);
    
    let showTutorial = $state(false);
    let earnedPointsResult = $state(0);
    let calculatedScore = $state(0);
    let isTimeFrozen = $state(false); // For Time Stop item

    let hasSavedGame = $state(false);
    let startMode: 'initial' | 'diff_select' = $state('initial');

    // Load game on mount
    onMount(() => {
        // Ensure user data (inventory) is up to date
        user.refresh();
        
        const saved = localStorage.getItem('sudoku_save');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                // Simple valid check
                if (data.board && data.solution && data.difficulty) {
                    hasSavedGame = true;
                }
            } catch (e) {
                console.error('Failed to load save', e);
            }
        }
        
        // Cleanup on unmount - critical for preventing multiple intervals
        return () => {
            clearInterval(timerInterval);
        };
    });

    function loadSavedGame() {
        const saved = localStorage.getItem('sudoku_save');
        if (saved) {
             try {
                const data = JSON.parse(saved);
                
                // Validate Data Integrity
                if (!Array.isArray(data.board) || data.board.length !== 9) {
                    throw new Error('Invalid board data');
                }

                board = data.board;
                solution = data.solution;
                timerValue = data.timer;
                displayTimer = data.timer;
                mistakes = data.mistakes;
                difficulty = data.difficulty;
                history = data.history || [];
                
                gameState = 'paused'; // Start paused, user must click resume
            } catch (e) {
                console.error('Failed to load save', e);
                showAlert('저장된 게임 데이터가 손상되어 이어할 수 없습니다. 새 게임을 시작합니다.');
                localStorage.removeItem('sudoku_save');
                hasSavedGame = false;
                startMode = 'diff_select'; // Go to difficulty selection
                view = 'game';
            }
        }
    }

    // Save game state
    function saveGame() {
        if (gameState !== 'playing') return;
        const data = {
            board,
            solution,
            timer: timerValue,
            mistakes,
            difficulty,
            history
        };
        localStorage.setItem('sudoku_save', JSON.stringify(data));
    }

    // Save game with explicit timer value (to avoid reactivity issues)
    function saveGameWithTimer(currentTimer: number) {
        if (gameState !== 'playing') return;
        const data = {
            board,
            solution,
            timer: currentTimer,
            mistakes,
            difficulty,
            history
        };
        localStorage.setItem('sudoku_save', JSON.stringify(data));
    }

    // Clear save when game is finished
    function clearSave() {
        localStorage.removeItem('sudoku_save');
        hasSavedGame = false;
    }

    // Alert Modal State
    let alertMessage: string | null = $state(null);
    let confirmMessage: string | null = $state(null);
    let confirmCallback: (() => void) | null = null;

    function showAlert(msg: string) {
        alertMessage = msg;
    }

    function showConfirm(msg: string, callback: () => void) {
        confirmMessage = msg;
        confirmCallback = callback;
    }

    function handleConfirm(yes: boolean) {
        if (yes && confirmCallback) {
            confirmCallback();
        }
        confirmMessage = null;
        confirmCallback = null;
    }

    async function useItem(code: string): Promise<boolean> {
        try {
            const res = await fetch('/api/shop/use', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemCode: code })
            });
            const data = await res.json();
            return data.success;
        } catch(e) {
            return false;
        }
    }

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
        
        // Clear any old save first
        localStorage.removeItem('sudoku_save');
        
        showTutorial = false;
        const result = generateSudoku(difficulty);
		board = result.initialBoard;
		solution = result.solution;
		mistakes = 0;
		isWon = false;
		selectedCell = null;
        timerValue = 0;
        displayTimer = 0;
        history = []; // Reset history
        
        gameState = 'playing';
        
        // Force save BEFORE starting timer to ensure timer=0 is saved
        const data = {
            board,
            solution,
            timer: 0, // Explicitly set to 0
            mistakes,
            difficulty,
            history
        };
        localStorage.setItem('sudoku_save', JSON.stringify(data));
        hasSavedGame = true;
        
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
            // Pause timer if any modal is open
            if (gameState === 'playing' && !isTimeFrozen && !alertMessage && !confirmMessage) {
                timerValue++;
                displayTimer = timerValue;
                // Auto-save every 5s if active
                if (timerValue % 5 === 0) {
                    saveGameWithTimer(timerValue);
                }
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
        localStorage.removeItem('sudoku_save');
        hasSavedGame = false;
        gameState = 'start';
    }

	function handleCellSelect(cell: Cell) {
		if (gameState !== 'playing' || alertMessage || confirmMessage) return;
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
		if (gameState !== 'playing' || !selectedCell || selectedCell.isFixed || alertMessage || confirmMessage) return;

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
        clearSave(); // Remove saved game when finished
        
        if (won) {
            submitScore();
        }
    }
    
    async function handleAction(action: 'undo' | 'erase' | 'hint' | 'time_stop' | 'refresh_prob') {
        if (gameState !== 'playing') return;
        
        if (action === 'erase') {
             if (selectedCell && !selectedCell.isFixed) {
                addToHistory();
                selectedCell.value = null;
                selectedCell.notes = [];
            }
        } else if (action === 'undo') {
            const ok = await useItem('undo_shield');
            if (ok) {
                if (history.length > 0) {
                    const previousState = history.pop();
                    if (previousState) {
                        const parsed = JSON.parse(previousState);
                        board = parsed;
                        if (selectedCell) {
                            selectedCell = board[selectedCell.row][selectedCell.col];
                        }
                    }
                }
            } else {
                showAlert('실수 방패 아이템이 부족합니다! 🛡️');
            }
        } else if (action === 'hint') {
            const ok = await useItem('hint_ticket');
            if (ok) {
                // Find empty cells
                const emptyCells = [];
                for(let r=0; r<9; r++) {
                    for(let c=0; c<9; c++) {
                        if (board[r][c].value === null) {
                            emptyCells.push({r, c});
                        }
                    }
                }
                
                if (emptyCells.length > 0) {
                    addToHistory();
                    const target = emptyCells[Math.floor(Math.random() * emptyCells.length)];
                    const correctVal = solution[target.r][target.c];
                    
                    board[target.r][target.c].value = correctVal;
                    board[target.r][target.c].notes = [];
                    board[target.r][target.c].isFixed = true; // Treat as fixed/given
                    
                    checkWin();
                }
            } else {
                showAlert('힌트 티켓이 부족합니다! 🎫');
            }
        } else if (action === 'time_stop') {
            if (isTimeFrozen) {
                showAlert('이미 시간이 정지된 상태입니다! ❄️');
                return;
            }
            const ok = await useItem('time_stop');
            if (ok) {
                isTimeFrozen = true;
                setTimeout(() => {
                    isTimeFrozen = false;
                }, 30000);
            } else {
                showAlert('타임 스톱 아이템이 부족합니다! 😅');
            }
        } else if (action === 'refresh_prob') {
            showConfirm('현재 게임을 포기하고 새로운 문제를 시작하시겠습니까? (문제 교체 아이템 소모)', async () => {
                const ok = await useItem('refresh_prob');
                if (ok) {
                    startGame(true); 
                } else {
                    showAlert('문제 교체 아이템이 부족합니다! 😅');
                }
            });
        }
    }
    
    import { GAME_CONFIG } from '$lib/config';

    async function submitScore() {
        // if (!GAME_CONFIG.ENABLE_REWARDS) return; // Allow recording even if rewards disabled

        try {
            const res = await fetch('/api/game/record', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameId: 'sudoku',
                    difficulty: difficulty,
                    clearTime: timerValue,
                    score: 0,
                    skipReward: !GAME_CONFIG.ENABLE_REWARDS
                })
            });
            if (res.ok) {
                const data = await res.json();
                earnedPointsResult = data.earnedPoints;
                calculatedScore = data.score;
            }
        } catch (e) {
            console.error('Failed to submit score', e);
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
            <div class="start-header">
                <a href="/minigames" class="header-link left">← 오락실</a>
                <h1>Sudoku</h1>
                <button class="header-link right" onclick={() => view = 'ranking'}>랭킹 🏆</button>
            </div>
            
            {#if hasSavedGame && view === 'game' && startMode === 'initial'}
                <button class="btn-primary huge" onclick={loadSavedGame}>
                    📂 이어하기
                </button>
                <div class="divider">OR</div>
                <button class="btn-secondary huge" onclick={() => startMode = 'diff_select'}>
                    🆕 새 게임 시작
                </button>
            {/if}
            
            {#if view === 'game' && (!hasSavedGame || startMode === 'diff_select')}
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
                
                {#if hasSavedGame}
                    <button class="btn-text" onclick={() => startMode = 'initial'}>취소하고 돌아가기</button>
                {/if}
            {/if}

            {#if view === 'ranking'}
                <RankingBoard gameId="sudoku" />
                <button class="btn-text" onclick={() => view = 'game'}></button>
            {/if}
        </div>
    
    {:else}
        <!-- Game Header -->
        <header>
            <div class="header-info">
                <span class="difficulty-badge">{difficultyLabels[difficulty]}</span>
                <span class="mistakes">{mistakes}/3 실수</span>
            </div>
            
            <div class="timer-controls">
                <!-- Item Buttons -->
                <div class="header-items">
                    {#if $user.inventory.some((i: any) => i.item_code === 'time_stop')}
                        <button class="icon-btn theme-btn" onclick={() => handleAction('time_stop')} title="타임 스톱 (시간 정지)">
                             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="22"/><path d="m20 16-4-4 4-4"/><path d="m4 8 4 4-4 4"/><path d="m16 4-4 4-4-4"/><path d="m8 20 4-4 4 4"/></svg>
                        </button>
                    {/if}
                    {#if $user.inventory.some((i: any) => i.item_code === 'refresh_prob')}
                        <button class="icon-btn theme-btn" onclick={() => handleAction('refresh_prob')} title="문제 교체">
                             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
                        </button>
                    {/if}
                </div>

                <div class="timer" class:frozen={isTimeFrozen}>
                    {#if isTimeFrozen}❄️ {/if}{formatTime(displayTimer)}
                </div>
                <button class="icon-btn" onclick={pauseGame} aria-label="Pause">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="2" height="6"/><rect x="13" y="9" width="2" height="6"/></svg>
                </button>
            </div>
        </header>

        <!-- Game Board -->
        <div class="game-area" class:blurred={alertMessage || confirmMessage || gameState === 'paused'}>
             <BoardComponent 
                 {board} 
                 {selectedCell} 
                 isGameOver={gameState === 'finished'}
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



<!-- ... -->

    <!-- Game Over / Win Overlay -->
    {#if gameState === 'finished'}
        <div class="overlay">
            <div class="modal">
                <h2>{isWon ? '승리! 🎉' : '게임 오버 💀'}</h2>
                <div class="result-stats">
                     <p>시간: {formatTime(displayTimer)}</p>
                     <p>난이도: {difficultyLabels[difficulty]}</p>
                     <p>실수: {mistakes}</p>
                     <p class="score">🏆 점수: {calculatedScore}</p>
                     {#if isWon && earnedPointsResult > 0}
                        <p class="earned-points">✨ 획득 포인트: +{earnedPointsResult} P</p>
                     {/if}
                </div>
                
                {#if isWon && GAME_CONFIG.ENABLE_ADS}
                     <RewardedAd onReward={handleAdReward} />
                {/if}
                
                <button class="btn-primary" onclick={() => gameState = 'start'}>다시 하기</button>
                <button class="btn-text" onclick={quitGame}>나가기</button>
            </div>
        </div>
    {/if}
    <!-- Confirmation Modal -->
    {#if confirmMessage}
        <div class="overlay" onclick={() => handleConfirm(false)}>
            <div class="modal alert-modal" onclick={(e) => e.stopPropagation()}>
                <h3>확인 🤔</h3>
                <p>{confirmMessage}</p>
                <div class="modal-actions">
                    <button class="btn-secondary" onclick={() => handleConfirm(false)}>취소</button>
                    <button class="btn-primary" onclick={() => handleConfirm(true)}>확인</button>
                </div>
            </div>
        </div>
    {/if}

    <!-- Simple Alert Modal -->
    {#if alertMessage}
        <div class="overlay" onclick={() => alertMessage = null}>
            <div class="modal alert-modal" onclick={(e) => e.stopPropagation()}>
                <h3>알림 🔔</h3>
                <p>{alertMessage}</p>
                <button class="btn-primary" onclick={() => alertMessage = null}>확인</button>
            </div>
        </div>
    {/if}
</div>

<style>
    .modal-actions {
        display: flex;
        gap: 1rem;
        justify-content: center;
        width: 100%;
        margin-top: 1rem;
    }
    .modal-actions button {
        flex: 1;
        padding: 0.8rem;
    }



    .divider {
        font-weight: bold;
        color: #bbb;
        margin: 0.5rem 0;
        font-size: 0.9rem;
        letter-spacing: 1px;
    }
    .btn-secondary.huge {
        width: 100%;
        justify-content: center;
        padding: 1rem;
        background: #fff;
        border: 2px solid #eee;
        font-size: 1.1rem;
        margin-bottom: 0.5rem;
    }
    .btn-secondary.huge:hover {
        border-color: #ddd;
        background: #fafafa;
    }
    .alert-modal {
        max-width: 320px;
        padding: 2rem;
    }
    .alert-modal h3 {
        margin: 0;
        font-size: 1.4rem;
        color: #333;
    }
    .alert-modal p {
        font-size: 1.05rem;
        color: #555;
        line-height: 1.4;
    }

	/* Wrapper for the whole page */
    .game-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 2rem 1rem;
		gap: 0.5rem;
		max-width: 800px; /* Tighter width for focus */
		margin: 0 auto;
        min-height: 100vh;
        color: #333;
        position: relative;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
	}
    
    .screen {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 2.5rem;
        height: 90vh;
        width: 100%;
    }
    
    .start-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 0 1rem;
    }
    
    .start-header h1 {
        font-size: 2.5rem;
        font-weight: 200;
        color: #333;
        margin: 0;
    }
    
    .header-link {
        font-size: 0.85rem;
        color: #666;
        text-decoration: none;
        background: none;
        border: none;
        cursor: pointer;
        padding: 0.5rem;
        transition: color 0.2s;
    }
    
    .header-link:hover {
        color: #333;
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
        .screen {
            gap: 1rem;
            padding: 1rem 0;
        }
        .start-screen h1 {
            font-size: 2.2rem;
            margin-bottom: 0.5rem;
        }
        .options {
            flex-direction: column;
            align-items: stretch;
            padding: 0 1rem;
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
		flex-direction: row; 
        justify-content: space-between;
        align-items: center;
		gap: 0.5rem;
        padding: 1rem 0;
	}
    
    .header-info {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
    }
    
    .difficulty-badge {
        font-size: 0.75rem;
        font-weight: 600;
        color: #555;
        text-transform: uppercase;
        letter-spacing: 1px;
        border-radius: 20px;
    }
    
    .mistakes {
        font-size: 0.85rem;
        font-weight: 600;
        color: #333;
        display: flex;
        align-items: center;
        gap: 0.3rem;
    }
 
    .timer-controls {
        display: flex;
        align-items: center;
        gap: 1rem;
    }

    .header-items {
        display: flex;
        gap: 0.5rem;
        margin-right: 0.5rem;
    }
    
    .theme-btn {
        background: #f0f0f0;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1rem;
    }
    
    .timer {
        font-size: 1.6rem;
        font-weight: 400;
        font-variant-numeric: tabular-nums;
        color: #333;
        background: #f5f5f7;
        padding: 0.4rem 1rem;
        border-radius: 30px;
        min-width: 80px;
        text-align: center;
    }
    
    .timer.frozen {
        background: linear-gradient(135deg, #e0f7fa, #b2ebf2);
        color: #00838f;
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
        padding: 1rem 0;
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
        position: fixed;
        top:0; left:0; right:0; bottom:0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.2); /* Added slight bg dimming for better contrast */
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
    
    .sub-actions {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        margin-top: 1rem;
    }
    
    .btn-secondary {
        background: #f0f0f0;
        color: #333;
        border: none;
        padding: 0.8rem 2rem;
        border-radius: 50px;
        font-weight: 600;
        cursor: pointer;
        font-size: 1rem;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    
    .btn-secondary:hover {
        background: #e0e0e0;
    }

    @media (max-width: 600px) {
        .start-screen .btn-primary {
            width: 100%; /* Match the width of stretched difficulty buttons */
        }
        .btn-secondary {
            width: 100%;
            justify-content: center;
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

    .earned-points {
        font-size: 1.2rem;
        font-weight: 700;
        color: #007aff;
        margin-top: 0.5rem;
        animation: pop 0.5s cubic-bezier(0.18, 0.89, 0.32, 1.28);
    }
    
    @keyframes pop {
        0% { transform: scale(0.8); opacity: 0; }
        100% { transform: scale(1); opacity: 1; }
    }

    /* Sudoku Board Styles */
    .sudoku-board {
        display: flex;
        flex-direction: column;
        border: 3px solid #333;
        border-radius: 12px;
        background: #333;
        gap: 1px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
        user-select: none;
        overflow: hidden;
    }

    .row {
        display: flex;
        gap: 2px;
    }

    .row:nth-child(3n) {
        margin-bottom: 2px; /* Thicker gap for 3x3 boxes */
    }
    .row:last-child {
        margin-bottom: 0;
    }

    .cell {
        width: 40px;
        height: 40px;
        background: #fafafa;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.4rem;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s, transform 0.1s;
        position: relative;
        color: #1a73e8; /* User-entered numbers in blue */
    }

    .cell:nth-child(3n) {
        margin-right: 2px;
    }
    .cell:last-child {
        margin-right: 0;
    }
    
    .cell:active {
        transform: scale(0.95);
    }

    .cell.fixed {
        font-weight: 700;
        color: #333;
        background-color: #fff;
    }

    .cell.selected {
        background-color: #e8f0fe;
        box-shadow: inset 0 0 0 2px #1a73e8;
        z-index: 2;
    }

    /* Related cells (same row/col/box) */
    .cell.related {
        background-color: #f8f9fa;
    }

    /* Highlighted number (same value as selected) */
    .cell.highlighted {
        background-color: #c8e6ff;
        color: #0d47a1;
        font-weight: 700;
    }

    .cell.error {
        color: #d32f2f !important;
        background-color: #ffcdd2 !important;
        animation: shake 0.3s;
    }

    .cell .value {
        line-height: 1;
    }

    .cell .notes {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        width: 100%;
        height: 100%;
        padding: 2px;
    }

    .note {
        font-size: 9px;
        color: #666;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-2px); }
        75% { transform: translateX(2px); }
    }

    @media (max-width: 450px) {
        .cell {
            width: 36px;
            height: 36px;
            font-size: 1.3rem;
        }
        .start-screen h1 {
            font-size: 2.3rem;
        }
        .difficulty-select h2 {
            font-size: 0.85rem;
            margin-bottom: 0.4rem;
        }
  
        .btn-primary {
            padding: 0.7rem 1.5rem;
            font-size: 0.95rem;
            margin-top: 0.5rem;
        }
    }
    @media (max-width: 350px) {
        .cell {
            width: 32px;
            height: 32px;
            font-size: 1.1rem;
        }
        .start-screen h1 {
            font-size: 1.8rem;
        }
    }
</style>
