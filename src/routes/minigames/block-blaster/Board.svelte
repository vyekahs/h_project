<script lang="ts">
	import { GRID_SIZE, type BoardGrid, type BlockShape } from '$lib/games/block-blaster/types';
	import { canPlaceBlock } from '$lib/games/block-blaster/gameLogic';
	import type { AbilityFx } from './gameLogic.svelte';
	import type { Snippet } from 'svelte';

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
		isAnimating = false,
		abilityFx = null,
		abilityPreviewCells = [],
		children
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
		abilityFx?: AbilityFx | null;
		abilityPreviewCells?: [number, number][];
		children?: Snippet;
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
		// 블록 중심 보정: 블록 크기의 절반만큼 좌표를 이동
		const blockOffset = getBlockCenterOffset(dragBlock);
		const cell = cellFromXY(dragX - blockOffset.x, dragY - blockOffset.y);
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

	function getCellStep(): number {
		if (!boardEl) return 0;
		const rect = boardEl.getBoundingClientRect();
		const padding = 6;
		const gap = 3;
		const innerWidth = rect.width - padding * 2;
		const cellSize = (innerWidth - gap * (GRID_SIZE - 1)) / GRID_SIZE;
		return cellSize + gap;
	}

	function getBlockCenterOffset(block: BlockShape): { x: number; y: number } {
		const step = getCellStep();
		if (step === 0) return { x: 0, y: 0 };
		let maxR = 0, maxC = 0;
		for (const [r, c] of block.cells) {
			if (r > maxR) maxR = r;
			if (c > maxC) maxC = c;
		}
		return { x: (maxC * step) / 2, y: (maxR * step) / 2 };
	}

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
	export function getCellFromXY(px: number, py: number, block?: BlockShape | null) {
		if (block) {
			const offset = getBlockCenterOffset(block);
			return cellFromXY(px - offset.x, py - offset.y);
		}
		return cellFromXY(px, py);
	}

	function isPlaced(row: number, col: number): boolean {
		return lastPlacedCells.some(([r, c]: [number, number]) => r === row && c === col);
	}

	function isClearing(row: number, col: number): boolean {
		return clearingRows.includes(row) || clearingCols.includes(col);
	}

	function isAbilityPreview(row: number, col: number): boolean {
		return abilityPreviewCells.some(([r, c]: [number, number]) => r === row && c === col);
	}

	function getFxIndex(row: number, col: number): number {
		if (!abilityFx) return -1;
		return abilityFx.cells.findIndex(([r, c]: [number, number]) => r === row && c === col);
	}

	function getFxDelay(row: number, col: number): number {
		if (!abilityFx) return 0;
		// epicenter로부터의 체비셰프 거리에 비례한 지연 → 폭발/광선이 퍼져나가는 느낌
		if (abilityFx.epicenter) {
			const [er, ec] = abilityFx.epicenter;
			const dist = Math.max(Math.abs(row - er), Math.abs(col - ec));
			return dist * 35;
		}
		// epicenter 없는 nuke 등은 무작위 분산
		return Math.random() * 200;
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
				{@const previewing = isAbilityPreview(row, col)}
				{@const fxIdx = getFxIndex(row, col)}
				{@const fx = fxIdx >= 0 ? abilityFx : null}
				{@const fxDelay = fx ? getFxDelay(row, col) : 0}
				<div
					class="cell"
					class:filled={color !== 0}
					class:placed
					class:clearing
					class:ability-preview={previewing}
					class:ability-preview-empty={previewing && color === 0}
					class:ghost-valid={ghost?.valid === true}
					class:ghost-invalid={ghost?.valid === false}
					style={color !== 0 ? `--block-color: var(--block-color-${color})` : (
						ghost?.valid ? `--block-color: var(--block-color-${activeBlock?.color ?? 1})` : ''
					)}
				>
					{#if fx}
						<div
							class="fx fx-{fx.kind}"
							style="animation-delay: {fxDelay}ms"
						></div>
					{/if}
				</div>
			{/each}
		{/each}
	</div>
	{#if children}{@render children()}{/if}
</div>

<style>
	.board-wrapper {
		position: relative;
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

	.cell.hazard {
		animation: hazardFadeIn 0.5s ease-out;
	}

	/* 능력 드래그 미리보기 — 영향 받을 셀 강조 */
	.cell.ability-preview {
		box-shadow: inset 0 0 0 2px #f59e0b, 0 0 8px rgba(245, 158, 11, 0.5);
		animation: previewPulse 0.8s ease-in-out infinite;
	}

	.cell.ability-preview-empty {
		background: rgba(245, 158, 11, 0.18);
	}

	@keyframes previewPulse {
		0%, 100% { box-shadow: inset 0 0 0 2px #f59e0b, 0 0 6px rgba(245, 158, 11, 0.4); }
		50% { box-shadow: inset 0 0 0 2px #fbbf24, 0 0 14px rgba(251, 191, 36, 0.7); }
	}

	/* === Ability FX === */
	.cell {
		position: relative;
	}

	.fx {
		position: absolute;
		inset: -2px;
		border-radius: 6px;
		pointer-events: none;
		z-index: 5;
		opacity: 0;
		animation-fill-mode: forwards;
	}

	/* 폭발 — 주황 → 노랑 → 흰 섬광, 셀이 부서지는 느낌 */
	.fx-bomb {
		background: radial-gradient(circle, #fff 0%, #fde047 40%, #f97316 70%, transparent 100%);
		box-shadow: 0 0 12px #fb923c, 0 0 24px #f97316;
		animation: fxBomb 0.55s cubic-bezier(0.2, 0.7, 0.4, 1);
	}

	@keyframes fxBomb {
		0% { opacity: 0; transform: scale(0.3); }
		15% { opacity: 1; transform: scale(1.4); }
		60% { opacity: 0.9; transform: scale(1.1); }
		100% { opacity: 0; transform: scale(0.6); }
	}

	/* 가로 광선 — 시안 빔이 가로로 휩쓸고 지나감 */
	.fx-beam-row {
		background: linear-gradient(90deg, transparent, #fff 50%, transparent);
		box-shadow: 0 0 16px #67e8f9, 0 0 8px #fff inset;
		animation: fxBeamRow 0.5s cubic-bezier(0.2, 0.7, 0.4, 1);
	}

	@keyframes fxBeamRow {
		0% { opacity: 0; transform: scaleY(0.2); background-position: -100% 0; }
		20% { opacity: 1; transform: scaleY(1.2); }
		70% { opacity: 0.9; transform: scaleY(1); }
		100% { opacity: 0; transform: scaleY(0.4); background-position: 200% 0; }
	}

	/* 세로 광선 */
	.fx-beam-col {
		background: linear-gradient(0deg, transparent, #fff 50%, transparent);
		box-shadow: 0 0 16px #67e8f9, 0 0 8px #fff inset;
		animation: fxBeamCol 0.5s cubic-bezier(0.2, 0.7, 0.4, 1);
	}

	@keyframes fxBeamCol {
		0% { opacity: 0; transform: scaleX(0.2); }
		20% { opacity: 1; transform: scaleX(1.2); }
		70% { opacity: 0.9; transform: scaleX(1); }
		100% { opacity: 0; transform: scaleX(0.4); }
	}

	/* 동색 소거 — 무지개빛 펄스 */
	.fx-color {
		background: radial-gradient(circle, #fff 0%, currentColor 60%, transparent 100%);
		color: var(--block-color, #c084fc);
		box-shadow: 0 0 12px var(--block-color, #c084fc);
		animation: fxColor 0.55s ease-out;
	}

	@keyframes fxColor {
		0% { opacity: 0; transform: scale(0.5) rotate(0deg); }
		25% { opacity: 1; transform: scale(1.3) rotate(180deg); }
		70% { opacity: 0.85; transform: scale(1) rotate(270deg); }
		100% { opacity: 0; transform: scale(0.7) rotate(360deg); }
	}

	/* 핵폭탄 — 흰 섬광 + 강한 글로우 */
	.fx-nuke {
		background: radial-gradient(circle, #fff, #fef3c7 50%, #fb7185 100%);
		box-shadow: 0 0 24px #fff, 0 0 48px #f43f5e;
		animation: fxNuke 0.65s cubic-bezier(0.2, 0.7, 0.4, 1);
	}

	@keyframes fxNuke {
		0% { opacity: 0; transform: scale(0.2); filter: brightness(2); }
		10% { opacity: 1; transform: scale(1.6); filter: brightness(2.5); }
		60% { opacity: 0.8; transform: scale(1); filter: brightness(1.5); }
		100% { opacity: 0; transform: scale(0.4); filter: brightness(1); }
	}

	@keyframes hazardFadeIn {
		0% {
			opacity: 0;
			transform: scale(0.6);
			box-shadow: 0 0 12px rgba(239, 68, 68, 0.8);
		}
		60% {
			opacity: 1;
			transform: scale(1.15);
		}
		100% {
			opacity: 1;
			transform: scale(1);
			box-shadow: none;
		}
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
