<script lang="ts">
	let { visible, onRefresh }: { visible: boolean; onRefresh: () => void } = $props();
</script>

{#if visible}
	<button type="button" class="update-banner" onclick={onRefresh}>
		<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
		새 버전이 있어요 · 새로고침
	</button>
{/if}

<style>
	.update-banner {
		position: fixed;
		left: 50%;
		bottom: calc(16px + env(safe-area-inset-bottom, 0px) + 64px + 10px);
		transform: translateX(-50%);
		z-index: 1500;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 1rem;
		border-radius: 100px;
		background: var(--color-blue-bright);
		color: #fff;
		border: none;
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
		box-shadow: 0 4px 12px var(--shadow-md);
		animation: update-banner-in 0.25s ease-out;
	}
	@keyframes update-banner-in {
		from { transform: translateX(-50%) translateY(10px); opacity: 0; }
		to { transform: translateX(-50%) translateY(0); opacity: 1; }
	}
	@media (prefers-reduced-motion: reduce) {
		.update-banner { animation: none; }
	}
</style>
