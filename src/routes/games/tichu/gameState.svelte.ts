import type {
	Card, SeatIndex, TeamId, TichuRoundResult, ExchangeCards, GamePhase
} from '$lib/games/tichu/types';
import type { AiStrategy, AiSpeed } from '$lib/games/tichu/ai/types';
import { LocalGameEngine, type LocalGameConfig, type GameEvent } from '$lib/games/tichu/ai/localGameEngine';

export type GameView = 'setup' | 'game';
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
	let partnerStrategy = $state<AiStrategy>('balanced');
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
	let roundResult = $state<TichuRoundResult | null>(null);
	let gameEndData = $state<{ winner: TeamId; scoreA: number; scoreB: number } | null>(null);

	// Toast notifications
	let toasts = $state<Toast[]>([]);
	let toastIdCounter = 0;

	// Last game action (for visual feedback: pass, trick won, etc.)
	let lastEvent = $state<GameEvent | null>(null);
	let lastEventTimer: ReturnType<typeof setTimeout> | null = null;

	// Derived states — all use getState() helper which accesses stateVersion
	// to ensure reactivity, since engine.state is a mutable object (same reference)
	// and $derived on it won't propagate changes to dependents.
	function getState() {
		void stateVersion;
		return engine?.state ?? null;
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
			s.players[0]?.grandTichu === null;
	});

	const canDeclareSmallTichu = $derived.by(() => {
		const s = getState();
		return s !== null &&
			(s.phase === 'exchange' || s.phase === 'playing') &&
			!s.players[0]?.smallTichu &&
			!s.players[0]?.hasPlayedFirstCard &&
			s.players[0]?.grandTichu !== true;
	});

	const myHand = $derived.by(() => getState()?.players[0]?.hand ?? []);

	const sortedHand = $derived.by(() => {
		const hand = getState()?.players[0]?.hand ?? [];
		if (!hand.length) return [];
		return [...hand].sort((a, b) => {
			const specialOrder: Record<string, number> = { mahjong: 0, dog: 1, phoenix: 2, dragon: 3 };
			if (a.type === 'special' && b.type === 'special') {
				return specialOrder[a.special] - specialOrder[b.special];
			}
			if (a.type === 'special') return -1;
			if (b.type === 'special') return 1;
			if (a.rank !== b.rank) return a.rank - b.rank;
			const suitOrder: Record<string, number> = { jade: 0, pagoda: 1, star: 2, sword: 3 };
			return suitOrder[a.suit] - suitOrder[b.suit];
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
			lastPhase = currentPhase;

			// Reset selection on phase change
			selectedCards = new Set();

			if (currentPhase === 'exchange') {
				exchangePartner = null;
				exchangeLeft = null;
				exchangeRight = null;
			}

			if (currentPhase === 'wish_declare' && s?.round?.currentSeat === 0) {
				showWishModal = true;
			}

			if (currentPhase === 'dragon_gift' && s?.round?.dragonGiftSeat === 0) {
				showDragonGiftModal = true;
			}

			if (currentPhase === 'round_end' && s) {
				const rounds = s.completedRounds;
				if (rounds.length > 0) {
					roundResult = rounds[rounds.length - 1];
					showRoundEndModal = true;
				}
			}

			if (currentPhase === 'game_end' && s && s.winner) {
				gameEndData = {
					winner: s.winner,
					scoreA: s.cumulativeScoreA,
					scoreB: s.cumulativeScoreB
				};
				showGameOverModal = true;
			}
		}
	});

	function addToast(message: string, type: ToastType = 'info') {
		const id = ++toastIdCounter;
		toasts = [...toasts, { id, message, type }];
		setTimeout(() => {
			toasts = toasts.filter(t => t.id !== id);
		}, 3000);
	}

	// ===== Game Lifecycle =====

	function startGame() {
		if (engine) {
			engine.destroy();
		}

		engine = new LocalGameEngine({
			partnerStrategy,
			targetScore,
			aiSpeed,
			playerName: '나',
			onStateChange: () => {
				stateVersion++;
			},
			onEvent: (event: GameEvent) => {
				// Don't overwrite trick_won with subsequent play/pass events
				if (lastEvent?.type === 'trick_won' && event.type !== 'trick_won') return;
				lastEvent = event;
				if (lastEventTimer) clearTimeout(lastEventTimer);
				const duration = event.type === 'trick_won' ? 1200 : 800;
				lastEventTimer = setTimeout(() => { lastEvent = null; }, duration);
			}
		});

		lastPhase = null;
		lastEvent = null;
		view = 'game';
		engine.startGame();
	}

	function startNextRound() {
		showRoundEndModal = false;
		roundResult = null;
		engine?.startNextRound();
	}

	function backToSetup() {
		if (engine) {
			engine.destroy();
			engine = null;
		}
		view = 'setup';
		showRoundEndModal = false;
		showGameOverModal = false;
		roundResult = null;
		gameEndData = null;
		lastPhase = null;
		stateVersion = 0;
	}

	function cleanup() {
		if (lastEventTimer) clearTimeout(lastEventTimer);
		if (engine) {
			engine.destroy();
			engine = null;
		}
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
		const result = engine?.humanSubmitExchange({
			toPartner: exchangePartner,
			toLeft: exchangeLeft,
			toRight: exchangeRight
		});
		if (result) {
			addToast('카드를 교환했습니다', 'info');
		}
	}

	// ===== Game Actions =====

	async function playSelectedCards() {
		if (selectedCards.size === 0 || !engine || actionInProgress) return;
		actionInProgress = true;
		try {
			const cardIds = Array.from(selectedCards);
			const result = await engine.humanPlayCards(cardIds);
			if (result.success) {
				selectedCards = new Set();
			} else {
				addToast(result.error || '카드를 낼 수 없습니다', 'error');
			}
		} finally {
			actionInProgress = false;
		}
	}

	function pass() {
		if (!engine || actionInProgress) return;
		const result = engine.humanPass();
		if (!result.success) {
			addToast(result.error || '패스할 수 없습니다', 'error');
		}
	}

	function declareGrandTichu() {
		const result = engine?.humanDeclareGrandTichu();
		if (result) {
			addToast('그랜드 티츄를 선언했습니다!', 'success');
		}
	}

	function passGrandTichu() {
		engine?.humanPassGrandTichu();
	}

	function declareSmallTichu() {
		if (engine?.humanDeclareSmallTichu()) {
			addToast('스몰 티츄를 선언했습니다!', 'success');
		}
	}

	function setWish(rank: number | null) {
		showWishModal = false;
		engine?.humanSetWish(rank);
	}

	function giftDragon(seat: SeatIndex) {
		showDragonGiftModal = false;
		engine?.humanGiftDragon(seat);
	}

	async function playBomb(cardIds: string[]) {
		if (!engine || actionInProgress) return;
		actionInProgress = true;
		try {
			const result = await engine.humanPlayBomb(cardIds);
			if (result.success) {
				selectedCards = new Set();
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
		get roundResult() { return roundResult; },
		get gameEndData() { return gameEndData; },
		get toasts() { return toasts; },
		get lastEvent() { return lastEvent; },

		// Derived
		get isMyTurn() { return isMyTurn; },
		get isGrandTichuPhase() { return isGrandTichuPhase; },
		get actionInProgress() { return actionInProgress; },
		get myTeam() { return myTeam; },
		get partnerSeat() { return partnerSeat; },
		get canDeclareSmallTichu() { return canDeclareSmallTichu; },
		get sortedHand() { return sortedHand; },
		get myHand() { return myHand; },

		// Actions
		startGame,
		startNextRound,
		backToSetup,
		cleanup,
		toggleCard,
		clearSelection,
		setExchangeCard,
		submitExchange,
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
