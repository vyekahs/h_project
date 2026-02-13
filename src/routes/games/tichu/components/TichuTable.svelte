<script lang="ts">
	import type { SeatIndex } from '$lib/games/tichu/types';
	import OpponentArea from './OpponentArea.svelte';
	import TrickArea from './TrickArea.svelte';
	import PlayerHand from './PlayerHand.svelte';
	import TichuDeclareModal from './TichuDeclareModal.svelte';

	let { game } = $props<{ game: any }>();

	const gs = $derived(game.gameState);
	const mySeat = $derived<SeatIndex>(gs?.mySeat ?? (0 as SeatIndex));

	// Positions relative to me: left, top (partner), right
	const leftSeat = $derived(((mySeat + 3) % 4) as SeatIndex);
	const topSeat = $derived(((mySeat + 2) % 4) as SeatIndex);
	const rightSeat = $derived(((mySeat + 1) % 4) as SeatIndex);

	const leftPlayer = $derived(gs?.players[leftSeat]);
	const topPlayer = $derived(gs?.players[topSeat]);
	const rightPlayer = $derived(gs?.players[rightSeat]);

	const isGrandTichuPhase = $derived(gs?.phase === 'grand_tichu_window');
	const isExchangePhase = $derived(gs?.phase === 'exchange');

	// Wish indicator
	const wishActive = $derived(gs?.wish?.active ?? false);
	const wishRank = $derived(gs?.wish?.requestedRank);
	const rankNames: Record<number, string> = {
		2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8',
		9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A'
	};
</script>

<div class="game-table">
	<!-- Score Header -->
	<div class="score-header">
		<div class="team-score team-a">
			A: {gs?.cumulativeScoreA ?? 0}
		</div>
		<div class="round-info">
			R{(gs?.completedRounds?.length ?? 0) + 1}
		</div>
		<div class="team-score team-b">
			B: {gs?.cumulativeScoreB ?? 0}
		</div>
		<button class="btn-chat" onclick={() => game.showChat = !game.showChat}>
			💬
		</button>
	</div>

	<!-- Wish indicator -->
	{#if wishActive && wishRank}
		<div class="wish-indicator">
			소원: {rankNames[wishRank] ?? wishRank}
		</div>
	{/if}

	<!-- Small Tichu button -->
	{#if game.canDeclareSmallTichu}
		<button class="btn-small-tichu" onclick={() => game.declareSmallTichu()}>
			스몰 티츄!
		</button>
	{/if}

	<!-- Table Area -->
	<div class="table-field">
		<!-- Opponents -->
		{#if leftPlayer}
			<OpponentArea
				player={leftPlayer}
				isCurrentTurn={gs?.currentSeat === leftSeat}
				position="left"
			/>
		{/if}
		{#if topPlayer}
			<OpponentArea
				player={topPlayer}
				isCurrentTurn={gs?.currentSeat === topSeat}
				position="top"
			/>
		{/if}
		{#if rightPlayer}
			<OpponentArea
				player={rightPlayer}
				isCurrentTurn={gs?.currentSeat === rightSeat}
				position="right"
			/>
		{/if}

		<!-- Center Trick -->
		<div class="center-area">
			<TrickArea trick={gs?.trick ?? null} {mySeat} isMyTurn={game.isMyTurn} />
		</div>

		<!-- My turn indicator -->
		{#if game.isMyTurn}
			<div class="my-turn-indicator">내 차례!</div>
		{/if}
	</div>

	<!-- Grand Tichu Phase -->
	{#if isGrandTichuPhase}
		<TichuDeclareModal {game} />
	{/if}

	<!-- My Hand (bottom) -->
	<PlayerHand {game} />
</div>

<style>
	.game-table {
		display: flex;
		flex-direction: column;
		height: 100vh;
		height: 100dvh;
		position: relative;
	}

	.score-header {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 16px;
		padding: 8px 16px;
		padding-top: calc(8px + env(safe-area-inset-top));
		background: rgba(0,0,0,0.3);
		font-size: 0.85rem;
		font-weight: 600;
	}
	.team-score.team-a { color: #fca5a5; }
	.team-score.team-b { color: #93c5fd; }
	.round-info { opacity: 0.5; font-size: 0.75rem; }
	.btn-chat {
		position: absolute;
		right: 12px;
		background: none;
		border: none;
		font-size: 1.2rem;
		cursor: pointer;
		padding: 4px;
	}

	.wish-indicator {
		position: absolute;
		top: 52px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(245,158,11,0.9);
		color: #000;
		padding: 4px 12px;
		border-radius: 12px;
		font-size: 0.8rem;
		font-weight: 600;
		z-index: 50;
	}

	.btn-small-tichu {
		position: absolute;
		bottom: 200px;
		right: 12px;
		z-index: 50;
		padding: 8px 16px;
		border-radius: 8px;
		border: 2px solid #3b82f6;
		background: rgba(59,130,246,0.2);
		color: #93c5fd;
		font-weight: 600;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.btn-small-tichu:hover {
		background: rgba(59,130,246,0.3);
	}

	.table-field {
		flex: 1;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 0;
	}

	.center-area {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.my-turn-indicator {
		position: absolute;
		bottom: 8px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(245,158,11,0.8);
		color: #000;
		padding: 4px 16px;
		border-radius: 12px;
		font-size: 0.8rem;
		font-weight: 700;
		animation: turnPulse 1.5s infinite;
	}
	@keyframes turnPulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.6; }
	}
</style>
