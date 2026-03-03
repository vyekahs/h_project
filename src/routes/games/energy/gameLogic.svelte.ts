import { GAME_CONFIG } from '$lib/config';
import { generateLevel, computePoweredTiles, checkWin } from '$lib/games/energy/levels';
import type { Tile, Difficulty } from '$lib/games/energy/types';
import { goto } from '$app/navigation';
import { formatTime } from '$lib/games/utils';
import { browser } from '$app/environment';
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

export function createEnergyGame() {
	// Game state
	let gameState: GameState = $state('start');
	let difficulty: Difficulty = $state('medium');
	let tiles: Tile[][] = $state([]);
	let optimalMoves = $state(0);
	let moveCount = $state(0);
	let gridSize = $state(6);

	// Timer
	let timerValue = 0;
	let displayTimer = $state(0);
	let timerInterval: any;

	// History for undo (stores rotation snapshots)
	let history: number[][][] = $state([]);

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
	let newTitleName = $state<string | null>(null);
	let showVisitPrompt = $state(false);

	// Win animation
	let showWinAnimation = $state(false);

	// Initial state for restart (same puzzle)
	let initialRotations: number[][] = [];
	let initialOptimalMoves = 0;

	// Tutorial / Guide
	let showTutorial = $state(false);
	let activeTutorialId = $state('energy_easy_1');
	let showGuide = $state(false);

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
			if (gameState === 'playing' && !alertMessage && !confirmMessage && !showGuide && !showTutorial) {
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
				tiles: tiles.map((row) =>
					row.map((t) => ({
						type: t.type,
						rotation: t.rotation,
						row: t.row,
						col: t.col,
						fixed: t.fixed,
						solutionRotation: t.solutionRotation
					}))
				),
				optimalMoves,
				moveCount,
				timer: timerValue,
				difficulty,
				gridSize,
				history,
				hasRestarted,
				initialRotations,
				initialOptimalMoves
			};
			localStorage.setItem('energy_save', JSON.stringify(data));
		} catch {}
	}

	function loadGame() {
		try {
			const raw = localStorage.getItem('energy_save');
			if (!raw) {
				showAlert('저장된 게임이 없습니다.');
				return;
			}

			const data = JSON.parse(raw);
			if (!data.tiles || !Array.isArray(data.tiles)) {
				showAlert('저장 데이터가 손상되었습니다.');
				localStorage.removeItem('energy_save');
				hasSavedGame = false;
				return;
			}

			// Restore tiles with powered state
			gridSize = data.gridSize || data.tiles.length;
			tiles = data.tiles.map((row: any[]) =>
				row.map((t: any) => ({
					type: t.type,
					rotation: t.rotation,
					row: t.row,
					col: t.col,
					powered: false,
					fixed: t.fixed,
					solutionRotation: t.solutionRotation
				}))
			);
			computePoweredTiles(tiles);

			optimalMoves = data.optimalMoves || 0;
			moveCount = data.moveCount || 0;
			timerValue = data.timer || 0;
			displayTimer = timerValue;
			difficulty = data.difficulty || 'medium';
			history = data.history || [];
			hasRestarted = data.hasRestarted || false;
			// Restore initial state for restart
			if (data.initialRotations) {
				initialRotations = data.initialRotations;
				initialOptimalMoves = data.initialOptimalMoves ?? optimalMoves;
			} else {
				// Fallback: use current rotations as initial (old saves)
				initialRotations = tiles.map(row => row.map(t => t.rotation));
				initialOptimalMoves = optimalMoves;
			}

			gameState = 'paused';
			startTimer();
		} catch {
			showAlert('저장 데이터를 불러올 수 없습니다.');
			localStorage.removeItem('energy_save');
			hasSavedGame = false;
		}
	}

	// Game flow
	function startGame(force = false) {
		showTutorial = false;
		showGuide = false;
		localStorage.removeItem('energy_save');
		const level = generateLevel(difficulty);
		tiles = level.tiles;
		gridSize = tiles.length;
		optimalMoves = level.optimalMoves;
		// Save initial state for restart
		initialRotations = tiles.map(row => row.map(t => t.rotation));
		initialOptimalMoves = optimalMoves;
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

		gameState = 'playing';
		hasSavedGame = true;
		startTimer();
		saveGame();
	}

	function rotateTile(row: number, col: number) {
		if (gameState !== 'playing') return;
		const tile = tiles[row]?.[col];
		if (!tile || tile.fixed || tile.type === 'empty') return;

		// Save history before mutation
		saveHistory();

		// Rotate 90 degrees clockwise
		tile.rotation = (tile.rotation + 1) % 4;
		moveCount++;

		// Recompute powered states
		computePoweredTiles(tiles);

		// Force Svelte reactivity
		tiles = tiles.map((row) => [...row]);

		// Check win
		if (checkWin(tiles)) {
			handleWin();
		} else {
			saveGame();
		}
	}

	function saveHistory() {
		if (history.length >= 100) {
			history = history.slice(1);
		}
		const snapshot = tiles.map((row) => row.map((t) => t.rotation));
		history = [...history, snapshot];
	}

	function undo() {
		if (history.length === 0) return;
		const prev = history[history.length - 1];
		history = history.slice(0, -1);

		// Restore rotations
		for (let r = 0; r < tiles.length; r++) {
			for (let c = 0; c < tiles[r].length; c++) {
				tiles[r][c].rotation = prev[r][c];
			}
		}
		computePoweredTiles(tiles);
		tiles = tiles.map((row) => [...row]);
	}

	function handleWin() {
		showWinAnimation = true;
		// Delay before showing result modal
		setTimeout(() => {
			gameState = 'finished';
			stopTimer();
			localStorage.removeItem('energy_save');
			hasSavedGame = false;
			if (!hasRestarted) {
				submitScore();
			}
		}, 800);
	}

	async function submitScore() {
		try {
			const extraMoves = Math.max(0, moveCount - optimalMoves);
			const res = await fetch('/api/game/record', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					gameId: 'energy',
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

				// Show Rank Up animation if rank increased
				if (data.currentRank && (!data.previousRank || data.currentRank < data.previousRank)) {
					rankUpStore.show(data.previousRank, data.currentRank, 'energy', data.score);
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

			// Restore initial puzzle state (same seed)
			for (let r = 0; r < tiles.length; r++) {
				for (let c = 0; c < tiles[r].length; c++) {
					tiles[r][c].rotation = initialRotations[r][c];
				}
			}
			computePoweredTiles(tiles);
			tiles = tiles.map(row => [...row]);
			optimalMoves = initialOptimalMoves;
			moveCount = 0;
			timerValue = 0;
			displayTimer = 0;
			history = [];
			earnedPointsResult = 0;
			calculatedScore = 0;
			showWinAnimation = false;

			gameState = 'playing';
			hasSavedGame = true;
			startTimer();
			saveGame();
		});
	}

	return {
		// State (getters/setters for reactivity)
		get gameState() {
			return gameState;
		},
		set gameState(v: GameState) {
			gameState = v;
		},
		get difficulty() {
			return difficulty;
		},
		set difficulty(v: Difficulty) {
			difficulty = v;
		},
		get tiles() {
			return tiles;
		},
		get gridSize() {
			return gridSize;
		},
		get optimalMoves() {
			return optimalMoves;
		},
		get moveCount() {
			return moveCount;
		},
		get timerValue() {
			return timerValue;
		},
		get displayTimer() {
			return displayTimer;
		},
		get history() {
			return history;
		},
		get hasSavedGame() {
			return hasSavedGame;
		},
		get hasRestarted() {
			return hasRestarted;
		},
		get alertMessage() {
			return alertMessage;
		},
		set alertMessage(v: string | null) {
			alertMessage = v;
		},
		get confirmMessage() {
			return confirmMessage;
		},
		get earnedPointsResult() {
			return earnedPointsResult;
		},
		get calculatedScore() {
			return calculatedScore;
		},
		get newTitleName() {
			return newTitleName;
		},
		get showVisitPrompt() {
			return showVisitPrompt;
		},
		get showWinAnimation() {
			return showWinAnimation;
		},
		// Tutorial
		get showTutorial() {
			return showTutorial;
		},
		set showTutorial(v: boolean) {
			showTutorial = v;
		},
		get activeTutorialId() {
			return activeTutorialId;
		},
		set activeTutorialId(v: string) {
			activeTutorialId = v;
		},
		get showGuide() {
			return showGuide;
		},
		set showGuide(v: boolean) {
			showGuide = v;
		},
		// Functions
		showAlert,
		showConfirm,
		handleConfirm,
		startTimer,
		stopTimer,
		saveGame,
		loadGame,
		startGame,
		rotateTile,
		undo,
		pauseGame,
		resumeGame,
		restartGame
	};
}
