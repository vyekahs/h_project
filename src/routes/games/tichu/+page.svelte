<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { createTichuGameState } from './gameState.svelte';
	import TichuLobby from './components/TichuLobby.svelte';
	import TichuWaitingRoom from './components/TichuWaitingRoom.svelte';
	import TichuTable from './components/TichuTable.svelte';
	import DragonGiftModal from './components/DragonGiftModal.svelte';
	import WishModal from './components/WishModal.svelte';
	import ScoreBoard from './components/ScoreBoard.svelte';
	import GameOverModal from './components/GameOverModal.svelte';
	import ChatPanel from './components/ChatPanel.svelte';

	const game = createTichuGameState();

	onMount(() => {
		game.connect();
	});

	onDestroy(() => {
		game.disconnect();
	});
</script>

<svelte:head>
	<title>티츄</title>
</svelte:head>

<div class="tichu-page">
	<!-- Connection Status Bar -->
	{#if game.isReconnecting}
		<div class="connection-bar reconnecting">
			<span class="pulse-dot"></span>
			재연결 중... (시도 {game.reconnectAttempt})
		</div>
	{:else if game.connectionStatus === 'disconnected'}
		<div class="connection-bar disconnected">
			연결 끊김
			{#if game.reconnectFailed}
				<button class="btn-back" onclick={() => goto('/games')}>로비로 돌아가기</button>
			{/if}
		</div>
	{/if}

	<!-- Main Content -->
	{#if game.view === 'lobby'}
		<TichuLobby {game} />
	{:else if game.view === 'waiting'}
		<TichuWaitingRoom {game} />
	{:else if game.view === 'game' && game.gameState}
		<TichuTable {game} />
	{/if}

	<!-- Overlay when reconnecting -->
	{#if game.isReconnecting && game.view === 'game'}
		<div class="reconnect-overlay">
			<div class="reconnect-content">
				<div class="spinner"></div>
				<p>재연결 중...</p>
				{#if game.reconnectFailed}
					<button class="btn-back" onclick={() => game.backToLobby()}>로비로 돌아가기</button>
				{/if}
			</div>
		</div>
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

	<!-- Chat -->
	{#if game.showChat && game.gameState}
		<ChatPanel {game} />
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

	/* Connection Status */
	.connection-bar {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 1000;
		padding: 6px 16px;
		text-align: center;
		font-size: 0.85rem;
		font-weight: 500;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}
	.connection-bar.reconnecting {
		background: #f59e0b;
		color: #000;
	}
	.connection-bar.disconnected {
		background: #ef4444;
		color: white;
	}
	.pulse-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #000;
		animation: pulse 1s infinite;
	}
	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.3; }
	}

	.btn-back {
		margin-left: 12px;
		padding: 4px 12px;
		border: 1px solid rgba(255,255,255,0.5);
		border-radius: 4px;
		background: rgba(255,255,255,0.2);
		color: white;
		font-size: 0.8rem;
		cursor: pointer;
	}

	/* Reconnect Overlay */
	.reconnect-overlay {
		position: fixed;
		inset: 0;
		z-index: 900;
		background: rgba(0,0,0,0.6);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.reconnect-content {
		text-align: center;
		padding: 2rem;
	}
	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid rgba(255,255,255,0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin: 0 auto 1rem;
	}
	@keyframes spin {
		to { transform: rotate(360deg); }
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
