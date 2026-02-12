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

const TIME_LIMITS: Record<string, number> = {
    easy: 30, medium: 60, hard: 120, expert: 240, master: 360
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
    let hasSavedGame = $state(false);
    let hasRestarted = $state(false);

    // Modals
    let alertMessage: string | null = $state(null);
    let confirmMessage: string | null = $state(null);
    let confirmCallback: (() => void) | null = null;

    // Score
    let earnedPointsResult = $state(0);
    let calculatedScore = $state(0);

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
                hasRestarted,
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
            hasRestarted = data.hasRestarted || false;
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
    function startGame() {
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
            hasRestarted = false;

            gameState = 'playing';
            hasSavedGame = true;
            startTimer();
        saveGame();
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
    }

    function handleWin() {
        gameState = 'finished';
        isWon = true;
        stopTimer();
        localStorage.removeItem('unblockme_save');
        hasSavedGame = false;
        if (!hasRestarted) {
            submitScore();
        }
    }

    async function submitScore() {
        try {
            const extraMoves = currentLevel ? Math.max(0, moveCount - currentLevel.moves) : 0;
            const res = await fetch('/api/game/record', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameId: 'unblock-me',
                    difficulty,
                    clearTime: timerValue,
                    mistakes: extraMoves,
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
        showConfirm('다시시작하면 랭킹에 기록되지 않습니다. 계속하시겠습니까?', () => {
            stopTimer();
            hasRestarted = true;

            // Reset to same level
            if (currentLevel) {
                blocks = parseLevel(currentLevel);
            }
            moveCount = 0;
            isWon = false;
            timerValue = 0;
            displayTimer = 0;
            history = [];
            earnedPointsResult = 0;
            calculatedScore = 0;

            gameState = 'playing';
            hasSavedGame = true;
            startTimer();
            saveGame();
        });
    }

    function returnToMenu() {
        stopTimer();
        goto('/games/start/unblock-me');
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
        get hasSavedGame() { return hasSavedGame; },
        get hasRestarted() { return hasRestarted; },
        get alertMessage() { return alertMessage; },
        set alertMessage(v: string | null) { alertMessage = v; },
        get confirmMessage() { return confirmMessage; },
        get earnedPointsResult() { return earnedPointsResult; },
        get calculatedScore() { return calculatedScore; },
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
    };
}
