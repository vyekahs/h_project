import { TichuSocketClient, type ConnectionStatus } from './socketClient';
import type {
	TichuClientState, RoomListItem, Card, Combination,
	SeatIndex, TeamId, TichuRoundResult, ExchangeCards, GamePhase
} from '$lib/games/tichu/types';

export type GameView = 'lobby' | 'waiting' | 'game';
export type ToastType = 'info' | 'success' | 'error' | 'warning';

export interface Toast {
	id: number;
	message: string;
	type: ToastType;
}

export interface ChatMessage {
	seat: SeatIndex;
	message: string;
	isEmote: boolean;
	timestamp: number;
}

export function createTichuGameState() {
	// Connection
	let connectionStatus = $state<ConnectionStatus>('disconnected');
	let reconnectAttempt = $state(0);
	let reconnectFailed = $state(false);

	// View management
	let view = $state<GameView>('lobby');

	// Lobby
	let rooms = $state<RoomListItem[]>([]);
	let currentRoomId = $state<string | null>(null);

	// Game state from server
	let gameState = $state<TichuClientState | null>(null);

	// UI state
	let selectedCards = $state<Set<string>>(new Set());
	let grandTichuTimer = $state(0);
	let grandTichuTimerInterval: ReturnType<typeof setInterval> | null = null;

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

	// Chat
	let chatMessages = $state<ChatMessage[]>([]);
	let showChat = $state(false);

	// Socket client
	const client = new TichuSocketClient();

	// Derived states
	const isConnected = $derived(connectionStatus === 'connected');
	const isReconnecting = $derived(connectionStatus === 'reconnecting');
	const isMyTurn = $derived(
		gameState !== null &&
		gameState.phase === 'playing' &&
		gameState.currentSeat === gameState.mySeat
	);
	const myTeam = $derived(gameState?.players.find(p => p.seat === gameState?.mySeat)?.team ?? 'A');
	const partnerSeat = $derived<SeatIndex>(
		gameState ? (((gameState.mySeat + 2) % 4) as SeatIndex) : 0 as SeatIndex
	);
	const canDeclareSmallTichu = $derived(
		gameState !== null &&
		(gameState.phase === 'exchange' || gameState.phase === 'playing') &&
		!gameState.players[gameState.mySeat]?.smallTichu &&
		!gameState.players[gameState.mySeat]?.hasPlayedFirstCard
	);

	// Sort hand for display
	const sortedHand = $derived.by(() => {
		if (!gameState?.myHand) return [];
		return [...gameState.myHand].sort((a, b) => {
			// Specials first: mahjong, dog, phoenix, dragon
			const specialOrder: Record<string, number> = { mahjong: 0, dog: 1, phoenix: 2, dragon: 3 };
			if (a.type === 'special' && b.type === 'special') {
				return specialOrder[a.special] - specialOrder[b.special];
			}
			if (a.type === 'special') return -1;
			if (b.type === 'special') return 1;
			// Normal cards: by rank, then suit
			if (a.rank !== b.rank) return a.rank - b.rank;
			const suitOrder: Record<string, number> = { jade: 0, pagoda: 1, star: 2, sword: 3 };
			return suitOrder[a.suit] - suitOrder[b.suit];
		});
	});

	function addToast(message: string, type: ToastType = 'info') {
		const id = ++toastIdCounter;
		toasts = [...toasts, { id, message, type }];
		setTimeout(() => {
			toasts = toasts.filter(t => t.id !== id);
		}, 3000);
	}

	function connect() {
		client.connect({
			onConnect: () => {
				connectionStatus = 'connected';
				reconnectAttempt = 0;
				reconnectFailed = false;
				client.listRooms();
			},
			onDisconnect: (reason) => {
				connectionStatus = 'disconnected';
				if (reason === 'io server disconnect') {
					addToast('서버에서 연결이 끊겼습니다', 'error');
				}
			},
			onReconnecting: (attempt) => {
				connectionStatus = 'reconnecting';
				reconnectAttempt = attempt;
				if (attempt >= 30) {
					reconnectFailed = true;
				}
			},
			onReconnected: () => {
				connectionStatus = 'connected';
				reconnectAttempt = 0;
				reconnectFailed = false;
				addToast('재연결되었습니다!', 'success');
			},

			// Lobby
			onRoomList: (list) => { rooms = list; },
			onRoomCreated: (data) => {
				currentRoomId = data.roomId;
				if (data.state) gameState = data.state;
				view = 'waiting';
			},
			onRoomJoined: (data) => {
				currentRoomId = data.roomId;
				if (data.state) gameState = data.state;
				view = 'waiting';
			},
			onRoomLeft: () => {
				currentRoomId = null;
				gameState = null;
				view = 'lobby';
				client.listRooms();
			},
			onRoomUpdated: (data) => {
				// Update lobby room list only
				if (data.roomId) {
					rooms = rooms.map(r => r.roomId === data.roomId ? data : r);
				}
			},
			onRoomStart: () => {
				view = 'game';
			},
			onRoomError: (msg) => {
				addToast(msg, 'error');
			},

			// Game state
			onStateSync: (state) => {
				gameState = state;
				if (state.phase === 'lobby' || state.phase === 'ready_check') {
					view = 'waiting';
				} else {
					view = 'game';
				}
				// Trigger modals based on phase (server doesn't emit separate events for these)
				if (state.phase === 'wish_declare' && state.currentSeat === state.mySeat) {
					showWishModal = true;
				}
				if (state.phase === 'dragon_gift' && state.dragonGiftPending && state.dragonGiftSeat === state.mySeat) {
					showDragonGiftModal = true;
				}
			},
			onPhaseChange: (phase) => {
				if (gameState) {
					gameState = { ...gameState, phase: phase as GamePhase };
				}
				// Reset UI state on phase transitions
				selectedCards = new Set();
				if (phase === 'exchange') {
					exchangePartner = null;
					exchangeLeft = null;
					exchangeRight = null;
				}
			},
			onCardsDealt: (cards) => {
				if (gameState) {
					gameState = { ...gameState, myHand: cards };
				}
			},
			onRemainingDealt: (cards) => {
				if (gameState) {
					gameState = { ...gameState, myHand: [...gameState.myHand, ...cards] };
				}
			},
			onGrandTichuWindow: (timeoutMs) => {
				grandTichuTimer = Math.ceil(timeoutMs / 1000);
				if (grandTichuTimerInterval) clearInterval(grandTichuTimerInterval);
				grandTichuTimerInterval = setInterval(() => {
					grandTichuTimer--;
					if (grandTichuTimer <= 0 && grandTichuTimerInterval) {
						clearInterval(grandTichuTimerInterval);
						grandTichuTimerInterval = null;
						// Auto-pass when timer expires
						client.passGrandTichu();
					}
				}, 1000);
			},
			onPlayerDeclaredGrandTichu: (seat) => {
				if (gameState) {
					const players = [...gameState.players];
					players[seat] = { ...players[seat], grandTichu: true };
					gameState = { ...gameState, players };
				}
				const name = gameState?.players[seat]?.name;
				addToast(`${name}이(가) 그랜드 티츄를 선언했습니다!`, 'warning');
			},
			onPlayerDeclaredSmallTichu: (seat) => {
				if (gameState) {
					const players = [...gameState.players];
					players[seat] = { ...players[seat], smallTichu: true };
					gameState = { ...gameState, players };
				}
				const name = gameState?.players[seat]?.name;
				addToast(`${name}이(가) 스몰 티츄를 선언했습니다!`, 'info');
			},
			onExchangeReceived: (cards) => {
				if (gameState) {
					gameState = { ...gameState, myHand: [...gameState.myHand, ...cards] };
				}
				addToast('교환 카드를 받았습니다', 'info');
			},

			// Playing
			onTurnStart: (seat) => {
				if (gameState) {
					gameState = { ...gameState, currentSeat: seat };
				}
			},
			onCardsPlayed: (data) => {
				if (gameState) {
					const players = [...gameState.players];
					// Card count update will come via stateSync
					const trick = gameState.trick ? {
						...gameState.trick,
						plays: [...gameState.trick.plays, { seat: data.seat, combination: data.combination }],
						passCount: 0
					} : {
						plays: [{ seat: data.seat, combination: data.combination }],
						passCount: 0,
						leadSeat: data.seat,
						currentSeat: data.seat
					};
					gameState = { ...gameState, trick, players };
				}
			},
			onPlayerPassed: (seat) => {
				if (gameState?.trick) {
					gameState = {
						...gameState,
						trick: { ...gameState.trick, passCount: gameState.trick.passCount + 1 }
					};
				}
			},
			onTrickWon: (data) => {
				const name = gameState?.players[data.seat]?.name;
				addToast(`${name}이(가) 트릭을 가져갔습니다`, 'info');
			},
			onDragonGiftRequired: (seat) => {
				if (gameState && seat === gameState.mySeat) {
					showDragonGiftModal = true;
				}
				if (gameState) {
					gameState = { ...gameState, dragonGiftPending: true, dragonGiftSeat: seat };
				}
			},
			onWishActivated: (data) => {
				if (gameState) {
					gameState = {
						...gameState,
						wish: { active: true, requestedRank: data.rank as any, requestedBy: data.by }
					};
				}
				const rankNames: Record<number, string> = {
					2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8',
					9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A'
				};
				addToast(`소원: ${rankNames[data.rank] ?? data.rank}`, 'info');
			},
			onWishFulfilled: () => {
				if (gameState) {
					gameState = {
						...gameState,
						wish: { active: false, requestedRank: null, requestedBy: null }
					};
				}
			},
			onPlayerFinished: (data) => {
				if (gameState) {
					const players = [...gameState.players];
					players[data.seat] = { ...players[data.seat], finishOrder: data.order };
					gameState = { ...gameState, players };
				}
				const name = gameState?.players[data.seat]?.name;
				addToast(`${name}이(가) ${data.order}등으로 완주!`, 'success');
			},
			onBombPlayed: (data) => {
				const name = gameState?.players[data.seat]?.name;
				addToast(`💣 ${name}이(가) 폭탄을 터뜨렸습니다!`, 'warning');
			},

			// Round/Game end
			onRoundEnd: (result) => {
				roundResult = result;
				showRoundEndModal = true;
				if (gameState) {
					gameState = {
						...gameState,
						completedRounds: [...gameState.completedRounds, result],
						cumulativeScoreA: gameState.cumulativeScoreA + result.teamAScore,
						cumulativeScoreB: gameState.cumulativeScoreB + result.teamBScore
					};
				}
			},
			onGameEnd: (data) => {
				gameEndData = data;
				showGameOverModal = true;
			},
			onGameError: (msg) => {
				addToast(msg, 'error');
			},

			// Social
			onPlayerDisconnected: (data) => {
				addToast(`${data.name}의 연결이 끊겼습니다`, 'warning');
				if (gameState) {
					const players = gameState.players.map(p =>
						p.seat === data.seat ? { ...p, connected: false } : p
					);
					gameState = { ...gameState, players };
				}
			},
			onPlayerReconnected: (data) => {
				addToast(`${data.name}이(가) 재연결되었습니다`, 'success');
				if (gameState) {
					const players = gameState.players.map(p =>
						p.seat === data.seat ? { ...p, connected: true } : p
					);
					gameState = { ...gameState, players };
				}
			},
			onChatMessage: (data) => {
				chatMessages = [...chatMessages.slice(-49), {
					seat: data.seat,
					message: data.message,
					isEmote: false,
					timestamp: Date.now()
				}];
			},
			onChatEmote: (data) => {
				chatMessages = [...chatMessages.slice(-49), {
					seat: data.seat,
					message: data.emote,
					isEmote: true,
					timestamp: Date.now()
				}];
			}
		});
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
		// Clear this card from other slots if already assigned
		if (cardId) {
			if (exchangePartner === cardId && target !== 'partner') exchangePartner = null;
			if (exchangeLeft === cardId && target !== 'left') exchangeLeft = null;
			if (exchangeRight === cardId && target !== 'right') exchangeRight = null;
		}
		if (target === 'partner') exchangePartner = cardId;
		else if (target === 'left') exchangeLeft = cardId;
		else exchangeRight = cardId;
	}

	const exchangeReady = $derived(
		exchangePartner !== null && exchangeLeft !== null && exchangeRight !== null
	);

	function submitExchange() {
		if (!exchangePartner || !exchangeLeft || !exchangeRight) return;
		client.exchangeCards({
			toPartner: exchangePartner,
			toLeft: exchangeLeft,
			toRight: exchangeRight
		});
	}

	// ===== Actions =====

	function playSelectedCards() {
		if (selectedCards.size === 0) return;
		client.playCards(Array.from(selectedCards));
		selectedCards = new Set();
	}

	function disconnect() {
		if (grandTichuTimerInterval) {
			clearInterval(grandTichuTimerInterval);
			grandTichuTimerInterval = null;
		}
		client.disconnect();
		connectionStatus = 'disconnected';
	}

	function backToLobby() {
		client.leaveRoom();
		gameState = null;
		currentRoomId = null;
		view = 'lobby';
		reconnectFailed = false;
	}

	return {
		// State (read-only externally via getters)
		get connectionStatus() { return connectionStatus; },
		get reconnectAttempt() { return reconnectAttempt; },
		get reconnectFailed() { return reconnectFailed; },
		get view() { return view; },
		get rooms() { return rooms; },
		get currentRoomId() { return currentRoomId; },
		get gameState() { return gameState; },
		get selectedCards() { return selectedCards; },
		get grandTichuTimer() { return grandTichuTimer; },
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
		get chatMessages() { return chatMessages; },
		get showChat() { return showChat; },
		set showChat(v: boolean) { showChat = v; },

		// Derived
		get isConnected() { return isConnected; },
		get isReconnecting() { return isReconnecting; },
		get isMyTurn() { return isMyTurn; },
		get myTeam() { return myTeam; },
		get partnerSeat() { return partnerSeat; },
		get canDeclareSmallTichu() { return canDeclareSmallTichu; },
		get sortedHand() { return sortedHand; },

		// Actions
		connect,
		disconnect,
		backToLobby,
		toggleCard,
		clearSelection,
		setExchangeCard,
		submitExchange,
		playSelectedCards,
		addToast,

		// Socket actions (proxy to client)
		listRooms: () => client.listRooms(),
		createRoom: (targetScore?: number) => client.createRoom(targetScore),
		joinRoom: (roomId: string) => client.joinRoom(roomId),
		leaveRoom: () => client.leaveRoom(),
		setReady: () => client.setReady(),
		setUnready: () => client.setUnready(),
		startGame: () => client.startGame(),
		swapSeat: (targetSeat: SeatIndex) => client.swapSeat(targetSeat),
		shuffleSeats: () => client.shuffleSeats(),
		declareGrandTichu: () => client.declareGrandTichu(),
		passGrandTichu: () => client.passGrandTichu(),
		declareSmallTichu: () => client.declareSmallTichu(),
		pass: () => client.pass(),
		setWish: (rank: number | null) => client.setWish(rank),
		giftDragon: (seat: SeatIndex) => client.giftDragon(seat),
		playBomb: (cardIds: string[]) => { client.playBomb(cardIds); selectedCards = new Set(); },
		sendMessage: (msg: string) => client.sendMessage(msg),
		sendEmote: (emote: string) => client.sendEmote(emote)
	};
}
