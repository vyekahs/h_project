import type {
	Card, Combination, SeatIndex, TeamId, TichuRoundResult, ExchangeCards, GamePhase
} from '$lib/games/tichu/types';
import type { AiStrategy, AiSpeed } from '$lib/games/tichu/ai/types';
import { LocalGameEngine, type LocalGameConfig, type GameEvent, type ExchangeResultEntry, saveTichuGame, loadTichuGame, clearTichuSave, hasTichuSave } from '$lib/games/tichu/ai/localGameEngine';
import { triggerHaptic } from '$lib/stores/haptics';
import { rankUpStore } from '$lib/stores/rankUpStore.svelte';
import { TutorialEngine } from '$lib/games/tichu/tutorial/tutorialEngine';
import { getLessonById, LESSONS } from '$lib/games/tichu/tutorial/tutorialScenarios';
import type { TutorialStep } from '$lib/games/tichu/tutorial/tutorialTypes';
import { getPhoenixSubstituteRank } from '$lib/games/tichu/combinations';

export type GameView = 'setup' | 'game' | 'tutorial';
export type ToastType = 'info' | 'success' | 'error' | 'warning';

export interface Toast {
	id: number;
	message: string;
	type: ToastType;
}

export function createTichuGameState() {
	// View
	let view = $state<GameView>('setup');

	// Game engine
	let engine = $state<LocalGameEngine | null>(null);
	let stateVersion = $state(0); // incremented on every engine state change to trigger reactivity

	// Setup state
	let partnerStrategy = $state<AiStrategy>('aggressive');
	let aiSpeed = $state<AiSpeed>('normal');
	let targetScore = $state(1000);

	// UI state
	let selectedCards = $state<Set<string>>(new Set());
	let actionInProgress = $state(false);

	// Exchange phase
	let exchangePartner = $state<string | null>(null);
	let exchangeLeft = $state<string | null>(null);
	let exchangeRight = $state<string | null>(null);

	// Modals
	let showDragonGiftModal = $state(false);
	let showWishModal = $state(false);
	let showRoundEndModal = $state(false);
	let showGameOverModal = $state(false);
	let showExitConfirmModal = $state(false);
	let roundResult = $state<TichuRoundResult | null>(null);
	let lastTrickPlay = $state<{ seat: SeatIndex; combination: Combination } | null>(null);
	let gameEndData = $state<{ winner: TeamId; scoreA: number; scoreB: number } | null>(null);

	// Ranking
	let rankingResult = $state<{ score: number; earnedPoints: number } | null>(null);
	let scoreSubmitting = $state(false);
	let newTitleName = $state<string | null>(null);

	// Visit prompt (비로그인 시 카페 방문 안내)
	let showVisitPrompt = $state(false);

	// Exchange result display
	let exchangeResultData = $state<ExchangeResultEntry[] | null>(null);

	// Toast notifications
	let toasts = $state<Toast[]>([]);
	let toastIdCounter = 0;

	// Save/restore
	let savedGameAvailable = $state(hasTichuSave());

	// Last game action (for visual feedback: pass, trick won, etc.)
	let lastEvent = $state<GameEvent | null>(null);
	let lastEventTimer: ReturnType<typeof setTimeout> | null = null;

	// Tutorial state
	let tutorialEngine = $state<TutorialEngine | null>(null);
	let tutorialStep = $state<TutorialStep | null>(null);
	let tutorialStepIndex = $state(0);
	let tutorialTotalSteps = $state(0);
	let highlightCardIds = $state<Set<string>>(new Set());
	let tutorialLessonId = $state<string | null>(null);
	let showGrandTichuInTutorial = $state(false);
	const isTutorialMode = $derived(view === 'tutorial');

	// Derived states — all use getState() helper which accesses stateVersion
	// to ensure reactivity, since engine.state is a mutable object (same reference)
	// and $derived on it won't propagate changes to dependents.
	function getState() {
		void stateVersion;
		return tutorialEngine?.state ?? engine?.state ?? null;
	}

	const gameState = $derived.by(() => getState());

	const phase = $derived.by(() => getState()?.phase ?? null);

	const isMyTurn = $derived.by(() => {
		const s = getState();
		return s !== null &&
			s.phase === 'playing' &&
			s.round?.currentSeat === 0;
	});

	const myTeam = 'A' as TeamId; // Human is always Team A (seat 0)
	const partnerSeat = 2 as SeatIndex; // Always seat 2

	const isGrandTichuPhase = $derived.by(() => {
		const s = getState();
		return s !== null &&
			s.phase === 'grand_tichu_window' &&
			s.players[0]?.grandTichu === null &&
			!isTutorialMode;
	});

	const canDeclareSmallTichu = $derived.by(() => {
		const s = getState();
		return s !== null &&
			(s.phase === 'exchange' || s.phase === 'playing') &&
			!s.players[0]?.smallTichu &&
			!s.players[0]?.hasPlayedFirstCard &&
			s.players[0]?.grandTichu !== true;
	});

	const myHand = $derived.by(() => (getState()?.players[0]?.hand ?? []).filter(c => c != null));

	const sortedHand = $derived.by(() => {
		const hand = (getState()?.players[0]?.hand ?? []).filter(c => c != null);
		if (!hand.length) return [];

		// 봉황이 선택된 상태에서 유효 조합이면, 대체하는 랭크 위치로 정렬
		let phoenixSortRank: number | null = null;
		if (selectedCards.has('phoenix')) {
			const selectedCardObjs = hand.filter(c => selectedCards.has(c.id));
			phoenixSortRank = getPhoenixSubstituteRank(selectedCardObjs);
		}

		const getSortValue = (c: Card): number => {
			if (c.type === 'normal') return c.rank;
			switch (c.special) {
				case 'dog': return 0;
				case 'mahjong': return 1;
				case 'phoenix': return phoenixSortRank ?? 14.5;
				case 'dragon': return 15;
				default: return 0;
			}
		};
		return [...hand].sort((a, b) => {
			const av = getSortValue(a);
			const bv = getSortValue(b);
			if (av !== bv) return av - bv;
			if (a.type === 'normal' && b.type === 'normal') {
				const suitOrder: Record<string, number> = { jade: 0, pagoda: 1, star: 2, sword: 3 };
				return suitOrder[a.suit] - suitOrder[b.suit];
			}
			return 0;
		});
	});

	const exchangeReady = $derived(
		exchangePartner !== null && exchangeLeft !== null && exchangeRight !== null
	);

	// Track phase changes for UI reactions (plain var — not reactive, only used in effect)
	let lastPhase: GamePhase | null = null;

	$effect(() => {
		const s = getState();
		const currentPhase = s?.phase ?? null;
		if (currentPhase && currentPhase !== lastPhase) {
			const prevPhase = lastPhase;
			lastPhase = currentPhase;

			// Reset selection on phase change
			selectedCards = new Set();

			if (currentPhase === 'exchange') {
				exchangePartner = null;
				exchangeLeft = null;
				exchangeRight = null;
			}

			// Show exchange result when transitioning from exchange to playing
			if (currentPhase === 'playing' && prevPhase === 'exchange' && engine?.exchangeResult) {
				exchangeResultData = engine.exchangeResult;
			}

			if (currentPhase === 'wish_declare' && s?.round?.currentSeat === 0 && (!isTutorialMode || tutorialEngine?.freePlayMode)) {
				showWishModal = true;
			}

			if (currentPhase === 'dragon_gift' && s?.round?.dragonGiftSeat === 0) {
				showDragonGiftModal = true;
			}

			// dragon_gift에서 폭탄 사용으로 playing으로 복귀하면 모달 닫기
			if (prevPhase === 'dragon_gift' && currentPhase === 'playing') {
				showDragonGiftModal = false;
			}

			// round_ending 시 마지막 트릭 플레이 저장 (trick이 아직 남아있음)
			if (currentPhase === 'round_ending' && s?.round?.trick) {
				const plays = s.round.trick.plays;
				if (plays.length > 0) {
					lastTrickPlay = plays[plays.length - 1];
				}
			}

			if (currentPhase === 'round_end' && s && !isTutorialMode) {
				const rounds = s.completedRounds;
				if (rounds.length > 0) {
					roundResult = rounds[rounds.length - 1];
					showRoundEndModal = true;
				}
			}

			if (currentPhase === 'game_end' && s && s.winner && !isTutorialMode) {
				gameEndData = {
					winner: s.winner,
					scoreA: s.cumulativeScoreA,
					scoreB: s.cumulativeScoreB
				};
				showGameOverModal = true;
				clearTichuSave();
				savedGameAvailable = false;
				// 랭킹 점수 제출
				const isWin = s.winner === myTeam;
				submitTichuScore(isWin, s.completedRounds);
			}
		}
	});

	function dismissExchangeResult() {
		exchangeResultData = null;
	}

	function addToast(message: string, type: ToastType = 'info') {
		const id = ++toastIdCounter;
		toasts = [...toasts, { id, message, type }];

		if (type === 'error') {
			triggerHaptic([200, 50, 200]);
		}

		setTimeout(() => {
			toasts = toasts.filter(t => t.id !== id);
		}, 3000);
	}

	// ===== Save Helpers =====

	function saveNow() {
		if (engine) {
			const snapshot = engine.getSaveSnapshot();
			if (snapshot) {
				snapshot.config.partnerStrategy = partnerStrategy;
				saveTichuGame(snapshot);
				savedGameAvailable = true;
			}
		}
	}

	function handleStateChange() {
		stateVersion++;
	}

	function handleEvent(event: GameEvent) {
		const priorityTypes = ['trick_won', 'dog', 'dragon_gift'];
		if (lastEvent && priorityTypes.includes(lastEvent.type) && !priorityTypes.includes(event.type)) return;
		lastEvent = event;
		if (lastEventTimer) clearTimeout(lastEventTimer);
		const duration = priorityTypes.includes(event.type) ? 1200 : 800;
		lastEventTimer = setTimeout(() => { lastEvent = null; }, duration);
	}

	// ===== Game Lifecycle =====

	function startGame() {
		if (engine) {
			engine.destroy();
		}

		clearTichuSave();
		savedGameAvailable = false;
		selectedCards = new Set();

		engine = new LocalGameEngine({
			partnerStrategy,
			targetScore,
			aiSpeed,
			playerName: '나',
			onStateChange: handleStateChange,
			onEvent: handleEvent
		});

		lastPhase = null;
		lastEvent = null;
		view = 'game';
		engine.startGame();
	}

	function resumeGame() {
		const save = loadTichuGame();
		if (!save) return;

		if (engine) engine.destroy();

		// cautious는 제거됨 — 이전 세이브 호환을 위해 balanced로 폴백
		const validStrategies = ['aggressive', 'balanced', 'defensive', 'tricky', 'wild'];
		partnerStrategy = validStrategies.includes(save.config.partnerStrategy)
			? save.config.partnerStrategy
			: 'balanced';
		aiSpeed = save.config.aiSpeed;
		targetScore = save.config.targetScore;

		engine = LocalGameEngine.restore(save, handleStateChange, handleEvent);

		lastPhase = null; // null로 설정하여 $effect가 복원된 phase를 감지 → 소원/드래곤 모달 표시
		lastEvent = null;
		selectedCards = new Set();
		view = 'game';
		engine.resumeAfterRestore();
	}

	function startNextRound() {
		showRoundEndModal = false;
		roundResult = null;
		lastTrickPlay = null;
		selectedCards = new Set();
		engine?.startNextRound();
		saveNow();
	}

	function calculateRankingScore(isWin: boolean, rounds: TichuRoundResult[]): number {
		let score = 0;

		for (const round of rounds) {
			score += round.teamAScore > round.teamBScore ? 30 : 5;

			if (round.oneTwo === 'A') score += 40;

			for (const d of round.grandTichuDeclarations) {
				if (d.seat === 0 || d.seat === 2) {
					score += d.success ? 50 : -10;
				}
			}

			for (const d of round.smallTichuDeclarations) {
				if (d.seat === 0 || d.seat === 2) {
					score += d.success ? 25 : -5;
				}
			}

			const diff = round.teamAScore - round.teamBScore;
			if (diff > 0) score += Math.floor(diff / 25);
		}

		if (isWin) score += 30;

		return Math.max(10, score);
	}

	async function submitTichuScore(isWin: boolean, rounds: TichuRoundResult[]) {
		if (scoreSubmitting) return;
		scoreSubmitting = true;
		try {
			const score = calculateRankingScore(isWin, rounds);
			const res = await fetch('/api/game/record', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ gameId: 'tichu', difficulty: 'default', clearTime: 0, score })
			});
			if (res.ok) {
				const data = await res.json();
				rankingResult = { score: data.score, earnedPoints: data.earnedPoints };

				// Show Rank Up animation if rank increased
				if (data.currentRank && (!data.previousRank || data.currentRank < data.previousRank)) {
					rankUpStore.show(data.previousRank, data.currentRank, 'tichu', data.score);
				}

				if (data.newTitles && data.newTitles.length > 0) {
					newTitleName = data.newTitles[0];
				}
			} else if (res.status === 401 || res.status === 403) {
				showVisitPrompt = true;
			}
		} catch (e) {
			console.error('[Tichu] Score submit failed:', e);
		} finally {
			scoreSubmitting = false;
		}
	}

	function pauseGame() {
		if (isTutorialMode) {
			tutorialEngine?.pause();
			showExitConfirmModal = true;
			return;
		}
		engine?.pause();
		showExitConfirmModal = true;
	}

	function resumeFromPause() {
		showExitConfirmModal = false;
		if (isTutorialMode) {
			tutorialEngine?.resume();
			return;
		}
		engine?.resume();
	}

	function backToSetup() {
		if (isTutorialMode) {
			exitTutorial();
			showExitConfirmModal = false;
			return;
		}
		clearTichuSave();
		savedGameAvailable = false;
		if (engine) {
			engine.destroy();
			engine = null;
		}
		view = 'setup';
		showExitConfirmModal = false;
		showRoundEndModal = false;
		showGameOverModal = false;
		roundResult = null;
		lastTrickPlay = null;
		gameEndData = null;
		rankingResult = null;
		newTitleName = null;
		lastPhase = null;
		stateVersion = 0;
	}

	function flushSave() {
		saveNow();
	}

	function cleanup() {
		if (lastEventTimer) clearTimeout(lastEventTimer);
		saveNow();
		if (engine) {
			engine.destroy();
			engine = null;
		}
		if (tutorialEngine) {
			tutorialEngine.destroy();
			tutorialEngine = null;
		}
	}

	// ===== Tutorial =====

	function startTutorial(lessonId: string) {
		const lesson = getLessonById(lessonId);
		if (!lesson) return;

		if (engine) { engine.pause(); }
		if (tutorialEngine) { tutorialEngine.destroy(); }

		tutorialLessonId = lessonId;
		tutorialStep = null;
		tutorialStepIndex = 0;
		tutorialTotalSteps = lesson.steps.length;
		highlightCardIds = new Set();
		selectedCards = new Set();
		lastPhase = null;
		lastEvent = null;

		tutorialEngine = new TutorialEngine({
			lesson,
			onStateChange: handleStateChange,
			onEvent: handleEvent,
			onStepChange: (step: TutorialStep, index: number) => {
				tutorialStepIndex = index;
				// free_play 스텝: 오버레이 숨기고 자유 플레이
				if (step.expectedAction.type === 'free_play') {
					tutorialStep = null;
					highlightCardIds = new Set();
					showGrandTichuInTutorial = false;
					return;
				}
				tutorialStep = step;
				highlightCardIds = new Set(step.highlightCards ?? []);
				// set_wish 스텝이면 WishModal 표시
				if (step.expectedAction.type === 'set_wish') {
					showWishModal = true;
				}
				// grand tichu 스텝이면 모달 표시, 아니면 숨김
				const actionType = step.expectedAction.type;
				showGrandTichuInTutorial = (actionType === 'declare_grand_tichu' || actionType === 'pass_grand_tichu');
			},
			onComplete: () => {
				// Mark lesson as completed in localStorage
				try {
					const key = 'tichu_tutorial_progress';
					const progress = JSON.parse(localStorage.getItem(key) || '{}');
					progress[lessonId] = true;
					localStorage.setItem(key, JSON.stringify(progress));
				} catch { /* ignore */ }
				// 다음 레슨이 있으면 바로 시작, 없으면 종료
				const currentIndex = LESSONS.findIndex(l => l.id === lessonId);
				const nextLesson = LESSONS[currentIndex + 1];
				if (nextLesson) {
					startTutorial(nextLesson.id);
				} else {
					exitTutorial();
				}
			}
		});

		// Use tutorial engine's internal LocalGameEngine as our engine for rendering
		engine = null; // Clear regular engine reference
		stateVersion = 0;
		view = 'tutorial';
		tutorialEngine.start();
	}

	function exitTutorial() {
		if (tutorialEngine) {
			tutorialEngine.destroy();
			tutorialEngine = null;
		}
		tutorialStep = null;
		tutorialStepIndex = 0;
		tutorialTotalSteps = 0;
		highlightCardIds = new Set();
		tutorialLessonId = null;
		selectedCards = new Set();
		lastPhase = null;
		lastEvent = null;
		stateVersion = 0;
		view = 'setup';
	}

	function tutorialTapNext() {
		tutorialEngine?.tapNext();
	}

	// ===== Card Selection =====

	function toggleCard(cardId: string) {
		const next = new Set(selectedCards);
		if (next.has(cardId)) {
			next.delete(cardId);
		} else {
			next.add(cardId);
		}
		selectedCards = next;
	}

	function clearSelection() {
		selectedCards = new Set();
	}

	// ===== Exchange =====

	function setExchangeCard(target: 'partner' | 'left' | 'right', cardId: string | null) {
		if (cardId) {
			if (exchangePartner === cardId && target !== 'partner') exchangePartner = null;
			if (exchangeLeft === cardId && target !== 'left') exchangeLeft = null;
			if (exchangeRight === cardId && target !== 'right') exchangeRight = null;
		}
		if (target === 'partner') exchangePartner = cardId;
		else if (target === 'left') exchangeLeft = cardId;
		else exchangeRight = cardId;
	}

	function submitExchange() {
		if (!exchangePartner || !exchangeLeft || !exchangeRight) return;
		if (isTutorialMode && tutorialEngine) {
			const result = tutorialEngine.humanSubmitExchange({
				toPartner: exchangePartner,
				toLeft: exchangeLeft,
				toRight: exchangeRight
			});
			if (result.success) {
				exchangePartner = null;
				exchangeLeft = null;
				exchangeRight = null;
				addToast('카드를 교환했습니다', 'info');
			} else {
				addToast(result.error || '교환할 수 없습니다', 'error');
			}
			return;
		}
		const result = engine?.humanSubmitExchange({
			toPartner: exchangePartner,
			toLeft: exchangeLeft,
			toRight: exchangeRight
		});
		if (result) {
			saveNow();
			addToast('카드를 교환했습니다', 'info');
		}
	}

	// ===== Game Actions =====

	async function playSelectedCards() {
		if (selectedCards.size === 0 || actionInProgress) return;

		// Tutorial mode
		if (isTutorialMode && tutorialEngine) {
			actionInProgress = true;
			try {
				const cardIds = Array.from(selectedCards);
				const result = await tutorialEngine.humanPlayCards(cardIds);
				if (result.success) {
					selectedCards = new Set();
				} else {
					addToast(result.error || '카드를 낼 수 없습니다', 'error');
				}
			} finally {
				actionInProgress = false;
			}
			return;
		}

		if (!engine) return;
		actionInProgress = true;
		try {
			const cardIds = Array.from(selectedCards);
			const result = await engine.humanPlayCards(cardIds);
			if (result.success) {
				selectedCards = new Set();
				saveNow();
			} else {
				addToast(result.error || '카드를 낼 수 없습니다', 'error');
			}
		} finally {
			actionInProgress = false;
		}
	}

	function pass() {
		// Tutorial mode
		if (isTutorialMode && tutorialEngine) {
			const result = tutorialEngine.humanPass();
			if (result.success) {
				selectedCards = new Set();
			} else {
				addToast(result.error || '패스할 수 없습니다', 'error');
			}
			return;
		}

		if (!engine || actionInProgress) return;
		const result = engine.humanPass();
		if (result.success) {
			saveNow();
		} else {
			addToast(result.error || '패스할 수 없습니다', 'error');
		}
	}

	function declareGrandTichu() {
		if (isTutorialMode && tutorialEngine) {
			const result = tutorialEngine.humanDeclareGrandTichu();
			if (result.success) {
				addToast('그랜드 티츄를 선언했습니다!', 'success');
			} else {
				addToast(result.error || '그랜드 티츄를 선언할 수 없습니다', 'error');
			}
			return;
		}
		const result = engine?.humanDeclareGrandTichu();
		if (result) {
			saveNow();
			addToast('그랜드 티츄를 선언했습니다!', 'success');
		}
	}

	function passGrandTichu() {
		if (isTutorialMode && tutorialEngine) {
			const result = tutorialEngine.humanPassGrandTichu();
			if (!result.success) {
				addToast(result.error || '패스할 수 없습니다', 'error');
			}
			return;
		}
		if (engine?.humanPassGrandTichu()) {
			saveNow();
		}
	}

	function declareSmallTichu() {
		if (isTutorialMode && tutorialEngine) {
			const result = tutorialEngine.humanDeclareSmallTichu();
			if (result.success) {
				addToast('스몰 티츄를 선언했습니다!', 'success');
			} else {
				addToast(result.error || '스몰 티츄를 선언할 수 없습니다', 'error');
			}
			return;
		}
		if (engine?.humanDeclareSmallTichu()) {
			saveNow();
			addToast('스몰 티츄를 선언했습니다!', 'success');
		}
	}

	function setWish(rank: number | null) {
		showWishModal = false;
		if (isTutorialMode && tutorialEngine) {
			const ok = tutorialEngine.humanSetWish(rank);
			if (!ok) {
				showWishModal = true;
				const step = tutorialEngine.currentStep;
				if (step) addToast(tutorialEngine.getHintForStep(step), 'info');
			}
			return;
		}
		engine?.humanSetWish(rank);
		saveNow();
	}

	function giftDragon(seat: SeatIndex) {
		showDragonGiftModal = false;
		if (isTutorialMode && tutorialEngine) {
			const result = tutorialEngine.humanGiftDragon(seat);
			if (!result.success) {
				addToast(result.error || '양도할 수 없습니다', 'error');
			}
			return;
		}
		engine?.humanGiftDragon(seat);
		saveNow();
	}

	async function playBomb(cardIds: string[]) {
		if (!engine || actionInProgress) return;
		actionInProgress = true;
		try {
			const result = await engine.humanPlayBomb(cardIds);
			if (result.success) {
				selectedCards = new Set();
				saveNow();
				addToast('💣 폭탄!', 'warning');
			} else {
				addToast(result.error || '폭탄을 사용할 수 없습니다', 'error');
			}
		} finally {
			actionInProgress = false;
		}
	}

	return {
		// View & setup
		get view() { return view; },
		get partnerStrategy() { return partnerStrategy; },
		set partnerStrategy(v: AiStrategy) { partnerStrategy = v; },
		get aiSpeed() { return aiSpeed; },
		set aiSpeed(v: AiSpeed) { aiSpeed = v; },
		get targetScore() { return targetScore; },
		set targetScore(v: number) { targetScore = v; },

		// Game state (derived from engine)
		// Access stateVersion to subscribe to engine state changes in components
		get stateVersion() { return stateVersion; },
		get gameState() { return gameState; },
		get phase() { return phase; },

		// UI state
		get selectedCards() { return selectedCards; },
		get exchangePartner() { return exchangePartner; },
		get exchangeLeft() { return exchangeLeft; },
		get exchangeRight() { return exchangeRight; },
		get exchangeReady() { return exchangeReady; },
		get showDragonGiftModal() { return showDragonGiftModal; },
		set showDragonGiftModal(v: boolean) { showDragonGiftModal = v; },
		get showWishModal() { return showWishModal; },
		set showWishModal(v: boolean) { showWishModal = v; },
		get showRoundEndModal() { return showRoundEndModal; },
		set showRoundEndModal(v: boolean) { showRoundEndModal = v; },
		get showGameOverModal() { return showGameOverModal; },
		set showGameOverModal(v: boolean) { showGameOverModal = v; },
		get showExitConfirmModal() { return showExitConfirmModal; },
		get roundResult() { return roundResult; },
		get lastTrickPlay() { return lastTrickPlay; },
		get gameEndData() { return gameEndData; },
		set gameEndData(v: { winner: TeamId; scoreA: number; scoreB: number } | null) { gameEndData = v; },
		get rankingResult() { return rankingResult; },
		get newTitleName() { return newTitleName; },
		set newTitleName(v: string | null) { newTitleName = v; },
		get showVisitPrompt() { return showVisitPrompt; },
		set showVisitPrompt(v: boolean) { showVisitPrompt = v; },
		get toasts() { return toasts; },
		get lastEvent() { return lastEvent; },
		get exchangeResultData() { return exchangeResultData; },

		// Derived
		get isMyTurn() { return isMyTurn; },
		get isGrandTichuPhase() { return isGrandTichuPhase || showGrandTichuInTutorial; },
		get actionInProgress() { return actionInProgress; },
		get myTeam() { return myTeam; },
		get partnerSeat() { return partnerSeat; },
		get canDeclareSmallTichu() { return canDeclareSmallTichu; },
		get sortedHand() { return sortedHand; },
		get myHand() { return myHand; },

		// Save/restore
		get savedGameAvailable() { return savedGameAvailable; },
		resumeGame,
		flushSave,

		// Tutorial
		get isTutorialMode() { return isTutorialMode; },
		get tutorialStep() { return tutorialStep; },
		get tutorialStepIndex() { return tutorialStepIndex; },
		get tutorialTotalSteps() { return tutorialTotalSteps; },
		get highlightCardIds() { return highlightCardIds; },
		get tutorialLessonId() { return tutorialLessonId; },
		startTutorial,
		exitTutorial,
		tutorialTapNext,

		// Actions
		startGame,
		startNextRound,
		pauseGame,
		resumeFromPause,
		backToSetup,
		cleanup,
		toggleCard,
		clearSelection,
		setExchangeCard,
		submitExchange,
		dismissExchangeResult,
		playSelectedCards,
		pass,
		declareGrandTichu,
		passGrandTichu,
		declareSmallTichu,
		setWish,
		giftDragon,
		playBomb,
		addToast
	};
}
