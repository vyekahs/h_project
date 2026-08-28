import { EventEmitter } from 'events';

export function getLiveEmitter(): EventEmitter {
	if (!(globalThis as any).__liveEmitter) {
		(globalThis as any).__liveEmitter = new EventEmitter();
		(globalThis as any).__liveEmitter.setMaxListeners(100);
	}
	return (globalThis as any).__liveEmitter;
}

export function emitLiveEvent(type: 'visitors' | 'games') {
	getLiveEmitter().emit('change', type);
}

export function emitNotification(userId: number, data: { type: string; title: string; body: string; url?: string }) {
	getLiveEmitter().emit('notification', { userId, ...data });
}

export function emitPartyChatMessage(userId: number, data: { partyId: number; comment: any }) {
	getLiveEmitter().emit('party_chat', { userId, ...data });
}

export function emitWtpChatMessage(userId: number, data: { wtpId: number; comment: any }) {
	getLiveEmitter().emit('wtp_chat', { userId, ...data });
}

// SSE connection counter
if ((globalThis as any).__sseConnectionCount === undefined) {
	(globalThis as any).__sseConnectionCount = 0;
}

export function incrementSSECount() {
	(globalThis as any).__sseConnectionCount++;
}

export function decrementSSECount() {
	(globalThis as any).__sseConnectionCount = Math.max(0, (globalThis as any).__sseConnectionCount - 1);
}

export function getSSEConnectionCount(): number {
	return (globalThis as any).__sseConnectionCount || 0;
}
