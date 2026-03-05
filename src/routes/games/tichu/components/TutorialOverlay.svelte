<script lang="ts">
	import type { createTichuGameState } from '../gameState.svelte';

	interface Props {
		game: ReturnType<typeof createTichuGameState>;
	}

	const { game }: Props = $props();

	const step = $derived(game.tutorialStep);
	const stepIndex = $derived(game.tutorialStepIndex);
	const totalSteps = $derived(game.tutorialTotalSteps);
	const progress = $derived(totalSteps > 0 ? ((stepIndex + 1) / totalSteps) * 100 : 0);

	const isTapNext = $derived(step?.expectedAction.type === 'tap_next');
	const isWait = $derived(step?.expectedAction.type === 'wait');
	const isSetWish = $derived(step?.expectedAction.type === 'set_wish');
	const isGrandTichu = $derived(step?.expectedAction.type === 'declare_grand_tichu' || step?.expectedAction.type === 'pass_grand_tichu');

	let showExitConfirm = $state(false);
</script>

{#if step}
	<div class="tutorial-overlay" class:position-top={step.guidance.position === 'top' || isGrandTichu} class:position-center={step.guidance.position === 'center' && !isGrandTichu} class:position-bottom={step.guidance.position === 'bottom' && !isGrandTichu}>
		<!-- Guide bubble -->
		<div class="guide-bubble">
			<div class="inline-progress">
				<div class="inline-progress-bar" style="width: {progress}%"></div>
			</div>
			<span class="inline-progress-text">{stepIndex + 1} / {totalSteps}</span>

			<h3 class="guide-title">{step.guidance.title}</h3>
			<p class="guide-message">{step.guidance.message}</p>

			<div class="guide-actions">
				{#if isTapNext}
					<button class="btn-next" onclick={() => game.tutorialTapNext()}>
						{stepIndex >= totalSteps - 1 ? '완료' : '다음'}
					</button>
				{:else if isSetWish || isGrandTichu}
					<div class="wait-indicator">
						<span class="dot-pulse"></span>
						아래에서 선택하세요
					</div>
				{:else if isWait}
					<div class="wait-indicator">
						<span class="dot-pulse"></span>
						진행 중...
					</div>
				{/if}

				<button class="btn-exit" onclick={() => { showExitConfirm = true; }}>
					나가기
				</button>
			</div>
		</div>
	</div>
{/if}

{#if showExitConfirm}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="exit-confirm-overlay" onkeydown={(e) => e.key === 'Escape' && (showExitConfirm = false)}>
		<div class="exit-confirm-modal">
			<h3>튜토리얼 종료</h3>
			<p>진행 중인 튜토리얼을 종료하시겠습니까?</p>
			<div class="exit-confirm-actions">
				<button class="exit-btn cancel" onclick={() => { showExitConfirm = false; }}>
					계속하기
				</button>
				<button class="exit-btn confirm" onclick={() => { showExitConfirm = false; game.exitTutorial(); }}>
					종료
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.tutorial-overlay {
		position: fixed;
		left: 0;
		right: 0;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0 16px;
		pointer-events: none;
	}

	.tutorial-overlay.position-top {
		top: calc(60px + env(safe-area-inset-top, 0px));
	}
	.tutorial-overlay.position-center {
		top: 50%;
		transform: translateY(-50%);
	}
	.tutorial-overlay.position-bottom {
		bottom: calc(240px + env(safe-area-inset-bottom, 0px));
	}

	.guide-bubble {
		max-width: 340px;
		width: 100%;
		background: rgba(15, 23, 42, 0.88);
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		border: 1px solid rgba(251, 191, 36, 0.3);
		border-radius: 24px;
		padding: 20px 24px;
		color: #f3f4f6;
		box-shadow:
			0 20px 50px rgba(0, 0, 0, 0.5),
			0 0 30px rgba(251, 191, 36, 0.1),
			inset 0 1px 0 rgba(255, 255, 255, 0.1);
		animation: bubbleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
		pointer-events: auto;
	}

	@keyframes bubbleIn {
		from { opacity: 0; transform: scale(0.92) translateY(8px); }
		to { opacity: 1; transform: scale(1) translateY(0); }
	}

	/* 가운데 모달 내부 진행바 */
	.inline-progress {
		width: 100%;
		height: 3px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 2px;
		margin-bottom: 4px;
		overflow: hidden;
	}
	.inline-progress-bar {
		height: 100%;
		background: linear-gradient(90deg, #fbbf24, #f59e0b);
		transition: width 0.4s ease;
		border-radius: 2px;
	}
	.inline-progress-text {
		display: block;
		font-size: 0.7rem;
		color: #94a3b8;
		font-weight: 600;
		text-align: right;
		margin-bottom: 12px;
	}

	.guide-title {
		margin: 0 0 8px;
		font-size: 1.05rem;
		font-weight: 800;
		color: #fbbf24;
		letter-spacing: -0.02em;
	}

	.guide-message {
		margin: 0 0 16px;
		font-size: 0.88rem;
		line-height: 1.5;
		color: #d1d5db;
		word-break: keep-all;
	}

	.guide-actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.btn-next {
		flex: 1;
		padding: 12px 0;
		border-radius: 14px;
		border: none;
		background: linear-gradient(135deg, #fbbf24, #d97706);
		color: #fff;
		font-weight: 700;
		font-size: 0.95rem;
		cursor: pointer;
		transition: all 0.2s;
		box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3);
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
	}
	.btn-next:active {
		transform: scale(0.97);
	}

	.wait-indicator {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 12px 0;
		color: #94a3b8;
		font-size: 0.85rem;
		font-weight: 600;
	}

	.dot-pulse {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #fbbf24;
		animation: dotPulse 1.2s ease-in-out infinite;
	}
	@keyframes dotPulse {
		0%, 100% { opacity: 0.3; transform: scale(0.8); }
		50% { opacity: 1; transform: scale(1.2); }
	}

	.btn-exit {
		padding: 12px 16px;
		border-radius: 14px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		background: rgba(255, 255, 255, 0.08);
		color: #94a3b8;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}
	.btn-exit:active {
		background: rgba(255, 255, 255, 0.15);
	}

	/* Exit Confirm */
	.exit-confirm-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(5px);
		-webkit-backdrop-filter: blur(5px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
	}
	.exit-confirm-modal {
		background: rgba(30, 41, 59, 0.9);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 24px;
		padding: 28px 32px;
		text-align: center;
		color: #f3f4f6;
		min-width: 260px;
		max-width: 320px;
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
		animation: bubbleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
	}
	.exit-confirm-modal h3 {
		margin: 0 0 8px;
		font-size: 1.15rem;
		font-weight: 700;
	}
	.exit-confirm-modal p {
		margin: 0 0 24px;
		font-size: 0.85rem;
		color: #9ca3af;
		line-height: 1.4;
	}
	.exit-confirm-actions {
		display: flex;
		gap: 10px;
	}
	.exit-btn {
		flex: 1;
		padding: 12px 0;
		border-radius: 14px;
		border: none;
		font-size: 0.95rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.2s;
	}
	.exit-btn.cancel {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: #e5e7eb;
	}
	.exit-btn.cancel:active {
		background: rgba(255, 255, 255, 0.2);
		transform: scale(0.97);
	}
	.exit-btn.confirm {
		background: linear-gradient(135deg, #dc2626, #b91c1c);
		color: #fff;
		box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
	}
	.exit-btn.confirm:active {
		transform: scale(0.97);
	}
</style>
