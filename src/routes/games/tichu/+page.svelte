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

<div class="page-background"></div>

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
	.page-background {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		z-index: -1;
		background: radial-gradient(circle at 50% 50%, #7f1d1d 0%, #450a0a 40%, #1a0505 100%);
		overflow: hidden;
	}

	.page-background::before {
		content: '';
		position: absolute;
		top: -50%;
		left: -50%;
		width: 200%;
		height: 200%;
		background: conic-gradient(
			from 0deg at 50% 50%,
			transparent 0deg,
			rgba(245, 158, 11, 0.1) 60deg,
			rgba(16, 185, 129, 0.05) 120deg,
			transparent 180deg,
			rgba(220, 38, 38, 0.1) 240deg,
			rgba(251, 191, 36, 0.08) 300deg,
			transparent 360deg
		);
		animation: rotate 80s linear infinite;
		filter: blur(80px);
	}

	.page-background::after {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: radial-gradient(circle at 85% 15%, rgba(251, 191, 36, 0.12) 0%, transparent 30%),
					radial-gradient(circle at 15% 85%, rgba(16, 185, 129, 0.08) 0%, transparent 30%);
		filter: blur(50px);
		animation: pulse 12s ease-in-out infinite alternate;
	}

	@keyframes rotate {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	@keyframes pulse {
		0% { opacity: 0.6; transform: scale(1); }
		100% { opacity: 0.9; transform: scale(1.05); }
	}

	.tichu-page {
		position: fixed;
		inset: 0;
		background: transparent;
		color: #fef2f2;
		overflow: hidden;
		overscroll-behavior: none;
		font-family: 'Inter', system-ui, -apple-system, sans-serif;
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
		gap: 8px;
		pointer-events: none;
		max-width: 90vw;
	}
	.toast {
		padding: 10px 20px;
		border-radius: 16px;
		font-size: 0.9rem;
		font-weight: 600;
		text-align: center;
		animation: toastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
		word-break: keep-all;
		overflow-wrap: break-word;
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border: 1px solid rgba(255,255,255,0.15);
		box-shadow: 0 4px 20px rgba(0,0,0,0.3);
		letter-spacing: -0.01em;
		color: #fff;
		text-shadow: 0 1px 2px rgba(0,0,0,0.2);
	}
	/* Custom Toast Colors for Red Theme */
	.toast-info { background: rgba(59, 130, 246, 0.25); border-color: rgba(147, 197, 253, 0.3); }
	.toast-success { background: rgba(16, 185, 129, 0.25); border-color: rgba(110, 231, 183, 0.3); }
	.toast-error { background: rgba(239, 68, 68, 0.3); border-color: rgba(252, 165, 165, 0.3); }
	.toast-warning { background: rgba(245, 158, 11, 0.25); border-color: rgba(253, 230, 138, 0.3); }

	@keyframes toastIn {
		from { opacity: 0; transform: translateY(-12px) scale(0.95); }
		to { opacity: 1; transform: translateY(0) scale(1); }
	}
</style>
