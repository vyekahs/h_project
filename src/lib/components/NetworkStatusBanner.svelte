<script lang="ts">
	import { getIsSlowNetwork } from '$lib/stores/networkHealth.svelte';

	const isSlow = $derived(getIsSlowNetwork());
</script>

{#if isSlow}
	<div class="network-slow-banner" role="status">
		<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13a10 10 0 0 1 14 0"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 20 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
		네트워크 연결이 느립니다
	</div>
{/if}

<style>
	.network-slow-banner {
		position: fixed;
		top: env(safe-area-inset-top, 0px);
		left: 50%;
		transform: translateX(-50%);
		z-index: 2000;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 1rem;
		border-radius: 0 0 12px 12px;
		background: var(--color-warning-bg);
		color: var(--color-orange-dark);
		border: 1px solid var(--border-warning);
		border-top: none;
		font-size: 0.78rem;
		font-weight: 600;
		box-shadow: 0 4px 12px var(--shadow-md);
		animation: network-banner-in 0.25s ease-out;
	}
	@keyframes network-banner-in {
		from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
		to { transform: translateX(-50%) translateY(0); opacity: 1; }
	}
	@media (prefers-reduced-motion: reduce) {
		.network-slow-banner { animation: none; }
	}
</style>
