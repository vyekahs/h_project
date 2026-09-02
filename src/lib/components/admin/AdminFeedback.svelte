<script lang="ts">
	/**
	 * 어드민 전역 결과 알림 표면. 레이아웃에 한 번만 놓으면 모든 어드민 화면이
	 * showToast / showAlert 로 결과를 알릴 수 있다.
	 */
	import { toastMessage, alertMessage, dismissAlert } from '$lib/stores/adminFeedback';
	import { trapFocus } from '$lib/actions/modal';
</script>

<!-- 라이브 리전은 항상 DOM에 있어야 스크린리더가 변화를 읽는다 -->
<div class="toast-region" role="status" aria-live="polite">
	{#if $toastMessage}
		<div class="toast">{$toastMessage}</div>
	{/if}
</div>

{#if $alertMessage}
	<!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 Escape(trapFocus)와 확인 버튼이 담당한다. -->
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="alert-backdrop" on:click={dismissAlert} role="presentation">
		<div
			class="alert-card"
			use:trapFocus={dismissAlert}
			on:click|stopPropagation
			on:keydown|stopPropagation
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="admin-alert-title"
			tabindex="-1"
		>
			<h3 id="admin-alert-title">문제가 발생했어요</h3>
			<p>{$alertMessage}</p>
			<div class="alert-actions">
				<button type="button" class="alert-confirm" data-autofocus on:click={dismissAlert}>확인</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.toast-region {
		position: fixed;
		left: 50%;
		bottom: var(--space-5, 1.5rem);
		transform: translateX(-50%);
		z-index: 900;
		pointer-events: none;
		width: min(28rem, calc(100vw - 2rem));
		display: flex;
		justify-content: center;
	}
	.toast {
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
