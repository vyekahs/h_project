<script lang="ts">
	/**
	 * 어드민 전역 결과 알림 표면. 레이아웃에 한 번만 놓으면 모든 어드민 화면이
	 * showToast / showAlert 로 결과를 알릴 수 있다.
	 */
	import {
		toasts,
		alertMessage,
		alertKind,
		dismissAlert,
		dismissToast
	} from '$lib/stores/adminFeedback';
	import { trapFocus } from '$lib/actions/modal';

	/*
		최신이 맨 앞. 예전에는 세로로 나란히 쌓아서 셋이 동시에 살아 있으면
		화면 아래 절반을 덮었다 — 폰에서는 알림이 아니라 가림막이었다.
		이제 한 장만 온전히 보이고 나머지는 뒤에 겹쳐 선다.
	*/
	const stacked = $derived([...$toasts].reverse());
</script>

<!-- 라이브 리전은 항상 DOM에 있어야 스크린리더가 변화를 읽는다 -->
<div class="toast-region" role="status" aria-live="polite">
	<!--
		맨 앞 한 장만 읽히고 눌린다. 뒤에 선 것들은 「아직 더 있다」를 모서리로만
		말한다 — 화면을 가리지 않으면서 사라지지 않았다는 것은 보여야 한다.
	-->
	{#each stacked as toast, depth (toast.id)}
		<div
			class="toast"
			class:is-front={depth === 0}
			style="--depth: {depth}"
			aria-hidden={depth === 0 ? undefined : 'true'}
		>
			<span class="toast-text">{toast.message}</span>
			{#if toast.action && depth === 0}
				<!-- 되돌리기는 결과를 알리는 그 자리에 있어야 눌린다 -->
				<button
					type="button"
					class="toast-action"
					onclick={() => {
						const act = toast.action;
						dismissToast(toast.id);
						act?.run();
					}}>{toast.action.label}</button
				>
			{/if}
			<!--
				되돌리기가 달린 토스트는 30초를 산다. 무를 생각이 없는데 30초를
				기다려야 하면, 알림이 아니라 방해다. 읽었으면 치울 수 있어야 한다.
			-->
			<button
				type="button"
				class="toast-close"
				tabindex={depth === 0 ? undefined : -1}
				onclick={() => dismissToast(toast.id)}
				aria-label="알림 닫기{toast.action ? ` — ${toast.message}` : ''}"
			><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
		</div>
	{/each}
</div>

{#if $alertMessage}
	<!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 Escape(trapFocus)와 확인 버튼이 담당한다. -->
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="alert-backdrop" onclick={dismissAlert} role="presentation">
		<div
			class="alert-card alert-{$alertKind}"
			use:trapFocus={dismissAlert}
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="admin-alert-title"
			tabindex="-1"
		>
			<h3 id="admin-alert-title">
				{$alertKind === 'success' ? '완료' : $alertKind === 'info' ? '알림' : '문제가 발생했어요'}
			</h3>
			<p>{$alertMessage}</p>
			<div class="alert-actions">
				<button type="button" class="alert-confirm" data-autofocus onclick={dismissAlert}>확인</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.toast-region {
		position: fixed;
		left: 50%;
		/* 폰에는 고정 탭 바가 있고 되돌리기 토스트는 30초 산다. 그 위로 띄우지
		   않으면 반 분 동안 이동이 막힌다. --admin-bottom-inset 은 어드민
		   레이아웃이 채운다(데스크톱 0, 폰 탭 바 + 안전 영역). */
		bottom: calc(var(--space-5, 1.5rem) + var(--admin-bottom-inset, 0px));
		transform: translateX(-50%);
		/*
			모달 백드롭(1000)과 확인 모달(1100) 위에 선다. 900이었을 때는
			페널티를 준 직후 — 관리 시트가 아직 열려 있는 상태 — 에 토스트가
			백드롭 아래로 깔려, 되돌리기 버튼이 보이기는 하는데 눌리지 않았다.
			이 콘솔에서 가장 자주 되돌리는 조치가 정확히 그 경로다.
		*/
		z-index: 1200;
		pointer-events: none;
		width: min(28rem, calc(100vw - 2rem));
		/*
			높이를 갖지 않는다. 카드들이 이 선에 바닥을 맞추고 위로 겹쳐 자라므로,
			몇 장이 살아 있든 화면에서 차지하는 자리는 한 장 높이다.
		*/
		height: 0;
	}
	.toast {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		/* 뒤로 갈수록 조금 올라가고 조금 작아진다 — 모서리만 남는다 */
		transform: translateY(calc(var(--depth) * -7px)) scale(calc(1 - var(--depth) * 0.04));
		z-index: calc(10 - var(--depth));
		display: flex;
		align-items: center;
		gap: var(--space-3, 0.75rem);
		pointer-events: auto;
		background: var(--text-darker, #555);
		color: var(--bg-primary, #fff);
		padding: 0.7rem 1.1rem;
		border-radius: var(--radius-control, 6px);
		font-size: var(--text-sm, 0.875rem);
		line-height: 1.45;
		text-align: center;
		box-shadow: var(--shadow-lg, 0 10px 25px rgba(0, 0, 0, 0.15));
		word-break: keep-all;
		overflow-wrap: anywhere;
	}
	/* 맨 앞 한 장만 누를 수 있다. 뒤의 것을 잘못 눌러 엉뚱한 알림이 닫히면 안 된다. */
	.toast:not(.is-front) {
		pointer-events: none;
	}
	.toast:not(.is-front) .toast-close {
		visibility: hidden;
	}
	.toast-text {
		flex: 1;
		min-width: 0;
		text-align: left;
	}
	/* 어두운 토스트 위에서 읽혀야 하므로 흰 테두리로 세운다 (#fff on #555 = 7.5:1) */
	/* 토스트는 어두운 표면이라 밝은 표면용 포커스 링(#111827)이 2.38:1로 묻힌다.
	   사이드바와 같은 어두운 표면용 링을 쓴다. */
	.toast-action:focus-visible {
		outline-color: var(--focus-ring-on-dark, #9ec5fe);
	}
	/* 실수를 무르는 버튼이 페이지에서 가장 작은 축에 들면 안 된다 (74.5x32였다) */
	.toast-action {
		flex-shrink: 0;
		min-height: 44px;
		padding: 0 var(--space-3, 0.75rem);
		border: 1px solid var(--bg-primary, #fff);
		border-radius: var(--radius-control, 6px);
		background: none;
		color: var(--bg-primary, #fff);
		font-size: var(--text-sm, 0.875rem);
		font-weight: var(--weight-medium, 600);
		white-space: nowrap;
		cursor: pointer;
	}
	.toast-close {
		flex: 0 0 auto;
		min-width: 44px;
		min-height: 44px;
		padding: 0;
		border: 1px solid transparent;
		border-radius: var(--radius-control, 6px);
		background: none;
		color: inherit;
		opacity: 0.7;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.toast-close:hover {
		opacity: 1;
		background: rgba(255, 255, 255, 0.16);
	}
	.toast-action:hover {
		background: rgba(255, 255, 255, 0.16);
	}
	.alert-backdrop {
		position: fixed;
		inset: 0;
		background: var(--overlay-heavy, rgba(0, 0, 0, 0.5));
		display: flex;
		align-items: center;
		justify-content: center;
		/* 토스트도 1200이 됐다. 같은 값이면 DOM 순서가 이기는데, 멈춰 세우는
		   알림이 지나가는 토스트에 가리는 일은 순서에 맡길 문제가 아니다. */
		z-index: 1300;
		padding: var(--space-4, 1rem);
	}
	.alert-card {
		background: var(--bg-primary, #fff);
		border-radius: var(--radius-card, 12px);
		padding: var(--space-5, 1.5rem);
		width: 100%;
		max-width: 380px;
	}
	.alert-card h3 {
		margin: 0 0 var(--space-2, 0.5rem);
		font-size: var(--text-lg, 1.25rem);
		color: var(--color-red-dark, #d32f2f);
	}
	.alert-card.alert-success h3 {
		color: var(--color-green-dark, #2b8a3e);
	}
	.alert-card.alert-info h3 {
		color: var(--text-primary, #333);
	}
	.alert-card p {
		margin: 0 0 var(--space-4, 1rem);
		font-size: var(--text-sm, 0.875rem);
		color: var(--text-primary, #333);
		line-height: 1.6;
	}
	.alert-actions {
		display: flex;
		justify-content: flex-end;
	}
	.alert-confirm {
		min-height: 44px;
		padding: 0 var(--space-4, 1rem);
		border: none;
		border-radius: var(--radius-control, 6px);
		background: var(--color-blue-bright, #0b5ed7);
		color: #fff;
		font-size: var(--text-sm, 0.875rem);
		font-weight: var(--weight-medium, 600);
		cursor: pointer;
	}
</style>
