<script lang="ts">
	import type { Card } from '$lib/games/freecell/types';
	import { SUIT_COLOR, SUIT_SYMBOL } from '$lib/games/freecell/types';

	let {
		card,
		selected = false,
		dimmed = false,
		compact = false,
		onclick,
		ondblclick
	}: {
		card: Card;
		selected?: boolean;
		dimmed?: boolean;
		compact?: boolean;
		onclick?: () => void;
		ondblclick?: () => void;
	} = $props();

	const colorName = $derived(SUIT_COLOR[card.suit]);
	const symbol = $derived(SUIT_SYMBOL[card.suit]);
</script>

<div
	class="card"
	class:red={colorName === 'red'}
	class:black={colorName === 'black'}
	class:selected
	class:dimmed
	class:compact
	role="button"
	tabindex="-1"
	onclick={onclick}
	ondblclick={ondblclick}
	onkeydown={(e) => { if (e.key === 'Enter' && onclick) onclick(); }}
>
	<span class="top-left">
		<span class="rank">{card.rank}</span>
		<span class="suit">{symbol}</span>
	</span>
	{#if !compact}
		<span class="center-suit">{symbol}</span>
		<span class="bottom-right">
			<span class="rank">{card.rank}</span>
			<span class="suit">{symbol}</span>
		</span>
	{/if}
</div>

<style>
	.card {
		position: relative;
		width: 100%;
		aspect-ratio: 5 / 7;
		background: linear-gradient(180deg, #ffffff 0%, #f8f8fa 100%);
		border: 1px solid #c8ccd0;
		border-radius: clamp(4px, 1vw, 8px);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04);
		cursor: pointer;
		user-select: none;
		-webkit-user-select: none;
		transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
		overflow: hidden;
		touch-action: manipulation;
	}

	.card.red {
		color: #dc2626;
	}

	.card.black {
		color: #1a1a1a;
	}

	.card.selected {
		transform: translateY(-4px);
		border-color: var(--color-blue);
		box-shadow: 0 4px 12px var(--shadow-md), 0 0 0 2px var(--color-blue);
		z-index: 10;
	}

	.card.dimmed {
		background: linear-gradient(180deg, #f0f0f2 0%, #e8e8eb 100%);
	}

	.card.dimmed.red {
		color: #f0a0a0;
	}

	.card.dimmed.black {
		color: #a0a0a0;
	}

	.top-left {
		position: absolute;
		top: clamp(1px, 0.5vw, 3px);
		left: clamp(2px, 0.6vw, 4px);
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 1;
		z-index: 1;
	}

	.top-left .rank {
		font-size: clamp(10px, 2.8vw, 16px);
		font-weight: 800;
		letter-spacing: -0.5px;
	}

	.top-left .suit {
		font-size: clamp(8px, 2.2vw, 13px);
		line-height: 1;
	}

	.center-suit {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: clamp(18px, 5.5vw, 32px);
		opacity: 1;
		z-index: 0;
	}

	.bottom-right {
		position: absolute;
		bottom: clamp(1px, 0.5vw, 3px);
		right: clamp(2px, 0.6vw, 4px);
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 1;
		transform: rotate(180deg);
		z-index: 1;
	}

	.bottom-right .rank {
		font-size: clamp(10px, 2.8vw, 16px);
		font-weight: 800;
		letter-spacing: -0.5px;
	}

	.bottom-right .suit {
		font-size: clamp(8px, 2.2vw, 13px);
		line-height: 1;
	}
</style>
