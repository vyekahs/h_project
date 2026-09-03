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

export const toastMessage = writable('');
/** 토스트에 실리는 단일 행동(주로 되돌리기). 없으면 null. */
export const toastAction = writable<ToastAction | null>(null);
export const alertMessage = writable('');
export const alertKind = writable<AlertKind>('error');

let toastTimer: ReturnType<typeof setTimeout> | null = null;

const PLAIN_MS = 4500;
/**
 * 되돌리기가 달린 토스트는 훨씬 오래 남는다.
 * 서버의 되돌리기 창은 10분(UNDO_WINDOW_MS)인데 그걸 담은 유일한 표면이
 * 9초만 살아서, UI가 서버가 주는 여유를 버리고 있었다. 실수를 알아차리는
 * 데는 보통 그 자리를 떠난 뒤가 걸린다.
 */
const ACTION_MS = 30000;

/**
 * 지나가도 되는 결과.
 *
 * action을 주면 토스트가 그 행동을 함께 싣는다. 되돌릴 수 있는 조치를
 * 알릴 때 쓴다 — 결과를 알리는 자리와 무르는 자리가 같아야 실제로 눌린다.
 */
export function showToast(message: string, action: ToastAction | null = null) {
	toastMessage.set(message);
	toastAction.set(action);
	if (toastTimer) clearTimeout(toastTimer);
	toastTimer = setTimeout(() => {
		toastMessage.set('');
		toastAction.set(null);
	}, action ? ACTION_MS : PLAIN_MS);
}

/** 되돌리기를 누른 뒤처럼, 토스트를 즉시 거둬야 할 때 */
export function dismissToast() {
	if (toastTimer) clearTimeout(toastTimer);
	toastMessage.set('');
	toastAction.set(null);
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
