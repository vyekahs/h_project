<script lang="ts">
	let {
		step,
		progress,
		hint,
		onTapNext,
		onSkip
	} = $props<{
		step: {
			id: string;
			guidance: { title: string; message: string; position: 'top' | 'center' | 'bottom' };
			expectedAction: { type: string; [key: string]: any };
		};
		progress: { current: number; total: number };
		hint: string | null;
		onTapNext: () => void;
		onSkip: () => void;
	}>();

	let showSkipConfirm = $state(false);

	const progressPercent = $derived(progress.total > 0 ? (progress.current / progress.total) * 100 : 0);
	const isLastStep = $derived(progress.current >= progress.total);
	const isTapNext = $derived(step.expectedAction.type === 'tap_next');
	const isPlayCards = $derived(step.expectedAction.type === 'play_cards' || step.expectedAction.type === 'any_play');
	const isDiscardCards = $derived(step.expectedAction.type === 'discard_cards' || step.expectedAction.type === 'any_discard');
	const isUseJester = $derived(step.expectedAction.type === 'use_jester');

	function handleSkipConfirm() {
		showSkipConfirm = false;
		onSkip();
	}
</script>

<!-- tap_next: full backdrop blocks game interaction -->
<!-- interactive steps: no backdrop, game is playable -->
{#if isTapNext}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="tutorial-backdrop" onkeydown={() => {}}>
	</div>
{/if}

<div
	class="tutorial-overlay"
	class:position-top={step.guidance.position !== 'bottom'}
	class:position-bottom={step.guidance.position === 'bottom'}
>
	<div class="guide-bubble" class:reading={isTapNext}>
		<!-- Progress bar -->
		<div class="inline-progress">
			<div class="inline-progress-bar" style="width: {progressPercent}%"></div>
		</div>
		<span class="inline-progress-text">{progress.current} / {progress.total}</span>

		<!-- Title & message -->
		<h3 class="guide-title">{step.guidance.title}</h3>
		<p class="guide-message">{@html step.guidance.message}</p>

		<!-- Hint box -->
		{#if hint}
			<div class="hint-box">
				<span class="hint-icon">⚠️</span>
				<span class="hint-text">{hint}</span>
			</div>
		{/if}

		<!-- Actions -->
		<div class="guide-actions">
			{#if isTapNext}
				<button class="btn-next" onclick={onTapNext}>
					{isLastStep ? '시작하기!' : '다음'}
				</button>
			{:else if isPlayCards}
				<div class="action-indicator">
					<span class="action-dot"></span>
					<span>하이라이트된 카드를 선택 후 플레이</span>
				</div>
			{:else if isDiscardCards}
				<div class="action-indicator">
					<span class="action-dot"></span>
					<span>카드를 선택해서 버리세요</span>
				</div>
			{:else if isUseJester}
				<div class="action-indicator">
					<span class="action-dot"></span>
					<span>광대를 사용하세요</span>
				</div>
			{/if}

			<button class="btn-skip" onclick={() => { showSkipConfirm = true; }}>
				건너뛰기
			</button>
		</div>
	</div>
</div>

<!-- Skip confirm modal -->
{#if showSkipConfirm}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="skip-confirm-overlay" onkeydown={(e) => e.key === 'Escape' && (showSkipConfirm = false)}>
		<div class="skip-confirm-modal">
			<p>튜토리얼을 건너뛸까요?</p>
			<div class="skip-confirm-actions">
				<button class="skip-btn cancel" onclick={() => { showSkipConfirm = false; }}>
					계속
				</button>
				<button class="skip-btn confirm" onclick={handleSkipConfirm}>
					건너뛰기
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* ─── Full-screen backdrop for tap_next (blocks game) ─── */
	.tutorial-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.45);
		z-index: 999;
		-webkit-tap-highlight-color: transparent;
	}

	/* ─── Overlay container ─── */
	.tutorial-overlay {
		position: fixed;
		left: 0;
		right: 0;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0 12px;
		pointer-events: none;
	}

	.tutorial-overlay.position-top {
		top: 48px;
		top: calc(48px + env(safe-area-inset-top, 0px));
	}
	.tutorial-overlay.position-bottom {
		bottom: 0;
		top: auto;
		padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
	}

	/* ─── Guide bubble ─── */
	.guide-bubble {
		max-width: 340px;
		width: 100%;
		background: rgba(15, 23, 42, 0.95);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		padding: 16px 20px;
		color: #f3f4f6;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
		pointer-events: auto;
		animation: bubbleIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.guide-bubble.reading {
		border-color: rgba(251, 191, 36, 0.3);
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5), 0 0 20px rgba(251, 191, 36, 0.08);
	}

	@keyframes bubbleIn {
		from { opacity: 0; transform: translateY(8px) scale(0.96); }
		to { opacity: 1; transform: translateY(0) scale(1); }
	}

	/* ─── Progress ─── */
	.inline-progress {
		width: 100%;
		height: 3px;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 2px;
		margin-bottom: 4px;
		overflow: hidden;
	}
	.inline-progress-bar {
		height: 100%;
		background: #fbbf24;
		transition: width 0.4s ease;
		border-radius: 2px;
	}
	.inline-progress-text {
		display: block;
		font-size: 11px;
		color: #64748b;
		font-weight: 600;
		text-align: right;
		margin-bottom: 10px;
		font-variant-numeric: tabular-nums;
	}

	/* ─── Content ─── */
	.guide-title {
		margin: 0 0 6px;
		font-size: 1rem;
		font-weight: 800;
		color: #fbbf24;
		letter-spacing: -0.01em;
	}
	.guide-message {
		margin: 0 0 14px;
		font-size: 0.85rem;
		line-height: 1.6;
		color: #d1d5db;
		word-break: keep-all;
	}
	.guide-message :global(b),
	.guide-message :global(strong) {
		color: #f3f4f6;
		font-weight: 700;
	}

	/* ─── Hint box ─── */
	.hint-box {
		display: flex;
		align-items: center;
		gap: 6px;
		background: rgba(239, 68, 68, 0.12);
		border: 1px solid rgba(239, 68, 68, 0.25);
		border-radius: 10px;
		padding: 8px 12px;
		margin-bottom: 12px;
	}
	.hint-icon { flex-shrink: 0; font-size: 14px; }
	.hint-text {
		font-size: 0.8rem;
		line-height: 1.4;
		color: #fca5a5;
		word-break: keep-all;
	}

	/* ─── Actions ─── */
	.guide-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.btn-next {
		flex: 1;
		padding: 14px 0;
		border-radius: 12px;
		border: none;
		background: #fbbf24;
		color: #1e293b;
		font-weight: 800;
		font-size: 0.95rem;
		cursor: pointer;
		transition: all 0.15s;
		-webkit-tap-highlight-color: transparent;
	}
	.btn-next:active {
		transform: scale(0.97);
		background: #f59e0b;
	}

	.action-indicator {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 10px 0;
		color: #94a3b8;
		font-size: 0.8rem;
		font-weight: 600;
	}

	.action-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #fbbf24;
		animation: dotPulse 1.2s ease-in-out infinite;
		flex-shrink: 0;
	}
	@keyframes dotPulse {
		0%, 100% { opacity: 0.4; transform: scale(0.8); }
		50% { opacity: 1; transform: scale(1.3); }
	}

	.btn-skip {
		padding: 10px 14px;
		border-radius: 10px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: transparent;
		color: #64748b;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		white-space: nowrap;
	}
	.btn-skip:active {
		background: rgba(255, 255, 255, 0.08);
	}

	/* ─── Skip confirm ─── */
	.skip-confirm-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
	}
	.skip-confirm-modal {
		background: rgba(30, 41, 59, 0.95);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		padding: 24px;
		text-align: center;
		color: #f3f4f6;
		width: calc(100% - 48px);
		max-width: 280px;
		animation: bubbleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
	}
	.skip-confirm-modal p {
		margin: 0 0 20px;
		font-size: 0.9rem;
		color: #d1d5db;
		line-height: 1.5;
	}
	.skip-confirm-actions {
		display: flex;
		gap: 8px;
	}
	.skip-btn {
		flex: 1;
		padding: 12px 0;
		border-radius: 12px;
		border: none;
		font-size: 0.9rem;
		font-weight: 700;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	.skip-btn.cancel {
		background: rgba(255, 255, 255, 0.1);
		color: #e5e7eb;
	}
	.skip-btn.cancel:active {
		background: rgba(255, 255, 255, 0.18);
	}
	.skip-btn.confirm {
		background: #ef4444;
		color: #fff;
	}
	.skip-btn.confirm:active {
		background: #dc2626;
	}
</style>
