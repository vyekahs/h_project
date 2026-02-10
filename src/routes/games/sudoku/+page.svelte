<script lang="ts">
	import { onMount } from 'svelte';
	import { generateSudoku, type Board, type Cell } from '$lib/games/sudoku/logic';
    import { generateKillerSudoku, type Cage, getCageErrors } from '$lib/games/sudoku/killerLogic';
	import BoardComponent from './Board.svelte';
	import Controls from './Controls.svelte';
    import { goto } from '$app/navigation';
    import { browser } from '$app/environment';
    import RankingBoard from '$lib/components/gamification/RankingBoard.svelte';
    import RewardedAd from '$lib/components/ads/RewardedAd.svelte';
    import { user } from '$lib/stores/user';
    import TutorialModal from './TutorialModal.svelte';
    import { TUTORIAL_ORDER, TUTORIALS } from './tutorialData';
    import { KILLER_TUTORIALS, KILLER_TUTORIAL_ORDER } from '../killer-sudoku/killerTutorialData';
    import KillerTutorialModal from '../killer-sudoku/KillerTutorialModal.svelte';

    // Game States: 'start', 'playing', 'paused', 'finished'
    type GameState = 'start' | 'playing' | 'paused' | 'finished';
    type GameMode = 'standard' | 'killer';

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
    let gameMode: GameMode = $state('standard');
    let currentTutorialOrder = $derived(gameMode === 'killer' ? KILLER_TUTORIAL_ORDER : TUTORIAL_ORDER);
    let currentTutorials = $derived(gameMode === 'killer' ? KILLER_TUTORIALS : TUTORIALS);
	let difficulty: 'easy' | 'medium' | 'hard' | 'expert' | 'master' = $state('medium');
	let board: Board = $state([]);
	let solution: number[][];
    let cages: Cage[] = $state([]); // For Killer Sudoku
	let selectedCell: Cell | null = $state(null);
	let isNoteMode = $state(false);
	let mistakes = $state(0);
	let isWon = $state(false);
    let timerValue = 0; // Non-reactive timer value
    let displayTimer = $state(0); // Reactive display value
    let timerInterval: any;
    
    // View state for Start Screen
    let view: 'game' | 'ranking' | 'tutorials_list' = $state('game'); // Keeping for compatibility or refactor? 
    // Actually, the plan says to refactor the start screen. 
    // 'view' currently toggles between 'game', 'ranking', 'tutorials_list'. 
    // But 'ranking' and 'tutorials_list' CHANGE the entire view (hiding the difficulty select).
    // The new design is: Start Screen HAS tabs. 
    // So 'view' might still be 'game' (meaning "not playing yet"? No, 'gameState' covers that).
    // The current code uses `gameState === 'start'` to show the start screen.
    // Inside `gameState === 'start'`, it uses `view` to switch sub-views.
    // I will replace `view` logic with `activeTab` logic INSIDE `gameState === 'start'`.
    
    let activeTab: 'difficulty' | 'ranking' | 'guide' = $state('difficulty');
    let rankingTab: 'halloffame' | 'ranking' = $state('ranking'); // Sub-tab for Ranking view
    let hallOfFameData: any[] = $state([]);
    let hallOfFameLoading = $state(false);

    async function loadHallOfFame() {
        hallOfFameLoading = true;
        try {
            // Determine gameId based on mode
            const gameId = gameMode === 'killer' ? 'killer-sudoku' : 'sudoku';
            const res = await fetch(`/api/ranking/halloffame/${gameId}`);
            if (res.ok) {
                hallOfFameData = await res.json();
            }
        } catch (e) {
            console.error('Failed to load hall of fame', e);
        } finally {
            hallOfFameLoading = false;
        }
    }
    
    // Simple history stack: stores JSON string of board state
    let history: string[] = $state([]);
    
    let showTutorial = $state(false);
    let activeTutorialId = $state('sudoku_easy_1'); // Default
    let earnedPointsResult = $state(0);
    let calculatedScore = $state(0);
    let isTimeFrozen = $state(false); // For Time Stop item

    let hasSavedGame = $state(false);
    let startMode: 'initial' | 'diff_select' = $state('initial');
    let hasUnlockedTutorials = $state(false);

    // Derived unlocked list for UI
    let unlockedTutorialIDs = $derived.by(() => {
        const db = ($user as any)?.completedTutorials || [];
        const localStandard = browser ? JSON.parse(localStorage.getItem('sudoku_unlocked_tutorials') || '[]') : [];
        const localKiller = browser ? JSON.parse(localStorage.getItem('killer_sudoku_unlocked_tutorials') || '[]') : [];
        return new Set([...db, ...localStandard, ...localKiller]);
    });

    // Load game on mount
    onMount(() => {
        // Ensure user data (inventory) is up to date
        user.refresh();

        // 1. Read Mode from URL
        if (browser) {
            const params = new URLSearchParams(window.location.search);
            const modeParam = params.get('mode');
            if (modeParam === 'killer') {
                gameMode = 'killer';
            } else if (modeParam === 'standard') {
                gameMode = 'standard';
            }
        }
        // If not specified, default to 'standard' (set in declaration)
        
        const saved = localStorage.getItem('sudoku_save');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                // Simple valid check
                if (data.board && data.solution && data.difficulty) {
                    hasSavedGame = true;
                    // Note: We don't overwrite gameMode here if URL param is present?
                    // Strategy: If URL param is explicitly set, it overrides save for the *Start Screen*
                    // But if user clicks "Resume", we load from save.
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

    $effect(() => {
        if (browser) {
            const unlockedLocal = JSON.parse(localStorage.getItem(
                gameMode === 'killer' ? 'killer_sudoku_unlocked_tutorials' : 'sudoku_unlocked_tutorials'
            ) || '[]');
            const unlockedDB = $user.completedTutorials || [];

            const all = [...unlockedLocal, ...unlockedDB];
            const prefix = gameMode === 'killer' ? 'killer_' : 'sudoku_';
            hasUnlockedTutorials = all.some((id: string) => typeof id === 'string' && id.startsWith(prefix));
        }
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
                gameMode = data.gameMode || 'standard';
                cages = data.cages || [];
                
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
            history,
            gameMode,
            cages
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
            history,
            gameMode,
            cages
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

    // Tutorial Logic
    function checkAndShowTutorial(diff: string) {
        if (!browser) return false;
        
        // Killer Sudoku Logic
        if (gameMode === 'killer') {
            const unlocked = JSON.parse(localStorage.getItem('killer_sudoku_unlocked_tutorials') || '[]');
            let targetId: string | null = null;
            
            if (diff === 'easy') {
                if (!unlocked.includes('killer_easy_1')) targetId = 'killer_easy_1';
                else if (!unlocked.includes('killer_easy_2')) targetId = 'killer_easy_2';
                else if (!unlocked.includes('killer_easy_3')) targetId = 'killer_easy_3';
            } else if (diff === 'medium') {
                if (unlocked.includes('killer_easy_3')) {
                    if (!unlocked.includes('killer_medium_1')) targetId = 'killer_medium_1';
                    else if (!unlocked.includes('killer_medium_2')) targetId = 'killer_medium_2';
                }
            } else if (diff === 'hard') {
                if (unlocked.includes('killer_medium_2')) {
                    if (!unlocked.includes('killer_hard_1')) targetId = 'killer_hard_1';
                    else if (!unlocked.includes('killer_hard_2')) targetId = 'killer_hard_2';
                }
            } else if (diff === 'expert' || diff === 'master') {
                if (unlocked.includes('killer_hard_2')) {
                    if (!unlocked.includes('killer_expert_1')) targetId = 'killer_expert_1';
                }
            }

            if (targetId) {
                openTutorial(targetId);
                return true;
            }
            return false;
        }

        // Standard Sudoku Logic
        const unlocked = JSON.parse(localStorage.getItem('sudoku_unlocked_tutorials') || '[]');
        
        // Determine which tutorial to show based on difficulty
        let targetId: string | null = null;
        
        if (diff === 'easy') {
            if (!unlocked.includes('sudoku_easy_1')) targetId = 'sudoku_easy_1';
            else if (!unlocked.includes('sudoku_easy_2')) targetId = 'sudoku_easy_2';
            else if (!unlocked.includes('sudoku_easy_3')) targetId = 'sudoku_easy_3';
        } else if (diff === 'medium') {
            if (unlocked.includes('sudoku_easy_3')) {
                if (!unlocked.includes('sudoku_medium_1')) targetId = 'sudoku_medium_1';
                else if (!unlocked.includes('sudoku_medium_2')) targetId = 'sudoku_medium_2';
            }
        } else if (diff === 'hard') {
            if (unlocked.includes('sudoku_medium_2')) {
                if (!unlocked.includes('sudoku_hard_1')) targetId = 'sudoku_hard_1';
                else if (!unlocked.includes('sudoku_hard_2')) targetId = 'sudoku_hard_2';
            }
        } else if (diff === 'expert' || diff === 'master') {
            if (unlocked.includes('sudoku_hard_2')) {
                if (!unlocked.includes('sudoku_expert_1')) targetId = 'sudoku_expert_1';
                else if (!unlocked.includes('sudoku_expert_2')) targetId = 'sudoku_expert_2';
                else if (!unlocked.includes('sudoku_expert_3')) targetId = 'sudoku_expert_3';
            }
        }
        
        if (targetId) {
            openTutorial(targetId);
            return true;
        }
        return false;
    }
    
    function openTutorial(id: string) {
        activeTutorialId = id;
        showTutorial = true;
    }

    // Start Screen Logic
    let isLoading = $state(false);

    async function startGame(force = false, skipTutorialCheck = false) {
        // 1. Tutorial Check
        if (!skipTutorialCheck && !force) { 
             const shouldShow = checkAndShowTutorial(difficulty);
             if (shouldShow) return;
        }

        isLoading = true;
        // Allow UI to update before heavy calculation
        await new Promise(resolve => setTimeout(resolve, 50));

        try {
            // 2. Play Count & Unlock Logic (Only for new games)
            if (force || !hasSavedGame) {
                if (browser) {
                    const playCounts = JSON.parse(localStorage.getItem('sudoku_play_counts') || '{}');
                    playCounts[difficulty] = (playCounts[difficulty] || 0) + 1;
                    localStorage.setItem('sudoku_play_counts', JSON.stringify(playCounts));
                    
                    // Track unlocked tutorials
                    if (showTutorial && activeTutorialId) {
                        const storageKey = gameMode === 'killer' ? 'killer_sudoku_unlocked_tutorials' : 'sudoku_unlocked_tutorials';
                        const unlocked = JSON.parse(localStorage.getItem(storageKey) || '[]');
                        if (!unlocked.includes(activeTutorialId)) {
                            unlocked.push(activeTutorialId);
                            localStorage.setItem(storageKey, JSON.stringify(unlocked));
                            
                            // Sync to DB
                            fetch('/api/user/tutorials/complete', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ tutorialId: activeTutorialId })
                            }).then(async (res) => {
                                if (res.ok) {
                                    await user.refresh();
                                }
                            });
                        }
                        hasUnlockedTutorials = true;
                    }
                }
            }
            
            showTutorial = false;
            
            // Clear any old save first
            localStorage.removeItem('sudoku_save');
            
            if (gameMode === 'killer') {
                 // Map 'master' -> 'expert' for logic because library might not support 'master' key
                // or ensure generateKillerSudoku handles it.
                // killerLogic.ts defines Difficulty = 'easy' | 'medium' | 'hard' | 'expert'
                const logicDiff = difficulty === 'master' ? 'expert' : difficulty;

                const result = generateKillerSudoku(logicDiff);
                board = result.initialBoard;
                solution = result.solution;
                cages = result.cages;
            } else {
                const result = generateSudoku(difficulty);
                board = result.initialBoard;
                solution = result.solution;
                cages = [];
            }
           
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
                cages,
                timer: 0, 
                mistakes,
                difficulty,
                history,
                gameMode
            };
            localStorage.setItem('sudoku_save', JSON.stringify(data));
            hasSavedGame = true;
            
            startTimer();
        } finally {
            isLoading = false;
        }
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
            // const ok = await useItem('undo_shield');
            // if (ok) {
                if (history.length > 0) {
                    const previousState = history.pop();
                    if (previousState) {
                        const parsed = JSON.parse(previousState);
                        const currentTimer = timerValue;
                        board = parsed;
                        displayTimer = currentTimer;
                        if (selectedCell) {
                            selectedCell = board[selectedCell.row][selectedCell.col];
                        }
                    }
                }
            // } else {
            //     showAlert('실수 방패 아이템이 부족합니다! 🛡️');
            // }
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
                    gameId: gameMode === 'killer' ? 'killer-sudoku' : 'sudoku',
                    difficulty: difficulty,
                    clearTime: timerValue,
                    mistakes: mistakes,
                    skipReward: !GAME_CONFIG.ENABLE_REWARDS
                })
            });
            const data = await res.json();
            if (res.ok) {
                earnedPointsResult = data.earnedPoints;
                calculatedScore = data.score;
            } else {
                console.error('Score submit failed:', res.status, data);
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
        <TutorialModal tutorialId={activeTutorialId} onclose={(shouldStart: boolean) => {
            if (shouldStart) {
                // startGame will mark tutorial as complete and then set showTutorial = false
                startGame(true);
            } else {
                showTutorial = false;
            }
        }} />
        
    {:else if gameState === 'start'}
        <div class="screen start-screen">
            <!-- Main Header -->
            <div class="start-header">
                <a href="/minigames" class="header-link left">← 오락실</a>
                <h1>{gameMode === 'killer' ? 'Killer Sudoku' : 'Sudoku'}</h1>
                <div class="header-links">
                    <!-- Right header area (empty or settings?) -->
                </div>
            </div>

            <!-- Tab Navigation -->
            <div class="tab-nav">
                <button 
                    class="tab-btn" 
                    class:active={activeTab === 'difficulty'} 
                    onclick={() => activeTab = 'difficulty'}
                >
                    난이도
                </button>
                <button 
                    class="tab-btn" 
                    class:active={activeTab === 'ranking'} 
                    onclick={() => { activeTab = 'ranking'; rankingTab = 'ranking'; }}
                >
                    랭킹
                </button>
                {#if hasUnlockedTutorials}
                    <button 
                        class="tab-btn" 
                        class:active={activeTab === 'guide'} 
                        onclick={() => activeTab = 'guide'}
                    >
                        공략집
                    </button>
                {/if}
            </div>

            <!-- Tab Content -->
            <div class="tab-content">
                
                <!-- 1. Difficulty Tab -->
                {#if activeTab === 'difficulty'}
                    <div class="difficulty-tab-content">
                        {#if hasSavedGame && startMode === 'initial'}
                            <div class="saved-game-prompt">
                                <button class="btn-primary huge" onclick={loadSavedGame}>
                                    이어하기
                                </button>
                                <div class="divider">OR</div>
                                <button class="btn-secondary huge" onclick={() => startMode = 'diff_select'}>
                                    새 게임 시작
                                </button>
                            </div>
                        {:else}
                            <div class="difficulty-selection-container">
                                <div class="difficulty-select">
                                    <!-- <h2>난이도 선택</h2> --> 
                                    <!-- Title removed or kept? User said "Difficulty Select and Start Button space-between" -->
                                    <!-- Let's keep it simple. -->
                                            
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
                                
                                <div class="start-actions">
                                    <button class="btn-primary huge" onclick={() => startGame()}>게임 시작</button>
                                    {#if hasSavedGame}
                                        <button class="btn-text" onclick={() => startMode = 'initial'}>취소</button>
                                    {/if}
                                </div>

                            </div>
                        {/if}
                    </div>

                <!-- 2. Ranking Tab -->
                {:else if activeTab === 'ranking'}
                    <div class="subpage-body">
                        <div class="ranking-tabs">
                            <button class="tab" class:active={rankingTab === 'ranking'} onclick={() => rankingTab = 'ranking'}>랭킹</button>
                            <button class="tab" class:active={rankingTab === 'halloffame'} onclick={() => { rankingTab = 'halloffame'; loadHallOfFame(); }}>명예의 전당</button>
                        </div>
                        
                        {#if rankingTab === 'halloffame'}
                            <div class="hall-of-fame-limit">
                                <p class="score-desc">점수 = 기본점수 + (제한시간 - 클리어시간) x 난이도 배율</p>
                                <div class="hall-of-fame">
                                    {#if hallOfFameLoading}
                                        <div class="hof-loading">불러오는 중...</div>
                                    {:else if hallOfFameData.length === 0}
                                        <div class="hof-empty">아직 기록이 없습니다.</div>
                                    {:else}
                                        {#each ['easy', 'medium', 'hard', 'expert', 'master'] as diff}
                                            {@const record = hallOfFameData.find((r: any) => r.difficulty === diff)}
                                            {@const diffLabel = difficultyLabels[diff as keyof typeof difficultyLabels]}
                                            {#if record}
                                                <div class="hof-card">
                                                    <div class="hof-diff-badge {diff}">
                                                        {diffLabel}
                                                    </div>
                                                    <div class="hof-body">
                                                        <div class="hof-player">
                                                            <span class="hof-name">{record.nickname || '익명'}</span>
                                                        </div>
                                                        <div class="hof-stats">
                                                            <span class="hof-stat">
                                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                                                                {record.score.toLocaleString()}
                                                            </span>
                                                            <span class="hof-stat">
                                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                                                {formatTime(record.clear_time)}
                                                            </span>
                                                            <span class="hof-stat">
                                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>
                                                                {record.mistakes}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            {:else}
                                                <div class="hof-card hof-empty-card">
                                                    <div class="hof-diff-badge {diff}">{diffLabel}</div>
                                                    <div class="hof-body">
                                                        <span class="hof-no-record">-</span>
                                                    </div>
                                                </div>
                                            {/if}
                                        {/each}
                                    {/if}
                                </div>
                            </div>
                        {:else}
                            <p class="score-desc">매월 1일 초기화</p>
                            <!-- Use dynamic gameId based on mode -->
                            <RankingBoard gameId={gameMode === 'killer' ? 'killer-sudoku' : 'sudoku'} />
                        {/if}
                    </div>

                <!-- 3. Guide Tab -->
                {:else if activeTab === 'guide'}
                    <div class="subpage-body">
                        <div class="tutorial-list-container">
                            <div class="tutorial-list">
                                {#each currentTutorialOrder as tid}
                                    {@const t = currentTutorials[tid]}
                                    {#if unlockedTutorialIDs.has(tid)}
                                        <button class="tutorial-list-item" onclick={() => openTutorial(tid)}>
                                            <div class="t-info">
                                                <span class="t-badge {t.difficulty}">{t.difficulty.toUpperCase()}</span>
                                                <span class="t-title">{t.title}</span>
                                            </div>
                                            <span class="t-arrow">›</span>
                                        </button>
                                    {/if}
                                {/each}
                            </div>
                        </div>
                    </div>
                {/if}
            </div>
        </div>

    {:else}
        <div class="game-play-area" class:blurred={alertMessage || confirmMessage || gameState === 'paused'}>
            <!-- Game Header -->
            <header>
                <div class="header-info">
                    <span class="difficulty-badge">{difficultyLabels[difficulty]}</span>
                    <span class="mistakes">{mistakes}/3 실수</span>
                </div>

                <div class="timer-controls">
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
            <div class="game-area">
                 <BoardComponent
                     {board}
                     {cages}
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

    <!-- Game Result Modal (Redesigned) -->
    {#if gameState === 'finished'}
        <div class="overlay backdrop-blur">
            <div class="result-card {isWon ? 'win' : 'lose'}">
                <div class="result-icon-container">
                    {#if isWon}
                        <div class="result-icon win-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
                            </svg>
                            <div class="particles">
                                <span>✨</span><span>🎉</span><span>⭐</span>
                            </div>
                        </div>
                    {:else}
                        <div class="result-icon lose-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                        </div>
                    {/if}
                </div>

                <h2 class="result-title">{isWon ? 'SUCCESS!' : 'GAME OVER'}</h2>
                <p class="result-message">
                    {#if isWon}
                        {calculatedScore >= 5000 ? '전설적인 기록입니다! 🏆' : '퍼즐을 완벽하게 해결했습니다! 🎉'}
                    {:else}
                        아쉽지만 다음 기회에... 😭
                    {/if}
                </p>

                <div class="result-stats-grid">
                    <div class="stat-item">
                        <span class="stat-label">난이도</span>
                        <span class="stat-value">{difficultyLabels[difficulty]}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">시간</span>
                        <span class="stat-value">{formatTime(displayTimer)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">실수</span>
                        <span class="stat-value">{mistakes} / 3</span>
                    </div>
                    <div class="stat-item highlight">
                        <span class="stat-label">점수</span>
                        <span class="stat-value">{calculatedScore.toLocaleString()}</span>
                    </div>
                </div>

                <!-- 
                {#if isWon && earnedPointsResult > 0}
                    <div class="reward-badge">
                        <span class="coin-icon">💰</span>
                        <span>+{earnedPointsResult} P</span>
                    </div>
                {/if} 
                -->

                {#if isWon && GAME_CONFIG.ENABLE_ADS}
                     <RewardedAd onReward={handleAdReward} />
                {/if}

                <div class="result-actions">
                    <button class="btn-primary huge-btn" onclick={() => gameState = 'start'}>
                        다시 도전하기
                    </button>
                    <button class="btn-text secondary-btn" onclick={quitGame}>
                        나가기
                    </button>
                </div>
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
    {#if showTutorial}
        {#if gameMode === 'killer'}
            <KillerTutorialModal tutorialId={activeTutorialId} onclose={(shouldStart: boolean) => {
                if (shouldStart) {
                    startGame(true);
                } else {
                    showTutorial = false;
                }
            }} />
        {:else}
            <TutorialModal tutorialId={activeTutorialId} onclose={(shouldStart: boolean) => {
                if (shouldStart) {
                    startGame(true);
                } else {
                    showTutorial = false;
                }
            }} />
        {/if}
    {/if}

    {#if isLoading}
        <div class="loading-overlay">
            <div class="spinner"></div>
            <p>게임 생성 중...</p>
        </div>
    {/if}
</div>

<style>
    .loading-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 2000;
        color: white;
        backdrop-filter: blur(5px);
    }
    .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid rgba(255, 255, 255, 0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 1rem;
    }
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
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
    :global(.app-layout:has(.game-container)) {
        min-height: 0 !important;
        height: 100dvh;
        padding-bottom: 0 !important;
        overflow: hidden;
    }
    .game-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0 1rem;
		gap: 0;
		max-width: 800px;
		margin: 0 auto;
        height: 100dvh;
        overflow: hidden;
        color: #333;
        position: relative;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        touch-action: manipulation;
	}
    
    .screen {
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        gap: 2.5rem;
        flex: 1;
        width: 100%;
        overflow: hidden;
        padding-top: 2rem;
    }
    .subpage {
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        width: 100%;
        flex: 1;
        gap: 2.5rem;
        overflow: hidden;
        padding-top: 2rem;
    }
    .subpage-body {
        overflow-y: auto;
        width: 100%;
    }
    
    .start-header {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        width: 100%;
        padding: 0 1rem;
    }
    
    .start-header h1 {
        font-size: 2.5rem;
        font-weight: 200;
        color: #333;
        margin: 0;
        text-align: center;
    }

    .header-link.left {
        justify-self: start;
    }

    .header-links {
        justify-self: end;
        display: flex;
        gap: 0.5rem;
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
    
    .start-screen {
        /* Screen is already flex col */
        padding-top: 2rem;
        gap: 0.5rem; /* Reduce gap, let inner containers handle it */
    }

    /* Tab Navigation */
    .tab-nav {
        display: flex;
        justify-content: center;
        gap: 0.5rem;
        padding: 0 1rem;
        margin-bottom: 0.5rem;
        flex-shrink: 0;
    }

    .tab-btn {
        background: transparent;
        border: none;
        padding: 0.6rem 1.2rem;
        font-size: 1rem;
        color: #888;
        font-weight: 500;
        cursor: pointer;
        position: relative;
        transition: color 0.2s;
    }

    .tab-btn.active {
        color: #333;
        font-weight: 700;
    }

    .tab-btn.active::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        height: 3px;
        background: #333;
        border-radius: 3px;
    }

    /* Tab Content - fills remaining space */
    .tab-content {
        flex: 1;
        width: 100%;
        overflow: hidden; /* Scroll inside */
        display: flex;
        flex-direction: column;
    }

    /* Difficulty Tab Layout */
    .difficulty-tab-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center; /* Center horizontally or vertically? */
        width: 100%;
        padding: 0 1rem 2rem 1rem;
    }

    .difficulty-selection-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: space-between; /* Push start button to bottom */
        width: 100%;
        align-items: center;
        gap: 2rem;
        padding-top: 2rem;
    }
    
    .difficulty-select {
        width: 100%;
    }

    .start-actions {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
    }

    .saved-game-prompt {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        flex: 1;
        width: 100%;
    }

    /* Scrollable ranking container */
    .hall-of-fame-limit {
        flex: 1;
        overflow-y: auto;
        padding: 0 1rem;
    }

    /* ... Existing Styles Below ... */
    
    .start-header {
        /* Reduced bottom margin */
        padding-bottom: 0.5rem; 
    }

    /* Fix start header title size for different modes if needed? */
    .start-header h1 {
        font-size: 2.2rem; /* Slightly smaller to fit tabs */
    }

    /* Hide old subpage styles if any overlap */
    .subpage-body {
        padding: 0; /* Remove padding for tab content context */
    }
    
    /* ... keep existing styles for options, btn, etc. ... */
    
    .options {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.8rem;
        width: 100%;
    }
    
    .options label {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 1.2rem;
        width: 100%;
        max-width: 500px;
        background: #f5f5f7;
        border-radius: 20px;
        cursor: pointer;
        font-weight: 600;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        border: 2px solid transparent;
        color: #555;
        font-size: 1.25rem;
        box-sizing: border-box;
    }
    
    .options label:hover {
        background: #f0f0f0;
    }

    /* ... */

    .btn-primary.huge {
        font-size: 1.3rem;
        padding: 1.4rem;
        width: 100%;
        max-width: 500px;
        border-radius: 24px;
    }

    /* ... */

    .btn-secondary.huge {
        width: 100%;
        max-width: 500px;
        justify-content: center;
        padding: 1.4rem;
        background: #fff;
        border: 2px solid #eee;
        font-size: 1.3rem;
        margin-bottom: 0.5rem;
        border-radius: 24px;
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
        padding: 0.5rem 0;
        flex-shrink: 0;
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

    .game-play-area {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        max-width: 500px;
        flex: 1;
        gap: 1rem;
    }

    .game-play-area.blurred {
        filter: blur(15px);
        opacity: 0.5;
    }

	.game-area {
		width: 100%;
	}

	.controls-area {
		width: 100%;
        padding-bottom: env(safe-area-inset-bottom, 0.5rem);
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
        padding: 1rem 2rem;
        width: 100%;
        max-width: 320px;
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

    .divider {
        font-weight: bold;
        color: #bbb;
        margin: 0.5rem 0;
        font-size: 0.9rem;
        letter-spacing: 1px;
    }

    .btn-secondary.huge {
        width: 100%;
        max-width: 320px;
        justify-content: center;
        padding: 1rem;
        background: #fff;
        border: 2px solid #eee;
        font-size: 1.1rem;
        margin-bottom: 0.5rem;
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

    /* Tutorial List Styles */
    .tutorial-list-container {
        width: 100%;
        max-width: 500px;
        margin: 0 auto;
    }
    
    .tutorial-list {
        display: flex;
        flex-direction: column;
        width: 100%;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        overflow: hidden;
    }
    
    .tutorial-list-item {
        background: white;
        border: none;
        border-bottom: 1px solid #f0f0f0;
        padding: 1rem 1.2rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        text-align: left;
        cursor: pointer;
        transition: background 0.2s;
    }
    
    .tutorial-list-item:hover {
        background: #f5f5f7;
    }
    
    .tutorial-list-item:last-child {
        border-bottom: none;
    }
    
    .t-info {
        display: flex;
        align-items: center;
        gap: 0.8rem;
    }
    
    .t-badge {
        font-size: 0.65rem;
        font-weight: 700;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        background: #eee;
        color: #666;
        min-width: 50px;
        text-align: center;
    }
    .t-badge.easy { background: #e8f5e9; color: #2e7d32; }
    .t-badge.medium { background: #fff3e0; color: #ef6c00; }
    .t-badge.hard { background: #ffebee; color: #c62828; }
    
    .t-title {
        font-size: 1rem;
        font-weight: 600;
        color: #333;
    }
    
    .t-arrow {
        color: #ccc;
        font-size: 1.5rem;
        font-weight: 300;
    }
    
    .empty-state {
        text-align: center;
        padding: 3rem 1rem;
        color: #888;
    }

    .empty-state p {
        margin: 0.5rem 0;
    }

    /* Ranking Tabs */
    .ranking-tabs {
        display: flex;
        gap: 0;
        width: 100%;
        max-width: 500px;
        margin: 0 auto;
        background: #f0f0f0;
        border-radius: 12px;
        padding: 4px;
    }
    .tab {
        flex: 1;
        padding: 0.6rem 1rem;
        border: none;
        background: transparent;
        border-radius: 10px;
        font-weight: 600;
        font-size: 0.9rem;
        color: #888;
        cursor: pointer;
        transition: all 0.2s;
    }
    .tab.active {
        background: #fff;
        color: #333;
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }

    /* Hall of Fame */
    .hall-of-fame {
        width: 100%;
        max-width: 500px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
        overflow-y: auto;
        flex: 1;
    }
    .hof-card {
        display: flex;
        align-items: center;
        gap: 0.9rem;
        background: #fff;
        border-radius: 10px;
        padding: 0.7rem 1rem;
        border: 1px solid #eee;
    }
    .hof-top3 {
        background: #fafafa;
        border-color: #ddd;
    }
    .hof-rank {
        font-size: 0.85rem;
        font-weight: 800;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: #f0f0f0;
        color: #999;
        font-variant-numeric: tabular-nums;
        flex-shrink: 0;
    }
    .hof-rank-1 {
        background: #333;
        color: #fff;
    }
    .hof-rank-2 {
        background: #777;
        color: #fff;
    }
    .hof-rank-3 {
        background: #aaa;
        color: #fff;
    }
    .hof-body {
        flex: 1;
        min-width: 0;
    }
    .hof-difficulty {
        font-size: 0.65rem;
        font-weight: 600;
        color: #bbb;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    .hof-player {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        margin-bottom: 0.2rem;
    }
    .hof-name {
        font-size: 0.95rem;
        font-weight: 700;
        color: #333;
    }
    .hof-stats {
        display: flex;
        gap: 0.7rem;
        font-size: 0.78rem;
        color: #888;
    }
    .hof-stat {
        display: flex;
        align-items: center;
        gap: 0.25rem;
    }
    .hof-stat svg {
        opacity: 0.5;
    }
    .hof-loading, .hof-empty {
        text-align: center;
        padding: 2rem;
        color: #888;
    }
    .hof-diff-badge {
        font-size: 0.75rem;
        font-weight: 700;
        padding: 0.3rem 0.6rem;
        border-radius: 6px;
        min-width: 50px;
        text-align: center;
        flex-shrink: 0;
        background: #f0f0f0;
        color: #666;
    }
    .hof-diff-badge.easy { background: #e8f5e9; color: #2e7d32; }
    .hof-diff-badge.medium { background: #fff3e0; color: #ef6c00; }
    .hof-diff-badge.hard { background: #ffebee; color: #c62828; }
    .hof-diff-badge.expert { background: #e8eaf6; color: #283593; }
    .hof-diff-badge.master { background: #f3e5f5; color: #6a1b9a; }
    .hof-empty-card {
        opacity: 0.5;
    }
    .hof-no-record {
        font-size: 0.85rem;
        color: #aaa;
    }
    .score-desc {
        text-align: center;
        font-size: 0.78rem;
        color: #999;
        margin: 1rem 0 1rem 0;
    }

    .mode-badge {
        font-size: 0.8rem;
        background: #007aff;
        color: white;
        padding: 2px 8px;
        border-radius: 12px;
        margin-left: 8px;
        vertical-align: middle;
        font-weight: 600;
        text-transform: uppercase;
    }

    /* Redesigned Result Modal */
    .overlay.backdrop-blur {
        backdrop-filter: blur(8px);
        background: rgba(0, 0, 0, 0.6);
    }

    .result-card {
        background: white;
        padding: 3.5rem 2rem 2.5rem 2rem;
        border-radius: 32px;
        width: 90%;
        max-width: 420px;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1.5rem;
        position: relative;
        overflow: visible;
    }

    .result-card.win {
        border: 2px solid rgba(255, 215, 0, 0.3);
    }

    /* Icon Animation */
    .result-icon-container {
        position: relative;
        margin-top: -1rem;
    }

    .result-icon {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto;
        color: white;
        box-shadow: 0 10px 20px rgba(0,0,0,0.2);
    }

    .win-icon {
        background: linear-gradient(135deg, #FFD700, #FFA500);
        animation: bounce 2s infinite;
    }

    .lose-icon {
        background: linear-gradient(135deg, #ff6b6b, #ee5253);
    }

    .result-icon svg {
        width: 40px;
        height: 40px;
    }

    .result-title {
        font-size: 2rem;
        font-weight: 800;
        margin: 0;
        letter-spacing: -1px;
        background: linear-gradient(45deg, #333, #666);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }

    .result-card.win .result-title {
        background: linear-gradient(45deg, #FFD700, #FFA500);
        -webkit-background-clip: text;
    }

    .result-message {
        color: #666;
        font-size: 1.1rem;
        margin: -0.5rem 0 0.5rem 0;
        line-height: 1.4;
    }

    /* Stats Grid */
    .result-stats-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        width: 100%;
        background: #f8f9fa;
        padding: 1.5rem;
        border-radius: 20px;
    }

    .stat-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.2rem;
    }

    .stat-label {
        font-size: 0.8rem;
        color: #888;
        font-weight: 600;
        text-transform: uppercase;
    }

    .stat-value {
        font-size: 1.1rem;
        font-weight: 700;
        color: #333;
    }

    .stat-item.highlight .stat-value {
        color: #3b82f6;
        font-size: 1.3rem;
    }

    /* Reward Badge */
    .reward-badge {
        background: #FFF9C4;
        color: #FBC02D;
        padding: 0.5rem 1rem;
        border-radius: 50px;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        box-shadow: 0 4px 10px rgba(251, 192, 45, 0.2);
    }

    /* Actions */
    .result-actions {
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
        width: 100%;
        margin-top: 0.5rem;
    }

    .huge-btn {
        width: 100%;
        padding: 1rem;
        font-size: 1.1rem;
        border-radius: 16px;
        box-shadow: 0 8px 20px rgba(59, 130, 246, 0.3);
    }

    .secondary-btn {
        color: #888;
        font-weight: 500;
    }
    
    .secondary-btn:hover {
        color: #333;
        background: none;
    }

    @keyframes popIn {
        from { transform: scale(0.8); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
    }

    @keyframes bounce {
        0%, 20%, 50%, 80%, 100% {transform: translateY(0);}
        40% {transform: translateY(-10px);}
        60% {transform: translateY(-5px);}
    }
    
    .particles {
        position: absolute;
        width: 100%;
        height: 100%;
        pointer-events: none;
    }
    
    .particles span {
        position: absolute;
        animation: float 2s infinite ease-in-out;
    }
    .particles span:nth-child(1) { top: -10px; left: -10px; animation-delay: 0s; font-size: 1.2rem; }
    .particles span:nth-child(2) { top: 0px; right: -15px; animation-delay: 0.5s; font-size: 1rem; }
    .particles span:nth-child(3) { bottom: -5px; left: 50%; animation-delay: 1s; font-size: 0.8rem; }
    
    @keyframes float {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
    }
</style>
