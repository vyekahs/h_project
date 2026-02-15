<script lang="ts">
	import type { Card } from '$lib/games/tichu/types';

	let { card, selected = false, small = false, onclick = undefined } = $props<{
		card: Card;
		selected?: boolean;
		small?: boolean;
		onclick?: () => void;
	}>();

	const suitSymbols: Record<string, string> = {
		jade: '🟢',
		sword: '🔵',
		pagoda: '🟤',
		star: '⭐'
	};

	const suitColors: Record<string, string> = {
		jade: '#22c55e',
		sword: '#3b82f6',
		pagoda: '#a3713c',
		star: '#eab308'
	};

	const specialDisplay: Record<string, { symbol: string; color: string; name: string }> = {
		dragon: { symbol: '🐉', color: '#ef4444', name: '용' },
		phoenix: { symbol: '🔥', color: '#f97316', name: '봉황' },
		mahjong: { symbol: '🀄', color: '#22c55e', name: '참새' },
		dog: { symbol: '🐕', color: '#8b5cf6', name: '개' }
	};

	const rankDisplay: Record<number, string> = {
		2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8',
		9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A'
	};

	const isSpecial = $derived(card.type === 'special');
	const displayInfo = $derived.by(() => {
		if (card.type === 'special') {
			const info = specialDisplay[card.special];
			return { rank: info.symbol, suit: '', color: info.color, name: info.name };
		}
		return {
			rank: rankDisplay[card.rank] ?? String(card.rank),
			suit: suitSymbols[card.suit] ?? '',
			color: suitColors[card.suit] ?? '#fff',
			name: ''
		};
	});
</script>

<button
	class="card"
	class:selected
	class:small
	class:special={isSpecial}
	style="--card-color: {displayInfo.color}"
	{onclick}
	disabled={!onclick}
>
	{#if card.type === 'special'}
		<span class="card-symbol">{displayInfo.rank}</span>
		<span class="card-name">{displayInfo.name}</span>
	{:else}
		<span class="card-rank" style="color: {displayInfo.color}">{displayInfo.rank}</span>
		<span class="card-suit">{displayInfo.suit}</span>
	{/if}
</button>

<style>
	.card {
		width: 44px;
		height: 62px;
		border-radius: 5px;
		background: white;
		border: 2px solid #e5e7eb;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1px;
		cursor: pointer;
		transition: transform 0.15s, box-shadow 0.15s;
		position: relative;
		flex-shrink: 0;
		padding: 1px;
	}
	/* Only apply hover effect on devices with hover capability (not mobile) */
	@media (hover: hover) {
		.card:not(:disabled):not(.selected):hover {
			transform: translateY(-3px);
			box-shadow: 0 3px 8px rgba(0,0,0,0.3);
		}
	}
	.card:disabled {
		cursor: default;
	}
	.card.selected {
		transform: translateY(-8px);
		border-color: #f59e0b;
		box-shadow: 0 3px 12px rgba(245,158,11,0.4);
	}
	.card.small {
		width: 32px;
		height: 44px;
		font-size: 0.7rem;
	}
	.card.special {
		border-color: var(--card-color);
		background: linear-gradient(135deg, white, color-mix(in srgb, var(--card-color) 10%, white));
	}

	.card-rank {
		font-size: 1rem;
		font-weight: 700;
		line-height: 1;
	}
	.card-suit {
		font-size: 0.75rem;
		line-height: 1;
	}
	.card-symbol {
		font-size: 1.2rem;
		line-height: 1;
	}
	.card-name {
		font-size: 0.5rem;
		color: var(--card-color);
		font-weight: 600;
	}
	.small .card-rank { font-size: 0.75rem; }
	.small .card-suit { font-size: 0.55rem; }
	.small .card-symbol { font-size: 0.9rem; }
	.small .card-name { font-size: 0.4rem; }
</style>
