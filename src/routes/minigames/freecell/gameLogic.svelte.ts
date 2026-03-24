import { GAME_CONFIG } from '$lib/config';
import {
	dealCards,
	cloneState,
	executeMove,
	tryMove,
	isWon,
	isStuck,
	canAutoComplete,
	autoComplete,
	findBestMove,
	getAutoFoundationMoves,
	getMovableSequenceLength,
	canMoveToFoundation
} from '$lib/games/freecell/gameLogic';
import type { FreecellState, Location, MoveAction, Card } from '$lib/games/freecell/types';
import { locationsEqual } from '$lib/games/freecell/types';
import { SEEDS } from '$lib/games/freecell/seeds';
import { formatTime } from '$lib/games/utils';
import { rankUpStore } from '$lib/stores/rankUpStore.svelte';

export type GameState = 'start' | 'playing' | 'paused' | 'finished';

export { formatTime };

export function createFreecellGame() {
	// Game state
	let gameState: GameState = $state('start');
	let state: FreecellState = $state(dealCards(1));
	let difficulty = $state('easy');
	let seed = $state(0);
	let moveCount = $state(0);
	let undoCount = $state(0);
	let won = $state(false);

	// Timer
	let timerValue = 0;
	let displayTimer = $state(0);
	let timerInterval: any;

	// UI state
	let hasRestarted = $state(false);
	let selectedLocation: Location | null = $state(null);
	let validTargets: Location[] = $state([]);
	let autoCompleting = $state(false);
	let isAnimating = $state(false);

	// Flying animation callback — Board registers this
	let onFlyCard: ((move: MoveAction) => Promise<void>) | null = null;

	// Drag state
	let isDragging = $state(false);
	let dragCards: Card[] = $state([]);
	let dragFrom: Location | null = $state(null);
	let dragX = $state(0);
	let dragY = $state(0);

	// Modals
	let alertMessage: string | null = $state(null);
	let confirmMessage: string | null = $state(null);
	let confirmCallback: (() => void) | null = null;

	// Score
	let calculatedScore = $state(0);
	let newTitleName = $state<string | null>(null);
	let showVisitPrompt = $state(false);

	// Undo
	let history: FreecellState[] = $state([]);

	// ─── Modal helpers ───

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

	// ─── Timer ───

	function startTimer() {
		clearInterval(timerInterval);
		timerInterval = setInterval(() => {
			if (gameState === 'playing' && !alertMessage && !confirmMessage && !autoCompleting) {
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

	// ─── Save / Load ───

	function saveGame() {
		if (gameState !== 'playing') return;
		try {
			const data = {
				state: {
					tableau: state.tableau,
					freeCells: state.freeCells,
					foundations: state.foundations,
					seed: state.seed
				},
				difficulty,
				seed,
				moveCount,
				undoCount,
				timer: timerValue,
				hasRestarted
			};
			localStorage.setItem('freecell_save', JSON.stringify(data));
		} catch {}
	}

	function loadGame() {
		try {
			const raw = localStorage.getItem('freecell_save');
			if (!raw) {
				showAlert('저장된 게임이 없습니다.');
				return;
			}

			const data = JSON.parse(raw);
			if (!data.state || !data.state.tableau) {
				showAlert('저장 데이터가 손상되었습니다.');
				localStorage.removeItem('freecell_save');
				return;
			}

			state = data.state;
			difficulty = data.difficulty || 'easy';
			seed = data.seed || 0;
			moveCount = data.moveCount || 0;
			undoCount = data.undoCount || 0;
			timerValue = data.timer || 0;
			displayTimer = timerValue;
			hasRestarted = data.hasRestarted || false;

			selectedLocation = null;
			validTargets = [];
			history = [];
			won = false;
			autoCompleting = false;

			gameState = 'paused';
			startTimer();
		} catch {
			showAlert('저장 데이터를 불러올 수 없습니다.');
			localStorage.removeItem('freecell_save');
		}
	}

	// ─── Game flow ───

	function pickSeed(diff: string): number {
		const seeds = SEEDS[diff];
		if (seeds && seeds.length > 0) {
			return seeds[Math.floor(Math.random() * seeds.length)];
		}
		// Fallback: random seed
		return Math.floor(Math.random() * 32000) + 1;
	}

	async function startGame(diff?: string) {
		if (diff) difficulty = diff;
		localStorage.removeItem('freecell_save');

		seed = pickSeed(difficulty);
		state = dealCards(seed);
		moveCount = 0;
		undoCount = 0;
		timerValue = 0;
		displayTimer = 0;
		calculatedScore = 0;
		showVisitPrompt = false;
		hasRestarted = false;
		newTitleName = null;
		selectedLocation = null;
		validTargets = [];
		isAnimating = false;
		autoCompleting = false;
		won = false;
		history = [];

		gameState = 'playing';
		startTimer();

		// Auto-move any initial safe foundation moves (animated)
		isAnimating = true;
		await runAutoFoundation();
		isAnimating = false;
		saveGame();
	}

	async function runAutoFoundation() {
		let moves = getAutoFoundationMoves(state);
		while (moves.length > 0) {
			for (const move of moves) {
				if (onFlyCard) {
					await onFlyCard(move);
				}
				state = executeMove(state, move);
			}
			moves = getAutoFoundationMoves(state);
		}
	}

	// ─── Card interaction ───

	function getCardLocation(card: Card): Location | null {
		// Check free cells
		for (let i = 0; i < state.freeCells.length; i++) {
			if (state.freeCells[i]?.id === card.id) {
				return { type: 'freecell', index: i };
			}
		}
		// Check tableau
		for (let col = 0; col < state.tableau.length; col++) {
			for (let idx = 0; idx < state.tableau[col].length; idx++) {
				if (state.tableau[col][idx].id === card.id) {
					return { type: 'tableau', col, cardIndex: idx };
				}
			}
		}
		return null;
	}

	function computeValidTargets(from: Location): Location[] {
		const targets: Location[] = [];
		let cards: Card[];

		if (from.type === 'tableau') {
			cards = state.tableau[from.col].slice(from.cardIndex);
		} else if (from.type === 'freecell') {
			const c = state.freeCells[from.index];
			if (!c) return [];
			cards = [c];
		} else {
			return [];
		}

		// Foundation
		if (cards.length === 1) {
			const fIdx = canMoveToFoundation(cards[0], state.foundations);
			if (fIdx !== null) targets.push({ type: 'foundation', index: fIdx });
		}

		// Tableau columns
		for (let col = 0; col < state.tableau.length; col++) {
			if (from.type === 'tableau' && col === from.col) continue;
			const move = tryMove(state, from, { type: 'tableau', col, cardIndex: 0 });
			if (move) targets.push({ type: 'tableau', col, cardIndex: 0 });
		}

		// Free cells
		if (cards.length === 1) {
			for (let i = 0; i < state.freeCells.length; i++) {
				if (state.freeCells[i] === null) {
					targets.push({ type: 'freecell', index: i });
					break; // Only one empty free cell target needed
				}
			}
		}

		return targets;
	}

	function isValidTarget(loc: Location): boolean {
		return validTargets.some((t) => locationsEqual(t, loc));
	}

	function handleCardClick(from: Location) {
		if (gameState !== 'playing' || isAnimating || autoCompleting) return;

		// If clicking a foundation, ignore
		if (from.type === 'foundation') return;

		// If something is already selected
		if (selectedLocation) {
			// Clicking the same card → deselect
			if (locationsEqual(selectedLocation, from)) {
				selectedLocation = null;
				validTargets = [];
				return;
			}

			// Clicking a valid target → move
			if (isValidTarget(from)) {
				const action = tryMove(state, selectedLocation, from);
				if (action) {
					applyMove(action);
					selectedLocation = null;
					validTargets = [];
					return;
				}
			}

			// Clicking a different source card → re-select
			selectedLocation = from;
			validTargets = computeValidTargets(from);
			return;
		}

		// Nothing selected: select this card
		selectedLocation = from;
		validTargets = computeValidTargets(from);
	}

	function handleSlotClick(to: Location) {
		if (gameState !== 'playing' || isAnimating || autoCompleting) return;

		if (!selectedLocation) return;

		if (isValidTarget(to)) {
			const action = tryMove(state, selectedLocation, to);
			if (action) {
				applyMove(action);
			}
		}

		selectedLocation = null;
		validTargets = [];
	}

	function handleDoubleClick(from: Location) {
		if (gameState !== 'playing' || isAnimating || autoCompleting) return;

		// Try foundation first
		let card: Card | null = null;
		if (from.type === 'tableau') {
			const col = state.tableau[from.col];
			if (col.length > 0 && from.cardIndex === col.length - 1) {
				card = col[col.length - 1];
			}
		} else if (from.type === 'freecell') {
			card = state.freeCells[from.index];
		}

		if (!card) return;

		const fIdx = canMoveToFoundation(card, state.foundations);
		if (fIdx !== null) {
			const action = tryMove(state, from, { type: 'foundation', index: fIdx });
			if (action) {
				applyMove(action);
				selectedLocation = null;
				validTargets = [];
				return;
			}
		}

		// Otherwise try findBestMove
		const best = findBestMove(state, from);
		if (best) {
			applyMove(best);
			selectedLocation = null;
			validTargets = [];
		}
	}

	// ─── Drag & Drop ───

	function handleDragStart(from: Location, cards: Card[], x: number, y: number) {
		if (gameState !== 'playing' || isAnimating || autoCompleting) return;
		isDragging = true;
		dragFrom = from;
		dragCards = cards;
		dragX = x;
		dragY = y;
		selectedLocation = null;
		validTargets = computeValidTargets(from);
	}

	function handleDragMove(x: number, y: number) {
		if (!isDragging) return;
		dragX = x;
		dragY = y;
	}

	function handleDrop(to: Location) {
		if (!isDragging || !dragFrom) {
			cancelDrag();
			return;
		}

		if (isValidTarget(to)) {
			const action = tryMove(state, dragFrom, to);
			if (action) {
				applyMove(action);
			}
		}

		cancelDrag();
	}

	function cancelDrag() {
		isDragging = false;
		dragCards = [];
		dragFrom = null;
		validTargets = [];
	}

	// ─── Move execution ───

	async function applyMove(action: MoveAction) {
		// Save to history
		history = [...history, cloneState(state)];

		state = executeMove(state, action);
		moveCount++;

		// Auto-move safe cards to foundations (animated)
		isAnimating = true;
		await runAutoFoundation();
		isAnimating = false;

		// Check win
		if (isWon(state)) {
			handleWin();
			return;
		}

		// Check auto-complete
		if (canAutoComplete(state)) {
			runAutoComplete();
			return;
		}

		saveGame();
	}

	function handleWin() {
		won = true;
		localStorage.removeItem('freecell_save');
		gameState = 'finished';
		stopTimer();
		if (!hasRestarted) {
			submitScore();
		}
	}

	async function runAutoComplete() {
		autoCompleting = true;

		// Run auto-complete step by step with fly animation
		let current = cloneState(state);
		for (let safety = 0; safety < 52; safety++) {
			let moved = false;

			// Try free cells
			for (let i = 0; i < current.freeCells.length; i++) {
				const card = current.freeCells[i];
				if (!card) continue;
				const fIdx = canMoveToFoundation(card, current.foundations);
				if (fIdx !== null) {
					const move: MoveAction = {
						from: { type: 'freecell', index: i },
						to: { type: 'foundation', index: fIdx },
						cards: [card]
					};
					if (onFlyCard) await onFlyCard(move);
					current = executeMove(current, move);
					state = cloneState(current);
					moveCount++;
					moved = true;
					break;
				}
			}
			if (moved) continue;

			// Try tableau
			for (let col = 0; col < current.tableau.length; col++) {
				const column = current.tableau[col];
				if (column.length === 0) continue;
				const card = column[column.length - 1];
				const fIdx = canMoveToFoundation(card, current.foundations);
				if (fIdx !== null) {
					const move: MoveAction = {
						from: { type: 'tableau', col, cardIndex: column.length - 1 },
						to: { type: 'foundation', index: fIdx },
						cards: [card]
					};
					if (onFlyCard) await onFlyCard(move);
					current = executeMove(current, move);
					state = cloneState(current);
					moveCount++;
					moved = true;
					break;
				}
			}

			if (!moved || isWon(current)) break;
		}

		autoCompleting = false;

		if (isWon(state)) {
			handleWin();
		}
	}

	// ─── Score ───

	async function submitScore() {
		try {
			const res = await fetch('/api/game/record', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					gameId: 'freecell',
					difficulty,
					clearTime: timerValue,
					score: 0, // Server calculates
					mistakes: undoCount,
					skipReward: !GAME_CONFIG.ENABLE_REWARDS
				})
			});
			const data = await res.json();
			if (res.ok) {
				calculatedScore = data.score;

				if (data.currentRank && (!data.previousRank || data.currentRank < data.previousRank)) {
					rankUpStore.show(data.previousRank, data.currentRank, 'freecell', data.score);
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

	// ─── Game controls ───

	function pauseGame() {
		gameState = 'paused';
	}

	function resumeGame() {
		gameState = 'playing';
	}

	function restartGame() {
		showConfirm('다시시작하면 랭킹에 기록되지 않습니다. 계속하시겠습니까?', async () => {
			stopTimer();
			hasRestarted = true;

			// 같은 시드로 재시작
			state = dealCards(seed);
			moveCount = 0;
			undoCount = 0;
			timerValue = 0;
			displayTimer = 0;
			calculatedScore = 0;
			selectedLocation = null;
			validTargets = [];
			isAnimating = false;
			autoCompleting = false;
			won = false;
			history = [];

			gameState = 'playing';
			startTimer();
			isAnimating = true;
			await runAutoFoundation();
			isAnimating = false;
			saveGame();
		});
	}

	function undo() {
		if (history.length === 0 || gameState !== 'playing' || isAnimating || autoCompleting) return;
		state = history[history.length - 1];
		history = history.slice(0, -1);
		moveCount = Math.max(0, moveCount - 1);
		undoCount++;
		selectedLocation = null;
		validTargets = [];
	}

	function newGame() {
		if (gameState === 'playing') {
			showConfirm('현재 게임을 포기하고 새 게임을 시작하시겠습니까?', () => {
				stopTimer();
				hasRestarted = true;
				startGame();
			});
		} else {
			startGame();
		}
	}

	return {
		// State getters
		get gameState() { return gameState; },
		set gameState(v: GameState) { gameState = v; },
		get state() { return state; },
		get difficulty() { return difficulty; },
		get seed() { return seed; },
		get moveCount() { return moveCount; },
		get undoCount() { return undoCount; },
		get won() { return won; },
		get timerValue() { return timerValue; },
		get displayTimer() { return displayTimer; },
		get hasRestarted() { return hasRestarted; },
		get selectedLocation() { return selectedLocation; },
		get validTargets() { return validTargets; },
		get autoCompleting() { return autoCompleting; },
		get isAnimating() { return isAnimating; },
		get isDragging() { return isDragging; },
		get dragCards() { return dragCards; },
		get dragFrom() { return dragFrom; },
		get dragX() { return dragX; },
		get dragY() { return dragY; },

		// Modals
		get alertMessage() { return alertMessage; },
		set alertMessage(v: string | null) { alertMessage = v; },
		get confirmMessage() { return confirmMessage; },
		get calculatedScore() { return calculatedScore; },
		get newTitleName() { return newTitleName; },
		get showVisitPrompt() { return showVisitPrompt; },

		get canUndo() { return history.length > 0 && gameState === 'playing' && !isAnimating && !autoCompleting; },

		// Functions
		showAlert,
		showConfirm,
		handleConfirm,
		startTimer,
		stopTimer,
		saveGame,
		loadGame,
		startGame,
		pauseGame,
		resumeGame,
		restartGame,
		undo,
		newGame,
		handleCardClick,
		handleSlotClick,
		handleDoubleClick,
		registerFlyCallback(cb: (move: MoveAction) => Promise<void>) { onFlyCard = cb; },
		handleDragStart,
		handleDragMove,
		handleDrop,
		cancelDrag,
		isValidTarget,
		computeValidTargets
	};
}
