<script lang="ts">
	import type { BlockShape } from '$lib/games/block-blaster/types';

	let {
		blocks,
		selectedIndex,
		onSelect,
		onDragStart,
		isLocked = () => false,
		slotLockColor = () => null
	} = $props<{
		blocks: (BlockShape | null)[];
		selectedIndex: number | null;
		onSelect: (index: number) => void;
		onDragStart: (index: number, e: PointerEvent) => void;
		isLocked?: (index: number) => boolean;
		/** 잠긴 슬롯에 표시할 매칭 색 (없으면 null). 색 매칭은 위험 셀과 동일. */
		slotLockColor?: (index: number) => string | null;
	}>();

	function getShapeBounds(cells: [number, number][]) {
		let maxR = 0;
		let maxC = 0;
		for (const [r, c] of cells) {
			if (r > maxR) maxR = r;
			if (c > maxC) maxC = c;
		}
		return { rows: maxR + 1, cols: maxC + 1 };
	}

	function handlePointerDown(i: number, e: PointerEvent) {
		if (!blocks[i]) return;
		if (isLocked(i)) return;
		onDragStart(i, e);
	}
</script>

<div class="tray">
	{#each blocks as block, i}
		{@const locked = isLocked(i)}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="tray-slot"
			class:selected={selectedIndex === i && block !== null}
			class:empty={block === null && !locked}
			class:locked
			onpointerdown={(e) => handlePointerDown(i, e)}
			role="button"
			tabindex={block && !locked ? 0 : -1}
			aria-label={locked ? '잠긴 슬롯' : block ? `블록 ${i + 1} 선택` : `빈 슬롯`}
		>
			{#if locked}
				<svg class="lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<rect x="5" y="11" width="14" height="10" rx="2" />
					<path d="M8 11V7a4 4 0 0 1 8 0v4" />
				</svg>
				{@const lockColor = slotLockColor(i)}
				{#if lockColor}
					<span class="slot-lock-dot" style="background: {lockColor}"></span>
				{/if}
			{:else if block}
				{@const bounds = getShapeBounds(block.cells)}
				<div
					class="mini-grid"
					style="
						grid-template-rows: repeat({bounds.rows}, 1fr);
						grid-template-columns: repeat({bounds.cols}, 1fr);
					"
				>
					{#each Array(bounds.rows * bounds.cols) as _, idx}
						{@const r = Math.floor(idx / bounds.cols)}
						{@const c = idx % bounds.cols}
						{@const filled = block.cells.some(([cr, cc]: [number, number]) => cr === r && cc === c)}
						<div
							class="mini-cell"
							class:filled
							style={filled ? `--block-color: var(--block-color-${block.color})` : ''}
						></div>
					{/each}
				</div>
			{/if}
		</div>
	{/each}
</div>

<style>
	.tray {
		display: flex;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.25rem 0.25rem;
		width: 100%;
		flex-shrink: 0;
		box-sizing: border-box;
	}

	.tray-slot {
		flex: 1 1 0;
		min-width: 0;
		max-width: 100px;
		aspect-ratio: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-elevated);
		border: 2px solid transparent;
		border-radius: 12px;
		cursor: pointer;
		position: relative;
		transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
		padding: 8px;
		box-sizing: border-box;
		touch-action: none;
	}

	.tray-slot.selected {
		border-color: var(--accent, #8b5cf6);
		box-shadow: 0 0 12px rgba(139, 92, 246, 0.4);
	}

	.tray-slot.empty {
		opacity: 0.2;
		cursor: default;
		pointer-events: none;
	}

	.tray-slot.locked {
		background: rgba(0, 0, 0, 0.3);
		border-color: rgba(239, 68, 68, 0.5);
		cursor: not-allowed;
		pointer-events: none;
		color: rgba(239, 68, 68, 0.85);
	}

	.lock-icon {
		width: 60%;
		height: 60%;
		opacity: 0.8;
		filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
	}

	/* 매칭 색 점 — 잠긴 슬롯 우상단에 작게 (Board 위험 셀과 동일 색) */
	.slot-lock-dot {
		position: absolute;
		top: 4px;
		right: 4px;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		box-shadow: 0 0 4px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.5);
	}

	.mini-grid {
		display: grid;
		gap: 2px;
		/* 화면 폭에 비례하여 자동 조정 */
		--cell-size: clamp(8px, 3vw, 14px);
	}

	.mini-cell {
		width: var(--cell-size);
		height: var(--cell-size);
		border-radius: 2px;
		background: transparent;
	}

	.mini-cell.filled {
		background: var(--block-color);
		border-radius: 3px;
	}

	/* Block color variables */
	:global(:root) {
		--block-color-1: #60a5fa;
		--block-color-2: #4ade80;
		--block-color-3: #facc15;
		--block-color-4: #f87171;
		--block-color-5: #c084fc;
	}
</style>
