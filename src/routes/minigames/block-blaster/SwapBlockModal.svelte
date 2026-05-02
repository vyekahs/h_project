<script lang="ts">
	import type { BlockShape } from '$lib/games/block-blaster/types';

	let { options, onPick, onCancel } = $props<{
		options: BlockShape[];
		onPick: (option: BlockShape) => void;
		onCancel: () => void;
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
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="overlay" onclick={onCancel}>
	<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
		<h2>교체할 블록 선택</h2>
		<p class="subtitle">{options.length}개 후보 중 1개를 골라 교체합니다</p>
		<div class="options">
			{#each options as opt}
				{@const b = getShapeBounds(opt.cells)}
				<button class="option" onclick={() => onPick(opt)}>
					<div
						class="opt-grid"
						style="
							grid-template-rows: repeat({b.rows}, 14px);
							grid-template-columns: repeat({b.cols}, 14px);
						"
					>
						{#each Array(b.rows * b.cols) as _, idx}
							{@const r = Math.floor(idx / b.cols)}
							{@const c = idx % b.cols}
							{@const filled = opt.cells.some(([cr, cc]: [number, number]) => cr === r && cc === c)}
							<div
								class="opt-cell"
								class:filled
								style={filled ? `--c: var(--block-color-${opt.color})` : ''}
							></div>
						{/each}
					</div>
				</button>
			{/each}
		</div>
		<button class="cancel-btn" onclick={onCancel}>취소</button>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		z-index: 280;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		animation: fadeIn 0.2s ease-out;
	}

	.modal {
		width: 100%;
		max-width: 380px;
		background: linear-gradient(135deg, #1f2937, #111827);
		border: 2px solid rgba(168, 85, 247, 0.5);
		border-radius: 18px;
		padding: 1.25rem 1rem;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 24px rgba(168, 85, 247, 0.3);
		color: #fff;
		animation: popIn 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	h2 {
		margin: 0 0 0.25rem;
		font-size: 1.05rem;
		font-weight: 800;
		text-align: center;
	}

	.subtitle {
		margin: 0 0 1rem;
		text-align: center;
		font-size: 0.78rem;
		color: rgba(255, 255, 255, 0.7);
	}

	.options {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
		gap: 0.5rem;
		margin-bottom: 0.85rem;
	}

	.option {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 80px;
		padding: 0.6rem;
		border: 1.5px solid rgba(255, 255, 255, 0.15);
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.04);
		cursor: pointer;
		font-family: inherit;
		transition: transform 0.1s, border-color 0.1s, background 0.1s;
	}

	.option:active {
		transform: scale(0.96);
		background: rgba(168, 85, 247, 0.2);
		border-color: rgba(168, 85, 247, 0.7);
	}

	.opt-grid {
		display: grid;
		gap: 2px;
	}

	.opt-cell {
		border-radius: 2px;
		background: transparent;
	}

	.opt-cell.filled {
		background: var(--c);
		border-radius: 3px;
	}

	.cancel-btn {
		width: 100%;
		padding: 0.7rem;
		border: none;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.08);
		color: #fff;
		font-family: inherit;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
	}

	.cancel-btn:active {
		transform: scale(0.98);
		background: rgba(255, 255, 255, 0.15);
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes popIn {
		from { opacity: 0; transform: scale(0.95); }
		to { opacity: 1; transform: scale(1); }
	}
</style>
