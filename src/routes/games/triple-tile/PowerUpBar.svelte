<script lang="ts">
	let {
		shuffleRemaining,
		undoAvailable,
		onshuffle,
		onundo,
	}: {
		shuffleRemaining: number;
		undoAvailable: boolean;
		onshuffle: () => void;
		onundo: () => void;
	} = $props();
</script>

<div class="powerup-bar">
	<button class="powerup-btn" onclick={onundo} disabled={!undoAvailable} title="되돌리기">
		<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
			<path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
		</svg>
		<span>되돌리기</span>
	</button>

	<button
		class="powerup-btn shuffle-btn"
		onclick={onshuffle}
		disabled={shuffleRemaining <= 0}
		title="셔플"
	>
		<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
			<path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>
		</svg>
		<span>셔플</span>
		{#if shuffleRemaining > 0}
			<span class="count">{shuffleRemaining}</span>
		{/if}
	</button>
</div>

<style>
	.powerup-bar {
		display: flex;
		gap: 8px;
		justify-content: center;
		padding: 4px 0;
	}

	.powerup-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		background: #f0f0f0;
		border: none;
		padding: 0.4rem 0.8rem;
		border-radius: 50px;
		font-size: 0.8rem;
		font-weight: 600;
		color: #555;
		cursor: pointer;
		transition: all 0.2s;
		user-select: none;
		-webkit-user-select: none;
		-webkit-tap-highlight-color: transparent;
	}

	.powerup-btn:active:not(:disabled) {
		background: #e0e0e0;
		transform: scale(0.95);
	}

	.powerup-btn:disabled {
		opacity: 0.3;
		pointer-events: none;
	}

	.count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: #333;
		color: white;
		font-size: 0.65rem;
		font-weight: 700;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		margin-left: 2px;
	}
</style>
