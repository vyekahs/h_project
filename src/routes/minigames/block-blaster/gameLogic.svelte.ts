import { GAME_CONFIG } from '$lib/config';
import {
	createEmptyGrid,
	canPlaceBlock,
	placeBlock,
	findCompletedLines,
	clearLines,
	calculateScore,
	canPlaceAnyBlock
} from '$lib/games/block-blaster/gameLogic';
import { generateBlockSet } from '$lib/games/block-blaster/blocks';
import type { BoardGrid, BlockShape } from '$lib/games/block-blaster/types';
import { formatTime, trackGameStart } from '$lib/games/utils';
import { rankUpStore } from '$lib/stores/rankUpStore.svelte';

export type GameState = 'start' | 'playing' | 'paused' | 'finished';

export { formatTime };

export function createBlockBlasterGame() {
	// Game state
	let gameState: GameState = $state('start');
	let grid: BoardGrid = $state(createEmptyGrid());
	let score = $state(0);
	let currentBlocks: (BlockShape | null)[] = $state([]);
	let selectedBlockIndex: number | null = $state(null);
	let linesCleared = $state(0);
	let combo = $state(0);
	let maxCombo = $state(0);

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

	// Score submission
	let calculatedScore = $state(0);
	let newTitleName = $state<string | null>(null);
	let showVisitPrompt = $state(false);

	// Animation state
	let lastPlacedCells: [number, number][] = $state([]);
	let clearingRows: number[] = $state([]);
	let clearingCols: number[] = $state([]);
	let isAnimating = $state(false);

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
				grid,
				score,
				currentBlocks,
				selectedBlockIndex,
				linesCleared,
				combo,
				maxCombo,
				timer: timerValue,
				hasRestarted
			};
			localStorage.setItem('block_blaster_save', JSON.stringify(data));
		} catch {}
	}

	function loadGame() {
		try {
			const raw = localStorage.getItem('block_blaster_save');
			if (!raw) {
				showAlert('저장된 게임이 없습니다.');
				return;
			}

			const data = JSON.parse(raw);
			if (!data.grid || !Array.isArray(data.grid)) {
				showAlert('저장 데이터가 손상되었습니다.');
				localStorage.removeItem('block_blaster_save');
				return;
			}

			grid = data.grid;
			score = data.score || 0;
			currentBlocks = data.currentBlocks || [];
			selectedBlockIndex = data.selectedBlockIndex ?? null;
			linesCleared = data.linesCleared || 0;
			combo = data.combo || 0;
			maxCombo = data.maxCombo || 0;
			timerValue = data.timer || 0;
			displayTimer = timerValue;
			hasRestarted = data.hasRestarted || false;

			lastPlacedCells = [];
			clearingRows = [];
			clearingCols = [];
			isAnimating = false;

			gameState = 'paused';
			startTimer();
		} catch {
			showAlert('저장 데이터를 불러올 수 없습니다.');
			localStorage.removeItem('block_blaster_save');
		}
	}

	// Game flow
	function startGame() {
		trackGameStart('block-blaster', 'classic');
		localStorage.removeItem('block_blaster_save');
		grid = createEmptyGrid();
		score = 0;
		currentBlocks = generateBlockSet();
		selectedBlockIndex = null;
		linesCleared = 0;
		combo = 0;
		maxCombo = 0;
		timerValue = 0;
		displayTimer = 0;
		calculatedScore = 0;
		showVisitPrompt = false;
		hasRestarted = false;
		newTitleName = null;
		lastPlacedCells = [];
		clearingRows = [];
		clearingCols = [];
		isAnimating = false;

		gameState = 'playing';
		startTimer();
		saveGame();
	}

	function selectBlock(index: number) {
		if (gameState !== 'playing' || isAnimating) return;
		if (index < 0 || !currentBlocks[index]) {
			selectedBlockIndex = null;
			return;
		}
		selectedBlockIndex = selectedBlockIndex === index ? null : index;
	}

	function placeBlockAt(row: number, col: number) {
		if (gameState !== 'playing' || isAnimating) return;
		if (selectedBlockIndex === null) return;

		const block = currentBlocks[selectedBlockIndex];
		if (!block) return;

		if (!canPlaceBlock(grid, block, row, col)) return;

		// Place the block
		const newGrid = placeBlock(grid, block, row, col);
		const placedCells: [number, number][] = block.cells.map(([dr, dc]) => [row + dr, col + dc]);
		lastPlacedCells = placedCells;
		grid = newGrid;

		// 배치 애니메이션 후 초기화 (200ms = cellSpawn duration)
		setTimeout(() => { lastPlacedCells = []; }, 200);

		// Remove from tray
		const newBlocks = [...currentBlocks];
		newBlocks[selectedBlockIndex] = null;
		currentBlocks = newBlocks;
		selectedBlockIndex = null;

		// Check for completed lines
		const { rows, cols } = findCompletedLines(grid);
		const totalLines = rows.length + cols.length;

		if (totalLines > 0) {
			// Show clearing animation
			clearingRows = rows;
			clearingCols = cols;
			isAnimating = true;

			// Update combo
			combo++;
			if (combo > maxCombo) maxCombo = combo;

			const points = calculateScore(block.cells.length, totalLines, combo);
			score += points;
			linesCleared += totalLines;

			// After animation, clear the lines
			setTimeout(() => {
				grid = clearLines(grid, rows, cols);
				clearingRows = [];
				clearingCols = [];
				isAnimating = false;

				saveGame();
				afterPlace();
			}, 300);
		} else {
			// No lines cleared
			score += block.cells.length;
			combo = 0;
			saveGame();
			afterPlace();
		}
	}

	function afterPlace() {
		// Check if all 3 blocks are used
		const remaining = currentBlocks.filter(b => b !== null);
		if (remaining.length === 0) {
			currentBlocks = generateBlockSet();
		}

		// Check game over
		if (!canPlaceAnyBlock(grid, currentBlocks)) {
			isAnimating = true;
			setTimeout(() => {
				handleGameOver();
			}, 800);
		}
	}

	function handleGameOver() {
		localStorage.removeItem('block_blaster_save');
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
					gameId: 'block-blaster',
					difficulty: 'classic',
					clearTime: timerValue,
					score,
					mistakes: 0,
					skipReward: !GAME_CONFIG.ENABLE_REWARDS
				})
			});
			const data = await res.json();
			if (res.ok) {
				calculatedScore = data.score;

				if (data.currentRank && (!data.previousRank || data.currentRank < data.previousRank)) {
					rankUpStore.show(data.previousRank, data.currentRank, 'block-blaster', data.score);
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

			grid = createEmptyGrid();
			score = 0;
			currentBlocks = generateBlockSet();
			selectedBlockIndex = null;
			linesCleared = 0;
			combo = 0;
			maxCombo = 0;
			timerValue = 0;
			displayTimer = 0;
			calculatedScore = 0;
			lastPlacedCells = [];
			clearingRows = [];
			clearingCols = [];
			isAnimating = false;

			gameState = 'playing';
			startTimer();
			saveGame();
		});
	}

	return {
		// State getters/setters
		get gameState() { return gameState; },
		set gameState(v: GameState) { gameState = v; },
		get grid() { return grid; },
		get score() { return score; },
		get currentBlocks() { return currentBlocks; },
		get selectedBlockIndex() { return selectedBlockIndex; },
		get linesCleared() { return linesCleared; },
		get combo() { return combo; },
		get maxCombo() { return maxCombo; },
		get timerValue() { return timerValue; },
		get displayTimer() { return displayTimer; },
		get hasRestarted() { return hasRestarted; },
		get alertMessage() { return alertMessage; },
		set alertMessage(v: string | null) { alertMessage = v; },
		get confirmMessage() { return confirmMessage; },
		get calculatedScore() { return calculatedScore; },
		get newTitleName() { return newTitleName; },
		get showVisitPrompt() { return showVisitPrompt; },
		get lastPlacedCells() { return lastPlacedCells; },
		get clearingRows() { return clearingRows; },
		get clearingCols() { return clearingCols; },
		get isAnimating() { return isAnimating; },
		// Functions
		showAlert,
		showConfirm,
		handleConfirm,
		startTimer,
		stopTimer,
		saveGame,
		loadGame,
		startGame,
		selectBlock,
		placeBlockAt,
		pauseGame,
		resumeGame,
		restartGame
	};
}
