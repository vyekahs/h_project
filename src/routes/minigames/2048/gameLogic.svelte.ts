import { GAME_CONFIG } from '$lib/config';
import { createBoard, cloneBoard, move, canMove, getMaxTile } from '$lib/games/2048/gameLogic';
import type { Board, Direction, MoveResult } from '$lib/games/2048/types';
import { formatTime } from '$lib/games/utils';
import { rankUpStore } from '$lib/stores/rankUpStore.svelte';

export type GameState = 'start' | 'playing' | 'paused' | 'finished';

export { formatTime };

export function create2048Game() {
	// Game state
	let gameState: GameState = $state('start');
	let board: Board = $state(createBoard());
	let moveCount = $state(0);

	// Timer
	let timerValue = 0;
	let displayTimer = $state(0);
	let timerInterval: any;

	// UI state
	let hasRestarted = $state(false);

	// Modals
	let alertMessage: string | null = $state(null);
	let confirmMessage: string | null = $state(null);
	let confirmCallback: (() => void) | null = null;

	// Score
	let calculatedScore = $state(0);
	let newTitleName = $state<string | null>(null);
	let showVisitPrompt = $state(false);

	// Animation tracking
	let lastSpawnedId: number | null = $state(null);
	let lastMergedIds: number[] = $state([]);
	let isAnimating = $state(false);

	// Undo
	const MAX_UNDO = 10;
	const UNDO_PENALTY_RATE = 0.05;
	let history: { board: Board; mergeScore: number }[] = $state([]);
	let undoCount = $state(0);

	// Modal helpers
	function showAlert(msg: string) {
		alertMessage = msg;
	}

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
				tiles: board.tiles.map(t => ({ ...t })),
				score: board.score,
				nextId: board.nextId,
				moveCount,
				timer: timerValue,
				hasRestarted
			};
			localStorage.setItem('2048_save', JSON.stringify(data));
		} catch {}
	}

	function loadGame() {
		try {
			const raw = localStorage.getItem('2048_save');
			if (!raw) {
				showAlert('저장된 게임이 없습니다.');
				return;
			}

			const data = JSON.parse(raw);
			if (!data.tiles || !Array.isArray(data.tiles)) {
				showAlert('저장 데이터가 손상되었습니다.');
				localStorage.removeItem('2048_save');
				return;
			}

			board = {
				tiles: data.tiles.map((t: any) => ({ ...t })),
				score: data.score || 0,
				nextId: data.nextId || data.tiles.length
			};
			moveCount = data.moveCount || 0;
			timerValue = data.timer || 0;
			displayTimer = timerValue;
			hasRestarted = data.hasRestarted || false;

			lastSpawnedId = null;
			lastMergedIds = [];
			history = [];
			undoCount = 0;

			gameState = 'paused';
			startTimer();
		} catch {
			showAlert('저장 데이터를 불러올 수 없습니다.');
			localStorage.removeItem('2048_save');
		}
	}

	// Game flow
	function startGame() {
		localStorage.removeItem('2048_save');
		board = createBoard();
		moveCount = 0;
		timerValue = 0;
		displayTimer = 0;
		calculatedScore = 0;
		showVisitPrompt = false;
		hasRestarted = false;
		newTitleName = null;
		lastSpawnedId = null;
		lastMergedIds = [];
		isAnimating = false;
		history = [];
		undoCount = 0;

		gameState = 'playing';
		startTimer();
		saveGame();
	}

	function handleMove(direction: Direction) {
		if (gameState !== 'playing' || isAnimating) return;

		const result: MoveResult = move(board, direction);
		if (!result.moved) return;

		// Save current state to history before applying move
		history = [...history.slice(-(MAX_UNDO - 1)), { board: cloneBoard(board), mergeScore: result.mergeScore }];

		isAnimating = true;

		// Track animation targets
		lastMergedIds = [];
		lastSpawnedId = null;

		// Apply the new board
		board = result.board;
		moveCount++;

		if (result.spawnedTile) {
			lastSpawnedId = result.spawnedTile.id;
		}

		// After slide animation, check game over
		setTimeout(() => {
			isAnimating = false;

			if (!canMove(board)) {
				handleGameOver();
			} else {
				saveGame();
			}
		}, 200);
	}

	function handleGameOver() {
		localStorage.removeItem('2048_save');
		gameState = 'finished';
		stopTimer();
		if (!hasRestarted) {
			submitScore();
		}
	}

	async function submitScore() {
		try {
			const res = await fetch('/api/game/record', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					gameId: '2048',
					difficulty: 'classic',
					clearTime: timerValue,
					score: board.score,
					mistakes: moveCount,
					skipReward: !GAME_CONFIG.ENABLE_REWARDS
				})
			});
			const data = await res.json();
			if (res.ok) {
				calculatedScore = data.score;

				if (data.currentRank && (!data.previousRank || data.currentRank < data.previousRank)) {
					rankUpStore.show(data.previousRank, data.currentRank, '2048', data.score);
				}

				if (data.newTitles && data.newTitles.length > 0) {
					newTitleName = data.newTitles[0];
				}
			} else if (res.status === 401 || res.status === 403) {
				showVisitPrompt = true;
			}
		} catch (e) {
			console.error('Failed to submit score', e);
		}
	}

	function pauseGame() {
		gameState = 'paused';
	}

	function resumeGame() {
		gameState = 'playing';
	}

	function restartGame() {
		showConfirm('다시시작하면 랭킹에 기록되지 않습니다. 계속하시겠습니까?', () => {
			stopTimer();
			hasRestarted = true;

			board = createBoard();
			moveCount = 0;
			timerValue = 0;
			displayTimer = 0;
			calculatedScore = 0;
			lastSpawnedId = null;
			lastMergedIds = [];
			isAnimating = false;
			history = [];
			undoCount = 0;

			gameState = 'playing';
			startTimer();
			saveGame();
		});
	}

	function executeUndo() {
		const entry = history[history.length - 1];
		history = history.slice(0, -1);
		const penalty = Math.floor(entry.board.score * UNDO_PENALTY_RATE);
		entry.board.score = Math.max(0, entry.board.score - penalty);
		board = entry.board;
		moveCount = Math.max(0, moveCount - 1);
		undoCount++;
		lastSpawnedId = null;
		lastMergedIds = [];
	}

	function undo() {
		if (history.length === 0 || gameState !== 'playing' || isAnimating) return;
		if (undoCount === 0) {
			showConfirm('되돌리기를 사용하면 현재 점수의 5%가 감점됩니다. 사용하시겠습니까?', executeUndo);
		} else {
			executeUndo();
		}
	}

	return {
		// State getters/setters
		get gameState() { return gameState; },
		set gameState(v: GameState) { gameState = v; },
		get board() { return board; },
		get moveCount() { return moveCount; },
		get timerValue() { return timerValue; },
		get displayTimer() { return displayTimer; },
		get hasRestarted() { return hasRestarted; },
		get alertMessage() { return alertMessage; },
		set alertMessage(v: string | null) { alertMessage = v; },
		get confirmMessage() { return confirmMessage; },
		get calculatedScore() { return calculatedScore; },
		get newTitleName() { return newTitleName; },
		get showVisitPrompt() { return showVisitPrompt; },
		get lastSpawnedId() { return lastSpawnedId; },
		get lastMergedIds() { return lastMergedIds; },
		get isAnimating() { return isAnimating; },
		get canUndo() { return history.length > 0 && gameState === 'playing' && !isAnimating; },
		get undoCount() { return undoCount; },
		// Functions
		showAlert,
		showConfirm,
		handleConfirm,
		startTimer,
		stopTimer,
		saveGame,
		loadGame,
		startGame,
		handleMove,
		pauseGame,
		resumeGame,
		restartGame,
		undo
	};
}
