<script lang="ts">
	import type { BlockShape } from '$lib/games/block-blaster/types';

	let { blocks } = $props<{ blocks: BlockShape[] }>();

	function getShapeBounds(cells: [number, number][]) {
		let maxR = 0;
		let maxC = 0;
		for (const [r, c] of cells) {
			if (r > maxR) maxR = r;
			if (c > maxC) maxC = c;
		}
		return { rows: maxR + 1, cols: maxC + 1 };
	}
</script>

<div class="peek-strip">
	<span class="peek-label">NEXT</span>
	<div class="peek-blocks">
		{#each blocks as block, bi}
			{#if block}
				{@const b = getShapeBounds(block.cells)}
				<div class="peek-block" class:dimmed={bi > 0}>
					<div
						class="peek-grid"
						style="
							grid-template-rows: repeat({b.rows}, 10px);
							grid-template-columns: repeat({b.cols}, 10px);
						"
					>
						{#each Array(b.rows * b.cols) as _, idx}
							{@const r = Math.floor(idx / b.cols)}
							{@const c = idx % b.cols}
							{@const filled = block.cells.some(([cr, cc]: [number, number]) => cr === r && cc === c)}
							<div
								class="peek-cell"
								class:filled
								style={filled ? `--c: var(--block-color-${block.color})` : ''}
							></div>
						{/each}
					</div>
				</div>
			{/if}
		{/each}
	</div>
</div>

<style>
	.peek-strip {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.4rem 0.2rem;
		flex-shrink: 0;
		overflow-x: auto;
		max-width: 100%;
	}

	.peek-label {
		font-size: 0.6rem;
		font-weight: 800;
		letter-spacing: 1.5px;
		color: #a855f7;
		flex-shrink: 0;
	}

	.peek-blocks {
		display: flex;
		gap: 1.6rem;
		align-items: center;
		flex: 1;
		min-width: 0;
	}

	.peek-block {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 24px;
		min-height: 24px;
	}

	.peek-block.dimmed {
		opacity: 0.55;
	}

	.peek-grid {
		display: grid;
		gap: 3px;
	}

	.peek-cell {
		border-radius: 2px;
		background: transparent;
	}

	.peek-cell.filled {
		background: var(--c);
		border-radius: 2px;
	}
</style>
