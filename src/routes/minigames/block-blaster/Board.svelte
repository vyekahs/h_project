<script lang="ts">
	import { GRID_SIZE, type BoardGrid, type BlockShape } from '$lib/games/block-blaster/types';
	import { canPlaceBlock } from '$lib/games/block-blaster/gameLogic';

	let {
		grid,
		selectedBlock = null,
		dragBlock = null,
		dragX = 0,
		dragY = 0,
		onCellClick,
		onDrop,
		lastPlacedCells = [],
		clearingRows = [],
		clearingCols = [],
		isAnimating = false
	} = $props<{
		grid: BoardGrid;
		selectedBlock: BlockShape | null;
		dragBlock: BlockShape | null;
		dragX: number;
		dragY: number;
		onCellClick: (row: number, col: number) => void;
		onDrop: (row: number, col: number) => void;
		lastPlacedCells: [number, number][];
		clearingRows: number[];
		clearingCols: number[];
		isAnimating: boolean;
	}>();

	let boardEl = $state<HTMLDivElement | null>(null);

	// Ghost preview state
	let ghostCells: { row: number; col: number; valid: boolean }[] = $state([]);

	// 현재 활성 블록 (탭 선택 또는 드래그 중인 블록)
	const activeBlock = $derived(dragBlock ?? selectedBlock);

	// 블록 선택/드래그 해제 시 고스트 자동 초기화
	$effect(() => {
		if (!activeBlock) {
			ghostCells = [];
		}
	});

	// 드래그 중일 때 좌표 기반으로 고스트 업데이트
	$effect(() => {
		if (!dragBlock || !boardEl || isAnimating) {
			if (dragBlock === null && selectedBlock === null) {
				ghostCells = [];
			}
			return;
		}
		const cell = cellFromXY(dragX, dragY);
		if (!cell) {
			ghostCells = [];
			return;
		}
		const valid = canPlaceBlock(grid, dragBlock, cell.row, cell.col);
		ghostCells = dragBlock.cells
			.map(([dr, dc]: [number, number]) => ({
				row: cell.row + dr,
				col: cell.col + dc,
				valid
			}))
			.filter((g: { row: number; col: number; valid: boolean }) =>
				g.row >= 0 && g.row < GRID_SIZE && g.col >= 0 && g.col < GRID_SIZE
			);
	});

	function cellFromXY(px: number, py: number): { row: number; col: number } | null {
		if (!boardEl) return null;
		const rect = boardEl.getBoundingClientRect();
		const padding = 6;
		const gap = 3;

		const x = px - rect.left - padding;
		const y = py - rect.top - padding;

		const innerWidth = rect.width - padding * 2;
		const cellSize = (innerWidth - gap * (GRID_SIZE - 1)) / GRID_SIZE;
		const step = cellSize + gap;

		const col = Math.floor(x / step);
		const row = Math.floor(y / step);

		if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return null;
		return { row, col };
	}

	function cellFromPointer(e: PointerEvent): { row: number; col: number } | null {
		return cellFromXY(e.clientX, e.clientY);
	}

	// 탭 모드: 선택된 블록의 고스트 (마우스/데스크톱)
	function updateTapGhost(e: PointerEvent) {
		if (!selectedBlock || dragBlock || isAnimating) {
			if (!dragBlock) ghostCells = [];
			return;
		}
		const cell = cellFromPointer(e);
		if (!cell) {
			ghostCells = [];
			return;
		}
		const valid = canPlaceBlock(grid, selectedBlock, cell.row, cell.col);
		ghostCells = selectedBlock.cells
			.map(([dr, dc]: [number, number]) => ({
				row: cell.row + dr,
				col: cell.col + dc,
				valid
			}))
			.filter((g: { row: number; col: number; valid: boolean }) =>
				g.row >= 0 && g.row < GRID_SIZE && g.col >= 0 && g.col < GRID_SIZE
			);
	}

	function clearTapGhost() {
		if (!dragBlock) {
			ghostCells = [];
		}
	}

	function handleClick(e: PointerEvent) {
		if (isAnimating || dragBlock) return;
		const cell = cellFromPointer(e);
		if (cell) {
			onCellClick(cell.row, cell.col);
		}
	}

	// 드롭 처리: page에서 pointerup 시 Board 좌표 계산용으로 export
	export function getCellFromXY(px: number, py: number) {
		return cellFromXY(px, py);
	}

	function isPlaced(row: number, col: number): boolean {
		return lastPlacedCells.some(([r, c]: [number, number]) => r === row && c === col);
	}

	function isClearing(row: number, col: number): boolean {
		return clearingRows.includes(row) || clearingCols.includes(col);
	}

	function getGhost(row: number, col: number) {
		return ghostCells.find(g => g.row === row && g.col === col) ?? null;
	}
</script>

<div
	class="board-wrapper"
	role="grid"
	tabindex="0"
	aria-label="Block Blaster game board"
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="board"
		bind:this={boardEl}
		onpointermove={updateTapGhost}
		onpointerleave={clearTapGhost}
		onpointerup={handleClick}
	>
		{#each Array(GRID_SIZE) as _, row}
			{#each Array(GRID_SIZE) as _, col}
				{@const color = grid[row][col]}
				{@const ghost = getGhost(row, col)}
				{@const placed = isPlaced(row, col)}
				{@const clearing = isClearing(row, col) && color !== 0}
				<div
					class="cell"
					class:filled={color !== 0}
					class:placed
					class:clearing
					class:ghost-valid={ghost?.valid === true}
					class:ghost-invalid={ghost?.valid === false}
					style={color !== 0 ? `--block-color: var(--block-color-${color})` : (
						ghost?.valid ? `--block-color: var(--block-color-${activeBlock?.color ?? 1})` : ''
					)}
				></div>
			{/each}
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
		width: 100%;
		height: 100%;
		background: var(--bg-elevated);
		border-radius: 12px;
		padding: 6px;
		display: grid;
		grid-template-columns: repeat(8, 1fr);
		grid-template-rows: repeat(8, 1fr);
		gap: 3px;
	}

	.cell {
		background: var(--bg-tertiary);
		border-radius: 4px;
		transition: background 0.1s ease;
	}

	.cell.filled {
		background: var(--block-color);
	}

	.cell.placed {
		animation: cellSpawn 0.2s ease-out;
	}

	.cell.clearing {
		animation: cellClear 0.3s ease-in forwards;
	}

	.cell.ghost-valid:not(.filled) {
		background: var(--block-color);
		opacity: 0.4;
	}

	.cell.ghost-invalid:not(.filled) {
		background: #f87171;
		opacity: 0.25;
	}

	@keyframes cellSpawn {
		0% { transform: scale(0); }
		60% { transform: scale(1.1); }
		100% { transform: scale(1); }
	}

	@keyframes cellClear {
		0% {
			background: #ffffff;
			transform: scale(1);
			opacity: 1;
		}
		50% {
			background: var(--block-color);
			transform: scale(1.05);
			opacity: 0.8;
		}
		100% {
			transform: scale(0);
			opacity: 0;
		}
	}
</style>
