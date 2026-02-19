<script lang="ts">
	import { onDestroy } from 'svelte';
	import { createTichuGameState } from './gameState.svelte';
	import GameSetup from './components/GameSetup.svelte';
	import TichuTable from './components/TichuTable.svelte';
	import DragonGiftModal from './components/DragonGiftModal.svelte';
	import WishModal from './components/WishModal.svelte';
	import ScoreBoard from './components/ScoreBoard.svelte';
	import GameOverModal from './components/GameOverModal.svelte';

	const game = createTichuGameState();

	onDestroy(() => {
		game.cleanup();
	});
</script>

<svelte:window onbeforeunload={() => game.flushSave()} />

<svelte:head>
	<title>티츄</title>
</svelte:head>

<div class="tichu-page">
	{#if game.view === 'setup'}
		<GameSetup {game} />
	{:else if game.view === 'game' && game.gameState}
		<TichuTable {game} />
	{/if}

	<!-- Modals -->
	{#if game.showDragonGiftModal && game.gameState}
		<DragonGiftModal {game} />
	{/if}

	{#if game.showWishModal && game.gameState}
		<WishModal {game} />
	{/if}

	{#if game.showRoundEndModal && game.roundResult}
		<ScoreBoard {game} />
	{/if}

	{#if game.showGameOverModal && game.gameEndData}
		<GameOverModal {game} />
	{/if}

	<!-- Toast Notifications -->
	<div class="toast-container">
		{#each game.toasts as toast (toast.id)}
			<div class="toast toast-{toast.type}">
				{toast.message}
			</div>
		{/each}
	</div>
</div>

<style>
	.tichu-page {
		min-height: 100vh;
		min-height: 100dvh;
		background: #1a5c2e;
		color: white;
		position: relative;
		overflow: hidden;
	}

	/* Toast */
	.toast-container {
		position: fixed;
		top: 40px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 2000;
		display: flex;
		flex-direction: column;
		gap: 6px;
		pointer-events: none;
		max-width: 90vw;
	}
	.toast {
		padding: 8px 16px;
		border-radius: 8px;
		font-size: 0.85rem;
		font-weight: 500;
		text-align: center;
		animation: toastIn 0.3s ease-out;
		word-break: keep-all;
		overflow-wrap: break-word;
	}
	.toast-info { background: rgba(59,130,246,0.9); color: white; }
	.toast-success { background: rgba(34,197,94,0.9); color: white; }
	.toast-error { background: rgba(239,68,68,0.9); color: white; }
	.toast-warning { background: rgba(245,158,11,0.9); color: #000; }

	@keyframes toastIn {
		from { opacity: 0; transform: translateY(-10px); }
		to { opacity: 1; transform: translateY(0); }
	}
</style>
