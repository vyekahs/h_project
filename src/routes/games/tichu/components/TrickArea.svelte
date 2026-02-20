<script lang="ts">
	import type { Combination, SeatIndex } from '$lib/games/tichu/types';
	import CardComponent from './CardComponent.svelte';

	let { trick, lastPlay = null, mySeat, playerNames = {}, isMyTurn = false } = $props<{
		trick: {
			plays: { seat: SeatIndex; combination: Combination }[];
			passCount: number;
			leadSeat: SeatIndex;
			currentSeat: SeatIndex;
		} | null;
		lastPlay?: { seat: SeatIndex; combination: Combination } | null;
		mySeat: SeatIndex;
		playerNames?: Record<number, string>;
		isMyTurn?: boolean;
	}>();

	const lastPlayName = $derived(lastPlay ? (lastPlay.seat === mySeat ? '나' : (playerNames[lastPlay.seat] ?? '')) : '');

	// Dynamic overlap for trick cards when many are played
	const trickCardOverlap = $derived.by(() => {
		if (!lastPlay) return 0;
		const count = lastPlay.combination.cards.length;
		if (count <= 3) return 0;
		// 46px card width, fit within ~220px
		const maxWidth = 220;
		const cardW = 46;
		const needed = cardW - (maxWidth - cardW) / (count - 1);
		return Math.max(needed, 0);
	});

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
			<div class="trick-player">{lastPlayName}</div>
			<div class="trick-cards" style="--trick-overlap: -{trickCardOverlap}px">
				{#each lastPlay.combination.cards as card (card.id)}
					<CardComponent {card} />
				{/each}
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
		width: clamp(220px, 60vw, 340px);
		height: clamp(100px, 25vh, 160px);
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		pointer-events: none; /* Let clicks pass through if needed */
	}

	.trick-display {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
	}

	.trick-player {
		font-size: 0.7rem;
		color: #e5e7eb;
		font-weight: 600;
		background: rgba(0, 0, 0, 0.5);
		padding: 2px 10px;
		border-radius: 12px;
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		border: 1px solid rgba(255, 255, 255, 0.15);
	}

	.trick-cards {
		display: flex;
		gap: 2px;
		filter: drop-shadow(0 4px 6px rgba(0,0,0,0.15));
	}
	.trick-cards :global(.card:not(:first-child)) {
		margin-left: var(--trick-overlap, 0px);
	}

.trick-empty {
		color: rgba(255, 255, 255, 0.3);
		font-size: 0.85rem;
		font-weight: 500;
		font-style: italic;
	}

	@keyframes popIn {
		from { opacity: 0; transform: scale(0.5) translateY(20px); }
		to { opacity: 1; transform: scale(1) translateY(0); }
	}
</style>
