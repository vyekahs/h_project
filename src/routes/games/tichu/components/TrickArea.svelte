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

	const formatCombination = $derived.by(() => {
		if (!lastPlay) return '';
		const combo = lastPlay.combination;
		const r = Math.floor(combo.rank);
		const ranks: Record<number, string> = {
			2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8',
			9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
			1: '참새', 15: '용', 0: '개'
		};
		// Handle phoenix rank mapping if necessary, floor of 14.5 is 14.
		let rankStr = ranks[r] ?? r.toString();
		// If it's single phoenix, make it explicit.
		if (combo.type === 'single' && combo.cards[0].type === 'special' && combo.cards[0].special === 'phoenix') {
			rankStr = '봉황';
		}

		switch (combo.type) {
			case 'single': return `${rankStr} 싱글`;
			case 'pair': return `${rankStr} 페어`;
			case 'triple': return `${rankStr} 트리플`;
			case 'full_house': return `${rankStr} 풀하우스`;
			case 'straight': return `${rankStr}탑 스트레이트`;
			case 'stairs': return `${rankStr}탑 연속 페어`;
			case 'four_bomb': return `💣 ${rankStr} 포카드 폭탄`;
			case 'straight_flush_bomb': return `💣 ${rankStr}탑 스티플 폭탄`;
			default: return '알 수 없음';
		}
	});
</script>

<div class="trick-area">
	{#if trick && lastPlay}
		<div class="trick-display pos-{seatPosition(lastPlay.seat)}">
			<div class="trick-player">{lastPlayName}</div>
			<div class="trick-combo">{formatCombination}</div>
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

	.trick-combo {
		font-size: 0.75rem;
		font-weight: 700;
		color: #fbbf24;
		background: rgba(0,0,0,0.6);
		padding: 2px 10px;
		border-radius: 10px;
		margin-bottom: -2px;
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		border: 1px solid rgba(251, 191, 36, 0.4);
		box-shadow: 0 4px 6px rgba(0,0,0,0.3);
		animation: comboPop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
	}
	@keyframes comboPop {
		from { transform: scale(0.8); opacity: 0; }
		to { transform: scale(1); opacity: 1; }
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
