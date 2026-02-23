<script lang="ts">
	import type { Tile } from '$lib/games/energy/types';

	let {
		tiles,
		isGameOver = false,
		showWinAnimation = false,
		onrotate
	} = $props<{
		tiles: Tile[][];
		isGameOver: boolean;
		showWinAnimation: boolean;
		onrotate: (row: number, col: number) => void;
	}>();

	let gridSize = $derived(tiles.length || 5);
	let cellSize = $derived(100 / gridSize);
	let pipeWidth = $derived(cellSize * 0.28);
	let half = $derived(cellSize / 2);

	// Track which tile was just tapped for animation
	let tappedTile: string | null = $state(null);
	let tappedTimeout: ReturnType<typeof setTimeout> | null = null;

	function handleTap(e: PointerEvent, row: number, col: number) {
		e.preventDefault();
		if (isGameOver) return;
		const tile = tiles[row]?.[col];
		if (!tile || tile.fixed || tile.type === 'empty') return;

		if (tappedTimeout) clearTimeout(tappedTimeout);
		tappedTile = `${row},${col}`;
		tappedTimeout = setTimeout(() => {
			tappedTile = null;
		}, 300);

		onrotate(row, col);
	}

	// SVG path helpers - all paths drawn assuming rotation=0 (rotation applied via transform)
	function straightPath(s: number): string {
		const h = s / 2;
		return `M 0 ${h} L ${s} ${h}`;
	}

	function cornerPath(s: number): string {
		const h = s / 2;
		// TOP to RIGHT: from top-center down to center, then right
		return `M ${h} 0 L ${h} ${h} L ${s} ${h}`;
	}

	function teePath(s: number): string {
		const h = s / 2;
		// TOP to BOTTOM vertical + RIGHT branch
		return `M ${h} 0 L ${h} ${s} M ${h} ${h} L ${s} ${h}`;
	}

	function crossPath(s: number): string {
		const h = s / 2;
		return `M 0 ${h} L ${s} ${h} M ${h} 0 L ${h} ${s}`;
	}

	function bulbPath(s: number): string {
		const h = s / 2;
		// Connection from bottom to center
		return `M ${h} ${s} L ${h} ${h}`;
	}
</script>

