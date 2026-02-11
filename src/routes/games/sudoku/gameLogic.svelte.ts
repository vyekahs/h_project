import { generateSudoku, type Board, type Cell } from '$lib/games/sudoku/logic';
import { generateKillerSudoku, type Cage, getCageErrors } from '$lib/games/sudoku/killerLogic';
import { goto } from '$app/navigation';
import { browser } from '$app/environment';
import { user } from '$lib/stores/user';
import { GAME_CONFIG } from '$lib/config';

export type GameState = 'start' | 'playing' | 'paused' | 'finished';
export type GameMode = 'standard' | 'killer';

export function formatTime(seconds: number) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const difficultyLabels: Record<string, string> = {
    easy: '쉬움',
    medium: '보통',
    hard: '어려움',
    expert: '전문가',
    master: '마스터'
};

export function createSudokuGame() {
    // Game States
    let gameState: GameState = $state('start');
    let gameMode: GameMode = $state('standard');
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

    // View state
    let activeTab: 'difficulty' | 'ranking' | 'guide' = $state('difficulty');
    let rankingTab: 'halloffame' | 'ranking' = $state('ranking');
    let hallOfFameData: any[] = $state([]);
    let hallOfFameLoading = $state(false);

    async function loadHallOfFame() {
        hallOfFameLoading = true;
        try {
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

    // Simple history stack
    let history: string[] = $state([]);

    // Tutorial state (managed here, but tutorial check logic is in tutorialLogic)
    let showTutorial = $state(false);
    let activeTutorialId = $state('sudoku_easy_1');

    let earnedPointsResult = $state(0);
    let calculatedScore = $state(0);
    let isTimeFrozen = $state(false);

    let hasSavedGame = $state(false);
    let startMode: 'initial' | 'diff_select' = $state('initial');
    let hasUnlockedTutorials = $state(false);

    // Derived
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

    // Loading
    let isLoading = $state(false);

    // Alert/Confirm Modal State
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
                startMode = 'diff_select';
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

    // Tutorial helpers (actual check logic is external)
    let checkAndShowTutorialFn: ((diff: string) => boolean) | null = null;

    function setTutorialChecker(fn: (diff: string) => boolean) {
        checkAndShowTutorialFn = fn;
    }

    async function startGame(force = false, skipTutorialCheck = false) {
        // 1. Tutorial Check
        if (!skipTutorialCheck && !force) {
             const shouldShow = checkAndShowTutorialFn?.(difficulty) ?? false;
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
            history = [];

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
        if (history.length >= 50) {
            history.shift();
        }
        history.push(JSON.stringify(board));
    }

    // Timer Logic
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
        localStorage.removeItem('sudoku_save');
        hasSavedGame = false;
        goto(`/games/start/${gameMode === 'killer' ? 'killer-sudoku' : 'sudoku'}`);
    }

    function restartGame() {
        clearInterval(timerInterval);
        localStorage.removeItem('sudoku_save');
        startGame(true, true);
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

    async function submitScore() {
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

    function checkSavedGameExists() {
        const saved = localStorage.getItem('sudoku_save');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                if (data.board && data.solution && data.difficulty) {
                    hasSavedGame = true;
                }
            } catch (e) {
                console.error('Failed to load save', e);
            }
        }
    }

    function clearTimerInterval() {
        clearInterval(timerInterval);
    }

    return {
        // State (getters/setters for reactivity)
        get gameState() { return gameState; },
        set gameState(v: GameState) { gameState = v; },
        get gameMode() { return gameMode; },
        set gameMode(v: GameMode) { gameMode = v; },
        get difficulty() { return difficulty; },
        set difficulty(v: 'easy' | 'medium' | 'hard' | 'expert' | 'master') { difficulty = v; },
        get board() { return board; },
        set board(v: Board) { board = v; },
        get cages() { return cages; },
        set cages(v: Cage[]) { cages = v; },
        get selectedCell() { return selectedCell; },
        set selectedCell(v: Cell | null) { selectedCell = v; },
        get isNoteMode() { return isNoteMode; },
        set isNoteMode(v: boolean) { isNoteMode = v; },
        get mistakes() { return mistakes; },
        get isWon() { return isWon; },
        get displayTimer() { return displayTimer; },
        get activeTab() { return activeTab; },
        set activeTab(v: 'difficulty' | 'ranking' | 'guide') { activeTab = v; },
        get rankingTab() { return rankingTab; },
        set rankingTab(v: 'halloffame' | 'ranking') { rankingTab = v; },
        get hallOfFameData() { return hallOfFameData; },
        get hallOfFameLoading() { return hallOfFameLoading; },
        get history() { return history; },
        get showTutorial() { return showTutorial; },
        set showTutorial(v: boolean) { showTutorial = v; },
        get activeTutorialId() { return activeTutorialId; },
        set activeTutorialId(v: string) { activeTutorialId = v; },
        get earnedPointsResult() { return earnedPointsResult; },
        get calculatedScore() { return calculatedScore; },
        get isTimeFrozen() { return isTimeFrozen; },
        get hasSavedGame() { return hasSavedGame; },
        set hasSavedGame(v: boolean) { hasSavedGame = v; },
        get startMode() { return startMode; },
        set startMode(v: 'initial' | 'diff_select') { startMode = v; },
        get hasUnlockedTutorials() { return hasUnlockedTutorials; },
        set hasUnlockedTutorials(v: boolean) { hasUnlockedTutorials = v; },
        get completedNumbers() { return completedNumbers; },
        get isLoading() { return isLoading; },
        get alertMessage() { return alertMessage; },
        set alertMessage(v: string | null) { alertMessage = v; },
        get confirmMessage() { return confirmMessage; },

        // Functions
        loadHallOfFame,
        showAlert,
        showConfirm,
        handleConfirm,
        loadSavedGame,
        saveGame,
        startGame,
        addToHistory,
        startTimer,
        pauseGame,
        resumeGame,
        quitGame,
        restartGame,
        handleCellSelect,
        handleNumberInput,
        handleAction,
        handleAdReward,
        handleGameOver,
        checkSavedGameExists,
        clearTimerInterval,
        setTutorialChecker,
        formatTime,
    };
}
