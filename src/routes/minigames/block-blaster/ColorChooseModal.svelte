<script lang="ts">
	import type { CellColor } from '$lib/games/block-blaster/types';

	let { availableColors, level, onConfirm, onCancel } = $props<{
		availableColors: CellColor[];
		level: number;
		onConfirm: (colors: CellColor[]) => void;
		onCancel: () => void;
	}>();

	let selected: CellColor[] = $state([]);
	const maxPick = $derived(level); // Lv1=1, Lv2=2, Lv3=3

	function isSelected(c: CellColor): boolean {
		return selected.includes(c);
	}

	function toggle(c: CellColor) {
		if (isSelected(c)) {
			selected = selected.filter(x => x !== c);
			return;
		}
		if (selected.length >= maxPick) {
			// 가득 찬 상태에서 새 색 클릭 → 가장 오래된 선택 제거 후 추가
			selected = [...selected.slice(1), c];
			return;
		}
		selected = [...selected, c];
	}

	const canConfirm = $derived(selected.length >= 1);

	function confirm() {
		if (!canConfirm) return;
		onConfirm(selected);
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="overlay" onclick={onCancel}>
	<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
		<h2>제거할 색 선택</h2>
		<p class="subtitle">
			최대 <strong>{maxPick}개</strong>까지 선택
			<span class="count">({selected.length}/{maxPick})</span>
		</p>

		<div class="swatches">
			{#each availableColors as c}
				{@const isSel = isSelected(c)}
				<button
					class="swatch"
					class:selected={isSel}
					style="--c: var(--block-color-{c})"
					onclick={() => toggle(c)}
					aria-label="색상 {c}"
				>
					<div class="swatch-inner"></div>
				</button>
			{/each}
		</div>

		<div class="actions">
			<button class="btn-secondary" onclick={onCancel}>취소</button>
			<button class="btn-primary" disabled={!canConfirm} onclick={confirm}>확인</button>
		</div>
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
		max-width: 320px;
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

	.count {
		color: #fbbf24;
		font-weight: 700;
		margin-left: 0.3rem;
	}

	.swatches {
		display: flex;
		justify-content: center;
		gap: 0.6rem;
		margin-bottom: 1.25rem;
		flex-wrap: wrap;
	}

	.swatch {
		width: 52px;
		height: 52px;
		border-radius: 14px;
		border: 3px solid transparent;
		background: transparent;
		cursor: pointer;
		padding: 4px;
		transition: transform 0.1s, border-color 0.1s, box-shadow 0.15s;
	}

	.swatch:active {
		transform: scale(0.92);
	}

	.swatch-inner {
		width: 100%;
		height: 100%;
		border-radius: 8px;
		background: var(--c);
	}

	.swatch.selected {
		border-color: #fff;
		transform: scale(1.1);
		box-shadow: 0 0 16px var(--c), 0 4px 12px rgba(0, 0, 0, 0.4);
	}

	.actions {
		display: flex;
		gap: 0.4rem;
	}

	.btn-secondary, .btn-primary {
		flex: 1;
		padding: 0.65rem;
		border: none;
		border-radius: 12px;
		font-family: inherit;
		font-size: 0.8rem;
		font-weight: 700;
		cursor: pointer;
	}

	.btn-secondary {
		background: rgba(255, 255, 255, 0.08);
		color: #fff;
	}

	.btn-primary {
		background: linear-gradient(135deg, #a855f7, #6366f1);
		color: #fff;
		box-shadow: 0 2px 8px rgba(168, 85, 247, 0.4);
	}

	.btn-primary:disabled {
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.3);
		cursor: not-allowed;
		box-shadow: none;
	}

	.btn-secondary:active, .btn-primary:not(:disabled):active {
		transform: scale(0.97);
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
