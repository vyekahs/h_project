<script lang="ts">
	let {
		jestersRemaining,
		jestersUsed,
		canUse,
		onFlip
	}: {
		jestersRemaining: number;
		jestersUsed: number;
		canUse: boolean;
		onFlip: () => void;
	} = $props();

	let showConfirm = $state(false);

	function handleTap() {
		if (!canUse || jestersRemaining <= 0) return;
		showConfirm = true;
	}

	function confirmUse() {
		showConfirm = false;
		onFlip();
	}

	function cancelUse() {
		showConfirm = false;
	}

	const total = $derived(jestersRemaining + jestersUsed);
</script>

<div class="jester-panel">
	<div class="jester-tokens">
		<span class="jester-label">광대</span>
		<div class="tokens">
			{#each Array(total) as _, i}
				<div
					class="token"
					class:available={i < jestersRemaining}
					class:used={i >= jestersRemaining}
				>
					{#if i < jestersRemaining}
						<span class="token-icon">&#x1F0CF;</span>
					{:else}
						<span class="token-icon used-icon">&#x1F0CF;</span>
					{/if}
				</div>
			{/each}
		</div>
	</div>

	<button
		class="jester-btn"
		disabled={!canUse || jestersRemaining <= 0}
		onclick={handleTap}
	>
		사용
	</button>

	{#if showConfirm}
		<div class="confirm-backdrop" role="presentation" onclick={cancelUse}>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="confirm-popover" onclick={(e) => e.stopPropagation()}>
				<p>광대를 사용하시겠습니까?<br /><span class="hint">현재 핸드를 버리고 8장을 새로 뽑습니다</span></p>
				<div class="confirm-actions">
					<button class="btn-cancel" onclick={cancelUse}>취소</button>
					<button class="btn-ok" onclick={confirmUse}>사용</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.jester-panel {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: var(--bg-surface);
		border: 1px solid var(--border-primary);
		border-radius: 12px;
		padding: 0.4rem 0.6rem;
		position: relative;
		flex-shrink: 0;
	}

	.jester-tokens {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.jester-label {
		font-size: 0.7rem;
		font-weight: 600;
		color: #7c3aed;
		white-space: nowrap;
	}

	.tokens {
		display: flex;
		gap: 0.2rem;
	}

	.token {
		width: 24px;
		height: 24px;
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.9rem;
		transition: opacity 0.2s;
	}

	.token.available {
		background: rgba(124, 58, 237, 0.12);
	}

	.token.used {
		background: var(--bg-tertiary);
		opacity: 0.4;
	}

	.token-icon {
		line-height: 1;
	}

	.used-icon {
		filter: grayscale(1);
	}

	.jester-btn {
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.3rem 0.6rem;
		border: none;
		border-radius: 8px;
		background: #7c3aed;
		color: white;
		cursor: pointer;
		transition: all 0.15s;
		white-space: nowrap;
	}

	.jester-btn:disabled {
		background: var(--bg-tertiary);
		color: var(--text-tertiary);
		cursor: default;
	}

	.jester-btn:not(:disabled):active {
		transform: scale(0.95);
	}

	/* Confirm popover */
	.confirm-backdrop {
		position: fixed;
		inset: 0;
		z-index: 200;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.5);
	}

	.confirm-popover {
		background: var(--bg-primary);
		border: 1px solid var(--border-primary);
		border-radius: 16px;
		padding: 1.25rem;
		width: 260px;
		box-shadow: var(--shadow-heavy);
		animation: popIn 0.2s ease-out;
	}

	.confirm-popover p {
		margin: 0 0 1rem 0;
		text-align: center;
		color: var(--text-primary);
		font-size: 0.9rem;
		line-height: 1.5;
	}

	.hint {
		font-size: 0.78rem;
		color: var(--text-tertiary);
	}

	.confirm-actions {
		display: flex;
		gap: 0.5rem;
	}

	.btn-cancel {
		flex: 1;
		padding: 0.6rem;
		border: none;
		border-radius: 10px;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		background: var(--bg-tertiary);
		color: var(--text-tertiary);
		transition: all 0.15s;
	}

	.btn-cancel:active {
		transform: scale(0.97);
	}

	.btn-ok {
		flex: 1;
		padding: 0.6rem;
		border: none;
		border-radius: 10px;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		background: #7c3aed;
		color: white;
		transition: all 0.15s;
	}

	.btn-ok:active {
		transform: scale(0.97);
	}

	@keyframes popIn {
		from {
			opacity: 0;
			transform: scale(0.9);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}
</style>