<div class="board-wrapper" style="touch-action: manipulation;">
	<svg class="board-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
		<!-- Background grid -->
		{#each tiles as row, r}
			{#each row as tile, c}
				<rect
					x={c * cellSize}
					y={r * cellSize}
					width={cellSize}
					height={cellSize}
					class="cell-bg"
					class:powered={tile.powered}
					class:source={tile.type === 'source'}
				/>
			{/each}
		{/each}

		<!-- Grid lines -->
		{#each { length: gridSize + 1 } as _, i}
			<line
				x1={i * cellSize}
				y1={0}
				x2={i * cellSize}
				y2={100}
				stroke="#e2e8f0"
				stroke-width="0.15"
			/>
			<line
				x1={0}
				y1={i * cellSize}
				x2={100}
				y2={i * cellSize}
				stroke="#e2e8f0"
				stroke-width="0.15"
			/>
		{/each}

		<!-- Tiles -->
		{#each tiles as row, r}
			{#each row as tile, c}
				{#if tile.type !== 'empty'}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<g
						class="tile-group"
						class:tapped={tappedTile === `${r},${c}`}
						class:tappable={!tile.fixed && tile.type !== 'empty'}
						onpointerdown={(e) => handleTap(e, r, c)}
						style="cursor: {tile.fixed ? 'default' : 'pointer'}"
					>
						<!-- Invisible hit area covering entire cell -->
						<rect
							x={c * cellSize}
							y={r * cellSize}
							width={cellSize}
							height={cellSize}
							fill="transparent"
						/>
						<!-- Pipe paths with rotation -->
						<g
							class="pipe-rotate"
							style="
								transform-origin: {c * cellSize + half}px {r * cellSize + half}px;
								transform: rotate({tile.rotation * 90}deg);
								transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
							"
						>
							{#if tile.type === 'straight'}
								<path
									d={straightPath(cellSize)}
									transform="translate({c * cellSize}, {r * cellSize})"
									fill="none"
									stroke={tile.powered ? '#fbbf24' : '#94a3b8'}
									stroke-width={pipeWidth}
									stroke-linecap="round"
									class:pipe-powered={tile.powered}
								/>
							{:else if tile.type === 'corner'}
								<path
									d={cornerPath(cellSize)}
									transform="translate({c * cellSize}, {r * cellSize})"
									fill="none"
									stroke={tile.powered ? '#fbbf24' : '#94a3b8'}
									stroke-width={pipeWidth}
									stroke-linecap="round"
									stroke-linejoin="round"
									class:pipe-powered={tile.powered}
								/>
							{:else if tile.type === 'tee'}
								<path
									d={teePath(cellSize)}
									transform="translate({c * cellSize}, {r * cellSize})"
									fill="none"
									stroke={tile.powered ? '#fbbf24' : '#94a3b8'}
									stroke-width={pipeWidth}
									stroke-linecap="round"
									class:pipe-powered={tile.powered}
								/>
							{:else if tile.type === 'cross'}
								<path
									d={crossPath(cellSize)}
									transform="translate({c * cellSize}, {r * cellSize})"
									fill="none"
									stroke={tile.powered ? '#fbbf24' : '#94a3b8'}
									stroke-width={pipeWidth}
									stroke-linecap="round"
									class:pipe-powered={tile.powered}
								/>
							{:else if tile.type === 'bulb'}
								<!-- Bulb connection line -->
								<path
									d={bulbPath(cellSize)}
									transform="translate({c * cellSize}, {r * cellSize})"
									fill="none"
									stroke={tile.powered ? '#fbbf24' : '#94a3b8'}
									stroke-width={pipeWidth}
									stroke-linecap="round"
									class:pipe-powered={tile.powered}
								/>
							{:else if tile.type === 'source'}
								<!-- Source cross connections -->
								<path
									d={crossPath(cellSize)}
									transform="translate({c * cellSize}, {r * cellSize})"
									fill="none"
									stroke="#f59e0b"
									stroke-width={pipeWidth}
									stroke-linecap="round"
								/>
							{/if}
						</g>

						<!-- Source icon (drawn on top, no rotation) -->
						{#if tile.type === 'source'}
							<circle
								cx={c * cellSize + half}
								cy={r * cellSize + half}
								r={cellSize * 0.22}
								class="source-circle"
							/>
							<!-- Lightning bolt -->
							<path
								d="M {c * cellSize + half - cellSize * 0.06} {r * cellSize + half - cellSize * 0.12}
								   L {c * cellSize + half + cellSize * 0.02} {r * cellSize + half - cellSize * 0.02}
								   L {c * cellSize + half - cellSize * 0.02} {r * cellSize + half + cellSize * 0.02}
								   L {c * cellSize + half + cellSize * 0.06} {r * cellSize + half + cellSize * 0.12}"
								fill="none"
								stroke="white"
								stroke-width={cellSize * 0.04}
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						{/if}

						<!-- Bulb icon (drawn on top, no rotation needed for icon) -->
						{#if tile.type === 'bulb'}
							<circle
								cx={c * cellSize + half}
								cy={r * cellSize + half}
								r={cellSize * 0.2}
								class="bulb-circle"
								class:bulb-on={tile.powered}
								class:bulb-win={tile.powered && showWinAnimation}
							/>
							<!-- Bulb filament lines -->
							<path
								d="M {c * cellSize + half - cellSize * 0.06} {r * cellSize + half}
								   Q {c * cellSize + half} {r * cellSize + half - cellSize * 0.08}
								   {c * cellSize + half + cellSize * 0.06} {r * cellSize + half}"
								fill="none"
								stroke={tile.powered ? '#92400e' : '#9ca3af'}
								stroke-width={cellSize * 0.025}
								stroke-linecap="round"
							/>
						{/if}

						<!-- Connection dots at tile edges -->
						{#if tile.type !== 'source' && tile.type !== 'bulb'}
							<circle
								cx={c * cellSize + half}
								cy={r * cellSize + half}
								r={pipeWidth * 0.4}
								fill={tile.powered ? '#fbbf24' : '#94a3b8'}
								class:dot-powered={tile.powered}
							/>
						{/if}
					</g>
				{/if}
			{/each}
		{/each}
	</svg>
</div>

<style>
	.board-wrapper {
		width: 100%;
		aspect-ratio: 1;
		max-width: 500px;
		margin: 0 auto;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
		-webkit-touch-callout: none;
		user-select: none;
	}

	.board-svg {
		width: 100%;
		height: 100%;
		display: block;
		border-radius: 12px;
		background: #f8fafc;
		box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.04);
	}

	.cell-bg {
		fill: #f8fafc;
		transition: fill 0.3s ease;
	}

	.cell-bg.powered {
		fill: rgba(251, 191, 36, 0.06);
	}

	.cell-bg.source {
		fill: rgba(245, 158, 11, 0.08);
	}

	/* Pipe powered glow */
	.pipe-powered {
		filter: drop-shadow(0 0 1.5px rgba(251, 191, 36, 0.6));
	}

	/* Source styling */
	.source-circle {
		fill: #f59e0b;
		filter: drop-shadow(0 0 2px rgba(245, 158, 11, 0.8));
		animation: sourcePulse 2s ease-in-out infinite;
	}

	@keyframes sourcePulse {
		0%,
		100% {
			filter: drop-shadow(0 0 1.5px rgba(245, 158, 11, 0.6));
		}
		50% {
			filter: drop-shadow(0 0 3px rgba(251, 191, 36, 1));
		}
	}

	/* Bulb styling */
	.bulb-circle {
		fill: #e5e7eb;
		stroke: #9ca3af;
		stroke-width: 0.3;
		transition: all 0.3s ease;
	}

	.bulb-circle.bulb-on {
		fill: #fde047;
		stroke: #f59e0b;
		filter: drop-shadow(0 0 2px rgba(253, 224, 71, 0.8));
	}

	.bulb-circle.bulb-win {
		animation: bulbGlow 0.6s ease-out;
	}

	@keyframes bulbGlow {
		0% {
			filter: drop-shadow(0 0 2px rgba(253, 224, 71, 0.8));
		}
		50% {
			filter: drop-shadow(0 0 6px rgba(253, 224, 71, 1))
				drop-shadow(0 0 10px rgba(245, 158, 11, 0.6));
		}
		100% {
			filter: drop-shadow(0 0 3px rgba(253, 224, 71, 0.9));
		}
	}

	/* Dot at center of pipe tiles */
	.dot-powered {
		filter: drop-shadow(0 0 1px rgba(251, 191, 36, 0.5));
	}

	/* Touch behavior */
	.tile-group.tappable {
		touch-action: manipulation;
	}

	/* Tap feedback */
	.tile-group.tapped {
		opacity: 0.85;
	}

	.tile-group.tapped rect {
		fill: rgba(245, 158, 11, 0.12) !important;
	}
</style>
