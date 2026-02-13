import { io, type Socket } from 'socket.io-client';
import type {
	TichuClientState, RoomListItem, ExchangeCards,
	Card, Combination, SeatIndex, TeamId, TichuRoundResult
} from '$lib/games/tichu/types';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface TichuSocketCallbacks {
	// Connection
	onConnect: () => void;
	onDisconnect: (reason: string) => void;
	onReconnecting: (attempt: number) => void;
	onReconnected: () => void;

	// Lobby
	onRoomList: (rooms: RoomListItem[]) => void;
	onRoomCreated: (data: { roomId: string; seat: SeatIndex; state: TichuClientState }) => void;
	onRoomJoined: (data: { roomId: string; seat: SeatIndex; state: TichuClientState }) => void;
	onRoomLeft: () => void;
	onRoomUpdated: (data: RoomListItem) => void;
	onRoomStart: () => void;
	onRoomError: (message: string) => void;

	// Game state
	onStateSync: (state: TichuClientState) => void;
	onPhaseChange: (phase: string) => void;
	onCardsDealt: (cards: Card[]) => void;
	onRemainingDealt: (cards: Card[]) => void;
	onGrandTichuWindow: (timeoutMs: number) => void;
	onPlayerDeclaredGrandTichu: (seat: SeatIndex) => void;
	onPlayerDeclaredSmallTichu: (seat: SeatIndex) => void;
	onExchangeReceived: (cards: Card[]) => void;

	// Playing
	onTurnStart: (seat: SeatIndex) => void;
	onCardsPlayed: (data: { seat: SeatIndex; combination: Combination }) => void;
	onPlayerPassed: (seat: SeatIndex) => void;
	onTrickWon: (data: { seat: SeatIndex; cards: Card[] }) => void;
	onDragonGiftRequired: (seat: SeatIndex) => void;
	onWishActivated: (data: { rank: number; by: SeatIndex }) => void;
	onWishFulfilled: () => void;
	onPlayerFinished: (data: { seat: SeatIndex; order: number }) => void;
	onBombPlayed: (data: { seat: SeatIndex; combination: Combination }) => void;

	// Round/Game end
	onRoundEnd: (result: TichuRoundResult) => void;
	onGameEnd: (data: { winner: TeamId; scoreA: number; scoreB: number }) => void;
	onGameError: (message: string) => void;

	// Social
	onPlayerDisconnected: (data: { seat: SeatIndex; name: string }) => void;
	onPlayerReconnected: (data: { seat: SeatIndex; name: string }) => void;
	onChatMessage: (data: { seat: SeatIndex; message: string }) => void;
	onChatEmote: (data: { seat: SeatIndex; emote: string }) => void;
}

export class TichuSocketClient {
	private socket: Socket | null = null;
	private callbacks: Partial<TichuSocketCallbacks> = {};
	private _status: ConnectionStatus = 'disconnected';
	private _reconnectAttempt = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	get status(): ConnectionStatus {
		return this._status;
	}

	get reconnectAttempt(): number {
		return this._reconnectAttempt;
	}

	connect(callbacks: Partial<TichuSocketCallbacks>): void {
		this.callbacks = callbacks;

		this.socket = io({
			path: '/socket.io',
			transports: ['websocket', 'polling'],
			reconnection: true,
			reconnectionAttempts: 30,
			reconnectionDelay: 1000,
			reconnectionDelayMax: 10000,
			timeout: 10000
		});

		this._status = 'connecting';
		this.setupListeners();
	}

