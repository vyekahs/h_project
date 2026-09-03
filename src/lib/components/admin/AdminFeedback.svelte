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
</script>

<!-- 라이브 리전은 항상 DOM에 있어야 스크린리더가 변화를 읽는다 -->
<div class="toast-region" role="status" aria-live="polite">
	<!-- 최신이 아래에 오도록 쌓는다 — 새 결과가 늘 엄지 가까이에 있다 -->
	{#each $toasts as toast (toast.id)}
		<div class="toast">
			<span class="toast-text">{toast.message}</span>
			{#if toast.action}
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
		z-index: 900;
		pointer-events: none;
		width: min(28rem, calc(100vw - 2rem));
		/* 여러 개가 동시에 살아 있을 수 있으므로 세로로 쌓는다 */
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--space-2, 0.5rem);
	}
	.toast {
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
		z-index: 1200;
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
