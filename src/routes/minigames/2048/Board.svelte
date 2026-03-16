<script lang="ts">
	import { GRID_SIZE, getTileStyle, type Board, type Direction } from '$lib/games/2048/types';

	let {
		board,
		lastSpawnedId = null,
		onswipe
	} = $props<{
		board: Board;
		lastSpawnedId: number | null;
		onswipe: (direction: Direction) => void;
	}>();

	// Board sizing
	const GAP = 8;
	const PADDING = 8;

	// Swipe detection
	let touchStartX = 0;
	let touchStartY = 0;
	let touchStartTime = 0;

	function handleTouchStart(e: TouchEvent) {
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
		touchStartTime = Date.now();
	}

	function handleTouchEnd(e: TouchEvent) {
		const deltaX = e.changedTouches[0].clientX - touchStartX;
		const deltaY = e.changedTouches[0].clientY - touchStartY;
		const elapsed = Date.now() - touchStartTime;

		const absX = Math.abs(deltaX);
		const absY = Math.abs(deltaY);

		// Min swipe: 30px within 500ms
		if (Math.max(absX, absY) < 30 || elapsed > 500) return;

		if (absX > absY) {
			onswipe(deltaX > 0 ? 'right' : 'left');
		} else {
			onswipe(deltaY > 0 ? 'down' : 'up');
		}
	}

	function getFontSize(value: number): string {
		if (value >= 10000) return '1.2rem';
		if (value >= 1000) return '1.5rem';
		if (value >= 100) return '1.8rem';
		return '2rem';
	}
</script>

<div
	class="board-wrapper"
	ontouchstart={handleTouchStart}
	ontouchend={handleTouchEnd}
	role="grid"
	aria-label="2048 game board"
>
	<div class="board" style="--grid-size: {GRID_SIZE}; --gap: {GAP}px; --padding: {PADDING}px;">
		<!-- Background grid cells -->
		{#each Array(GRID_SIZE * GRID_SIZE) as _, i}
			<div class="grid-cell"></div>
		{/each}

		<!-- Tiles -->
		{#each board.tiles as tile (tile.id)}
			{@const style = getTileStyle(tile.value)}
			{@const isNew = lastSpawnedId === tile.id}
			<div
				class="tile"
				class:spawned={isNew}
				style="
					--row: {tile.row};
					--col: {tile.col};
					background: {style.bg};
					color: {style.color};
					font-size: {getFontSize(tile.value)};
				"
			>
				{tile.value}
			</div>
		{/each}
	</div>
</div>

<style>
	.board-wrapper {
		width: 100%;
		max-width: 400px;
		aspect-ratio: 1;
		margin: 0 auto;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
	}

	.board {
		position: relative;
		width: 100%;
		height: 100%;
		background: var(--bg-elevated);
		border-radius: 12px;
		padding: var(--padding);
		display: grid;
		grid-template-columns: repeat(var(--grid-size), 1fr);
		grid-template-rows: repeat(var(--grid-size), 1fr);
		gap: var(--gap);
	}

	.grid-cell {
		background: var(--bg-tertiary);
		border-radius: 8px;
	}

	.tile {
		position: absolute;
		width: calc((100% - var(--padding) * 2 - var(--gap) * (var(--grid-size) - 1)) / var(--grid-size));
		height: calc((100% - var(--padding) * 2 - var(--gap) * (var(--grid-size) - 1)) / var(--grid-size));
		left: calc(var(--padding) + var(--col) * (100% - var(--padding) * 2 - var(--gap) * (var(--grid-size) - 1)) / var(--grid-size) + var(--col) * var(--gap));
		top: calc(var(--padding) + var(--row) * (100% - var(--padding) * 2 - var(--gap) * (var(--grid-size) - 1)) / var(--grid-size) + var(--row) * var(--gap));
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		transition: left 0.15s ease, top 0.15s ease;
		will-change: left, top;
		z-index: 2;
	}

	.tile.spawned {
		animation: tileSpawn 0.2s ease-out;
	}

	@keyframes tileSpawn {
		0% { transform: scale(0); }
		60% { transform: scale(1.1); }
		100% { transform: scale(1); }
	}
</style>