	private setupListeners(): void {
		if (!this.socket) return;
		const s = this.socket;

		// Connection events
		s.on('connect', () => {
			this._status = 'connected';
			this._reconnectAttempt = 0;
			this.callbacks.onConnect?.();
		});

		s.on('disconnect', (reason) => {
			this._status = 'disconnected';
			this.callbacks.onDisconnect?.(reason);
		});

		s.io.on('reconnect_attempt', (attempt) => {
			this._status = 'reconnecting';
			this._reconnectAttempt = attempt;
			this.callbacks.onReconnecting?.(attempt);
		});

		s.io.on('reconnect', () => {
			this._status = 'connected';
			this._reconnectAttempt = 0;
			this.callbacks.onReconnected?.();
		});

		// Lobby events
		s.on('room:list', (rooms: RoomListItem[]) => this.callbacks.onRoomList?.(rooms));
		s.on('room:created', (data) => this.callbacks.onRoomCreated?.(data));
		s.on('room:joined', (data) => this.callbacks.onRoomJoined?.(data));
		s.on('room:left', () => this.callbacks.onRoomLeft?.());
		s.on('room:updated', (data) => this.callbacks.onRoomUpdated?.(data));
		s.on('room:start', () => this.callbacks.onRoomStart?.());
		s.on('room:error', (data) => this.callbacks.onRoomError?.(typeof data === 'string' ? data : data.message));

		// Game state events
		s.on('game:stateSync', (state: TichuClientState) => this.callbacks.onStateSync?.(state));
		s.on('game:phaseChange', (phase: string) => this.callbacks.onPhaseChange?.(phase));
		s.on('game:cardsDealt', (data) => this.callbacks.onCardsDealt?.(data.cards));
		s.on('game:remainingDealt', (data) => this.callbacks.onRemainingDealt?.(data.cards));
		s.on('game:grandTichuWindow', (ms: number) => this.callbacks.onGrandTichuWindow?.(ms));
		s.on('game:playerDeclaredGrandTichu', (data) => this.callbacks.onPlayerDeclaredGrandTichu?.(data.seat));
		s.on('game:playerDeclaredSmallTichu', (data) => this.callbacks.onPlayerDeclaredSmallTichu?.(data.seat));
		s.on('game:exchangeReceived', (data) => this.callbacks.onExchangeReceived?.(data.cards));

		// Playing events
		s.on('game:turnStart', (seat: SeatIndex) => this.callbacks.onTurnStart?.(seat));
		s.on('game:cardsPlayed', (data) => this.callbacks.onCardsPlayed?.(data));
		s.on('game:playerPassed', (seat: SeatIndex) => this.callbacks.onPlayerPassed?.(seat));
		s.on('game:trickWon', (data) => this.callbacks.onTrickWon?.(data));
		s.on('game:dragonGiftRequired', (seat: SeatIndex) => this.callbacks.onDragonGiftRequired?.(seat));
		s.on('game:wishActivated', (data) => this.callbacks.onWishActivated?.(data));
		s.on('game:wishFulfilled', () => this.callbacks.onWishFulfilled?.());
		s.on('game:playerFinished', (data) => this.callbacks.onPlayerFinished?.(data));
		s.on('game:bombPlayed', (data) => this.callbacks.onBombPlayed?.(data));

		// Round/Game events
		s.on('game:roundEnd', (result: TichuRoundResult) => this.callbacks.onRoundEnd?.(result));
		s.on('game:gameEnd', (data) => this.callbacks.onGameEnd?.(data));
		s.on('game:error', (data) => this.callbacks.onGameError?.(typeof data === 'string' ? data : data.message));

		// Social events
		s.on('player:disconnected', (data) => this.callbacks.onPlayerDisconnected?.(data));
		s.on('player:reconnected', (data) => this.callbacks.onPlayerReconnected?.(data));
		s.on('chat:message', (data) => this.callbacks.onChatMessage?.(data));
		s.on('chat:emote', (data) => this.callbacks.onChatEmote?.(data));
	}

	// ===== Lobby Actions =====

	listRooms(): void {
		this.socket?.emit('room:list');
	}

	createRoom(targetScore?: number): void {
		this.socket?.emit('room:create', { targetScore });
	}

	joinRoom(roomId: string): void {
		this.socket?.emit('room:join', { roomId });
	}

	leaveRoom(): void {
		this.socket?.emit('room:leave');
	}

	setReady(): void {
		this.socket?.emit('room:ready');
	}

	setUnready(): void {
		this.socket?.emit('room:unready');
	}

	startGame(): void {
		this.socket?.emit('game:start');
	}

	swapSeat(targetSeat: SeatIndex): void {
		this.socket?.emit('room:swapSeat', { targetSeat });
	}

	shuffleSeats(): void {
		this.socket?.emit('room:shuffleSeats');
	}

	// ===== Game Actions =====

	declareGrandTichu(): void {
		this.socket?.emit('game:declareGrandTichu');
	}

	passGrandTichu(): void {
		this.socket?.emit('game:passGrandTichu');
	}

	declareSmallTichu(): void {
		this.socket?.emit('game:declareSmallTichu');
	}

	exchangeCards(exchange: ExchangeCards): void {
		this.socket?.emit('game:exchangeCards', exchange);
	}

	playCards(cardIds: string[]): void {
		this.socket?.emit('game:playCards', { cardIds });
	}

	pass(): void {
		this.socket?.emit('game:pass');
	}

	setWish(rank: number | null): void {
		this.socket?.emit('game:wish', { rank });
	}

	giftDragon(targetSeat: SeatIndex): void {
		this.socket?.emit('game:dragonGift', { targetSeat });
	}

	playBomb(cardIds: string[]): void {
		this.socket?.emit('game:bomb', { cardIds });
	}

	// ===== Chat =====

	sendMessage(message: string): void {
		this.socket?.emit('chat:message', { message });
	}

	sendEmote(emote: string): void {
		this.socket?.emit('chat:emote', { emote });
	}

	// ===== Lifecycle =====

	disconnect(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.socket?.disconnect();
		this.socket = null;
		this._status = 'disconnected';
	}
}
