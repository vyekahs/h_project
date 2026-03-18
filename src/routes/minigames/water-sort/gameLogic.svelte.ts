import { GAME_CONFIG } from '$lib/config';
import { generateLevel, canPour, pourWater, checkWin, isStuck, isEffectivelyStuck } from '$lib/games/water-sort/levels';
import { TUBE_CAPACITY, type Tube, type Difficulty } from '$lib/games/water-sort/types';
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

export function createWaterSortGame() {
	// Game state
	let gameState: GameState = $state('start');
	let difficulty: Difficulty = $state('medium');
	let tubes: Tube[] = $state([]);
	let moveLimit = $state(0);
	let moveCount = $state(0);
	let selectedTubeId: number | null = $state(null);

	// Timer
	let timerValue = 0;
	let displayTimer = $state(0);
	let timerInterval: any;

	// History for undo (stores full tube snapshots + moveCount)
	let history: { layers: number[][]; moveCount: number }[] = $state([]);

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
	let initialTubes: number[][] = [];
	let initialMoveLimit = 0;

	// Stuck detection
	let isGameStuck = $state(false);
	let isWarnedUnsolvable = $state(false);

	// Pour animation state
	let pouringAnimation: {
		srcId: number;
		tgtId: number;
		color: number;
		count: number;
	} | null = $state(null);
	let isAnimating = $state(false);

	// Returning animation (separate from pour so next pour can start in parallel)
	let returningTubeId: number | null = $state(null);

	// Queued inputs during animation (supports multiple clicks: select + pour target)
	let pendingTubeIds: number[] = [];

	// Completed tubes tracking (for sequential celebration)
	let justCompletedIds: number[] = $state([]);

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
		if (gameState !== 'playing' || showWinAnimation) return;
		try {
			const data = {
				tubes: tubes.map(t => ({ id: t.id, layers: [...t.layers] })),
				moveLimit,
				moveCount,
				timer: timerValue,
				difficulty,
				history: history.map(h => ({ layers: h.layers.map(l => [...l]), moveCount: h.moveCount })),
				hasRestarted,
				initialTubes: initialTubes.map(l => [...l]),
				initialMoveLimit,
				isWarnedUnsolvable
			};
			localStorage.setItem('watersort_save', JSON.stringify(data));
		} catch {}
	}

	function loadGame() {
		try {
			const raw = localStorage.getItem('watersort_save');
			if (!raw) {
				showAlert('저장된 게임이 없습니다.');
				return;
			}

			const data = JSON.parse(raw);
			if (!data.tubes || !Array.isArray(data.tubes)) {
				showAlert('저장 데이터가 손상되었습니다.');
				localStorage.removeItem('watersort_save');
				hasSavedGame = false;
				return;
			}

			tubes = data.tubes.map((t: any) => ({
				id: t.id,
				layers: [...t.layers]
			}));

			moveLimit = data.moveLimit || data.optimalMoves || 0;
			moveCount = data.moveCount || 0;
			timerValue = data.timer || 0;
			displayTimer = timerValue;
			difficulty = data.difficulty || 'medium';
			history = (data.history || []).map((h: any) => ({
				layers: h.layers.map((l: number[]) => [...l]),
				moveCount: h.moveCount ?? 0
			}));
			hasRestarted = data.hasRestarted || false;
			isWarnedUnsolvable = data.isWarnedUnsolvable || false;
			// Restore initial state for restart
			if (data.initialTubes) {
				initialTubes = data.initialTubes.map((l: number[]) => [...l]);
				initialMoveLimit = data.initialMoveLimit ?? moveLimit;
			} else {
				// Fallback: use current state as initial (old saves)
				initialTubes = tubes.map(t => [...t.layers]);
				initialMoveLimit = moveLimit;
			}
			selectedTubeId = null;

			gameState = 'paused';
			startTimer();
		} catch {
			showAlert('저장 데이터를 불러올 수 없습니다.');
			localStorage.removeItem('watersort_save');
			hasSavedGame = false;
		}
	}

	// Game flow
	function startGame() {
		localStorage.removeItem('watersort_save');
		const level = generateLevel(difficulty);
		tubes = level.tubes;
		moveLimit = level.moveLimit;
		// Save initial state for restart
		initialTubes = tubes.map(t => [...t.layers]);
		initialMoveLimit = moveLimit;
		moveCount = 0;
		timerValue = 0;
		displayTimer = 0;
		history = [];
		earnedPointsResult = 0;
		calculatedScore = 0;
		showVisitPrompt = false;
		hasRestarted = false;
		showWinAnimation = false;
		isGameStuck = false;
		isWarnedUnsolvable = false;
		newTitleName = null;
		selectedTubeId = null;

		gameState = 'playing';
		hasSavedGame = true;
		startTimer();
		saveGame();
	}

	function selectTube(id: number) {
		if (gameState !== 'playing') return;
		if (isAnimating) {
			// Queue the click to execute after animation finishes
			pendingTubeIds.push(id);
			// Show selection visual immediately
			const tube = tubes.find(t => t.id === id);
			if (tube && tube.layers.length > 0) {
				selectedTubeId = id;
			}
			return;
		}

		if (selectedTubeId === null) {
			// Select: only if tube has water
			const tube = tubes.find(t => t.id === id);
			if (!tube || tube.layers.length === 0) return;
			selectedTubeId = id;
		} else if (selectedTubeId === id) {
			// Deselect
			selectedTubeId = null;
		} else {
			// Try to pour
			const srcIdx = tubes.findIndex(t => t.id === selectedTubeId);
			const tgtIdx = tubes.findIndex(t => t.id === id);
			if (srcIdx === -1 || tgtIdx === -1) {
				selectedTubeId = null;
				return;
			}

			// Work with plain copies to avoid proxy issues
			const srcLayers = [...tubes[srcIdx].layers];
			const tgtLayers = [...tubes[tgtIdx].layers];
			const srcTube: Tube = { id: tubes[srcIdx].id, layers: srcLayers };
			const tgtTube: Tube = { id: tubes[tgtIdx].id, layers: tgtLayers };

			if (canPour(srcTube, tgtTube)) {
				// Save history before mutation
				saveHistory();

				// Get pour info for animation
				const topColor = srcLayers[srcLayers.length - 1];
				const pourCount = pourWater(srcTube, tgtTube);
				moveCount++;

				// Start pour animation
				isAnimating = true;
				selectedTubeId = null; // Unselect source tube so queuing works properly
				pouringAnimation = {
					srcId: tubes[srcIdx].id,
					tgtId: tubes[tgtIdx].id,
					color: topColor,
					count: pourCount
				};

				const srcTubeId = tubes[srcIdx].id;

				// Sequence: Move(250ms) -> Pour water(250ms) -> Return(250ms)
				setTimeout(() => {
					// 1. Tube arrived at target, transfer water
					tubes = tubes.map((t, i) => {
						if (i === srcIdx) return { ...t, layers: [...srcTube.layers] };
						if (i === tgtIdx) return { ...t, layers: [...tgtTube.layers] };
						return { ...t, layers: [...t.layers] };
					});

					setTimeout(() => {
						// 2. Water transferred, start return animation
						pouringAnimation = null;
						returningTubeId = srcTubeId;

						// Check if target tube just completed
						const tgtTubeNow = tubes[tgtIdx];
						if (tgtTubeNow.layers.length === TUBE_CAPACITY &&
							tgtTubeNow.layers.every(l => l === tgtTubeNow.layers[0])) {
							justCompletedIds = [...justCompletedIds, tgtTubeNow.id];
							setTimeout(() => {
								justCompletedIds = justCompletedIds.filter(cid => cid !== tgtTubeNow.id);
							}, 600);
						}

						// Check win/stuck
						if (checkWin(tubes)) {
							handleWin();
						} else if (pendingTubeIds.length === 0) {
							if (isStuck(tubes)) {
								// Physical deadlock: no valid moves at all
								handleStuck();
							} else if (!isWarnedUnsolvable && isEffectivelyStuck(tubes)) {
								// BFS: moves exist but no winning sequence
								isWarnedUnsolvable = true;
							}
							saveGame();
						} else {
							saveGame();
						}

						// 3. Unlock animation so we can process queued inputs in parallel with return
						isAnimating = false;

						// Process queued inputs immediately
						if (pendingTubeIds.length > 0) {
							const queued = [...pendingTubeIds];
							pendingTubeIds = [];
							selectedTubeId = null; // Clear visual preview state so replay acts like fresh clicks
							
							for (let j = 0; j < queued.length; j++) {
								const qid = queued[j];
								selectTube(qid);
								if (isAnimating) {
									// If a pour started, put the remaining clicks back into the queue
									pendingTubeIds = [...queued.slice(j + 1), ...pendingTubeIds];
									break;
								}
							}
						}

						// 4. Wait for return animation to finish to cleanup
						setTimeout(() => {
							if (returningTubeId === srcTubeId) {
								returningTubeId = null;
							}
						}, 250);
					}, 250); // 250ms for water drain
				}, 250); // 250ms to move there
			} else {
				// If can't pour, select the new tube instead (if it has water)
				if (tgtLayers.length > 0) {
					selectedTubeId = id;
				} else {
					selectedTubeId = null;
				}
			}
		}
	}

	function saveHistory() {
		if (history.length >= 100) {
			history = history.slice(1);
		}
		const snapshot = {
			layers: tubes.map(t => [...t.layers]),
			moveCount
		};
		history = [...history, snapshot];
	}

	function undo() {
		if (history.length === 0) return;
		const prev = history[history.length - 1];
		history = history.slice(0, -1);

		// Restore tube layers (moveCount is NOT restored — undo still counts as a move)
		tubes = tubes.map((t, i) => ({ ...t, layers: [...prev.layers[i]] }));
		selectedTubeId = null;
		isGameStuck = false;
		isWarnedUnsolvable = false;
	}

	function handleWin() {
		showWinAnimation = true;
		localStorage.removeItem('watersort_save');
		setTimeout(() => {
			gameState = 'finished';
			stopTimer();
			hasSavedGame = false;
			if (!hasRestarted) {
				submitScore();
			}
		}, 800);
	}

	function handleStuck() {
		isGameStuck = true;
	}

	async function submitScore() {
		try {
			const extraMoves = Math.max(0, moveCount - moveLimit);
			const res = await fetch('/api/game/record', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					gameId: 'water-sort',
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
					rankUpStore.show(data.previousRank, data.currentRank, 'water-sort', data.score);
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
			tubes = initialTubes.map((layers, i) => ({ id: i, layers: [...layers] }));
			moveLimit = initialMoveLimit;
			moveCount = 0;
			timerValue = 0;
			displayTimer = 0;
			history = [];
			earnedPointsResult = 0;
			calculatedScore = 0;
			showWinAnimation = false;
			isGameStuck = false;
			isWarnedUnsolvable = false;
			selectedTubeId = null;

			gameState = 'playing';
			hasSavedGame = true;
			startTimer();
			saveGame();
		});
	}

	return {
		// State (getters/setters for reactivity)
		get gameState() { return gameState; },
		set gameState(v: GameState) { gameState = v; },
		get difficulty() { return difficulty; },
		set difficulty(v: Difficulty) { difficulty = v; },
		get tubes() { return tubes; },
		get moveLimit() { return moveLimit; },
		get moveCount() { return moveCount; },
		get timerValue() { return timerValue; },
		get displayTimer() { return displayTimer; },
		get selectedTubeId() { return selectedTubeId; },
		get history() { return history; },
		get hasSavedGame() { return hasSavedGame; },
		get hasRestarted() { return hasRestarted; },
		get alertMessage() { return alertMessage; },
		set alertMessage(v: string | null) { alertMessage = v; },
		get confirmMessage() { return confirmMessage; },
		get earnedPointsResult() { return earnedPointsResult; },
		get calculatedScore() { return calculatedScore; },
		get newTitleName() { return newTitleName; },
		get showVisitPrompt() { return showVisitPrompt; },
		get showWinAnimation() { return showWinAnimation; },
		get isGameStuck() { return isGameStuck; },
		get isWarnedUnsolvable() { return isWarnedUnsolvable; },
		get pouringAnimation() { return pouringAnimation; },
		get isAnimating() { return isAnimating; },
		get returningTubeId() { return returningTubeId; },
		get justCompletedIds() { return justCompletedIds; },
		// Functions
		showAlert,
		showConfirm,
		handleConfirm,
		startTimer,
		stopTimer,
		saveGame,
		loadGame,
		startGame,
		selectTube,
		undo,
		pauseGame,
		resumeGame,
		restartGame
	};
}
