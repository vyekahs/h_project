<script lang="ts">
	import type { Tile } from '$lib/games/triple-tile/types';
	import { isExposed } from '$lib/games/triple-tile/tileLogic';
	import TileComponent from './TileComponent.svelte';

	let {
		tiles,
		matchingTypeId = -1,
		onselect,
	}: {
		tiles: Tile[];
		matchingTypeId?: number;
		onselect: (id: number, rect: DOMRect) => void;
	} = $props();

	// Wrapper dimensions for auto-scaling
	let wrapperWidth = $state(0);
	let wrapperHeight = $state(0);

	// Calculate board dimensions for centering
	const boardTiles = $derived(tiles.filter((t) => !t.removed));
	const maxCol = $derived(boardTiles.length > 0 ? Math.max(...boardTiles.map((t) => t.col)) : 0);
	const maxRow = $derived(boardTiles.length > 0 ? Math.max(...boardTiles.map((t) => t.row)) : 0);
	const maxLayer = $derived(boardTiles.length > 0 ? Math.max(...boardTiles.map((t) => t.layer)) : 0);

	const tileSize = 44;
	const tileGap = 2;

	const boardWidth = $derived(
		(maxCol + 1) * (tileSize + tileGap) + tileGap
	);
	const boardHeight = $derived(
		(maxRow + 1) * (tileSize + tileGap) + tileGap
	);

	// Auto-scale: shrink board if it doesn't fit the wrapper
	const scale = $derived.by(() => {
		if (wrapperWidth <= 0 || wrapperHeight <= 0) return 1;
		const padX = 16;
		const padY = 16;
		const scaleX = (wrapperWidth - padX) / boardWidth;
		const scaleY = (wrapperHeight - padY) / boardHeight;
		return Math.min(1, scaleX, scaleY);
	});

	// Sort tiles: lower layers first, then by row, then by col
	const sortedTiles = $derived(
		[...tiles]
			.filter((t) => !t.removed)
			.sort((a, b) => a.layer - b.layer || a.row - b.row || a.col - b.col)
	);
</script>

<div class="board-wrapper" bind:clientWidth={wrapperWidth} bind:clientHeight={wrapperHeight}>
	<div
		class="board"
		style="width: {boardData.width}px; height: {boardData.height}px; --tile-size: {tileSize}px; transform: scale({scale});"
	>
		{#each boardData.sorted as tile (tile.id)}
			{@const exposed = boardData.exposed.has(tile.id)}
			{@const x = tile.col * (tileSize + tileGap)}
			{@const y = tile.row * (tileSize + tileGap)}
			<div
				class="tile-slot"
				style="
					left: {x}px;
					top: {y}px;
					z-index: {tile.layer * 100 + tile.row * 10 + tile.col};
				"
			>
				<TileComponent
					typeId={tile.typeId}
					{exposed}
					layer={tile.layer}
					matching={matchingTypeId === tile.typeId}
					onclick={(e) => {
						const btn = e.currentTarget;
						if (btn instanceof HTMLElement) {
							onselect(tile.id, btn.getBoundingClientRect());
						}
					}}
				/>
			</div>
		{/each}
	</div>
</div>

<style>
	.board-wrapper {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		flex: 1;
		overflow: hidden;
	}

	.board {
		position: relative;
		flex-shrink: 0;
		transform-origin: center center;
		contain: layout style;
	}

	.tile-slot {
		position: absolute;
	}
</style>
