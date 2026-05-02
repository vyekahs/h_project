<script lang="ts">
	import type { CellColor } from '$lib/games/block-blaster/types';

	let { cellCount, onConfirm, onCancel } = $props<{
		cellCount: number; // 그릴 셀 개수 (2 또는 3)
		onConfirm: (cells: [number, number][], color: CellColor) => void;
		onCancel: () => void;
	}>();

	const GRID_SIZE = 3; // 모달 내부 작도 그리드 (3×3)
	const COLOR_COUNT = 5;

	let selected: [number, number][] = $state([]);
	let color: CellColor = $state(((Math.floor(Math.random() * COLOR_COUNT) + 1) as CellColor));

	function isSelected(r: number, c: number): boolean {
		return selected.some(([sr, sc]) => sr === r && sc === c);
	}

	/** 인접한 셀들로만 구성되었는지 (BFS) */
	function isConnected(cells: [number, number][]): boolean {
		if (cells.length === 0) return true;
		if (cells.length === 1) return true;
		const set = new Set(cells.map(([r, c]) => `${r},${c}`));
		const visited = new Set<string>();
		const start = cells[0];
		const queue: [number, number][] = [start];
		visited.add(`${start[0]},${start[1]}`);
		while (queue.length > 0) {
			const [r, c] = queue.shift()!;
			for (const [dr, dc] of [
				[-1, 0],
				[1, 0],
				[0, -1],
				[0, 1]
			]) {
				const nr = r + dr;
				const nc = c + dc;
				const key = `${nr},${nc}`;
				if (set.has(key) && !visited.has(key)) {
					visited.add(key);
					queue.push([nr, nc]);
				}
			}
		}
		return visited.size === cells.length;
	}

	function toggleCell(r: number, c: number) {
		if (isSelected(r, c)) {
			selected = selected.filter(([sr, sc]) => !(sr === r && sc === c));
			return;
		}
		if (selected.length >= cellCount) {
			// 가득 찬 상태에서 새 셀 클릭 → 가장 오래된 셀 제거 후 추가
			selected = [...selected.slice(1), [r, c]];
			return;
		}
		selected = [...selected, [r, c]];
	}

	const canConfirm = $derived(selected.length >= 1 && selected.length <= cellCount && isConnected(selected));

	function confirm() {
		if (!canConfirm) return;
		// 정규화: 좌상단 (0,0) 기준으로 이동
		let minR = Infinity;
		let minC = Infinity;
		for (const [r, c] of selected) {
			if (r < minR) minR = r;
			if (c < minC) minC = c;
		}
		const normalized = selected.map(([r, c]) => [r - minR, c - minC] as [number, number]);
		onConfirm(normalized, color);
	}

	function clear() {
		selected = [];
	}

	function pickColor(c: number) {
		color = c as CellColor;
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="overlay" onclick={onCancel}>
	<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
		<h2>블록 그리기</h2>
		<p class="subtitle">
			인접한 셀 <strong>최대 {cellCount}개</strong>까지 선택
			<span class="count">({selected.length}/{cellCount})</span>
		</p>

		<div class="draw-grid">
			{#each Array(GRID_SIZE * GRID_SIZE) as _, idx}
				{@const r = Math.floor(idx / GRID_SIZE)}
				{@const c = idx % GRID_SIZE}
				{@const sel = isSelected(r, c)}
				<button
					class="draw-cell"
					class:selected={sel}
					style={sel ? `--c: var(--block-color-${color})` : ''}
					onclick={() => toggleCell(r, c)}
					aria-label="셀 {r},{c}"
				></button>
			{/each}
		</div>

		<div class="color-row">
			{#each Array(COLOR_COUNT) as _, i}
				{@const cc = i + 1}
				<button
					class="color-swatch"
					class:active={color === cc}
					style="background: var(--block-color-{cc})"
					onclick={() => pickColor(cc)}
					aria-label="색상 {cc}"
				></button>
			{/each}
		</div>

		{#if !isConnected(selected) && selected.length > 1}
			<p class="warn">셀들이 모두 인접해 있어야 합니다.</p>
		{/if}

		<div class="actions">
			<button class="btn-secondary" onclick={clear}>초기화</button>
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
		margin: 0 0 0.85rem;
		text-align: center;
		font-size: 0.78rem;
		color: rgba(255, 255, 255, 0.7);
	}

	.count {
		color: #fbbf24;
		font-weight: 700;
		margin-left: 0.3rem;
	}

	.draw-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		grid-template-rows: repeat(3, 1fr);
		gap: 6px;
		width: 180px;
		height: 180px;
		margin: 0 auto 0.85rem;
	}

	.draw-cell {
		border: 1.5px dashed rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.03);
		cursor: pointer;
		font-family: inherit;
		padding: 0;
		transition: transform 0.1s, background 0.1s, border-color 0.1s;
	}

	.draw-cell:active {
		transform: scale(0.92);
	}

	.draw-cell.selected {
		background: var(--c);
		border-color: rgba(255, 255, 255, 0.4);
		border-style: solid;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
	}

	.color-row {
		display: flex;
		justify-content: center;
		gap: 0.5rem;
		margin-bottom: 0.85rem;
	}

	.color-swatch {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 2px solid transparent;
		cursor: pointer;
		padding: 0;
		transition: transform 0.1s, border-color 0.1s;
	}

	.color-swatch:active {
		transform: scale(0.9);
	}

	.color-swatch.active {
		border-color: #fff;
		box-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
	}

	.warn {
		margin: 0 0 0.75rem;
		text-align: center;
		font-size: 0.7rem;
		color: #f87171;
		font-weight: 600;
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
