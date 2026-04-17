<script lang="ts">
	import type { BlockShape } from '$lib/games/block-blaster/types';

	let {
		blocks,
		selectedIndex,
		onSelect,
		onDragStart
	} = $props<{
		blocks: (BlockShape | null)[];
		selectedIndex: number | null;
		onSelect: (index: number) => void;
		onDragStart: (index: number, e: PointerEvent) => void;
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
		onDragStart(i, e);
	}
</script>

<div class="tray">
	{#each blocks as block, i}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="tray-slot"
			class:selected={selectedIndex === i && block !== null}
			class:empty={block === null}
			onpointerdown={(e) => handlePointerDown(i, e)}
			role="button"
			tabindex={block ? 0 : -1}
			aria-label={block ? `블록 ${i + 1} 선택` : `빈 슬롯`}
		>
			{#if block}
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
		gap: 0.75rem;
		padding: 0.75rem 0;
		width: 100%;
		flex-shrink: 0;
	}

	.tray-slot {
		width: 100px;
		height: 100px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-elevated);
		border: 2px solid transparent;
		border-radius: 12px;
		cursor: pointer;
		transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
		padding: 10px;
		flex-shrink: 0;
		touch-action: none;
	}

	.tray-slot.selected {
		transform: scale(1.05);
		border-color: var(--accent, #8b5cf6);
		box-shadow: 0 0 12px rgba(139, 92, 246, 0.3);
	}

	.tray-slot.empty {
		opacity: 0.2;
		cursor: default;
		pointer-events: none;
	}

	.mini-grid {
		display: grid;
		gap: 2px;
		--cell-size: 14px;
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
