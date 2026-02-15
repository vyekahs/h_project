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
		<div class="dragon-icon">🐉</div>
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
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1100;
	}
	.modal-content {
		background: #1e293b;
		border-radius: 16px;
		padding: 24px;
		text-align: center;
		color: white;
		max-width: 320px;
		width: 85%;
	}
	.dragon-icon { font-size: 2.5rem; }
	h2 { margin: 8px 0; font-size: 1.1rem; }
	p { font-size: 0.85rem; opacity: 0.7; margin: 0 0 20px; }

	.gift-options {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.gift-btn {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 18px;
		border-radius: 10px;
		border: 1px solid rgba(255,255,255,0.2);
		background: rgba(255,255,255,0.05);
		color: white;
		cursor: pointer;
		width: 100%;
		font-size: 0.95rem;
	}
	.gift-btn:hover { background: rgba(255,255,255,0.1); }
	.player-name { font-weight: 600; }
	.team-badge {
		font-size: 0.7rem;
		padding: 2px 8px;
		border-radius: 4px;
	}
	.team-badge.team-A { background: rgba(239,68,68,0.3); }
	.team-badge.team-B { background: rgba(59,130,246,0.3); }
</style>
