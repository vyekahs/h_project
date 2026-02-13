import { TichuRoom } from './TichuRoom';
import type { RoomListItem, RoomConfig, SeatIndex } from '$lib/games/tichu/types';
import { saveTichuSnapshot, loadTichuSnapshots, removeTichuSnapshot } from '$lib/server/services/tichuService';
import { ABANDONED_ROOM_TIMEOUT_MS } from '$lib/games/tichu/constants';

export class TichuRoomManager {
	private rooms = new Map<string, TichuRoom>();
	private userRoomMap = new Map<number, string>(); // userId → roomId
	private roomCounter = 0;
	private disconnectTimers = new Map<number, ReturnType<typeof setTimeout>>(); // userId → timer
	private abandonedRoomTimers = new Map<string, ReturnType<typeof setTimeout>>(); // roomId → timer
	private snapshotDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>(); // roomId → timer

	constructor() {}

	async init(): Promise<void> {
		try {
			const snapshots = await loadTichuSnapshots();
			for (const snapshot of snapshots) {
				try {
					const room = TichuRoom.fromJSON(snapshot.game_state);
					this.rooms.set(snapshot.room_id, room);
					for (const player of room.state.players) {
						this.userRoomMap.set(player.userId, snapshot.room_id);
					}
					// Restored rooms have no connected players — start abandoned timer
					this.startAbandonedTimer(snapshot.room_id);
					console.log(`[Tichu] Restored room ${snapshot.room_id} (phase: ${room.state.phase})`);
				} catch (e) {
					console.error(`[Tichu] Failed to restore room ${snapshot.room_id}:`, e);
					await removeTichuSnapshot(snapshot.room_id);
				}
			}
			console.log(`[Tichu] Restored ${this.rooms.size} active rooms`);
		} catch (e) {
			console.error('[Tichu] Failed to load snapshots:', e);
		}
	}

	createRoom(config?: Partial<RoomConfig>): TichuRoom | null {
		if (this.rooms.size >= 50) return null; // Max 50 concurrent rooms
		this.roomCounter++;
		const roomId = `tichu_${Date.now()}_${this.roomCounter}`;
		const room = new TichuRoom(roomId, config);
		this.rooms.set(roomId, room);
		return room;
	}

	getRoom(roomId: string): TichuRoom | undefined {
		return this.rooms.get(roomId);
	}

	getUserRoom(userId: number): TichuRoom | undefined {
		const roomId = this.userRoomMap.get(userId);
		if (!roomId) return undefined;
		return this.rooms.get(roomId);
	}

	joinRoom(roomId: string, userId: number, name: string): { room: TichuRoom; seat: SeatIndex } | null {
		const room = this.rooms.get(roomId);
		if (!room) return null;

		// Cancel any pending disconnect timer
		this.cancelDisconnectTimer(userId);

		// Check if user is already in this room (reconnection)
		const existingSeat = room.findSeat(userId);
		if (existingSeat !== null) {
			room.setConnected(userId, true);
			this.userRoomMap.set(userId, roomId);
			this.cancelAbandonedTimer(roomId);
			return { room, seat: existingSeat };
		}

		// Check if user is in another room
		const otherRoomId = this.userRoomMap.get(userId);
		if (otherRoomId && otherRoomId !== roomId) {
			this.leaveRoom(otherRoomId, userId);
		}

		const seat = room.addPlayer(userId, name);
		if (seat === null) return null;

		this.userRoomMap.set(userId, roomId);
		this.cancelAbandonedTimer(roomId);
		return { room, seat };
	}

	leaveRoom(roomId: string, userId: number): boolean {
		const room = this.rooms.get(roomId);
		if (!room) return false;

		const removed = room.removePlayer(userId);
		if (removed) {
			this.userRoomMap.delete(userId);
		}

		// Clean up empty rooms
		if (room.state.players.length === 0) {
			this.cancelAbandonedTimer(roomId);
			this.cancelSnapshotDebounce(roomId);
			room.cleanup();
			this.rooms.delete(roomId);
			removeTichuSnapshot(roomId).catch(e => console.error(`[Tichu] Failed to remove snapshot for ${roomId}:`, e));
		}

		return removed;
	}

	cancelDisconnectTimer(userId: number): void {
		const timer = this.disconnectTimers.get(userId);
		if (timer) {
			clearTimeout(timer);
			this.disconnectTimers.delete(userId);
		}
	}

