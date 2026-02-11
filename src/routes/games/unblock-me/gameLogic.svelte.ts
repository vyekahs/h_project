import { GAME_CONFIG } from '$lib/config';
import { getRandomLevel, parseLevel } from '$lib/games/unblock-me/levels';
import type { Block, UnblockLevel } from '$lib/games/unblock-me/levels';
import { goto } from '$app/navigation';
import { formatTime } from '$lib/games/utils';

export type GameState = 'start' | 'playing' | 'paused' | 'finished';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert' | 'master';

export const difficultyLabels: Record<string, string> = {
    easy: '쉬움', medium: '보통', hard: '어려움', expert: '전문가', master: '마스터'
};

export const difficultyList: Difficulty[] = ['easy', 'medium', 'hard', 'expert', 'master'];

const TIME_LIMITS: Record<string, number> = {
    easy: 120, medium: 300, hard: 600, expert: 900, master: 1200
};

export { formatTime };

export function createUnblockMeGame() {
    // Game state
    let gameState: GameState = $state('start');
    let difficulty: Difficulty = $state('medium');
    let blocks: Block[] = $state([]);
    let currentLevel: UnblockLevel | null = $state(null);
    let moveCount = $state(0);
    let isWon = $state(false);

    // Timer
    let timerValue = 0;
    let displayTimer = $state(0);
    let timerInterval: any;

    // History for undo
    let history: string[] = $state([]);

    // UI state
    let activeTab: 'difficulty' | 'ranking' = $state('difficulty');
    let hasSavedGame = $state(false);
    let startMode: 'initial' | 'diff_select' = $state('initial');
    let isLoading = $state(false);

    // Modals
    let alertMessage: string | null = $state(null);
    let confirmMessage: string | null = $state(null);
    let confirmCallback: (() => void) | null = null;

    // Score
    let earnedPointsResult = $state(0);
    let calculatedScore = $state(0);

    // Ranking
    let hallOfFameData: any[] = $state([]);
    let hallOfFameLoading = $state(false);

    // Modal helpers
    function showAlert(msg: string) { alertMessage = msg; }

    function showConfirm(msg: string, cb: () => void) {
        confirmMessage = msg;
        confirmCallback = cb;
    }

    function handleConfirm(yes: boolean) {
        if (yes && confirmCallback) confirmCallback();
        confirmMessage = null;
        confirmCallback = null;
    }

    // Timer
    function startTimer() {
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            if (gameState === 'playing' && !alertMessage && !confirmMessage) {
                timerValue++;
                displayTimer = timerValue;
                if (timerValue % 5 === 0) {
                    saveGame();
                }
            }
        }, 1000);
    }

    function stopTimer() {
        clearInterval(timerInterval);
    }

    // Save / Load
    function saveGame() {
        if (gameState !== 'playing') return;
        try {
            const data = {
                blocks,
                currentLevel,
                moveCount,
                timer: timerValue,
                difficulty,
                history,
            };
            localStorage.setItem('unblockme_save', JSON.stringify(data));
        } catch {}
    }

    function loadGame() {
        try {
            const raw = localStorage.getItem('unblockme_save');
            if (!raw) { showAlert('저장된 게임이 없습니다.'); return; }

            const data = JSON.parse(raw);
            if (!data.blocks || !Array.isArray(data.blocks) || !data.currentLevel) {
                showAlert('저장 데이터가 손상되었습니다.');
                localStorage.removeItem('unblockme_save');
                hasSavedGame = false;
                return;
            }

            blocks = data.blocks;
            currentLevel = data.currentLevel;
            moveCount = data.moveCount || 0;
            timerValue = data.timer || 0;
            displayTimer = timerValue;
            difficulty = data.difficulty || 'medium';
            history = data.history || [];
            isWon = false;

            gameState = 'paused';
            startTimer();
        } catch {
            showAlert('저장 데이터를 불러올 수 없습니다.');
            localStorage.removeItem('unblockme_save');
            hasSavedGame = false;
        }
    }

    // Game flow
    async function startGame() {
        isLoading = true;
        await new Promise(r => setTimeout(r, 50));

        try {
            localStorage.removeItem('unblockme_save');
            const level = getRandomLevel(difficulty);
            currentLevel = level;
            blocks = parseLevel(level);
            moveCount = 0;
            isWon = false;
            timerValue = 0;
            displayTimer = 0;
            history = [];
            earnedPointsResult = 0;
            calculatedScore = 0;

            gameState = 'playing';
            hasSavedGame = true;
            startMode = 'initial';
            startTimer();
            saveGame();
        } finally {
            isLoading = false;
        }
    }

    function handleBeforeMove() {
        // Save current state before block position changes
        if (history.length >= 50) {
            history = history.slice(1);
        }
        history = [...history, JSON.stringify(blocks.map(b => ({ ...b })))];
    }

    function handleMove() {
        moveCount++;
    }

    function undo() {
        if (history.length === 0) return;
        const prev = history[history.length - 1];
        history = history.slice(0, -1);
        blocks = JSON.parse(prev);
        if (moveCount > 0) moveCount--;
    }

    function handleWin() {
        gameState = 'finished';
        isWon = true;
        stopTimer();
        localStorage.removeItem('unblockme_save');
        hasSavedGame = false;
        submitScore();
    }

    function calculateScoreValue(): number {
        if (!currentLevel) return 0;

        const baseScore = difficulty === 'easy' ? 10
            : difficulty === 'medium' ? 50
            : difficulty === 'hard' ? 120
            : difficulty === 'expert' ? 250 : 400;

        const timeLimit = TIME_LIMITS[difficulty];
        const timeMultiplier = difficulty === 'easy' ? 1
            : difficulty === 'medium' ? 2
            : difficulty === 'hard' ? 3
            : difficulty === 'expert' ? 4 : 5;
        const timeBonus = Math.max(0, (timeLimit - timerValue) * timeMultiplier);

        const moveMultiplier = difficulty === 'easy' ? 2
            : difficulty === 'medium' ? 4
            : difficulty === 'hard' ? 6
            : difficulty === 'expert' ? 8 : 10;
        const moveBonus = Math.max(0, (currentLevel.moves * 3 - moveCount) * moveMultiplier);

        return baseScore + timeBonus + moveBonus;
    }

    async function submitScore() {
        const score = calculateScoreValue();
        calculatedScore = score;

        try {
            const res = await fetch('/api/game/record', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameId: 'unblock-me',
                    difficulty,
                    clearTime: timerValue,
                    score,
                    mistakes: 0,
                    skipReward: !GAME_CONFIG.ENABLE_REWARDS
                })
            });
            const data = await res.json();
            if (res.ok) {
                earnedPointsResult = data.earnedPoints;
                calculatedScore = data.score;
            }
        } catch (e) {
            console.error('Failed to submit score', e);
        }
    }

    function pauseGame() { gameState = 'paused'; }
    function resumeGame() { gameState = 'playing'; }

    function quitGame() {
        showConfirm('게임을 종료하시겠습니까?', () => {
            stopTimer();
            localStorage.removeItem('unblockme_save');
            hasSavedGame = false;
            goto('/games/start/unblock-me');
        });
    }

    function restartGame() {
        stopTimer();
        localStorage.removeItem('unblockme_save');
        startGame();
    }

    function returnToMenu() {
        stopTimer();
        goto('/games/start/unblock-me');
    }

    function checkSavedGame() {
        try {
            const saved = localStorage.getItem('unblockme_save');
            if (saved) {
                hasSavedGame = true;
            }
        } catch {}
    }

    return {
        // State (getters/setters for reactivity)
        get gameState() { return gameState; },
        set gameState(v: GameState) { gameState = v; },
        get difficulty() { return difficulty; },
        set difficulty(v: Difficulty) { difficulty = v; },
        get blocks() { return blocks; },
        set blocks(v: Block[]) { blocks = v; },
        get currentLevel() { return currentLevel; },
        get moveCount() { return moveCount; },
        get isWon() { return isWon; },
        get timerValue() { return timerValue; },
        get displayTimer() { return displayTimer; },
        get history() { return history; },
        get activeTab() { return activeTab; },
        set activeTab(v: 'difficulty' | 'ranking') { activeTab = v; },
        get hasSavedGame() { return hasSavedGame; },
        get startMode() { return startMode; },
        set startMode(v: 'initial' | 'diff_select') { startMode = v; },
        get isLoading() { return isLoading; },
        get alertMessage() { return alertMessage; },
        set alertMessage(v: string | null) { alertMessage = v; },
        get confirmMessage() { return confirmMessage; },
        get earnedPointsResult() { return earnedPointsResult; },
        get calculatedScore() { return calculatedScore; },
        get hallOfFameData() { return hallOfFameData; },
        get hallOfFameLoading() { return hallOfFameLoading; },

        // Functions
        showAlert,
        showConfirm,
        handleConfirm,
        startTimer,
        stopTimer,
        saveGame,
        loadGame,
        startGame,
        handleBeforeMove,
        handleMove,
        undo,
        handleWin,
        pauseGame,
        resumeGame,
        quitGame,
        restartGame,
        returnToMenu,
        checkSavedGame,
    };
}
