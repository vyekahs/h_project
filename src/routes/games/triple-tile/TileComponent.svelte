<script lang="ts">
	import { TILE_TYPES } from '$lib/games/triple-tile/types';

	let {
		typeId,
		exposed = false,
		layer = 0,
		onclick,
	}: {
		typeId: number;
		exposed?: boolean;
		layer?: number;
		onclick?: (e: MouseEvent) => void;
	} = $props();

	const emoji = $derived(TILE_TYPES[typeId] ?? '❓');
</script>

<button
	class="tile"
	class:exposed
	class:blocked={!exposed}
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
		border: 1px solid #dcd3c6;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: default;
		padding: 0;
		position: relative;
		will-change: transform;
		background: #fffcfa;

		/* Lift the higher tiles UP visually by 6px times their layer height to match thickness */
		transform: translateY(calc(var(--layer, 0) * -6px));

		/* 3D thickness using box-shadow — simplified for performance */
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 1),
			0 2px 0 #f0eadf,
			0 4px 0 #dfd7ca,
			0 6px 0 #9e9a90,
			0 8px 12px rgba(0, 0, 0, 0.12);
		user-select: none;
		-webkit-user-select: none;
		-webkit-tap-highlight-color: transparent;
	}

	.tile.exposed {
		cursor: pointer;
		background: #ffffff;
		border-color: #d6ccbd;
	}

	.tile.exposed:active {
		transform: translateY(calc(var(--layer, 0) * -6px + 3px));
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.8),
			0 1px 0 #e8e1d5,
			0 2px 0 #9e9a90,
			0 4px 6px rgba(0, 0, 0, 0.12);
	}

	.tile.blocked {
		opacity: 0.55;
		pointer-events: none;
	}

	.tile-emoji {
		font-size: calc(var(--tile-size, 44px) * 0.55);
		line-height: 1;
		pointer-events: none;
	}
</style>
