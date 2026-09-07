/**
 * 어드민 공용 결과 알림.
 *
 * 성공은 흐름을 막지 않는 토스트로, 실패는 멈춰 세우는 모달로 알린다.
 * 게임 도감처럼 피드백 표면이 아예 없던 화면들이 같은 규칙을 쓰게 하려고
 * 컴포넌트 밖으로 뺐다. 스토어라서 룬/비룬 컴포넌트 양쪽에서 동작한다.
 */
import { writable } from 'svelte/store';

export type AlertKind = 'error' | 'success' | 'info';

export type ToastAction = { label: string; run: () => void };

export type Toast = { id: number; message: string; action: ToastAction | null };

/**
 * 토스트 스택.
 *
 * 예전에는 슬롯이 하나였다. 그래서 두 번째 showToast가 첫 메시지와 첫
 * 되돌리기를 함께 파괴했다 — 만료된 게임 두 판을 연달아 정리하면(실제로
 * 흔한 장면이다) 첫 되돌리기는 읽히기도 전에 사라졌다. 이제 쌓인다.
 */
export const toasts = writable<Toast[]>([]);
export const alertMessage = writable('');
export const alertKind = writable<AlertKind>('error');

/** 한 번에 보이는 최대 개수. 넘치면 평문 토스트부터 밀어낸다. */
const MAX_TOASTS = 3;

const PLAIN_MS = 4500;
/**
 * 되돌리기가 달린 토스트는 훨씬 오래 남는다.
 * 서버의 되돌리기 창은 10분(UNDO_WINDOW_MS)인데 그걸 담은 유일한 표면이
 * 9초만 살아서, UI가 서버가 주는 여유를 버리고 있었다. 실수를 알아차리는
 * 데는 보통 그 자리를 떠난 뒤가 걸린다. 나머지 여유는 「최근 조치」 패널이
 * 이어받는다 — 30초 뒤에도 10분 창이 끝날 때까지 거기서 되돌린다.
 */
const ACTION_MS = 30000;

let seq = 0;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function clearTimer(id: number) {
	const t = timers.get(id);
	if (t) clearTimeout(t);
	timers.delete(id);
}

/**
 * 지나가도 되는 결과.
 *
 * action을 주면 토스트가 그 행동을 함께 싣는다. 되돌릴 수 있는 조치를
 * 알릴 때 쓴다 — 결과를 알리는 자리와 무르는 자리가 같아야 실제로 눌린다.
 *
 * @returns 이 토스트의 id. 개별로 거둘 때 쓴다.
 */
export function showToast(message: string, action: ToastAction | null = null) {
	const id = ++seq;
	toasts.update((list) => {
		const next = [...list, { id, message, action }];
		// 되돌리기가 달린 토스트는 밀려나지 않는다. 그것을 밀어내는 것은
		// 알림을 지우는 게 아니라 운영자가 가진 유일한 취소권을 지우는 것이다.
		while (next.length > MAX_TOASTS) {
			const i = next.findIndex((t) => !t.action);
			if (i === -1) break;
			clearTimer(next[i].id);
			next.splice(i, 1);
		}
		return next;
	});
	timers.set(
		id,
		setTimeout(() => dismissToast(id), action ? ACTION_MS : PLAIN_MS)
	);
	return id;
}

/**
 * 되돌리기를 누른 뒤처럼, 토스트를 즉시 거둬야 할 때.
 * id를 주면 그 하나만, 없으면 전부 거둔다.
 */
export function dismissToast(id?: number) {
	if (id === undefined) {
		timers.forEach((t) => clearTimeout(t));
		timers.clear();
		toasts.set([]);
		return;
	}
	clearTimer(id);
	toasts.update((list) => list.filter((t) => t.id !== id));
}

/**
 * 멈춰 세워야 하는 결과.
 * 기본은 실패지만, 페널티가 임계에 닿는 것처럼 "성공했으나 반드시 읽어야 하는"
 * 순간도 있어 kind로 구분한다.
 */
export function showAlert(message: string, kind: AlertKind = 'error') {
	alertKind.set(kind);
	alertMessage.set(message);
}

export function dismissAlert() {
	alertMessage.set('');
}

/**
 * use:enhance 결과에서 실패(failure)와 전송/HTTP 에러(error)를 모두 노출한다.
 * 성공이면 ok 문구를 토스트로 띄운다. 조용히 끝나는 폼이 없게 하는 것이 목적.
 *
 * @returns 문제가 있었으면 true
 */
export function reportResult(
	result: any,
	ok?: string,
	fallback = '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.'
): boolean {
	if (result?.type === 'failure') {
		showAlert(result.data?.error || fallback);
		return true;
	}
	if (result?.type === 'error') {
		showAlert(result.error?.message || fallback);
		return true;
	}
	if (ok) showToast(ok);
	return false;
}

/**
 * 최근 되돌릴 수 있는 조치.
 *
 * 서버의 되돌리기 창은 10분인데 그것을 담은 표면이 30초짜리 토스트뿐이었다.
 * 토스트가 사라진 뒤 실수를 알아차리면 되돌릴 길이 없었다 — 서버는 아직
 * 받아주는데도. 여기가 그 나머지 9분 반이다.
 */
export type RecentAction = { id: number; label: string; at: number; run: () => Promise<void> | void };

/** 서버 UNDO_WINDOW_MS와 같은 값. 여기가 더 길면 화면이 못 지킬 약속을 한다. */
export const UNDO_WINDOW_MS = 10 * 60 * 1000;

export const recentActions = writable<RecentAction[]>([]);

export function rememberAction(action: Omit<RecentAction, 'id' | 'at'>) {
	const id = ++seq;
	recentActions.update((list) => [{ ...action, id, at: Date.now() }, ...list].slice(0, 10));
	return id;
}

/** 되돌렸거나 창이 지난 조치를 목록에서 뺀다 */
export function forgetAction(id: number) {
	recentActions.update((list) => list.filter((a) => a.id !== id));
}

/** 10분이 지난 것은 서버가 이미 거절한다. 화면도 같은 시각을 본다. */
export function pruneActions(now = Date.now()) {
	recentActions.update((list) => list.filter((a) => now - a.at < UNDO_WINDOW_MS));
}
