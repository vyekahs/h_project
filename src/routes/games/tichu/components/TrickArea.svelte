<script lang="ts">
	import type { Combination, SeatIndex } from '$lib/games/tichu/types';
	import CardComponent from './CardComponent.svelte';

	let { trick, mySeat, isMyTurn = false } = $props<{
		trick: {
			plays: { seat: SeatIndex; combination: Combination }[];
			passCount: number;
			leadSeat: SeatIndex;
			currentSeat: SeatIndex;
		} | null;
		mySeat: SeatIndex;
		isMyTurn?: boolean;
	}>();

	const lastPlay = $derived(trick?.plays[trick.plays.length - 1] ?? null);

	// Position of a seat relative to me (me=bottom, partner=top, etc.)
	function seatPosition(seat: SeatIndex): string {
		const rel = ((seat - mySeat + 4) % 4);
		if (rel === 0) return 'bottom';
		if (rel === 1) return 'right';
		if (rel === 2) return 'top';
		return 'left';
	}
</script>

<div class="trick-area">
	{#if trick && lastPlay}
		<div class="trick-display pos-{seatPosition(lastPlay.seat)}">
			<div class="trick-cards">
				{#each lastPlay.combination.cards as card (card.id)}
					<CardComponent {card} small />
				{/each}
			</div>
			<div class="trick-label">
				{lastPlay.combination.type === 'four_bomb' || lastPlay.combination.type === 'straight_flush_bomb' ? '💣 폭탄!' : ''}
			</div>
		</div>
	{:else}
		<div class="trick-empty">
			<span>{isMyTurn ? '카드를 내세요' : '대기 중...'}</span>
		</div>
	{/if}
</div>

<style>
	.trick-area {
		width: clamp(160px, 50vw, 280px);
		height: clamp(80px, 20vh, 140px);
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
	}

	.trick-display {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		animation: cardSlide 0.3s ease-out;
	}

	.trick-cards {
		display: flex;
		gap: 2px;
	}

	.trick-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: #fbbf24;
		min-height: 16px;
	}

	.trick-empty {
		color: rgba(255,255,255,0.2);
		font-size: 0.85rem;
	}

	@keyframes cardSlide {
		from { opacity: 0; transform: scale(0.8); }
		to { opacity: 1; transform: scale(1); }
	}
</style>
