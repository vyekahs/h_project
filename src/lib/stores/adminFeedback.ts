/**
 * 어드민 공용 결과 알림.
 *
 * 성공은 흐름을 막지 않는 토스트로, 실패는 멈춰 세우는 모달로 알린다.
 * 게임 도감처럼 피드백 표면이 아예 없던 화면들이 같은 규칙을 쓰게 하려고
 * 컴포넌트 밖으로 뺐다. 스토어라서 룬/비룬 컴포넌트 양쪽에서 동작한다.
 */
import { writable } from 'svelte/store';

export type AlertKind = 'error' | 'success' | 'info';

export const toastMessage = writable('');
export const alertMessage = writable('');
export const alertKind = writable<AlertKind>('error');

let toastTimer: ReturnType<typeof setTimeout> | null = null;

/** 지나가도 되는 결과 */
export function showToast(message: string) {
	toastMessage.set(message);
	if (toastTimer) clearTimeout(toastTimer);
	toastTimer = setTimeout(() => toastMessage.set(''), 4500);
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