	disconnectUser(userId: number, onRemoved?: (roomId: string) => void): { roomId: string; room: TichuRoom } | null {
		const roomId = this.userRoomMap.get(userId);
		if (!roomId) return null;

		const room = this.rooms.get(roomId);
		if (!room) return null;

		room.setConnected(userId, false);

		// Check if ALL players are disconnected → start abandoned timer
		const allDisconnected = room.state.players.every(p => !p.connected);
		if (allDisconnected) {
			this.startAbandonedTimer(roomId);
		}

		// If in lobby/ready_check, give grace period before removing
		if (room.state.phase === 'lobby' || room.state.phase === 'ready_check') {
			// Reset ready status
			const seat = room.findSeat(userId);
			if (seat !== null) {
				room.state.readyStatus[seat] = false;
			}

			this.cancelDisconnectTimer(userId);
			const timer = setTimeout(() => {
				this.disconnectTimers.delete(userId);
				// Re-check: user may have moved to another room
				const currentRoomId = this.userRoomMap.get(userId);
				if (currentRoomId !== roomId) return;
				const currentRoom = this.rooms.get(roomId);
				if (!currentRoom) return;
				const player = currentRoom.findPlayer(userId);
				if (player && !player.connected) {
					this.leaveRoom(roomId, userId);
					onRemoved?.(roomId);
				}
			}, 15000); // 15초 유예
			this.disconnectTimers.set(userId, timer);
			return null;
		}

		return { roomId, room };
	}

	// ===== Abandoned Room Cleanup =====

	private startAbandonedTimer(roomId: string): void {
		this.cancelAbandonedTimer(roomId);
		const timer = setTimeout(() => {
			this.abandonedRoomTimers.delete(roomId);
			const room = this.rooms.get(roomId);
			if (!room) return;
			// Re-check: ensure all players are still disconnected
			const allDisconnected = room.state.players.every(p => !p.connected);
			if (allDisconnected) {
				console.log(`[Tichu] Removing abandoned room ${roomId}`);
				this.removeRoom(roomId).catch(e => console.error(`[Tichu] Failed to remove abandoned room ${roomId}:`, e));
			}
		}, ABANDONED_ROOM_TIMEOUT_MS);
		this.abandonedRoomTimers.set(roomId, timer);
	}

	private cancelAbandonedTimer(roomId: string): void {
		const timer = this.abandonedRoomTimers.get(roomId);
		if (timer) {
			clearTimeout(timer);
			this.abandonedRoomTimers.delete(roomId);
		}
	}

	// ===== Snapshot Debounce =====

	saveRoomSnapshotDebounced(roomId: string): void {
		this.cancelSnapshotDebounce(roomId);
		const timer = setTimeout(() => {
			this.snapshotDebounceTimers.delete(roomId);
			this.saveRoomSnapshot(roomId).catch(() => {});
		}, 2000);
		this.snapshotDebounceTimers.set(roomId, timer);
	}

	private cancelSnapshotDebounce(roomId: string): void {
		const timer = this.snapshotDebounceTimers.get(roomId);
		if (timer) {
			clearTimeout(timer);
			this.snapshotDebounceTimers.delete(roomId);
		}
	}

	getRoomList(): RoomListItem[] {
		const list: RoomListItem[] = [];
		for (const [roomId, room] of this.rooms) {
			// Only show joinable rooms
			if (room.state.phase === 'lobby' || room.state.phase === 'ready_check') {
				list.push({
					roomId,
					playerCount: room.state.players.length,
					players: room.state.players.map(p => ({
						name: p.name,
						seat: p.seat,
						team: p.team
					})),
					phase: room.state.phase,
					config: room.state.config
				});
			}
		}
		return list;
	}

	async saveRoomSnapshot(roomId: string): Promise<void> {
		const room = this.rooms.get(roomId);
		if (!room) return;
		if (room.state.phase === 'lobby' || room.state.phase === 'ready_check') return;

		try {
			await saveTichuSnapshot(
				roomId,
				room.toJSON(),
				room.state.players.map(p => p.userId),
				room.state.phase
			);
		} catch (e) {
			console.error(`[Tichu] Failed to save snapshot for ${roomId}:`, e);
		}
	}

	async saveAllSnapshots(): Promise<void> {
		// Flush all pending debounced saves immediately
		for (const [roomId, timer] of this.snapshotDebounceTimers) {
			clearTimeout(timer);
			this.snapshotDebounceTimers.delete(roomId);
		}
		const promises: Promise<void>[] = [];
		for (const [roomId, room] of this.rooms) {
			if (room.state.phase !== 'lobby' && room.state.phase !== 'ready_check' && room.state.phase !== 'game_end') {
				promises.push(this.saveRoomSnapshot(roomId));
			}
		}
		await Promise.all(promises);
	}

	async removeRoom(roomId: string): Promise<void> {
		const room = this.rooms.get(roomId);
		if (room) {
			for (const player of room.state.players) {
				this.userRoomMap.delete(player.userId);
				this.cancelDisconnectTimer(player.userId);
			}
			room.cleanup();
			this.rooms.delete(roomId);
		}
		this.cancelAbandonedTimer(roomId);
		this.cancelSnapshotDebounce(roomId);
		await removeTichuSnapshot(roomId).catch(e => console.error(`[Tichu] Failed to remove snapshot for ${roomId}:`, e));
	}

	getRoomCount(): number {
		return this.rooms.size;
	}
}
