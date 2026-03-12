<script lang="ts">
	import type { Cell } from '$lib/games/train-tracks/types';

	let {
		grid,
		rowCounts,
		colCounts,
		rowStatus,
		colStatus,
		isGameOver = false,
		showWinAnimation = false,
		errorCell = null,
		oncellclick
	}: {
		grid: Cell[][];
		rowCounts: number[];
		colCounts: number[];
		rowStatus: ('correct' | 'over' | 'under')[];
		colStatus: ('correct' | 'over' | 'under')[];
		isGameOver?: boolean;
		showWinAnimation?: boolean;
		errorCell?: { row: number; col: number } | null;
		oncellclick: (row: number, col: number) => void;
	} = $props();

	const gridSize = $derived(grid.length || 5);
	const totalSize = $derived(gridSize + 1); // extra row/col for labels
	const cellSize = $derived(100 / totalSize);
	const offsetX = $derived(cellSize); // grid starts after label column
	const offsetY = $derived(cellSize); // grid starts after label row

	const railWidth = $derived(cellSize * 0.08);

	function cellX(c: number) { return offsetX + c * cellSize; }
	function cellY(r: number) { return offsetY + r * cellSize; }
	function cellCX(c: number) { return cellX(c) + cellSize / 2; }
	function cellCY(r: number) { return cellY(r) + cellSize / 2; }

	function statusColor(status: 'correct' | 'over' | 'under'): string {
		if (status === 'correct') return '#16a34a';
		if (status === 'over') return '#dc2626';
		return '#333';
	}

	// straight/curve: 898x1168 → scale width to cellSize, height proportional, then clip
	const imgRealH = $derived(cellSize * (1168 / 898));
	const imgYOffset = $derived((cellSize - imgRealH) / 2);
</script>

<div class="board-wrapper" class:win-animation={showWinAnimation}>
	<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
		<defs>
			<filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
				<feGaussianBlur stdDeviation="0.8" result="blur" />
				<feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
			</filter>
			<filter id="glow-blue" x="-50%" y="-50%" width="200%" height="200%">
				<feGaussianBlur stdDeviation="0.8" result="blur" />
				<feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
			</filter>
		</defs>

		<!-- Column count labels (top row) -->
		{#each colCounts as count, c}
			<text
				x={cellCX(c)}
				y={cellSize * 0.6}
				text-anchor="middle"
				dominant-baseline="middle"
				font-size={cellSize * 0.4}
				font-weight="700"
				fill={colStatus[c] ? statusColor(colStatus[c]) : '#333'}
			>{count}</text>
		{/each}

		<!-- Row count labels (left column) -->
		{#each rowCounts as count, r}
			<text
				x={cellSize * 0.5}
				y={cellCY(r)}
				text-anchor="middle"
				dominant-baseline="middle"
				font-size={cellSize * 0.4}
				font-weight="700"
				fill={rowStatus[r] ? statusColor(rowStatus[r]) : '#333'}
			>{count}</text>
		{/each}

		<!-- Grid cells background -->
		{#each grid as row, r}
			{#each row as cell, c}
				<rect
					x={cellX(c)}
					y={cellY(r)}
					width={cellSize}
					height={cellSize}
					fill={cell.isStart ? '#dcfce7' : cell.isFinish ? '#dbeafe' : cell.isFixed ? '#f5f0e8' : '#fff'}
					stroke="#ccc"
					stroke-width="0.3"
				/>
			{/each}
		{/each}

		<!-- Track pieces -->
		{#each grid as row, r}
			{#each row as cell, c}
				{@const cx = cellCX(c)}
				{@const cy = cellCY(r)}
				{@const x = cellX(c)}
				{@const y = cellY(r)}
				{@const cs = cellSize}

				{#if cell.trackType === 'straight'}
					<clipPath id="clip-{r}-{c}">
						<rect x={x} y={y} width={cs} height={cs} />
					</clipPath>
					<g transform="rotate({cell.rotation * 90}, {cx}, {cy})" clip-path="url(#clip-{r}-{c})">
						<image
							href="/train/straight.svg"
							x={x} y={y + imgYOffset}
							width={cs} height={imgRealH}
							opacity={cell.isFixed ? 1 : 0.85}
						/>
					</g>
				{:else if cell.trackType === 'corner'}
					<clipPath id="clip-{r}-{c}">
						<rect x={x} y={y} width={cs} height={cs} />
					</clipPath>
					<g transform="rotate({(cell.rotation - 1) * 90}, {cx}, {cy})" clip-path="url(#clip-{r}-{c})">
						<image
							href="/train/curve.svg"
							x={x} y={y + imgYOffset}
							width={cs} height={imgRealH}
							opacity={cell.isFixed ? 1 : 0.85}
						/>
					</g>
				{:else if cell.trackType === 'start' || cell.trackType === 'finish'}
					<g transform="rotate({(cell.rotation - 1) * 90}, {cx}, {cy})">
						<image
							href={cell.trackType === 'start' ? '/train/start.svg' : '/train/stop.svg'}
							x={x} y={y}
							width={cs} height={cs}
						/>
					</g>
				{/if}

				<!-- Player marked empty (X) -->
				{#if cell.playerMarkedEmpty && cell.trackType === 'empty'}
					<line x1={x + cs * 0.25} y1={y + cs * 0.25} x2={x + cs * 0.75} y2={y + cs * 0.75}
						stroke="#ccc" stroke-width={railWidth * 1.5} stroke-linecap="round" />
					<line x1={x + cs * 0.75} y1={y + cs * 0.25} x2={x + cs * 0.25} y2={y + cs * 0.75}
						stroke="#ccc" stroke-width={railWidth * 1.5} stroke-linecap="round" />
				{/if}

				<!-- Start/Finish glow border (on top of track) -->
				{#if cell.isStart || cell.isFinish}
					<rect
						x={cellX(c)}
						y={cellY(r)}
						width={cellSize}
						height={cellSize}
						fill="none"
						stroke={cell.isStart ? '#16a34a' : '#2563eb'}
						stroke-width="0.7"
						filter={cell.isStart ? 'url(#glow-green)' : 'url(#glow-blue)'}
					/>
				{/if}

				<!-- Error flash overlay -->
				{#if errorCell && errorCell.row === r && errorCell.col === c}
					<rect
						x={cellX(c)}
						y={cellY(r)}
						width={cellSize}
						height={cellSize}
						fill="#ef4444"
						opacity="0"
					>
						<animate attributeName="opacity" values="0;0.4;0" dur="0.6s" repeatCount="2" />
					</rect>
				{/if}

				<!-- Click target -->
				{#if !cell.isFixed && !isGameOver}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<rect
						x={cellX(c)}
						y={cellY(r)}
						width={cellSize}
						height={cellSize}
						fill="transparent"
						style="cursor: pointer"
						onclick={() => oncellclick(r, c)}
					/>
				{/if}
			{/each}
		{/each}
	</svg>
</div>

<style>
	.board-wrapper {
		width: 100%;
		max-width: 500px;
		aspect-ratio: 1;
		margin: 0 auto;
	}

	.board-wrapper svg {
		width: 100%;
		height: 100%;
		display: block;
	}

	.win-animation {
		animation: winPulse 0.6s ease-in-out 2;
	}

	@keyframes winPulse {
		0%, 100% { filter: none; }
		50% { filter: brightness(1.1) drop-shadow(0 0 8px rgba(22, 163, 74, 0.4)); }
	}
</style>
