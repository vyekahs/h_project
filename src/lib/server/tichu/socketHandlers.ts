import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { TichuRoomManager } from './TichuRoomManager';
import type { TichuRoom } from './TichuRoom';
import type { SeatIndex, GamePhase, TichuRoundResult, TeamId, Card } from '$lib/games/tichu/types';
import { saveTichuResult } from '$lib/server/services/tichuService';

export function setupSocketHandlers(
	io: SocketIOServer,
	socket: Socket,
	manager: TichuRoomManager
) {
	const userId = socket.data.userId as number;
	const userName = socket.data.userName as string;
	let lastChatTime = 0;
	let lastEmoteTime = 0;
	let lastActionTime = 0;
	let lastRoomCreateTime = 0;

	// Cancel any pending disconnect timer (e.g. page refresh)
	manager.cancelDisconnectTimer(userId);

	// Check if user was in an active game (reconnection)
	const existingRoom = manager.getUserRoom(userId);
	if (existingRoom) {
		const seat = existingRoom.findSeat(userId);
		if (seat !== null) {
			existingRoom.setConnected(userId, true);
			socket.join(existingRoom.state.roomId);
			setupRoomCallbacks(io, existingRoom, manager);
			socket.emit('game:stateSync', existingRoom.getClientState(seat));
			socket.to(existingRoom.state.roomId).emit('player:reconnected', { seat, name: userName });
			// Resume turn timer if game is in playing phase (Fix 2.2 + 3.2)
			existingRoom.resumeTurnTimer();
			console.log(`[Tichu] Reconnected: ${userName} to room ${existingRoom.state.roomId}`);
		}
	}

	// ===== Lobby Events =====

	socket.on('room:list', () => {
		socket.emit('room:list', manager.getRoomList());
	});

	socket.on('room:create', (data: { targetScore?: number }) => {
		const now = Date.now();
		if (now - lastRoomCreateTime < 5000) return; // 5-second cooldown
		lastRoomCreateTime = now;

		// Validate targetScore: must be a positive integer, max 10000
		let targetScore = data?.targetScore;
		if (targetScore !== undefined) {
			if (typeof targetScore !== 'number' || !Number.isInteger(targetScore) || targetScore < 100 || targetScore > 10000) {
				targetScore = undefined; // fall back to default
			}
		}
		const room = manager.createRoom({ targetScore });
		if (!room) {
			socket.emit('room:error', { message: '방 수가 최대치에 도달했습니다' });
			return;
		}
		const result = manager.joinRoom(room.state.roomId, userId, userName);
		if (!result) {
			socket.emit('room:error', { message: '방 생성 실패' });
			return;
		}

		socket.join(room.state.roomId);
		setupRoomCallbacks(io, room, manager);
		socket.emit('room:created', {
			roomId: room.state.roomId,
			seat: result.seat,
			state: room.getClientState(result.seat)
		});
		broadcastRoomList(io, manager);
	});

	socket.on('room:join', (data: { roomId: string }) => {
		const result = manager.joinRoom(data.roomId, userId, userName);
		if (!result) {
			socket.emit('room:error', { message: '방에 참여할 수 없습니다' });
			return;
		}

		socket.join(data.roomId);
		setupRoomCallbacks(io, result.room, manager);
		socket.emit('room:joined', {
			roomId: data.roomId,
			seat: result.seat,
			state: result.room.getClientState(result.seat)
		});

		// Sync full state to all players (including existing ones)
		emitStateToAll(io, result.room);

		broadcastRoomList(io, manager);
	});

	socket.on('room:leave', () => {
		const room = manager.getUserRoom(userId);
		if (!room) return;

		const roomId = room.state.roomId;
		socket.leave(roomId);
		manager.leaveRoom(roomId, userId);

		socket.emit('room:left');
		// Room may have been deleted if empty — check before emitting
		const updatedRoom = manager.getRoom(roomId);
		if (updatedRoom) emitStateToAll(io, updatedRoom);

		broadcastRoomList(io, manager);
	});

	socket.on('room:ready', () => {
		const room = manager.getUserRoom(userId);
		if (!room) return;
		room.setReady(userId, true);
		emitStateToAll(io, room);
	});

	socket.on('room:unready', () => {
		const room = manager.getUserRoom(userId);
		if (!room) return;
		room.setReady(userId, false);
		emitStateToAll(io, room);
	});

	socket.on('room:swapSeat', (data: { targetSeat: number }) => {
		const room = manager.getUserRoom(userId);
		if (!room) return;

		if (room.swapSeat(userId, data.targetSeat as SeatIndex)) {
			emitStateToAll(io, room);
			broadcastRoomList(io, manager);
		} else {
			socket.emit('room:error', { message: '자리를 바꿀 수 없습니다' });
		}
	});

	socket.on('room:shuffleSeats', () => {
		const room = manager.getUserRoom(userId);
		if (!room) return;

		if (room.shuffleSeats()) {
			emitStateToAll(io, room);
			broadcastRoomList(io, manager);
		} else {
			socket.emit('room:error', { message: '랜덤 배치를 할 수 없습니다' });
		}
	});

	socket.on('game:start', () => {
		const room = manager.getUserRoom(userId);
		if (!room) return;
		if (room.state.players.length !== 4) {
			socket.emit('room:error', { message: '4명이 모여야 시작할 수 있습니다' });
			return;
		}
		const allReady = room.state.readyStatus.slice(0, 4).every(r => r);
		if (!allReady) {
			socket.emit('room:error', { message: '모든 플레이어가 준비해야 합니다' });
			return;
		}
		if (room.state.phase !== 'ready_check') {
			socket.emit('room:error', { message: '시작할 수 없는 상태입니다' });
			return;
		}
		room.startDealing();
	});

	// ===== Game Events =====

	socket.on('game:declareGrandTichu', () => {
		const room = manager.getUserRoom(userId);
		if (!room) return;
		const seat = room.findSeat(userId);
		if (seat === null) return;

		if (room.declareGrandTichu(seat)) {
			io.to(room.state.roomId).emit('game:playerDeclaredGrandTichu', { seat });
			emitStateToAll(io, room);
		}
	});

	socket.on('game:passGrandTichu', () => {
		const room = manager.getUserRoom(userId);
		if (!room) return;
		const seat = room.findSeat(userId);
		if (seat === null) return;

		room.passGrandTichu(seat);
		emitStateToAll(io, room);
	});

	socket.on('game:declareSmallTichu', () => {
		const room = manager.getUserRoom(userId);
		if (!room) return;
		const seat = room.findSeat(userId);
		if (seat === null) return;

		if (room.declareSmallTichu(seat)) {
			io.to(room.state.roomId).emit('game:playerDeclaredSmallTichu', { seat });
		}
	});

	socket.on('game:exchangeCards', (data: { toPartner: string; toLeft: string; toRight: string }) => {
		if (typeof data?.toPartner !== 'string' || typeof data?.toLeft !== 'string' || typeof data?.toRight !== 'string') {
			socket.emit('game:error', { message: '유효하지 않은 교환 데이터입니다' });
			return;
		}
		const room = manager.getUserRoom(userId);
		if (!room) return;
		const seat = room.findSeat(userId);
		if (seat === null) return;

		if (!room.submitExchange(seat, data)) {
			socket.emit('game:error', { message: '교환 카드가 유효하지 않습니다' });
		}
	});

	socket.on('game:playCards', (data: { cardIds: string[] }) => {
		const now = Date.now();
		if (now - lastActionTime < 200) return;
		lastActionTime = now;
		// Fix 5.1: Validate cardIds array contents
		if (!Array.isArray(data?.cardIds) || data.cardIds.some(id => typeof id !== 'string')) {
			socket.emit('game:error', { message: '유효하지 않은 카드 데이터입니다' });
			return;
		}
		const room = manager.getUserRoom(userId);
		if (!room) return;
		const seat = room.findSeat(userId);
		if (seat === null) return;

		const result = room.playCards(seat, data.cardIds);
		if (!result.success) {
			socket.emit('game:error', { message: result.error || '카드를 낼 수 없습니다' });
		}
	});

	socket.on('game:pass', () => {
		const now = Date.now();
		if (now - lastActionTime < 200) return;
		lastActionTime = now;
		const room = manager.getUserRoom(userId);
		if (!room) return;
		const seat = room.findSeat(userId);
		if (seat === null) return;

		const result = room.pass(seat);
		if (!result.success) {
			socket.emit('game:error', { message: result.error || '패스할 수 없습니다' });
		}
	});

	socket.on('game:wish', (data: { rank: number | null }) => {
		const now = Date.now();
		if (now - lastActionTime < 200) return;
		lastActionTime = now;
		const room = manager.getUserRoom(userId);
		if (!room) return;
		const seat = room.findSeat(userId);
		if (seat === null) return;

		if (!room.setWish(seat, data.rank)) {
			socket.emit('game:error', { message: '소원을 설정할 수 없습니다' });
		}
	});

	socket.on('game:dragonGift', (data: { targetSeat: number }) => {
		const now = Date.now();
		if (now - lastActionTime < 200) return;
		lastActionTime = now;
		const room = manager.getUserRoom(userId);
		if (!room) return;
		const seat = room.findSeat(userId);
		if (seat === null) return;

		if (!room.giftDragon(seat, data.targetSeat as SeatIndex)) {
			socket.emit('game:error', { message: '용 트릭을 양도할 수 없습니다' });
		}
	});

	socket.on('game:bomb', (data: { cardIds: string[] }) => {
		const now = Date.now();
		if (now - lastActionTime < 200) return;
		lastActionTime = now;
		// Fix 5.1: Validate cardIds array contents
		if (!Array.isArray(data?.cardIds) || data.cardIds.some(id => typeof id !== 'string')) {
			socket.emit('game:error', { message: '유효하지 않은 카드 데이터입니다' });
			return;
		}
		const room = manager.getUserRoom(userId);
		if (!room) return;
		const seat = room.findSeat(userId);
		if (seat === null) return;

		const result = room.playBomb(seat, data.cardIds);
		if (!result.success) {
			socket.emit('game:error', { message: result.error || '폭탄을 쓸 수 없습니다' });
		}
	});

	// ===== Chat =====

	socket.on('chat:message', (data: { message: string }) => {
		const now = Date.now();
		if (now - lastChatTime < 500) return; // rate limit: 500ms cooldown
		lastChatTime = now;

		const room = manager.getUserRoom(userId);
		if (!room) return;
		const seat = room.findSeat(userId);
		if (seat === null) return;

		io.to(room.state.roomId).emit('chat:message', {
			seat,
			name: userName,
			message: data.message.slice(0, 200) // limit length
		});
	});

	socket.on('chat:emote', (data: { emote: string }) => {
		if (typeof data?.emote !== 'string' || data.emote.length > 50) return;

		const now = Date.now();
		if (now - lastEmoteTime < 500) return; // rate limit: 500ms cooldown
		lastEmoteTime = now;

		const room = manager.getUserRoom(userId);
		if (!room) return;
		const seat = room.findSeat(userId);
		if (seat === null) return;

		io.to(room.state.roomId).emit('chat:emote', {
			seat,
			emote: data.emote
		});
	});

	// ===== Disconnect =====

	socket.on('disconnect', () => {
		console.log(`[Tichu] Disconnected: ${userName} (${userId})`);
		const result = manager.disconnectUser(userId, (roomId) => {
			// Called after grace period if user didn't reconnect
			const r = manager.getRoom(roomId);
			if (r) emitStateToAll(io, r);
			broadcastRoomList(io, manager);
		});
		if (result) {
			const { roomId, room } = result;
			const seat = room.findSeat(userId);
			io.to(roomId).emit('player:disconnected', { seat, name: userName });
			emitStateToAll(io, room);
			// Use debounced save (Fix 1.2)
			manager.saveRoomSnapshotDebounced(roomId);
		}
		broadcastRoomList(io, manager);
	});
}

