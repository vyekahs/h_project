import { GAME_CONFIG } from '$lib/config';
import { TIME_LIMIT, TileType, type Board, type Tile } from '$lib/games/match-crash/types';
import {
	createBoard,
	findMatches,
	removeMatches,
	activateSpecial,
	applyGravity,
	fillEmpty,
	isValidSwap,
	swapTiles,
	hasValidMoves,
	shuffleBoard,
	cloneBoard,
	flattenBoard
} from '$lib/games/match-crash/board';
import { calculateMatchScore, calculateSpecialBonus } from '$lib/games/match-crash/scoring';
import { formatTime, trackGameStart } from '$lib/games/utils';
import { rankUpStore } from '$lib/stores/rankUpStore.svelte';

export type GameState = 'start' | 'playing' | 'paused' | 'finished';
export type Difficulty = 'timebreaker' | 'infinite' | 'classic';

export { formatTime };

function delay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export function createMatchCrashGame() {
	let gameState: GameState = $state('start');
	let difficulty = $state<Difficulty>('classic');
	let board: Board = $state([]);
	let flatTiles: (Tile & { row: number; col: number })[] = $state([]);
	let score = $state(0);
	let combo = $state(0);
	let maxCombo = $state(0);
	let matchCount = $state(0);

	// Timer
	let timeRemaining = $state(TIME_LIMIT);
	let timerValue = $state(0);
	let displayTimer = $state(0);
	let timerInterval: any;

	// Animation
	let isAnimating = $state(false);
	let matchedCells: Set<string> = $state(new Set());
	let shuffling = $state(false);

	// UI
	let hasRestarted = $state(false);
	let alertMessage: string | null = $state(null);
	let confirmMessage: string | null = $state(null);
	let confirmCallback: (() => void) | null = null;
	let calculatedScore = $state(0);
	let newTitleName = $state<string | null>(null);
	let showVisitPrompt = $state(false);

	const isTimedMode = $derived(difficulty === 'timebreaker' || difficulty === 'classic');

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

	function startTimer() {
		clearInterval(timerInterval);
		timerInterval = setInterval(() => {
			if (gameState !== 'playing' || alertMessage || confirmMessage) return;

			if (isTimedMode) {
				timeRemaining--;
				displayTimer = timeRemaining;
				if (timeRemaining <= 0) {
					timeRemaining = 0;
					displayTimer = 0;
					handleGameOver();
				}
			} else {
				timerValue++;
				displayTimer = timerValue;
			}

			// Auto save for infinite mode
			if (!isTimedMode && timerValue % 5 === 0) {
				saveGame();
			}
		}, 1000);
	}

	function stopTimer() { clearInterval(timerInterval); }

	function updateFlatTiles() {
		flatTiles = flattenBoard(board);
	}

	// Save / Load (infinite mode only)
	function saveGame() {
		if (gameState !== 'playing' || isTimedMode) return;
		try {
			localStorage.setItem('match_crash_save', JSON.stringify({
				board, score, combo, maxCombo, matchCount,
				timer: timerValue, difficulty, hasRestarted
			}));
		} catch {}
	}

	function loadGame() {
		try {
			const raw = localStorage.getItem('match_crash_save');
			if (!raw) { showAlert('저장된 게임이 없습니다.'); return; }

			const data = JSON.parse(raw);
			if (!data.board) {
				showAlert('저장 데이터가 손상되었습니다.');
				localStorage.removeItem('match_crash_save');
				return;
			}

			board = data.board;
			score = data.score || 0;
			combo = data.combo || 0;
			maxCombo = data.maxCombo || 0;
			matchCount = data.matchCount || 0;
			timerValue = data.timer || 0;
			displayTimer = timerValue;
			difficulty = data.difficulty || 'infinite';
			hasRestarted = data.hasRestarted || false;
			isAnimating = false;
			matchedCells = new Set();

			updateFlatTiles();
			gameState = 'paused';
			startTimer();
		} catch {
			showAlert('저장 데이터를 불러올 수 없습니다.');
			localStorage.removeItem('match_crash_save');
		}
	}

	function startGame(diff: Difficulty = 'classic') {
		trackGameStart('match-crash', diff);
		localStorage.removeItem('match_crash_save');
		difficulty = diff;
		board = createBoard();
		score = 0;
		combo = 0;
		maxCombo = 0;
		matchCount = 0;
		timeRemaining = TIME_LIMIT;
		timerValue = 0;
		displayTimer = isTimedMode ? TIME_LIMIT : 0;
		calculatedScore = 0;
		showVisitPrompt = false;
		hasRestarted = false;
		newTitleName = null;
		isAnimating = false;
		matchedCells = new Set();
		shuffling = false;

		updateFlatTiles();
		gameState = 'playing';
		startTimer();
	}

	async function handleSwipe(r1: number, c1: number, r2: number, c2: number) {
		if (gameState !== 'playing' || isAnimating) return;

		if (!isValidSwap(board, r1, c1, r2, c2)) {
			// Invalid swap: bounce animation
			isAnimating = true;
			board = swapTiles(board, r1, c1, r2, c2);
			updateFlatTiles();
			await delay(200);
			board = swapTiles(board, r1, c1, r2, c2);
			updateFlatTiles();
			await delay(200);
			isAnimating = false;
			return;
		}

		isAnimating = true;

		// Perform swap
		board = swapTiles(board, r1, c1, r2, c2);
		updateFlatTiles();
		await delay(200);

		// Process cascades
		let cascadeLevel = 0;
		let continueLoop = true;

		while (continueLoop) {
			const result = findMatches(board);
			if (result.matchedCells.size === 0) break;

			cascadeLevel++;
			combo = cascadeLevel;
			if (combo > maxCombo) maxCombo = combo;

			// Check for special tile activations in matched cells
			let extraCleared = new Set<string>();
			for (const key of result.matchedCells) {
				const [r, c] = key.split(',').map(Number);
				const tile = board[r][c];
				if (tile && tile.type !== TileType.NORMAL) {
					const cleared = activateSpecial(board, r, c, tile.color);
					for (const ck of cleared) extraCleared.add(ck);
					score += calculateSpecialBonus(tile.type);
				}
			}

			// Merge extra cleared cells
			for (const ck of extraCleared) result.matchedCells.add(ck);

			// Show match animation
			matchedCells = new Set(result.matchedCells);
			updateFlatTiles();
			await delay(300);

			// Calculate score for each run
			for (const run of result.runs) {
				score += calculateMatchScore(run.length, cascadeLevel);
			}
			matchCount += result.matchedCells.size;

			// Remove matches and create specials
			board = removeMatches(board, result);
			matchedCells = new Set();
			updateFlatTiles();

			// Gravity
			board = applyGravity(board);
			updateFlatTiles();
			await delay(250);

			// Fill empty
			board = fillEmpty(board);
			updateFlatTiles();
			await delay(250);
		}

		combo = 0;

		// Check deadlock
		if (!hasValidMoves(board)) {
			if (!isTimedMode) {
				// Infinite mode: game over if no moves
				isAnimating = false;
				await delay(500);
				handleGameOver();
				return;
			} else {
				// Timed mode: shuffle
				shuffling = true;
				await delay(400);
				shuffleBoard(board);
				board = cloneBoard(board); // trigger reactivity
				updateFlatTiles();
				shuffling = false;
				await delay(300);
			}
		}

		isAnimating = false;
		if (!isTimedMode) saveGame();
	}

	function handleGameOver() {
		if (gameState !== 'playing') return;
		localStorage.removeItem('match_crash_save');
		gameState = 'finished';
		stopTimer();
		if (!hasRestarted) submitScore();
	}

	async function submitScore() {
		try {
			const clearTime = isTimedMode ? TIME_LIMIT - timeRemaining : timerValue;
			const res = await fetch('/api/game/record', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					gameId: 'match-crash',
					difficulty,
					clearTime,
					score,
					mistakes: 0,
					skipReward: !GAME_CONFIG.ENABLE_REWARDS
				})
			});
			const data = await res.json();
			if (res.ok) {
				calculatedScore = data.score;
				if (data.currentRank && (!data.previousRank || data.currentRank < data.previousRank)) {
					rankUpStore.show(data.previousRank, data.currentRank, 'match-crash', data.score);
				}
				if (data.newTitles?.length > 0) newTitleName = data.newTitles[0];
			} else if (res.status === 401 || res.status === 403) {
				showVisitPrompt = true;
			}
		} catch (e) {
			console.error('Failed to submit score', e);
		}
	}

	function pauseGame() { gameState = 'paused'; }
	function resumeGame() { gameState = 'playing'; }

	function restartGame() {
		showConfirm('다시시작하면 랭킹에 기록되지 않습니다. 계속하시겠습니까?', () => {
			stopTimer();
			hasRestarted = true;
			startGame(difficulty);
		});
	}

	return {
		get gameState() { return gameState; },
		set gameState(v: GameState) { gameState = v; },
		get difficulty() { return difficulty; },
		get board() { return board; },
		get flatTiles() { return flatTiles; },
		get score() { return score; },
		get combo() { return combo; },
		get maxCombo() { return maxCombo; },
		get matchCount() { return matchCount; },
		get timeRemaining() { return timeRemaining; },
		get timerValue() { return timerValue; },
		get displayTimer() { return displayTimer; },
		get isTimedMode() { return isTimedMode; },
		get isAnimating() { return isAnimating; },
		get matchedCells() { return matchedCells; },
		get shuffling() { return shuffling; },
		get hasRestarted() { return hasRestarted; },
		get alertMessage() { return alertMessage; },
		set alertMessage(v: string | null) { alertMessage = v; },
		get confirmMessage() { return confirmMessage; },
		get calculatedScore() { return calculatedScore; },
		get newTitleName() { return newTitleName; },
		get showVisitPrompt() { return showVisitPrompt; },
		showAlert,
		showConfirm,
		handleConfirm,
		stopTimer,
		saveGame,
		loadGame,
		startGame,
		handleSwipe,
		pauseGame,
		resumeGame,
		restartGame
	};
}
