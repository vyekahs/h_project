import { GAME_CONFIG } from '$lib/config';
import { generateLevel, validateRowColCounts, checkWin } from '$lib/games/train-tracks/levels';
import type { Cell, Difficulty, ToolType } from '$lib/games/train-tracks/types';
import { toolToTrack, DIFFICULTY_CONFIG } from '$lib/games/train-tracks/types';
import { goto } from '$app/navigation';
import { formatTime } from '$lib/games/utils';
import { rankUpStore } from '$lib/stores/rankUpStore.svelte';

export type GameState = 'start' | 'playing' | 'paused' | 'finished';

export const difficultyLabels: Record<string, string> = {
	easy: '쉬움',
	medium: '보통',
	hard: '어려움',
	expert: '전문가',
	master: '마스터'
};

export { formatTime };
export type { Difficulty };

export function createTrainTracksGame() {
	// Game state
	let gameState: GameState = $state('start');
	let difficulty: Difficulty = $state('medium');
	let grid: Cell[][] = $state([]);
	let solution: Cell[][] = [];
	let rowCounts: number[] = $state([]);
	let colCounts: number[] = $state([]);
	let gridSize = $state(6);
	let moveCount = $state(0);
	let pathLength = 0;

	// Timer
	let timerValue = 0;
	let displayTimer = $state(0);
	let timerInterval: any;

	// History for undo
	let history: string[] = $state([]);

	// UI state
	let hasSavedGame = $state(false);
	let hasRestarted = $state(false);

	// Tool palette
	let selectedTool: ToolType | null = $state('straight_h');

	// Modals
	let alertMessage: string | null = $state(null);
	let confirmMessage: string | null = $state(null);
	let confirmCallback: (() => void) | null = null;

	// Score
	let earnedPointsResult = $state(0);
	let calculatedScore = $state(0);
	let newTitleName = $state<string | null>(null);
	let showVisitPrompt = $state(false);

	// Mistakes
	let mistakes = $state(0);
	let isWon = $state(true);
	let errorCell = $state<{ row: number; col: number } | null>(null);
	let errorTimer: any;
	let maxMistakes = $derived(DIFFICULTY_CONFIG[difficulty].maxMistakes);

	// Win animation
	let showWinAnimation = $state(false);

	// Initial state for restart
	let initialGridSnapshot = '';

	// Derived: row/col validation
	let rowStatus = $derived.by(() => {
		if (!grid.length || !rowCounts.length) return [];
		return validateRowColCounts(grid, rowCounts, colCounts).rowStatus;
	});
	let colStatus = $derived.by(() => {
		if (!grid.length || !colCounts.length) return [];
		return validateRowColCounts(grid, rowCounts, colCounts).colStatus;
	});

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

	// Serialize grid for history/save
	function serializeGrid(): string {
		return JSON.stringify(
			grid.map((row) =>
				row.map((c) => ({
					trackType: c.trackType,
					rotation: c.rotation,
					playerMarkedEmpty: c.playerMarkedEmpty
				}))
			)
		);
	}

	function deserializeGrid(data: string) {
		const parsed = JSON.parse(data);
		for (let r = 0; r < grid.length; r++) {
			for (let c = 0; c < grid[r].length; c++) {
				if (!grid[r][c].isFixed) {
					grid[r][c].trackType = parsed[r][c].trackType;
					grid[r][c].rotation = parsed[r][c].rotation;
					grid[r][c].playerMarkedEmpty = parsed[r][c].playerMarkedEmpty;
				}
			}
		}
	}

	// Save / Load
	function saveGame() {
		if (gameState !== 'playing') return;
		try {
			const data = {
				grid: grid.map((row) =>
					row.map((c) => ({
						row: c.row,
						col: c.col,
						trackType: c.trackType,
						rotation: c.rotation,
						isFixed: c.isFixed,
						isStart: c.isStart,
						isFinish: c.isFinish,
						playerMarkedEmpty: c.playerMarkedEmpty
					}))
				),
				solution: solution.map((row) =>
					row.map((c) => ({
						row: c.row,
						col: c.col,
						trackType: c.trackType,
						rotation: c.rotation,
						isFixed: c.isFixed,
						isStart: c.isStart,
						isFinish: c.isFinish,
						playerMarkedEmpty: c.playerMarkedEmpty
					}))
				),
				rowCounts,
				colCounts,
				moveCount,
				pathLength,
				timer: timerValue,
				difficulty,
				gridSize,
				history,
				hasRestarted,
				initialGridSnapshot,
				mistakes
			};
			localStorage.setItem('train_tracks_save', JSON.stringify(data));
		} catch {}
	}

	function loadGame() {
		try {
			const raw = localStorage.getItem('train_tracks_save');
			if (!raw) {
				showAlert('저장된 게임이 없습니다.');
				return;
			}

			const data = JSON.parse(raw);
			if (!data.grid || !Array.isArray(data.grid)) {
				showAlert('저장 데이터가 손상되었습니다.');
				localStorage.removeItem('train_tracks_save');
				hasSavedGame = false;
				return;
			}

			gridSize = data.gridSize || data.grid.length;
			grid = data.grid.map((row: any[]) =>
				row.map((c: any) => ({
					row: c.row,
					col: c.col,
					trackType: c.trackType,
					rotation: c.rotation,
					isFixed: c.isFixed,
					isStart: c.isStart,
					isFinish: c.isFinish,
					playerMarkedEmpty: c.playerMarkedEmpty ?? false
				}))
			);
			solution = data.solution?.map((row: any[]) =>
				row.map((c: any) => ({
					row: c.row,
					col: c.col,
					trackType: c.trackType,
					rotation: c.rotation,
					isFixed: c.isFixed,
					isStart: c.isStart,
					isFinish: c.isFinish,
					playerMarkedEmpty: false
				}))
			) ?? [];
			rowCounts = data.rowCounts || [];
			colCounts = data.colCounts || [];
			moveCount = data.moveCount || 0;
			pathLength = data.pathLength || 0;
			timerValue = data.timer || 0;
			displayTimer = timerValue;
			difficulty = data.difficulty || 'medium';
			history = data.history || [];
			hasRestarted = data.hasRestarted || false;
			initialGridSnapshot = data.initialGridSnapshot || serializeGrid();
			mistakes = data.mistakes || 0;

			autoMarkCompletedLines();
			grid = grid.map((row) => [...row]);
			gameState = 'paused';
			startTimer();
		} catch {
			showAlert('저장 데이터를 불러올 수 없습니다.');
			localStorage.removeItem('train_tracks_save');
			hasSavedGame = false;
		}
	}

	// Game flow
	function startGame() {
		localStorage.removeItem('train_tracks_save');
		const level = generateLevel(difficulty);
		grid = level.grid;
		solution = level.solution;
		rowCounts = level.rowCounts;
		colCounts = level.colCounts;
		gridSize = grid.length;
		pathLength = level.pathLength;
		autoMarkCompletedLines();
		initialGridSnapshot = serializeGrid();
		moveCount = 0;
		timerValue = 0;
		displayTimer = 0;
		history = [];
		earnedPointsResult = 0;
		calculatedScore = 0;
		showVisitPrompt = false;
		hasRestarted = false;
		showWinAnimation = false;
		newTitleName = null;
		selectedTool = 'straight_h';
		mistakes = 0;
		isWon = true;
		errorCell = null;
		clearTimeout(errorTimer);

		grid = grid.map((row) => [...row]);
		gameState = 'playing';
		hasSavedGame = true;
		startTimer();
		saveGame();
	}

	// Tool selection
	function selectTool(tool: ToolType) {
		if (selectedTool === tool) {
			selectedTool = null;
		} else {
			selectedTool = tool;
		}
	}

	// Place track on cell
	function placeTrack(row: number, col: number) {
		if (gameState !== 'playing') return;
		const cell = grid[row]?.[col];
		if (!cell || cell.isFixed) return;
		if (!selectedTool) return;

		// Save history before mutation
		saveHistory();

		if (selectedTool === 'eraser') {
			cell.trackType = 'empty';
			cell.rotation = 0;
			cell.playerMarkedEmpty = false;
		} else if (selectedTool === 'mark_empty') {
			cell.trackType = 'empty';
			cell.rotation = 0;
			cell.playerMarkedEmpty = !cell.playerMarkedEmpty;
		} else {
			const track = toolToTrack(selectedTool);
			if (track) {
				cell.trackType = track.trackType;
				cell.rotation = track.rotation;
				cell.playerMarkedEmpty = false;
			}
		}

		moveCount++;

		// Check mistake (only for actual track placements, not eraser/mark_empty)
		if (selectedTool !== 'eraser' && selectedTool !== 'mark_empty') {
			const sol = solution[row]?.[col];
			if (sol && (cell.trackType !== sol.trackType || cell.rotation !== sol.rotation)) {
				mistakes++;
				clearTimeout(errorTimer);
				errorCell = { row, col };
				errorTimer = setTimeout(() => { errorCell = null; }, 1000);
			}
		}

		// Auto-mark empty cells in completed rows/columns
		autoMarkCompletedLines();

		// Force Svelte reactivity
		grid = grid.map((row) => [...row]);

		// Check game over (max mistakes)
		if (mistakes >= maxMistakes) {
			handleGameOver(false);
		} else if (checkWin(grid, rowCounts, colCounts)) {
			handleGameOver(true);
		} else {
			saveGame();
		}
	}

	function autoMarkCompletedLines() {
		const size = grid.length;
		// Check each row
		for (let r = 0; r < size; r++) {
			let trackCount = 0;
			for (let c = 0; c < size; c++) {
				if (grid[r][c].trackType !== 'empty') trackCount++;
			}
			if (trackCount === rowCounts[r]) {
				for (let c = 0; c < size; c++) {
					if (grid[r][c].trackType === 'empty' && !grid[r][c].isFixed) {
						grid[r][c].playerMarkedEmpty = true;
					}
				}
			}
		}
		// Check each column
		for (let c = 0; c < size; c++) {
			let trackCount = 0;
			for (let r = 0; r < size; r++) {
				if (grid[r][c].trackType !== 'empty') trackCount++;
			}
			if (trackCount === colCounts[c]) {
				for (let r = 0; r < size; r++) {
					if (grid[r][c].trackType === 'empty' && !grid[r][c].isFixed) {
						grid[r][c].playerMarkedEmpty = true;
					}
				}
			}
		}
	}

	function saveHistory() {
		if (history.length >= 100) {
			history = history.slice(1);
		}
		history = [...history, serializeGrid()];
	}

	function undo() {
		if (history.length === 0) return;
		const prev = history[history.length - 1];
		history = history.slice(0, -1);
		deserializeGrid(prev);
		grid = grid.map((row) => [...row]);
	}

	function handleGameOver(won: boolean) {
		isWon = won;
		if (won) showWinAnimation = true;
		setTimeout(() => {
			gameState = 'finished';
			stopTimer();
			localStorage.removeItem('train_tracks_save');
			hasSavedGame = false;
			if (won && !hasRestarted) {
				submitScore();
			}
		}, won ? 800 : 300);
	}

	async function submitScore() {
		try {
			// Extra moves = total placements - minimum needed (non-fixed path cells)
			const nonFixedPathCells = pathLength - grid.flat().filter((c) => c.isFixed).length;
			const extraMoves = Math.max(0, moveCount - nonFixedPathCells);
			const res = await fetch('/api/game/record', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					gameId: 'train-tracks',
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

				if (data.currentRank && (!data.previousRank || data.currentRank < data.previousRank)) {
					rankUpStore.show(data.previousRank, data.currentRank, 'train-tracks', data.score);
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

			deserializeGrid(initialGridSnapshot);
			grid = grid.map((row) => [...row]);
			moveCount = 0;
			timerValue = 0;
			displayTimer = 0;
			history = [];
			earnedPointsResult = 0;
			calculatedScore = 0;
			showWinAnimation = false;
			mistakes = 0;
			isWon = true;
			errorCell = null;
			clearTimeout(errorTimer);

			gameState = 'playing';
			hasSavedGame = true;
			startTimer();
			saveGame();
		});
	}

	return {
		get gameState() { return gameState; },
		set gameState(v: GameState) { gameState = v; },
		get difficulty() { return difficulty; },
		set difficulty(v: Difficulty) { difficulty = v; },
		get grid() { return grid; },
		get gridSize() { return gridSize; },
		get rowCounts() { return rowCounts; },
		get colCounts() { return colCounts; },
		get rowStatus() { return rowStatus; },
		get colStatus() { return colStatus; },
		get moveCount() { return moveCount; },
		get timerValue() { return timerValue; },
		get displayTimer() { return displayTimer; },
		get history() { return history; },
		get hasSavedGame() { return hasSavedGame; },
		get hasRestarted() { return hasRestarted; },
		get selectedTool() { return selectedTool; },
		get alertMessage() { return alertMessage; },
		set alertMessage(v: string | null) { alertMessage = v; },
		get confirmMessage() { return confirmMessage; },
		get earnedPointsResult() { return earnedPointsResult; },
		get calculatedScore() { return calculatedScore; },
		get newTitleName() { return newTitleName; },
		get showVisitPrompt() { return showVisitPrompt; },
		get showWinAnimation() { return showWinAnimation; },
		get mistakes() { return mistakes; },
		get isWon() { return isWon; },
		get errorCell() { return errorCell; },
		get maxMistakes() { return maxMistakes; },
		showAlert,
		showConfirm,
		handleConfirm,
		startTimer,
		stopTimer,
		saveGame,
		loadGame,
		startGame,
		selectTool,
		placeTrack,
		undo,
		pauseGame,
		resumeGame,
		restartGame
	};
}