function setupRoomCallbacks(io: SocketIOServer, room: TichuRoom, manager: TichuRoomManager) {
	// Only set up once
	if (room.onPhaseChange) return;

	room.onPhaseChange = (phase: GamePhase) => {
		emitStateToAll(io, room);

		// Save snapshot on important phase changes (immediate, not debounced)
		if (['playing', 'exchange', 'round_end'].includes(phase)) {
			manager.saveRoomSnapshot(room.state.roomId).catch(e => console.error(`[Tichu] Snapshot save failed:`, e));
		}
	};

	room.onStateUpdate = () => {
		emitStateToAll(io, room);
		// Use debounced save for per-play updates (Fix 1.2)
		if (room.state.phase === 'playing') {
			manager.saveRoomSnapshotDebounced(room.state.roomId);
		}
	};

	room.onCardsDealt = (seat: SeatIndex, cards: Card[]) => {
		const sockets = getSocketsInRoom(io, room.state.roomId);
		for (const s of sockets) {
			const sUserId = s.data.userId;
			const player = room.findPlayer(sUserId);
			if (player && player.seat === seat) {
				s.emit('game:cardsDealt', { cards });
			}
		}
	};

	room.onRemainingDealt = (seat: SeatIndex, cards: Card[]) => {
		const sockets = getSocketsInRoom(io, room.state.roomId);
		for (const s of sockets) {
			const sUserId = s.data.userId;
			const player = room.findPlayer(sUserId);
			if (player && player.seat === seat) {
				s.emit('game:remainingDealt', { cards });
			}
		}
	};

	room.onExchangeReceived = (seat: SeatIndex, cards: Card[]) => {
		const sockets = getSocketsInRoom(io, room.state.roomId);
		for (const s of sockets) {
			const sUserId = s.data.userId;
			const player = room.findPlayer(sUserId);
			if (player && player.seat === seat) {
				s.emit('game:exchangeReceived', { cards });
			}
		}
	};

	room.onRoundEnd = (result: TichuRoundResult) => {
		io.to(room.state.roomId).emit('game:roundEnd', result);
	};

	room.onGameEnd = async (winner: TeamId) => {
		io.to(room.state.roomId).emit('game:gameEnd', {
			winner,
			scoreA: room.state.cumulativeScoreA,
			scoreB: room.state.cumulativeScoreB,
			rounds: room.state.completedRounds
		});

		// Save result to DB
		try {
			await saveTichuResult(room);
		} catch (e) {
			console.error('[Tichu] Failed to save game result:', e);
		}

		// Clean up room after game end
		manager.removeRoom(room.state.roomId).catch(e => console.error(`[Tichu] Failed to remove room ${room.state.roomId}:`, e));
	};
}

