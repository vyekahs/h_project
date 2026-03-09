<script lang="ts">
	import type { Tile } from '$lib/games/triple-tile/types';
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

	const tileSize = 44;
	const tileGap = 2;

	// Pre-compute board metrics, exposed map, and sorted tiles in a single pass
	const boardData = $derived.by(() => {
		let mCol = 0;
		let mRow = 0;
		const active: Tile[] = [];

		for (const t of tiles) {
			if (t.col > mCol) mCol = t.col;
			if (t.row > mRow) mRow = t.row;
			if (!t.removed) active.push(t);
		}

		// Step 1: Find exposed tiles (coverDepth 0)
		const exposedSet = new Set<number>();
		const coverMap = new Map<number, number>();
		const hiddenSet = new Set<number>();

		for (const tile of active) {
			let maxCoverLayer = tile.layer;
			for (const other of active) {
				if (other.layer > tile.layer &&
					Math.abs(other.col - tile.col) < 1 &&
					Math.abs(other.row - tile.row) < 1) {
					if (other.layer > maxCoverLayer) maxCoverLayer = other.layer;
				}
			}
			const depth = maxCoverLayer - tile.layer;
			coverMap.set(tile.id, depth);
			if (depth === 0) exposedSet.add(tile.id);
		}

		// Step 2: "just below" = directly covered by an exposed tile
		const justBelowSet = new Set<number>();
		for (const tile of active) {
			if (exposedSet.has(tile.id)) continue;
			// Find the minimum layer among covering exposed tiles
			let minExposedLayerAbove = Infinity;
			for (const other of active) {
				if (exposedSet.has(other.id) &&
					other.layer > tile.layer &&
					Math.abs(other.col - tile.col) < 1 &&
					Math.abs(other.row - tile.row) < 1) {
					minExposedLayerAbove = Math.min(minExposedLayerAbove, other.layer);
				}
			}
			// Only mark as justBelow if the exposed tile is on the immediate next layer
			if (minExposedLayerAbove === tile.layer + 1) {
				justBelowSet.add(tile.id);
			}
		}

		// Step 3: fully-hidden check (all 4 corners covered)
		for (const tile of active) {
			if (exposedSet.has(tile.id)) continue;
			const covers: Tile[] = [];
			for (const other of active) {
				if (other.layer > tile.layer &&
					Math.abs(other.col - tile.col) < 1 &&
					Math.abs(other.row - tile.row) < 1) {
					covers.push(other);
				}
			}
			if (covers.length > 0) {
				const corners = [
					[tile.col - 0.49, tile.row - 0.49],
					[tile.col + 0.49, tile.row - 0.49],
					[tile.col - 0.49, tile.row + 0.49],
					[tile.col + 0.49, tile.row + 0.49],
				];
				const allCovered = corners.every(([cx, cy]) =>
					covers.some(
						(o) => cx >= o.col - 0.5 && cx <= o.col + 0.5 &&
							cy >= o.row - 0.5 && cy <= o.row + 0.5
					)
				);
				if (allCovered) hiddenSet.add(tile.id);
			}
		}

		// Sort: lower layers first, then row, then col
		active.sort((a, b) => a.layer - b.layer || a.row - b.row || a.col - b.col);

		return {
			width: (mCol + 1) * (tileSize + tileGap) + tileGap,
			height: (mRow + 1) * (tileSize + tileGap) + tileGap,
			sorted: active,
			coverMap,
			hiddenSet,
			justBelowSet,
		};
	});

	// Auto-scale: shrink board if it doesn't fit the wrapper
	const scale = $derived.by(() => {
		if (wrapperWidth <= 0 || wrapperHeight <= 0) return 1;
		const padX = 16;
		const padY = 16;
		const scaleX = (wrapperWidth - padX) / boardData.width;
		const scaleY = (wrapperHeight - padY) / boardData.height;
		return Math.min(1, scaleX, scaleY);
	});
</script>

<div class="board-wrapper" bind:clientWidth={wrapperWidth} bind:clientHeight={wrapperHeight}>
	<div
		class="board"
		style="width: {boardData.width}px; height: {boardData.height}px; --tile-size: {tileSize}px; transform: scale({scale});"
	>
		{#each boardData.sorted as tile (tile.id)}
			{@const coverDepth = boardData.coverMap.get(tile.id) ?? 0}
			{@const justBelow = boardData.justBelowSet.has(tile.id)}
			{@const hidden = boardData.hiddenSet.has(tile.id)}
			{@const x = tile.col * (tileSize + tileGap)}
			{@const y = tile.row * (tileSize + tileGap)}
			<div
				class="tile-slot"
				class:tile-hidden={hidden}
				style="
					left: {x}px;
					top: {y}px;
					z-index: {Math.floor(tile.layer * 10000 + tile.row * 100 + tile.col * 10)};
				"
			>
				<TileComponent
					typeId={tile.typeId}
					exposed={coverDepth === 0}
					coverDepth={hidden ? 3 : (justBelow ? 1 : (coverDepth === 0 ? 0 : 2))}
					layer={tile.layer}
					onclick={(e: MouseEvent) => {
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
		transition: visibility 0s, opacity 0.2s ease;
	}

	.tile-slot.tile-hidden {
		visibility: hidden;
	}
</style>
