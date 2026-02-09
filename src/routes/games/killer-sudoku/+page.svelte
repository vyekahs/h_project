<script lang="ts">
	import { onMount } from 'svelte';
	import type { Board, Cell } from '$lib/games/sudoku/logic';
	import { generateKillerSudoku, getCageErrors, findCageForCell, type Cage } from '$lib/games/sudoku/killerLogic';
	import KillerBoardComponent from './KillerBoard.svelte';
	import Controls from '../sudoku/Controls.svelte';
    import KillerTutorialModal from './KillerTutorialModal.svelte';
    import { KILLER_TUTORIALS, KILLER_TUTORIAL_ORDER } from './killerTutorialData';
    import { goto } from '$app/navigation';
    import { browser } from '$app/environment';
    import RankingBoard from '$lib/components/gamification/RankingBoard.svelte';
    import RewardedAd from '$lib/components/ads/RewardedAd.svelte';
    import { user } from '$lib/stores/user';

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
	let difficulty: 'easy' | 'medium' | 'hard' | 'expert' = $state('easy');
	let board: Board = $state([]);
	let solution: number[][];
	let cages: Cage[] = $state([]);
	let selectedCell: Cell | null = $state(null);
	let isNoteMode = $state(false);
	let mistakes = $state(0);
	let isWon = $state(false);
    let timerValue = 0;
    let displayTimer = $state(0);
    let timerInterval: any;

    let view: 'game' | 'ranking' | 'tutorials_list' = $state('game');
    let rankingTab: 'halloffame' | 'ranking' = $state('halloffame');
    let hallOfFameData: any[] = $state([]);
    let hallOfFameLoading = $state(false);

    async function loadHallOfFame() {
        hallOfFameLoading = true;
        try {
            const res = await fetch('/api/ranking/halloffame/killer-sudoku');
            if (res.ok) {
                hallOfFameData = await res.json();
            }
        } catch (e) {
            console.error('Failed to load hall of fame', e);
        } finally {
            hallOfFameLoading = false;
        }
    }

    let history: string[] = $state([]);
    let earnedPointsResult = $state(0);
    let calculatedScore = $state(0);
    let isTimeFrozen = $state(false);

    let hasSavedGame = $state(false);
    let startMode: 'initial' | 'diff_select' = $state('initial');

    let showTutorial = $state(false);
    let activeTutorialId = $state('killer_easy_1');
    let hasUnlockedTutorials = $state(false);

    let unlockedTutorialIDs = $derived.by(() => {
        const db = ($user as any)?.completedTutorials || [];
        const local = browser ? JSON.parse(localStorage.getItem('killer_sudoku_unlocked_tutorials') || '[]') : [];
        return new Set([...db, ...local]);
    });

    $effect(() => {
        if (browser) {
            const unlockedLocal: string[] = JSON.parse(localStorage.getItem('killer_sudoku_unlocked_tutorials') || '[]');
            const unlockedDB: string[] = $user.completedTutorials || [];
            const all = [...unlockedLocal, ...unlockedDB];
            const hasKiller = all.some(id => typeof id === 'string' && id.startsWith('killer_'));

            if (hasKiller) {
                hasUnlockedTutorials = true;
            }
        }
    });

    onMount(() => {
        user.refresh();

        const saved = localStorage.getItem('killer_sudoku_save');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                if (data.board && data.solution && data.difficulty && data.cages) {
                    hasSavedGame = true;
                }
            } catch (e) {
                console.error('Failed to load save', e);
            }
        }

        return () => {
            clearInterval(timerInterval);
        };
    });



    function checkAndShowTutorial(diff: string) {
        if (!browser) return false;
        
        // Use derived Set (DB + Local)
        const unlocked = unlockedTutorialIDs;
        let targetId: string | null = null;

        if (diff === 'easy') {
            if (!unlocked.has('killer_easy_1')) targetId = 'killer_easy_1';
            else if (!unlocked.has('killer_easy_2')) targetId = 'killer_easy_2';
            else if (!unlocked.has('killer_easy_3')) targetId = 'killer_easy_3';
        } else if (diff === 'medium') {
            if (unlocked.has('killer_easy_3')) {
                if (!unlocked.has('killer_medium_1')) targetId = 'killer_medium_1';
                else if (!unlocked.has('killer_medium_2')) targetId = 'killer_medium_2';
            }
        } else if (diff === 'hard') {
            if (unlocked.has('killer_medium_2')) {
                if (!unlocked.has('killer_hard_1')) targetId = 'killer_hard_1';
                else if (!unlocked.has('killer_hard_2')) targetId = 'killer_hard_2';
            }
        } else if (diff === 'expert') {
            if (unlocked.has('killer_hard_2')) {
                if (!unlocked.has('killer_expert_1')) targetId = 'killer_expert_1';
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

    function loadSavedGame() {
        const saved = localStorage.getItem('killer_sudoku_save');
        if (saved) {
             try {
                const data = JSON.parse(saved);

                if (!Array.isArray(data.board) || data.board.length !== 9) {
                    throw new Error('Invalid board data');
                }

                board = data.board;
                solution = data.solution;
                cages = data.cages;
                timerValue = data.timer;
                displayTimer = data.timer;
                mistakes = data.mistakes;
                difficulty = data.difficulty;
                history = data.history || [];

                gameState = 'paused';
            } catch (e) {
                console.error('Failed to load save', e);
                showAlert('저장된 게임 데이터가 손상되어 이어할 수 없습니다. 새 게임을 시작합니다.');
                localStorage.removeItem('killer_sudoku_save');
                hasSavedGame = false;
                startMode = 'diff_select';
                view = 'game';
            }
        }
    }

    function saveGame() {
        if (gameState !== 'playing') return;
        const data = {
            board, solution, cages,
            timer: timerValue, mistakes, difficulty, history
        };
        localStorage.setItem('killer_sudoku_save', JSON.stringify(data));
    }

    function saveGameWithTimer(currentTimer: number) {
        if (gameState !== 'playing') return;
        const data = {
            board, solution, cages,
            timer: currentTimer, mistakes, difficulty, history
        };
        localStorage.setItem('killer_sudoku_save', JSON.stringify(data));
    }

    function clearSave() {
        localStorage.removeItem('killer_sudoku_save');
        hasSavedGame = false;
    }

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

    let currentCageErrors = $derived.by(() => {
        if (board.length === 0 || cages.length === 0) return new Set<string>();
        return getCageErrors(board, cages);
    });

    let isLoading = $state(false);

    async function startGame(force = false, skipTutorialCheck = false) {
        // Tutorial check
        if (!skipTutorialCheck && !force) {
            const shouldShow = checkAndShowTutorial(difficulty);
            if (shouldShow) return;
        }

        // Track tutorial completion
        if (showTutorial && activeTutorialId) {
            const unlocked = JSON.parse(localStorage.getItem('killer_sudoku_unlocked_tutorials') || '[]');
            if (!unlocked.includes(activeTutorialId)) {
                unlocked.push(activeTutorialId);
                localStorage.setItem('killer_sudoku_unlocked_tutorials', JSON.stringify(unlocked));

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
        }
        showTutorial = false;

        isLoading = true;
        await new Promise(resolve => setTimeout(resolve, 50));

        try {
            localStorage.removeItem('killer_sudoku_save');

            const result = generateKillerSudoku(difficulty);
            board = result.initialBoard;
            solution = result.solution;
            cages = result.cages;
            mistakes = 0;
            isWon = false;
            selectedCell = null;
            timerValue = 0;
            displayTimer = 0;
            history = [];

            gameState = 'playing';

            const data = {
                board, solution, cages,
                timer: 0, mistakes, difficulty, history
            };
            localStorage.setItem('killer_sudoku_save', JSON.stringify(data));
            hasSavedGame = true;

            startTimer();
        } finally {
            isLoading = false;
        }
    }

    function addToHistory() {
        history.push(JSON.stringify(board));
    }

    function startTimer() {
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            if (gameState === 'playing' && !isTimeFrozen && !alertMessage && !confirmMessage) {
                timerValue++;
                displayTimer = timerValue;
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
        localStorage.removeItem('killer_sudoku_save');
        hasSavedGame = false;
        gameState = 'start';
    }

	function handleCellSelect(cell: Cell) {
		if (gameState !== 'playing' || alertMessage || confirmMessage) return;
		selectedCell = cell;
	}

    function removeNotes(r: number, c: number, num: number) {
        for(let i=0; i<9; i++) {
            const idx = board[r][i].notes.indexOf(num);
            if (idx !== -1) board[r][i].notes.splice(idx, 1);
        }
        for(let i=0; i<9; i++) {
            const idx = board[i][c].notes.indexOf(num);
            if (idx !== -1) board[i][c].notes.splice(idx, 1);
        }
        const startRow = Math.floor(r/3)*3;
        const startCol = Math.floor(c/3)*3;
        for(let i=0; i<3; i++) {
            for(let j=0; j<3; j++) {
                const cell = board[startRow+i][startCol+j];
                const idx = cell.notes.indexOf(num);
                if (idx !== -1) cell.notes.splice(idx, 1);
            }
        }
        // Also remove from same cage
        const cage = findCageForCell(r, c, cages);
        if (cage) {
            for (const { row, col } of cage.cells) {
                if (row === r && col === c) continue;
                const idx = board[row][col].notes.indexOf(num);
                if (idx !== -1) board[row][col].notes.splice(idx, 1);
            }
        }
    }

	function handleNumberInput(num: number) {
		if (gameState !== 'playing' || !selectedCell || selectedCell.isFixed || alertMessage || confirmMessage) return;

        addToHistory();

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

        if (completedNumbers.includes(num)) return;

        const correctVal = solution[selectedCell.row][selectedCell.col];

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
        clearSave();

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
        } else if (action === 'hint') {
            const ok = await useItem('hint_ticket');
            if (ok) {
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
                    board[target.r][target.c].isFixed = true;

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
        try {
            const res = await fetch('/api/game/record', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameId: 'killer-sudoku',
                    difficulty: difficulty,
                    clearTime: timerValue,
                    score: 0,
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

    const difficultyLabels: Record<string, string> = {
        easy: '쉬움',
        medium: '보통',
        hard: '어려움',
        expert: '전문가'
    };
</script>

<div class="game-container">
    {#if gameState === 'start'}
        {#if view === 'game'}
            <div class="screen start-screen">
                <div class="start-header">
                    <a href="/minigames" class="header-link left">← 오락실</a>
                    <h1>Killer Sudoku</h1>
                    <div class="header-links">
                        {#if hasUnlockedTutorials}
                            <button class="header-link" onclick={() => view = 'tutorials_list'}>공략집</button>
                        {/if}
                        <button class="header-link" onclick={() => { view = 'ranking'; rankingTab = 'halloffame'; loadHallOfFame(); }}>랭킹 🏆</button>
                    </div>
                </div>

                {#if hasSavedGame && startMode === 'initial'}
                    <div class="difficulty-select options">
                        <button class="btn-primary huge" onclick={loadSavedGame}>
                            이어하기
                        </button>
                        <div class="divider">OR</div>
                        <button class="btn-secondary huge" onclick={() => startMode = 'diff_select'}>
                            새 게임 시작
                        </button>
                    </div>
                    <div></div>
                {/if}

                {#if !hasSavedGame || startMode === 'diff_select'}
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
                        </div>
                    </div>
                    <button class="btn-primary huge" onclick={() => startGame()}>게임 시작</button>

                    {#if hasSavedGame}
                        <button class="btn-text" onclick={() => startMode = 'initial'}>취소하고 돌아가기</button>
                    {/if}
                {/if}
            </div>

        {:else if view === 'ranking'}
            <div class="subpage">
                <div class="start-header">
                    <button class="header-link left" onclick={() => view = 'game'}>← 뒤로</button>
                    <h1>랭킹</h1>
                    <div class="header-links"></div>
                </div>
                <div class="ranking-tabs">
                    <button class="tab" class:active={rankingTab === 'halloffame'} onclick={() => { rankingTab = 'halloffame'; loadHallOfFame(); }}>명예의 전당</button>
                    <button class="tab" class:active={rankingTab === 'ranking'} onclick={() => rankingTab = 'ranking'}>킬러 스도쿠 랭킹</button>
                </div>
                <div class="subpage-body">
                    {#if rankingTab === 'halloffame'}
                        <div class="hall-of-fame">
                            {#if hallOfFameLoading}
                                <div class="hof-loading">불러오는 중...</div>
                            {:else if hallOfFameData.length === 0}
                                <div class="hof-empty">아직 기록이 없습니다.</div>
                            {:else}
                                {#each hallOfFameData as record, i}
                                    {@const diffLabel = difficultyLabels[record.difficulty as keyof typeof difficultyLabels] || record.difficulty}
                                    <div class="hof-card" class:hof-top3={i < 3}>
                                        <div class="hof-rank" class:hof-rank-1={i === 0} class:hof-rank-2={i === 1} class:hof-rank-3={i === 2}>
                                            {i + 1}
                                        </div>
                                        <div class="hof-body">
                                            <div class="hof-player">
                                                <span class="hof-name">{record.nickname || '익명'}</span>
                                                <span class="hof-difficulty">{diffLabel}</span>
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
                                {/each}
                            {/if}
                        </div>
                    {:else}
                        <RankingBoard gameId="killer-sudoku" />
                    {/if}
                </div>
            </div>

        {:else if view === 'tutorials_list'}
            <div class="subpage">
                <div class="start-header">
                    <button class="header-link left" onclick={() => view = 'game'}>← 뒤로</button>
                    <h1>공략집</h1>
                    <div class="header-links"></div>
                </div>
                <div class="subpage-body">
                    <div class="tutorial-list-container">
                        <div class="tutorial-list">
                            {#each KILLER_TUTORIAL_ORDER as tid}
                                {@const t = KILLER_TUTORIALS[tid]}
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
            </div>
        {/if}

    {:else}
        <div class="game-play-area" class:blurred={alertMessage || confirmMessage || gameState === 'paused'}>
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

            <div class="game-area">
                 <KillerBoardComponent
                     {board}
                     {selectedCell}
                     {cages}
                     cageErrors={currentCageErrors}
                     isGameOver={gameState === 'finished'}
                     onselect={handleCellSelect}
                 />
            </div>

            <div class="controls-area" class:hidden={gameState !== 'playing'}>
                <Controls
                    bind:isNoteMode
                    completedNumbers={completedNumbers}
                    onnumber={handleNumberInput}
                    onaction={handleAction}
                    onnewgame={() => {}}
                />
            </div>
        </div>
    {/if}

    {#if gameState === 'paused'}
        <div class="overlay">
            <div class="modal">
                <h2>일시정지</h2>
                <button class="btn-primary" onclick={resumeGame}>계속하기</button>
                <button class="btn-danger" onclick={quitGame}>그만두기</button>
            </div>
        </div>
    {/if}

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
        <KillerTutorialModal tutorialId={activeTutorialId} onclose={(shouldStart: boolean) => {
            if (shouldStart) {
                startGame(true);
            } else {
                showTutorial = false;
            }
        }} />
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
        top: 0; left: 0;
        width: 100%; height: 100%;
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
        width: 40px; height: 40px;
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
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 0 1rem;
    }

    .start-header h1 {
        font-size: 2.2rem;
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
        font-size: 3rem;
        font-weight: 200;
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
            font-size: 2rem;
            margin-bottom: 0.5rem;
        }
        .options {
            flex-direction: column;
            align-items: stretch;
            padding: 0 1rem;
        }
        .options label {
            justify-content: center;
            padding: 0.8rem 1.5rem;
            font-size: 1rem;
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
        width: 32px; height: 32px;
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
        background: rgba(0,0,0,0.2);
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
            width: 100%;
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
        width: 28px; height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: #f0f0f0;
        color: #999;
        font-variant-numeric: tabular-nums;
        flex-shrink: 0;
    }
    .hof-rank-1 { background: #333; color: #fff; }
    .hof-rank-2 { background: #777; color: #fff; }
    .hof-rank-3 { background: #aaa; color: #fff; }
    .hof-body { flex: 1; min-width: 0; }
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
    .hof-stat svg { opacity: 0.5; }
    .hof-loading, .hof-empty {
        text-align: center;
        padding: 2rem;
        color: #888;
    }

    @media (max-width: 450px) {
        .start-screen h1 {
            font-size: 1.8rem;
        }
        .btn-primary {
            padding: 0.7rem 1.5rem;
            font-size: 0.95rem;
            margin-top: 0.5rem;
        }
    }

    /* Tutorial List Styles */
    .tutorial-list-container {
        width: 100%;
        max-width: 500px;
        margin: 0 auto;
        padding: 0 0.5rem;
    }
    .tutorial-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .tutorial-list-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #fff;
        border: 1px solid #eee;
        border-radius: 10px;
        padding: 0.8rem 1rem;
        cursor: pointer;
        transition: all 0.2s;
        width: 100%;
        text-align: left;
    }
    .tutorial-list-item:hover {
        background: #f8f9fa;
        border-color: #ddd;
    }
    .t-info {
        display: flex;
        align-items: center;
        gap: 0.6rem;
    }
    .t-badge {
        font-size: 0.6rem;
        font-weight: 700;
        padding: 0.15rem 0.4rem;
        border-radius: 4px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    .t-badge.easy { background: #d3f9d8; color: #2b8a3e; }
    .t-badge.medium { background: #fff3bf; color: #e67700; }
    .t-badge.hard { background: #ffc9c9; color: #c92a2a; }
    .t-badge.expert { background: #d0bfff; color: #5f3dc4; }
    .t-title {
        font-size: 0.95rem;
        font-weight: 600;
        color: #333;
    }
    .t-arrow {
        font-size: 1.2rem;
        color: #adb5bd;
        font-weight: 300;
    }
</style>