function emitStateToAll(io: SocketIOServer, room: TichuRoom) {
	const sockets = getSocketsInRoom(io, room.state.roomId);
	if (sockets.length === 0) return;

	// Fix 2.3: Cache common state parts, only hand differs per seat
	const stateCache = new Map<SeatIndex, ReturnType<TichuRoom['getClientState']>>();
	for (const s of sockets) {
		const sUserId = s.data.userId;
		const player = room.findPlayer(sUserId);
		if (player) {
			let state = stateCache.get(player.seat);
			if (!state) {
				state = room.getClientState(player.seat);
				stateCache.set(player.seat, state);
			}
			s.emit('game:stateSync', state);
		}
	}
}

function getSocketsInRoom(io: SocketIOServer, roomId: string): Socket[] {
	const room = io.sockets.adapter.rooms.get(roomId);
	if (!room) return [];
	const sockets: Socket[] = [];
	for (const id of room) {
		const s = io.sockets.sockets.get(id);
		if (s) sockets.push(s);
	}
	return sockets;
}

function broadcastRoomList(io: SocketIOServer, manager: TichuRoomManager) {
	// Fix 4.1: Only broadcast to sockets not in any game room
	const roomList = manager.getRoomList();
	for (const [, s] of io.sockets.sockets) {
		const sUserId = s.data.userId;
		if (!sUserId) continue;
		// Only send to users not currently in a room, or in lobby phase
		const userRoom = manager.getUserRoom(sUserId);
		if (!userRoom || userRoom.state.phase === 'lobby' || userRoom.state.phase === 'ready_check') {
			s.emit('room:list', roomList);
		}
	}
}
