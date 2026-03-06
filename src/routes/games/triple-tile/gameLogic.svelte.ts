import { GAME_CONFIG } from '$lib/config';
import { generatePuzzle, shuffleBoardTiles } from '$lib/games/triple-tile/tileGenerator';
import {
	isExposed,
	insertIntoStaging,
	checkStagingMatch,
	removeMatchedFromStaging,
	stagingOccupied,
} from '$lib/games/triple-tile/tileLogic';
import { DIFFICULTY_CONFIG, type Difficulty, type Tile } from '$lib/games/triple-tile/types';
import { goto } from '$app/navigation';
import { formatTime } from '$lib/games/utils';
import { rankUpStore } from '$lib/stores/rankUpStore.svelte';

export type GameState = 'start' | 'playing' | 'paused' | 'finished';

export const difficultyLabels: Record<string, string> = {
	easy: '쉬움',
	medium: '보통',
	hard: '어려움',
	expert: '전문가',
	master: '마스터',
};

export { formatTime };
export type { Difficulty };

export function createTripleTileGame() {
	// Core state
	let gameState: GameState = $state('start');
	let difficulty: Difficulty = $state('medium');
	let tiles: Tile[] = $state([]);
	let staging: (Tile | null)[] = $state(Array(7).fill(null));
	let isWon = $state(false);

	// Counts
	let moveCount = $state(0);
	let matchCount = $state(0);

	// Power-ups
	let shuffleRemaining = $state(0);
	let shuffleUsed = $state(0);

	// Timer
	let timerValue = 0;
	let displayTimer = $state(0);
	let timerInterval: any;

	// Undo history (tile id + staging snapshot)
	let history: { tileId: number; stagingSnapshot: (number | null)[] }[] = $state([]);

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

	// Animation
	let matchingTypeId = $state(-1); // type currently being matched (for animation)
	let matchingSlots: { index: number; typeId: number }[] = $state([]); // slots with match animation overlay
	let matchAnimTimer: ReturnType<typeof setTimeout> | null = null; // track match animation timeout
	let pendingQueue: { newStaging: (Tile | null)[]; tileId: number }[] = [];

	// Initial state for restart
	let initialTiles: Tile[] = [];

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
				tiles: tiles.map((t) => ({ ...t })),
				staging: staging.map((t) => (t ? { ...t } : null)),
				moveCount,
				matchCount,
				shuffleRemaining,
				shuffleUsed,
				timer: timerValue,
				difficulty,
				history: history.map((h) => ({ ...h, stagingSnapshot: [...h.stagingSnapshot] })),
				hasRestarted,
				initialTiles: initialTiles.map((t) => ({ ...t })),
			};
			localStorage.setItem('triple_tile_save', JSON.stringify(data));
		} catch {}
	}

	function loadGame() {
		try {
			const raw = localStorage.getItem('triple_tile_save');
			if (!raw) {
				showAlert('저장된 게임이 없습니다.');
				return;
			}

			const data = JSON.parse(raw);
			if (!data.tiles || !Array.isArray(data.tiles)) {
				showAlert('저장 데이터가 손상되었습니다.');
				localStorage.removeItem('triple_tile_save');
				hasSavedGame = false;
				return;
			}

			tiles = data.tiles.map((t: any) => ({ ...t }));
			staging = data.staging.map((t: any) => (t ? { ...t } : null));
			moveCount = data.moveCount || 0;
			matchCount = data.matchCount || 0;
			shuffleRemaining = data.shuffleRemaining ?? 0;
			shuffleUsed = data.shuffleUsed ?? 0;
			timerValue = data.timer || 0;
			displayTimer = timerValue;
			difficulty = data.difficulty || 'medium';
			history = (data.history || []).map((h: any) => ({
				tileId: h.tileId,
				stagingSnapshot: [...h.stagingSnapshot],
			}));
			hasRestarted = data.hasRestarted || false;
			initialTiles = (data.initialTiles || []).map((t: any) => ({ ...t }));
			isWon = false;

			gameState = 'paused';
			startTimer();
		} catch {
			showAlert('저장 데이터를 불러올 수 없습니다.');
			localStorage.removeItem('triple_tile_save');
			hasSavedGame = false;
		}
	}

	// Game flow
	function startGame() {
		localStorage.removeItem('triple_tile_save');
		const config = DIFFICULTY_CONFIG[difficulty];

		tiles = generatePuzzle(difficulty);
		staging = Array(config.stagingCapacity).fill(null);
		initialTiles = tiles.map((t) => ({ ...t }));

		moveCount = 0;
		matchCount = 0;
		shuffleRemaining = config.shuffleUses;
		shuffleUsed = 0;
		timerValue = 0;
		displayTimer = 0;
		history = [];
		earnedPointsResult = 0;
		calculatedScore = 0;
		showVisitPrompt = false;
		hasRestarted = false;
		isWon = false;
		matchingTypeId = -1;
		matchingSlots = [];
		pendingQueue = [];
		newTitleName = null;

		gameState = 'playing';
		hasSavedGame = true;
		startTimer();
		saveGame();
	}

	/** Get the virtual staging state including all pending (in-flight) tiles. */
	function getVirtualStaging(): (Tile | null)[] {
		if (pendingQueue.length === 0) return [...staging];
		return pendingQueue[pendingQueue.length - 1].newStaging;
	}

	/**
	 * Attempt to select a tile. Returns info for fly animation, or null if rejected.
	 * Does NOT immediately update staging — call commitTile(tileId) after animation.
	 * Multiple tiles can be in-flight simultaneously.
	 */
	function selectTile(tileId: number): { typeId: number; insertIndex: number; tileId: number } | null {
		if (gameState !== 'playing') return null;

		const tile = tiles.find((t) => t.id === tileId);
		if (!tile || tile.removed) return null;

		// Check if tile is exposed
		if (!isExposed(tile, tiles)) return null;

		// Use virtual staging (includes all pending in-flight tiles)
		const virtualStaging = getVirtualStaging();

		// Save undo history (staging snapshot before this move)
		const stagingSnapshot = virtualStaging.map((t) => (t ? t.typeId : null));
		history = [...history, { tileId: tile.id, stagingSnapshot }];

		// Try to insert into virtual staging
		const config = DIFFICULTY_CONFIG[difficulty];
		const result = insertIntoStaging(virtualStaging, tile, config.stagingCapacity);
		if (!result) {
			// Staging is full — game over
			history = history.slice(0, -1);
			handleGameOver();
			return null;
		}

		// Mark tile as removed from board immediately
		tiles = tiles.map((t) => (t.id === tileId ? { ...t, removed: true } : t));

		// Add to pending queue
		pendingQueue = [...pendingQueue, { newStaging: result.newStaging, tileId: tile.id }];

		return { typeId: tile.typeId, insertIndex: result.insertIndex, tileId: tile.id };
	}

	/** Called after fly animation completes to commit a specific tile's staging change. */
	function commitTile(tileId: number) {
		const idx = pendingQueue.findIndex((p) => p.tileId === tileId);
		if (idx === -1) return;

		// Commit this tile and all tiles before it (preserve order)
		for (let i = 0; i <= idx; i++) {
			staging = pendingQueue[i].newStaging;
			moveCount++;
		}
		pendingQueue = pendingQueue.slice(idx + 1);

		const config = DIFFICULTY_CONFIG[difficulty];

		// Check for match
		const matchedType = checkStagingMatch(staging);
		if (matchedType >= 0) {
			// Cancel previous match animation timer if still pending
			if (matchAnimTimer !== null) clearTimeout(matchAnimTimer);

			// Record matched slot positions for animation overlay
			matchingSlots = staging
				.map((t, i) => (t && t.typeId === matchedType ? { index: i, typeId: t.typeId } : null))
				.filter((x): x is { index: number; typeId: number } => x !== null);
			matchingTypeId = matchedType;

			// Update staging immediately (remove matched + compact)
			staging = removeMatchedFromStaging(staging, matchedType, config.stagingCapacity);
			matchCount++;

			// Clear animation overlay after CSS animation completes
			matchAnimTimer = setTimeout(() => {
				matchAnimTimer = null;
				matchingTypeId = -1;
				matchingSlots = [];

				// Check win only when no more pending tiles
				if (pendingQueue.length === 0 && tiles.every((t) => t.removed)) {
					handleWin();
				}
			}, 400);
		} else if (pendingQueue.length === 0) {
			// Check if staging is now full (no match possible)
			if (stagingOccupied(staging) >= config.stagingCapacity) {
				handleGameOver();
			}
		}
	}

	function undo() {
		if (history.length === 0 || pendingQueue.length > 0 || matchingTypeId >= 0) return;

		const last = history[history.length - 1];
		history = history.slice(0, -1);

		// Restore the tile to the board
		tiles = tiles.map((t) => (t.id === last.tileId ? { ...t, removed: false } : t));

		// Restore staging snapshot
		const config = DIFFICULTY_CONFIG[difficulty];
		const prevStaging: (Tile | null)[] = Array(config.stagingCapacity).fill(null);
		for (let i = 0; i < last.stagingSnapshot.length; i++) {
			const typeId = last.stagingSnapshot[i];
			if (typeId !== null) {
				// Find the tile in current staging or create a placeholder
				const existingTile = staging.find((t) => t && t.typeId === typeId);
				if (existingTile) {
					prevStaging[i] = { ...existingTile };
				}
			}
		}
		staging = prevStaging;
		moveCount = Math.max(0, moveCount - 1);

		// Clear game over state if we were stuck
		if (isWon === false && gameState === 'finished') {
			gameState = 'playing';
		}
	}

	function shuffle() {
		if (shuffleRemaining <= 0 || pendingQueue.length > 0 || matchingTypeId >= 0 || gameState !== 'playing') return;

		tiles = shuffleBoardTiles(tiles);
		shuffleRemaining--;
		shuffleUsed++;
	}

	function handleWin() {
		isWon = true;
		localStorage.removeItem('triple_tile_save');
		setTimeout(() => {
			gameState = 'finished';
			stopTimer();
			hasSavedGame = false;
			if (!hasRestarted) {
				submitScore();
			}
		}, 600);
	}

	function handleGameOver() {
		isWon = false;
		gameState = 'finished';
		stopTimer();
		localStorage.removeItem('triple_tile_save');
		hasSavedGame = false;
	}

	async function submitScore() {
		try {
			const res = await fetch('/api/game/record', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					gameId: 'triple-tile',
					difficulty,
					clearTime: timerValue,
					mistakes: shuffleUsed,
					skipReward: !GAME_CONFIG.ENABLE_REWARDS,
				}),
			});
			const data = await res.json();
			if (res.ok) {
				earnedPointsResult = data.earnedPoints;
				calculatedScore = data.score;

				if (data.currentRank && (!data.previousRank || data.currentRank < data.previousRank)) {
					rankUpStore.show(data.previousRank, data.currentRank, 'triple-tile', data.score);
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

			tiles = initialTiles.map((t) => ({ ...t }));
			const config = DIFFICULTY_CONFIG[difficulty];
			staging = Array(config.stagingCapacity).fill(null);
			shuffleRemaining = config.shuffleUses;
			shuffleUsed = 0;
			moveCount = 0;
			matchCount = 0;
			timerValue = 0;
			displayTimer = 0;
			history = [];
			earnedPointsResult = 0;
			calculatedScore = 0;
			isWon = false;
			matchingTypeId = -1;
			matchingSlots = [];
			pendingQueue = [];

			gameState = 'playing';
			hasSavedGame = true;
			startTimer();
			saveGame();
		});
	}

	return {
		// State
		get gameState() { return gameState; },
		set gameState(v: GameState) { gameState = v; },
		get difficulty() { return difficulty; },
		set difficulty(v: Difficulty) { difficulty = v; },
		get tiles() { return tiles; },
		get staging() { return staging; },
		get stagingCapacity() { return DIFFICULTY_CONFIG[difficulty].stagingCapacity; },
		get isWon() { return isWon; },
		get moveCount() { return moveCount; },
		get matchCount() { return matchCount; },
		get shuffleRemaining() { return shuffleRemaining; },
		get shuffleUsed() { return shuffleUsed; },
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
		get newTitleName() { return newTitleName; },
		get showVisitPrompt() { return showVisitPrompt; },
		get matchingTypeId() { return matchingTypeId; },
		get matchingSlots() { return matchingSlots; },
		get isAnimating() { return pendingQueue.length > 0 || matchingTypeId >= 0; },
		// Functions
		showAlert,
		showConfirm,
		handleConfirm,
		startTimer,
		stopTimer,
		saveGame,
		loadGame,
		startGame,
		selectTile,
		commitTile,
		undo,
		shuffle,
		pauseGame,
		resumeGame,
		restartGame,
	};
}
