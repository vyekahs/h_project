<script lang="ts">
	import type { SeatIndex } from '$lib/games/tichu/types';

	let { game } = $props<{ game: any }>();

	// Human is always seat 0. Opponents are seats 1 (right) and 3 (left).
	const leftSeat = 3 as SeatIndex;
	const rightSeat = 1 as SeatIndex;
	// Access stateVersion for reactivity on mutable engine state
	const leftPlayer = $derived.by(() => { void game.stateVersion; return game.gameState?.players[leftSeat]; });
	const rightPlayer = $derived.by(() => { void game.stateVersion; return game.gameState?.players[rightSeat]; });

	function gift(seat: SeatIndex) {
		game.giftDragon(seat);
		game.showDragonGiftModal = false;
	}
</script>

<div class="modal-overlay">
	<div class="modal-content">
		<img src="/tichu/dragon.svg" alt="Dragon" class="dragon-icon" />
		<h2>용 트릭 양도</h2>
		<p>이 트릭을 상대팀 중 한 명에게 넘겨야 합니다</p>

		<div class="gift-options">
			{#if leftPlayer}
				<button class="gift-btn" onclick={() => gift(leftSeat)}>
					<span class="player-name">{leftPlayer.name}</span>
					<span class="team-badge team-{leftPlayer.team}">Team {leftPlayer.team}</span>
				</button>
			{/if}
			{#if rightPlayer}
				<button class="gift-btn" onclick={() => gift(rightSeat)}>
					<span class="player-name">{rightPlayer.name}</span>
					<span class="team-badge team-{rightPlayer.team}">Team {rightPlayer.team}</span>
				</button>
			{/if}
		</div>
	</div>
</div>

<style>
	/* Fonts */
	@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1100;
		font-family: 'Inter', sans-serif;
	}

	.modal-content {
		background: rgba(30, 10, 10, 0.9); /* Dark Red tint */
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		border: 1px solid rgba(251, 191, 36, 0.4);
		border-radius: 24px;
		padding: 32px;
		text-align: center;
		color: #f3f4f6;
		max-width: 340px;
		width: 85%;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
		animation: popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.dragon-icon {
		width: 64px;
		height: 64px;
		object-fit: contain;
		margin-bottom: 16px;
		filter: drop-shadow(0 4px 10px rgba(220, 38, 38, 0.5));
		animation: float 3s ease-in-out infinite;
	}
	@keyframes float {
		0%, 100% { transform: translateY(0); }
		50% { transform: translateY(-10px); }
	}

	h2 {
		margin: 0 0 8px;
		font-size: 1.4rem;
		font-weight: 800;
		background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		letter-spacing: -0.02em;
	}

	p {
		font-size: 0.9rem;
		color: #d1d5db;
		margin: 0 0 24px;
		line-height: 1.5;
	}

	.gift-options {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.gift-btn {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-radius: 16px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.03);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		color: #e5e7eb;
		cursor: pointer;
		width: 100%;
		font-size: 1rem;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.gift-btn:hover {
		background: rgba(220, 38, 38, 0.15);
		border-color: rgba(220, 38, 38, 0.5);
		transform: translateY(-2px);
		box-shadow: 0 4px 15px rgba(220, 38, 38, 0.2);
		color: #fff;
	}

	.player-name {
		font-weight: 700;
	}

	.team-badge {
		font-size: 0.75rem;
		padding: 4px 10px;
		border-radius: 8px;
		font-weight: 600;
		letter-spacing: 0.05em;
	}
	.team-badge.team-A { 
		background: rgba(239, 68, 68, 0.2); 
		color: #fca5a5; 
		border: 1px solid rgba(239, 68, 68, 0.4);
	}
	.team-badge.team-B { 
		background: rgba(59, 130, 246, 0.2); 
		color: #93c5fd; 
		border: 1px solid rgba(59, 130, 246, 0.4);
	}

	@keyframes popIn {
		from { opacity: 0; transform: scale(0.9) translateY(20px); }
		to { opacity: 1; transform: scale(1) translateY(0); }
	}
</style>
