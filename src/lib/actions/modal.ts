/**
 * 모달 접근성 공통 액션.
 *
 * 어드민의 모달들은 각자 다른 방식으로 닫기를 처리하고 있었다. 대부분은
 * 백드롭 `<div tabindex="-1">`에 `onkeydown`으로 Escape를 달았는데,
 * tabindex="-1" 요소는 포커스를 받지 못하므로 그 핸들러는 한 번도 실행되지 않는다.
 * 여기의 trapFocus를 모달 컨텐츠에 걸면 포커스 진입 / Tab 순환 / Escape /
 * 포커스 복원이 한 번에 해결된다.
 */

const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * use:trapFocus={onClose} — 모달 컨텐츠 요소에 적용한다.
 *
 * 열릴 때 포커스를 안으로 옮기고(우선 `[data-autofocus]`, 없으면 첫 포커스 대상),
 * Tab을 컨텐츠 안에 가두고, Escape로 onClose를 호출하고,
 * 닫힐 때 열기 직전의 포커스를 복원한다.
 */
export function trapFocus(node: HTMLElement, onClose?: () => void) {
	const returnTo = document.activeElement as HTMLElement | null;
	let close = onClose;

	const focusable = () =>
		Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
			(el) => el.offsetParent !== null || el === document.activeElement
		);

	// 기본 포커스는 다이얼로그 컨테이너다. 첫 컨트롤에 포커스를 주면
	// 모달을 연 클릭/키 입력이 그 컨트롤에 그대로 떨어져 같이 눌린다
	// (폰에서는 <select>가 포커스만으로 네이티브 피커를 열기도 한다).
	// 특정 컨트롤로 시작해야 하면 그 요소에 [data-autofocus]를 준다.
	queueMicrotask(() => {
		const initial = node.querySelector<HTMLElement>('[data-autofocus]') ?? node;
		initial.focus();
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			close?.();
			return;
		}
		if (e.key !== 'Tab') return;
		const items = focusable();
		if (items.length === 0) {
			e.preventDefault();
			return;
		}
		const first = items[0];
		const last = items[items.length - 1];
		const active = document.activeElement as HTMLElement;
		if (e.shiftKey && (active === first || !node.contains(active))) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && (active === last || !node.contains(active))) {
			e.preventDefault();
			first.focus();
		}
	}

	node.addEventListener('keydown', onKeydown);
	return {
		update(next?: () => void) {
			close = next;
		},
		destroy() {
			node.removeEventListener('keydown', onKeydown);
			returnTo?.focus?.();
		}
	};
}
