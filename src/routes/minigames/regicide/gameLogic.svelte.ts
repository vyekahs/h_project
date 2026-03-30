import { GAME_CONFIG } from '$lib/config';
import {
	initGame,
	isValidPlay,
	getAttackValue,
	getUniqueSuits,
	resolveSuitPowers,
	dealDamage,
	defeatEnemy,
	flipNextEnemy,
	getEffectiveAttack,
	canSurviveAttack,
	validateDiscard,
	useJester,
	checkWin,
	checkCanPlay,
	getVictoryTier,
	drawCards
} from '$lib/games/regicide/gameLogic';
import type { Card, Enemy, Suit, GamePhase, TurnPhase, VictoryTier, CombatLogEntry } from '$lib/games/regicide/types';
import { SUIT_POWER_NAME, SUIT_NAME_KO, cardToString, getCardValue } from '$lib/games/regicide/types';
import { formatTime } from '$lib/games/utils';
import { rankUpStore } from '$lib/stores/rankUpStore.svelte';
import { TUTORIAL_SCENARIO } from '$lib/games/regicide/tutorial/tutorialScenarios';
import type { TutorialStep, TutorialGameState } from '$lib/games/regicide/tutorial/tutorialTypes';

export { formatTime };

export function createRegicideGame() {
	// ─── Game phase ───
	let gamePhase: GamePhase = $state('start');
	let turnPhase: TurnPhase = $state('select_cards');

	// ─── Game state (mirrors pure GameState as individual $state vars) ───
	let castleDeck: Card[] = $state([]);
	let tavernDeck: Card[] = $state([]);
	let discardPile: Card[] = $state([]);
	let playerHand: Card[] = $state([]);
	let currentEnemy: Enemy | null = $state(null);
	let enemiesDefeated = $state(0);
	let currentShield = $state(0);
	let jestersRemaining = $state(2);
	let jestersUsed = $state(0);
	let turnNumber = $state(1);
	let playedCardsThisEnemy: Card[] = $state([]);

	// ─── UI selection state ───
	let selectedCardIds: Set<number> = $state(new Set());
	let discardCardIds: Set<number> = $state(new Set());

	// ─── Combat log ───
	let combatLog: CombatLogEntry[] = $state([]);

	// ─── Timer ───
	let timerValue = 0;
	let displayTimer = $state(0);
	let timerInterval: any;

	// ─── Game metadata ───
	let difficulty = $state('classic');
	let hasRestarted = $state(false);
	let won = $state(false);
	let victoryTier: VictoryTier | null = $state(null);

	// ─── Modals ───
	let alertMessage: string | null = $state(null);
	let confirmMessage: string | null = $state(null);
	let confirmCallback: (() => void) | null = null;

	// ─── Score ───
	let calculatedScore = $state(0);
	let newTitleName = $state<string | null>(null);
	let showVisitPrompt = $state(false);

	// ─── Animation ───
	type AnimationEvent =
		| { type: 'power'; suits: Suit[]; immuneSuits: Suit[]; attackValue: number }
		| { type: 'damage'; amount: number; doubled: boolean }
		| { type: 'defeat'; exactKill: boolean }
		| { type: 'enemy_attack'; amount: number }
		| null;

	let animEvent: AnimationEvent = $state(null);
	let isAnimating = $state(false);

	function delay(ms: number): Promise<void> {
		return new Promise(r => setTimeout(r, ms));
	}

	async function showAnim(event: NonNullable<AnimationEvent>, durationMs: number) {
		animEvent = event;
		await delay(durationMs);
		animEvent = null;
	}

	// ─── Tutorial ───
	let isTutorial = $state(false);
	let tutorialSteps: TutorialStep[] = $state([]);
	let tutorialStepIndex = $state(0);
	let tutorialHint: string | null = $state(null);

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
			if (gamePhase === 'playing' && !alertMessage && !confirmMessage) {
				timerValue++;
				displayTimer = timerValue;
			}
		}, 1000);
	}

	function stopTimer() {
		clearInterval(timerInterval);
	}

	// ─── Save / Load ───

	function saveGame() {
		if (gamePhase !== 'playing' || isTutorial) return;
		try {
			const data = {
				castleDeck,
				tavernDeck,
				discardPile,
				playerHand,
				currentEnemy,
				enemiesDefeated,
				currentShield,
				jestersRemaining,
				jestersUsed,
				turnNumber,
				playedCardsThisEnemy,
				combatLog,
				timer: timerValue,
				hasRestarted,
				turnPhase
			};
			localStorage.setItem('regicide_save', JSON.stringify(data));
		} catch {}
	}

	function loadGame() {
		try {
			const raw = localStorage.getItem('regicide_save');
			if (!raw) {
				showAlert('저장된 게임이 없습니다.');
				return;
			}

			const data = JSON.parse(raw);
			if (!data.playerHand || !data.currentEnemy) {
				showAlert('저장 데이터가 손상되었습니다.');
				localStorage.removeItem('regicide_save');
				return;
			}

			castleDeck = data.castleDeck;
			tavernDeck = data.tavernDeck;
			discardPile = data.discardPile;
			playerHand = data.playerHand;
			currentEnemy = data.currentEnemy;
			enemiesDefeated = data.enemiesDefeated || 0;
			currentShield = data.currentShield || 0;
			jestersRemaining = data.jestersRemaining ?? 2;
			jestersUsed = data.jestersUsed || 0;
			turnNumber = data.turnNumber || 1;
			playedCardsThisEnemy = data.playedCardsThisEnemy || [];
			combatLog = data.combatLog || [];
			timerValue = data.timer || 0;
			displayTimer = timerValue;
			hasRestarted = data.hasRestarted || false;
			turnPhase = data.turnPhase || 'select_cards';

			selectedCardIds = new Set();
			discardCardIds = new Set();
			won = false;
			victoryTier = null;

			gamePhase = 'paused';
			startTimer();
		} catch {
			showAlert('저장 데이터를 불러올 수 없습니다.');
			localStorage.removeItem('regicide_save');
		}
	}

	// ─── Log helper ───

	function addLog(type: CombatLogEntry['type'], message: string) {
		combatLog = [...combatLog, { type, message }];
	}

	// ─── Card selection helpers ───

	function getSelectedCards(): Card[] {
		return playerHand.filter((c) => selectedCardIds.has(c.id));
	}

	function getSelectedDiscards(): Card[] {
		return playerHand.filter((c) => discardCardIds.has(c.id));
	}

	// ─── Game flow ───

	function startGame(diff?: string) {
		if (diff) difficulty = diff;
		localStorage.removeItem('regicide_save');

		const gs = initGame();
		castleDeck = gs.castleDeck;
		tavernDeck = gs.tavernDeck;
		discardPile = gs.discardPile;
		playerHand = gs.playerHand;
		currentEnemy = gs.currentEnemy;
		enemiesDefeated = gs.enemiesDefeated;
		currentShield = gs.currentShield;
		jestersRemaining = gs.jestersRemaining;
		jestersUsed = gs.jestersUsed;
		turnNumber = gs.turnNumber;
		playedCardsThisEnemy = gs.playedCardsThisEnemy;

		selectedCardIds = new Set();
		discardCardIds = new Set();
		combatLog = [];
		timerValue = 0;
		displayTimer = 0;
		calculatedScore = 0;
		showVisitPrompt = false;
		hasRestarted = false;
		newTitleName = null;
		won = false;
		victoryTier = null;

		turnPhase = 'select_cards';
		gamePhase = 'playing';
		startTimer();

		if (currentEnemy) {
			addLog('play', `첫 번째 적: ${cardToString(currentEnemy.card)} (HP: ${currentEnemy.maxHp}, ATK: ${currentEnemy.attack})`);
		}

		saveGame();
	}

	// ─── Card selection ───

	function toggleCardSelection(cardId: number) {
		if (turnPhase !== 'select_cards' || gamePhase !== 'playing') return;

		const next = new Set(selectedCardIds);
		if (next.has(cardId)) {
			next.delete(cardId);
		} else {
			next.add(cardId);
		}
		selectedCardIds = next;
	}

	// ─── Play cards ───

	async function playSelectedCards() {
		if (gamePhase !== 'playing' || turnPhase !== 'select_cards' || isAnimating) return;

		const cards = getSelectedCards();
		if (cards.length === 0 || !isValidPlay(cards) || !currentEnemy) return;

		// Tutorial validation
		if (isTutorial && !validateTutorialPlay(cards.map(c => c.id))) return;

		// Step 1: Remove played cards from hand, track them
		const playedIds = new Set(cards.map((c) => c.id));
		playerHand = playerHand.filter((c) => !playedIds.has(c.id));
		playedCardsThisEnemy = [...playedCardsThisEnemy, ...cards];
		selectedCardIds = new Set();

		const attackValue = getAttackValue(cards);
		const cardStr = cards.map(cardToString).join(' + ');
		addLog('play', `${cardStr} 플레이 (공격력: ${attackValue})`);

		// Step 2: Resolve suit powers
		const powerResult = resolveSuitPowers(
			cards,
			currentEnemy,
			currentShield,
			[...discardPile],
			[...tavernDeck],
			[...playerHand]
		);

		playerHand = powerResult.hand;
		tavernDeck = powerResult.tavernDeck;
		discardPile = powerResult.discardPile;
		currentShield = powerResult.newShield;

		// Sync shield to enemy object (getEffectiveAttack reads enemy.shieldReduction)
		if (currentEnemy) {
			currentEnemy = { ...currentEnemy, shieldReduction: currentShield };
		}

		for (const suit of powerResult.activatedPowers) {
			addLog('power', `${SUIT_NAME_KO[suit]} ${SUIT_POWER_NAME[suit]} 발동 (${attackValue})`);
		}
		for (const suit of powerResult.immuneSuits) {
			addLog('power', `${SUIT_NAME_KO[suit]} ${SUIT_POWER_NAME[suit]} 면역 (적 ${SUIT_NAME_KO[currentEnemy.card.suit]})`);
		}

		// Animation: suit powers
		isAnimating = true;
		if (powerResult.activatedPowers.length > 0 || powerResult.immuneSuits.length > 0) {
			await showAnim({
				type: 'power',
				suits: powerResult.activatedPowers,
				immuneSuits: powerResult.immuneSuits,
				attackValue
			}, 700);
		}

		// Step 3: Deal damage
		const totalDamage = attackValue * powerResult.damageMultiplier;
		const enemyCopy = { ...currentEnemy, card: { ...currentEnemy.card } };
		const dmgResult = dealDamage(enemyCopy, totalDamage);
		currentEnemy = dmgResult.enemy;

		if (powerResult.damageMultiplier > 1) {
			addLog('damage', `더블 데미지! ${totalDamage} 피해 (${currentEnemy.currentHp} HP 남음)`);
		} else {
			addLog('damage', `${totalDamage} 피해 (${currentEnemy.currentHp} HP 남음)`);
		}

		// Animation: damage hit
		await showAnim({ type: 'damage', amount: totalDamage, doubled: powerResult.damageMultiplier > 1 }, 600);

		if (dmgResult.defeated) {
			// Animation: defeat
			await showAnim({ type: 'defeat', exactKill: dmgResult.exactKill }, 700);

			// Enemy defeated
			const defeatResult = defeatEnemy(
				currentEnemy.card,
				dmgResult.exactKill,
				[...tavernDeck],
				[...discardPile],
				[...playedCardsThisEnemy]
			);
			tavernDeck = defeatResult.tavernDeck;
			discardPile = defeatResult.discardPile;
			enemiesDefeated++;
			currentShield = 0;
			playedCardsThisEnemy = [];

			if (dmgResult.exactKill) {
				addLog('defeat', `정확한 처치! ${cardToString(currentEnemy.card)}가 드로우 덱 맨 위로 → 다음 드로우 시 획득!`);
			} else {
				addLog('defeat', `적 처치! (초과 데미지 — 적 카드는 버린 카드 더미로)`);
			}

			if (checkWin(enemiesDefeated)) {
				isAnimating = false;
				handleWin();
				return;
			}

			// Flip next enemy
			const flipResult = flipNextEnemy([...castleDeck]);
			if (flipResult) {
				currentEnemy = flipResult.enemy;
				castleDeck = flipResult.castleDeck;
				addLog('play', `다음 적: ${cardToString(currentEnemy.card)} (HP: ${currentEnemy.maxHp}, ATK: ${currentEnemy.attack})`);
			} else {
				currentEnemy = null;
			}

			turnPhase = 'select_cards';
			isAnimating = false;

			// Check if player can continue
			if (!checkCanPlay(playerHand, jestersRemaining)) {
				handleLose();
				return;
			}
		} else {
			// Enemy survived — enemy attacks back
			const effectiveAtk = getEffectiveAttack(currentEnemy);

			if (effectiveAtk <= 0) {
				addLog('enemy_attack', `적 공격이 방어막으로 완전 차단됨`);
				turnPhase = 'select_cards';
				turnNumber++;
				isAnimating = false;
			} else if (!canSurviveAttack(playerHand, effectiveAtk) && jestersRemaining <= 0) {
				addLog('enemy_attack', `적 공격력 ${effectiveAtk} — 생존 불가!`);
				isAnimating = false;
				handleLose();
				return;
			} else {
				// Animation: enemy attack
				await showAnim({ type: 'enemy_attack', amount: effectiveAtk }, 500);
				addLog('enemy_attack', `적 공격! ${effectiveAtk} 이상의 카드를 버려야 합니다`);
				turnPhase = 'enemy_attacks';
				isAnimating = false;
			}
		}

		if (isTutorial) advanceTutorialStep();
		saveGame();
	}

	// ─── Discard phase ───

	function toggleDiscardSelection(cardId: number) {
		if (turnPhase !== 'enemy_attacks' || gamePhase !== 'playing') return;

		const next = new Set(discardCardIds);
		if (next.has(cardId)) {
			next.delete(cardId);
		} else {
			next.add(cardId);
		}
		discardCardIds = next;
	}

	function confirmDiscard() {
		if (gamePhase !== 'playing' || turnPhase !== 'enemy_attacks' || !currentEnemy) return;

		const cards = getSelectedDiscards();
		const effectiveAtk = getEffectiveAttack(currentEnemy);

		if (!validateDiscard(cards, effectiveAtk)) return;

		// Tutorial validation
		if (isTutorial && !validateTutorialDiscard(cards.map(c => c.id))) return;

		// Remove discarded cards from hand
		const discardIds = new Set(cards.map((c) => c.id));
		playerHand = playerHand.filter((c) => !discardIds.has(c.id));
		discardPile = [...discardPile, ...cards];

		const totalDiscarded = cards.reduce((sum, c) => sum + getCardValue(c), 0);
		addLog('discard', `${cards.map(cardToString).join(' + ')} 버림 (${totalDiscarded} / ${effectiveAtk} 필요)`);

		discardCardIds = new Set();
		turnPhase = 'select_cards';
		turnNumber++;

		// Check if player can continue (skip in tutorial)
		if (!isTutorial && !checkCanPlay(playerHand, jestersRemaining)) {
			handleLose();
			return;
		}

		if (isTutorial) advanceTutorialStep();
		saveGame();
	}

	// ─── Jester ───

	function flipJester() {
		if (gamePhase !== 'playing') return;
		if (jestersRemaining <= 0) return;
		if (turnPhase !== 'select_cards' && turnPhase !== 'enemy_attacks') return;

		const result = useJester([...playerHand], [...tavernDeck], [...discardPile]);
		playerHand = result.hand;
		tavernDeck = result.tavernDeck;
		discardPile = result.discardPile;
		jestersRemaining--;
		jestersUsed++;

		addLog('jester', `광대 사용! 손패 교체 (남은 광대: ${jestersRemaining})`);

		selectedCardIds = new Set();
		discardCardIds = new Set();

		// If used during enemy_attacks: new hand, but still must defend
		// turnPhase stays 'enemy_attacks' — player defends with new hand
		// If used during select_cards: just a hand refresh

		if (turnPhase === 'enemy_attacks' && currentEnemy) {
			// Check if new hand can survive
			const effectiveAtk = getEffectiveAttack(currentEnemy);
			if (!canSurviveAttack(playerHand, effectiveAtk) && jestersRemaining <= 0) {
				addLog('enemy_attack', `새 핸드로도 방어 불가!`);
				handleLose();
				return;
			}
		}

		// Check if player can continue (e.g. tavern was empty, new hand is empty)
		if (!checkCanPlay(playerHand, jestersRemaining)) {
			handleLose();
			return;
		}

		saveGame();
	}

	// ─── Win / Lose ───

	function handleWin() {
		won = true;
		victoryTier = getVictoryTier(jestersUsed);
		gamePhase = 'finished';
		stopTimer();
		localStorage.removeItem('regicide_save');

		addLog('defeat', `승리! 등급: ${victoryTier} (광대 ${jestersUsed}회 사용)`);

		if (!hasRestarted) {
			submitScore();
		}
	}

	function handleLose() {
		won = false;
		gamePhase = 'finished';
		turnPhase = 'game_over';
		stopTimer();
		localStorage.removeItem('regicide_save');

		addLog('damage', `패배! ${enemiesDefeated}/12 적 처치`);
	}

	// ─── Score submission ───

	async function submitScore() {
		try {
			const res = await fetch('/api/game/record', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					gameId: 'regicide',
					difficulty,
					clearTime: timerValue,
					score: 0,
					mistakes: jestersUsed,
					skipReward: !GAME_CONFIG.ENABLE_REWARDS
				})
			});
			const data = await res.json();
			if (res.ok) {
				calculatedScore = data.score;

				if (data.currentRank && (!data.previousRank || data.currentRank < data.previousRank)) {
					rankUpStore.show(data.previousRank, data.currentRank, 'regicide', data.score);
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

	function forceSave() {
		if (isTutorial) return;
		try {
			const data = {
				castleDeck,
				tavernDeck,
				discardPile,
				playerHand,
				currentEnemy,
				enemiesDefeated,
				currentShield,
				jestersRemaining,
				jestersUsed,
				turnNumber,
				playedCardsThisEnemy,
				combatLog,
				timer: timerValue,
				hasRestarted,
				turnPhase
			};
			localStorage.setItem('regicide_save', JSON.stringify(data));
		} catch {}
	}

	function pauseGame() {
		gamePhase = 'paused';
		forceSave();
	}

	function resumeGame() {
		gamePhase = 'playing';
	}

	function saveAndQuit() {
		stopTimer();
		forceSave();
	}

	function restartGame() {
		showConfirm('다시시작하면 랭킹에 기록되지 않습니다. 계속하시겠습니까?', () => {
			stopTimer();
			hasRestarted = true;
			startGame(difficulty);
		});
	}

	function newGame() {
		if (gamePhase === 'playing') {
			showConfirm('현재 게임을 포기하고 새 게임을 시작하시겠습니까?', () => {
				stopTimer();
				hasRestarted = true;
				startGame();
			});
		} else {
			stopTimer();
			gamePhase = 'start';
		}
	}

	// ─── Tutorial ───

	function applyTutorialState(state: Partial<TutorialGameState>) {
		if (state.playerHand) playerHand = [...state.playerHand];
		if (state.currentEnemy) currentEnemy = { ...state.currentEnemy };
		if (state.castleDeck) castleDeck = [...state.castleDeck];
		if (state.tavernDeck) tavernDeck = [...state.tavernDeck];
		if (state.discardPile) discardPile = [...state.discardPile];
		if (state.currentShield !== undefined) currentShield = state.currentShield;
		if (state.jestersRemaining !== undefined) jestersRemaining = state.jestersRemaining;
		if (state.playedCardsThisEnemy) playedCardsThisEnemy = [...state.playedCardsThisEnemy];
		if (state.turnPhase) turnPhase = state.turnPhase;
		if (state.enemiesDefeated !== undefined) enemiesDefeated = state.enemiesDefeated;
		if (state.turnNumber !== undefined) turnNumber = state.turnNumber;
	}

	function startTutorial() {
		const scenario = TUTORIAL_SCENARIO;
		tutorialSteps = scenario.steps;
		tutorialStepIndex = 0;
		tutorialHint = null;
		isTutorial = true;

		// Apply initial state
		applyTutorialState(scenario.initialState);
		selectedCardIds = new Set();
		discardCardIds = new Set();
		combatLog = [];
		timerValue = 0;
		displayTimer = 0;
		won = false;
		victoryTier = null;
		hasRestarted = true; // Tutorial games don't submit scores
		gamePhase = 'playing';

		// Apply first step's stateOverride if any
		const firstStep = tutorialSteps[0];
		if (firstStep?.stateOverride) {
			applyTutorialState(firstStep.stateOverride);
		}
	}

	function skipTutorial() {
		isTutorial = false;
		tutorialSteps = [];
		tutorialStepIndex = 0;
		tutorialHint = null;
		localStorage.setItem('regicide_tutorial_done', 'true');
		hasRestarted = false;
		startGame();
	}

	function tutorialTapNext() {
		if (!isTutorial) return;
		const step = tutorialSteps[tutorialStepIndex];
		if (!step || step.expectedAction.type !== 'tap_next') return;
		advanceTutorialStep();
	}

	function advanceTutorialStep() {
		tutorialHint = null;
		tutorialStepIndex++;

		if (tutorialStepIndex >= tutorialSteps.length) {
			// Tutorial complete
			completeTutorial();
			return;
		}

		const nextStep = tutorialSteps[tutorialStepIndex];
		if (nextStep?.stateOverride) {
			applyTutorialState(nextStep.stateOverride);
			selectedCardIds = new Set();
			discardCardIds = new Set();
		}
	}

	function completeTutorial() {
		isTutorial = false;
		tutorialSteps = [];
		tutorialStepIndex = 0;
		tutorialHint = null;
		localStorage.setItem('regicide_tutorial_done', 'true');
		hasRestarted = false;
		startGame();
	}

	function validateTutorialPlay(cardIds: number[]): boolean {
		if (!isTutorial) return true;
		const step = tutorialSteps[tutorialStepIndex];
		if (!step) return true;

		const action = step.expectedAction;
		if (action.type === 'play_cards') {
			const expected = new Set(action.cardIds);
			const actual = new Set(cardIds);
			if (expected.size !== actual.size || ![...expected].every(id => actual.has(id))) {
				tutorialHint = '하이라이트된 카드를 선택해주세요!';
				return false;
			}
		} else if (action.type === 'any_play') {
			// Any valid play is fine
		} else {
			tutorialHint = '지금은 카드를 낼 수 없습니다.';
			return false;
		}

		tutorialHint = null;
		return true;
	}

	function validateTutorialDiscard(cardIds: number[]): boolean {
		if (!isTutorial) return true;
		const step = tutorialSteps[tutorialStepIndex];
		if (!step) return true;

		const action = step.expectedAction;
		if (action.type === 'discard_cards') {
			const expected = new Set(action.cardIds);
			const actual = new Set(cardIds);
			if (expected.size !== actual.size || ![...expected].every(id => actual.has(id))) {
				tutorialHint = '안내에 따라 카드를 선택해주세요!';
				return false;
			}
		} else if (action.type === 'any_discard') {
			// Any valid discard is fine
		} else {
			tutorialHint = '지금은 카드를 버릴 수 없습니다.';
			return false;
		}

		tutorialHint = null;
		return true;
	}

	return {
		// ─── State getters ───
		get gamePhase() { return gamePhase; },
		set gamePhase(v: GamePhase) { gamePhase = v; },
		get turnPhase() { return turnPhase; },
		get playerHand() { return playerHand; },
		get currentEnemy() { return currentEnemy; },
		get enemiesDefeated() { return enemiesDefeated; },
		get castleDeck() { return castleDeck; },
		get tavernDeck() { return tavernDeck; },
		get discardPile() { return discardPile; },
		get currentShield() { return currentShield; },
		get jestersRemaining() { return jestersRemaining; },
		get jestersUsed() { return jestersUsed; },
		get turnNumber() { return turnNumber; },
		get selectedCardIds() { return selectedCardIds; },
		get discardCardIds() { return discardCardIds; },
		get combatLog() { return combatLog; },
		get displayTimer() { return displayTimer; },
		get timerValue() { return timerValue; },
		get difficulty() { return difficulty; },
		get hasRestarted() { return hasRestarted; },
		get won() { return won; },
		get victoryTier() { return victoryTier; },
		get playedCardsThisEnemy() { return playedCardsThisEnemy; },
		get animEvent() { return animEvent; },
		get isAnimating() { return isAnimating; },

		// ─── Modals ───
		get alertMessage() { return alertMessage; },
		set alertMessage(v: string | null) { alertMessage = v; },
		get confirmMessage() { return confirmMessage; },
		get calculatedScore() { return calculatedScore; },
		get newTitleName() { return newTitleName; },
		get showVisitPrompt() { return showVisitPrompt; },

		// ─── Computed ───
		get canPlay() {
			const cards = getSelectedCards();
			return cards.length > 0 && isValidPlay(cards);
		},
		get canConfirmDiscard() {
			if (!currentEnemy) return false;
			const cards = getSelectedDiscards();
			return cards.length > 0 && validateDiscard(cards, getEffectiveAttack(currentEnemy));
		},
		get effectiveEnemyAttack() {
			if (!currentEnemy) return 0;
			return getEffectiveAttack(currentEnemy);
		},
		get selectedCards() {
			return getSelectedCards();
		},
		get selectedDiscards() {
			return getSelectedDiscards();
		},
		get discardTotal() {
			return getSelectedDiscards().reduce((sum, c) => sum + getCardValue(c), 0);
		},

		// ─── Tutorial ───
		get isTutorial() { return isTutorial; },
		get tutorialStep() { return isTutorial ? tutorialSteps[tutorialStepIndex] ?? null : null; },
		get tutorialProgress() { return { current: tutorialStepIndex + 1, total: tutorialSteps.length }; },
		get tutorialHint() { return tutorialHint; },

		// ─── Methods ───
		startGame,
		toggleCardSelection,
		playSelectedCards,
		toggleDiscardSelection,
		confirmDiscard,
		flipJester,
		pauseGame,
		resumeGame,
		restartGame,
		newGame,
		loadGame,
		stopTimer,
		saveAndQuit,
		handleConfirm,
		showAlert,
		startTutorial,
		skipTutorial,
		tutorialTapNext
	};
}
