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

/**
 * 지금 알림 SSE에 붙어 있는 사용자.
 *
 * 앱을 보고 있는 사람에게 웹푸시까지 보내면 인앱 알림과 잠금화면 알림이 같이
 * 울린다. 같은 내용을 두 번 받는 셈이라 성가시다.
 *
 * 탭을 여러 개 열 수 있으므로 개수를 센다. 하나만 닫혔다고 연결이 끊긴 것으로
 * 보면, 남은 탭에서 보고 있는데 푸시가 다시 울린다.
 *
 * 블루/그린으로 두 인스턴스가 뜨는 동안에는 서로의 연결을 모른다. 다만 평상시
 * 트래픽은 한 슬롯만 받으므로 실질적인 문제가 되지 않는다.
 */
if ((globalThis as any).__sseUserCounts === undefined) {
	(globalThis as any).__sseUserCounts = new Map<number, number>();
}

function sseUserCounts(): Map<number, number> {
	return (globalThis as any).__sseUserCounts;
}

export function addSseUser(userId: number) {
	const m = sseUserCounts();
	m.set(userId, (m.get(userId) ?? 0) + 1);
}

export function removeSseUser(userId: number) {
	const m = sseUserCounts();
	const next = (m.get(userId) ?? 0) - 1;
	if (next <= 0) m.delete(userId);
	else m.set(userId, next);
}

/** 이 사용자가 지금 앱을 열어두고 있는가(알림 SSE 연결이 살아 있는가). */
export function hasActiveSse(userId: number): boolean {
	return (sseUserCounts().get(userId) ?? 0) > 0;
}
