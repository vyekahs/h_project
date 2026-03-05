<script lang="ts">
	import { TILE_TYPES } from '$lib/games/triple-tile/types';

	let {
		typeId,
		exposed = false,
		layer = 0,
		matching = false,
		onclick,
	}: {
		typeId: number;
		exposed?: boolean;
		layer?: number;
		matching?: boolean;
		onclick?: () => void;
	} = $props();

	const emoji = $derived(TILE_TYPES[typeId] ?? '❓');
</script>

<button
	class="tile"
	class:exposed
	class:blocked={!exposed}
	class:matching
	style="--layer: {layer}"
	onclick={exposed ? onclick : undefined}
	disabled={!exposed}
>
	<span class="tile-emoji">{emoji}</span>
</button>

<style>
	.tile {
		width: var(--tile-size, 44px);
		height: var(--tile-size, 44px);
		border: none;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: default;
		padding: 0;
		position: relative;
		transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.2s ease;
		background: linear-gradient(145deg, #ffffff, #f0f0f0);
		box-shadow:
			0 calc(var(--layer, 0) * 1px + 2px) calc(var(--layer, 0) * 2px + 4px) rgba(0, 0, 0, 0.12),
			inset 0 1px 0 rgba(255, 255, 255, 0.8);
		user-select: none;
		-webkit-user-select: none;
		-webkit-tap-highlight-color: transparent;
	}

	.tile.exposed {
		cursor: pointer;
		background: linear-gradient(145deg, #ffffff, #fafafa);
	}

	.tile.exposed:active {
		transform: scale(0.92);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
	}

	.tile.blocked {
		opacity: 0.5;
		pointer-events: none;
		filter: brightness(0.85);
	}

	.tile.matching {
		animation: matchPop 0.4s ease forwards;
	}

	.tile-emoji {
		font-size: calc(var(--tile-size, 44px) * 0.55);
		line-height: 1;
		pointer-events: none;
	}

	@keyframes matchPop {
		0% {
			transform: scale(1);
			opacity: 1;
		}
		40% {
			transform: scale(1.2);
			opacity: 1;
		}
		100% {
			transform: scale(0);
			opacity: 0;
		}
	}
</style>
