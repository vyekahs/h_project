<script lang="ts">
	import { BOARD_SIZE, TileType, type Tile } from '$lib/games/match-crash/types';

	let {
		flatTiles,
		matchedCells,
		isAnimating,
		shuffling = false,
		onSwipe
	} = $props<{
		flatTiles: (Tile & { row: number; col: number })[];
		matchedCells: Set<string>;
		isAnimating: boolean;
		shuffling: boolean;
		onSwipe: (r1: number, c1: number, r2: number, c2: number) => void;
	}>();

	let startX = 0;
	let startY = 0;
	let startRow = -1;
	let startCol = -1;
	let startTime = 0;
	let boardEl: HTMLDivElement | undefined = $state(undefined);

	function cellFromPointer(px: number, py: number): { row: number; col: number } | null {
		if (!boardEl) return null;
		const rect = boardEl.getBoundingClientRect();
		const padding = 6;
		const gap = 3;

		const x = px - rect.left - padding;
		const y = py - rect.top - padding;

		const innerWidth = rect.width - padding * 2;
		const cellSize = (innerWidth - gap * (BOARD_SIZE - 1)) / BOARD_SIZE;
		const step = cellSize + gap;

		const col = Math.floor(x / step);
		const row = Math.floor(y / step);

		if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return null;
		return { row, col };
	}

	function handlePointerDown(e: PointerEvent) {
		if (isAnimating) return;
		startX = e.clientX;
		startY = e.clientY;
		startTime = Date.now();
		const cell = cellFromPointer(e.clientX, e.clientY);
		if (cell) {
			startRow = cell.row;
			startCol = cell.col;
		}
	}

	function handlePointerUp(e: PointerEvent) {
		if (isAnimating || startRow < 0) return;

		const dx = e.clientX - startX;
		const dy = e.clientY - startY;
		const elapsed = Date.now() - startTime;

		const absX = Math.abs(dx);
		const absY = Math.abs(dy);

		startRow = -1;
		startCol = -1;

		if (Math.max(absX, absY) < 20 || elapsed > 500) return;

		const cell = cellFromPointer(startX, startY);
		if (!cell) return;

		let dr = 0, dc = 0;
		if (absX > absY) {
			dc = dx > 0 ? 1 : -1;
		} else {
			dr = dy > 0 ? 1 : -1;
		}

		const tr = cell.row + dr;
		const tc = cell.col + dc;
		if (tr < 0 || tr >= BOARD_SIZE || tc < 0 || tc >= BOARD_SIZE) return;

		onSwipe(cell.row, cell.col, tr, tc);
	}

	function getSpecialIcon(type: TileType): string {
		switch (type) {
			case TileType.BOMB: return '💣';
			case TileType.RAINBOW: return '🌈';
			case TileType.BLAST: return '💥';
			default: return '';
		}
	}
</script>

<div class="board-wrapper">
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="board"
		class:shuffling
		bind:this={boardEl}
		onpointerdown={handlePointerDown}
		onpointerup={handlePointerUp}
		role="grid"
		tabindex="0"
		aria-label="Match Crash game board"
	>
		<!-- Background cells -->
		{#each Array(BOARD_SIZE * BOARD_SIZE) as _, i}
			<div class="bg-cell"></div>
		{/each}

		<!-- Tiles -->
		{#each flatTiles as tile (tile.id)}
			{@const isMatched = matchedCells.has(`${tile.row},${tile.col}`)}
			<div
				class="tile"
				class:matched={isMatched}
				class:special={tile.type !== TileType.NORMAL}
				class:bomb={tile.type === TileType.BOMB}
				class:rainbow={tile.type === TileType.RAINBOW}
				class:blast={tile.type === TileType.BLAST}
				style="
					--row: {tile.row};
					--col: {tile.col};
					--gem-color: var(--gem-color-{tile.color});
				"
			>
				{#if tile.type !== TileType.NORMAL}
					<span class="special-icon">{getSpecialIcon(tile.type)}</span>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.board-wrapper {
		width: 100%;
		max-width: min(100%, 400px);
		max-height: 100%;
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
		padding: 6px;
		display: grid;
		grid-template-columns: repeat(8, 1fr);
		grid-template-rows: repeat(8, 1fr);
		gap: 3px;
		overflow: hidden;
	}

	.board.shuffling {
		animation: boardShake 0.4s ease-in-out;
	}

	.bg-cell {
		background: var(--bg-tertiary);
		border-radius: 4px;
	}

	.tile {
		position: absolute;
		width: calc((100% - 12px - 3px * 7) / 8);
		height: calc((100% - 12px - 3px * 7) / 8);
		left: calc(6px + var(--col) * (100% - 12px - 3px * 7) / 8 + var(--col) * 3px);
		top: calc(6px + var(--row) * (100% - 12px - 3px * 7) / 8 + var(--row) * 3px);
		border-radius: 6px;
		background: var(--gem-color);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: left 0.2s ease, top 0.2s ease;
		will-change: left, top;
		z-index: 2;
	}

	.tile.matched {
		animation: tileMatch 0.3s ease-in forwards;
		z-index: 3;
	}

	.tile.special {
		box-shadow: 0 0 8px 2px rgba(255, 255, 255, 0.4);
	}

	.tile.bomb {
		animation: specialPulse 1.5s ease-in-out infinite;
	}

	.tile.rainbow {
		background: linear-gradient(135deg, #e74c3c, #f1c40f, #2ecc71, #3498db, #9b59b6);
		animation: specialPulse 1.5s ease-in-out infinite;
	}

	.tile.blast {
		animation: specialPulse 1.5s ease-in-out infinite;
	}

	.tile.matched.bomb,
	.tile.matched.rainbow,
	.tile.matched.blast {
		animation: tileMatch 0.3s ease-in forwards;
	}

	.special-icon {
		font-size: 1.2em;
		filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
	}

	@keyframes tileMatch {
		0% { transform: scale(1); opacity: 1; }
		40% { transform: scale(1.2); opacity: 0.8; }
		100% { transform: scale(0); opacity: 0; }
	}

	@keyframes specialPulse {
		0%, 100% { box-shadow: 0 0 8px 2px rgba(255, 255, 255, 0.4); }
		50% { box-shadow: 0 0 14px 4px rgba(255, 255, 255, 0.7); }
	}

	@keyframes boardShake {
		0%, 100% { transform: translateX(0); }
		20% { transform: translateX(-4px); }
		40% { transform: translateX(4px); }
		60% { transform: translateX(-3px); }
		80% { transform: translateX(2px); }
	}

	/* Gem colors */
	:global(:root) {
		--gem-color-1: #e74c3c;
		--gem-color-2: #3498db;
		--gem-color-3: #2ecc71;
		--gem-color-4: #f1c40f;
		--gem-color-5: #9b59b6;
		--gem-color-6: #e67e22;
	}
</style>
