<script lang="ts">
	import { ENERGY_TUTORIALS, type EnergyTutorialTile } from './energyTutorialData';

	let { tutorialId = 'energy_easy_1', onclose } = $props();

	let step = $state(0);

	let tutorial = $derived(ENERGY_TUTORIALS[tutorialId] || ENERGY_TUTORIALS['energy_easy_1']);
	let currentStepData = $derived(tutorial.steps[step]);
	let totalSteps = $derived(tutorial.steps.length);

	function next() {
		if (step < totalSteps - 1) step++;
		else onclose();
	}

	function prev() {
		if (step > 0) step--;
	}

	// Grid helpers
	let gridSize = $derived(currentStepData.gridSize || 3);
	let cellSize = $derived(100 / gridSize);
	let half = $derived(cellSize / 2);
	let pipeWidth = $derived(cellSize * 0.28);

	function isHighlighted(r: number, c: number): boolean {
		return currentStepData.highlightCells?.includes(`cell-${r}-${c}`) ?? false;
	}

	function isAnimateRotate(r: number, c: number): boolean {
		const a = currentStepData.animateRotate;
		return a ? a.row === r && a.col === c : false;
	}

	function getTile(r: number, c: number): EnergyTutorialTile | null {
		return currentStepData.tiles?.find((t) => t.row === r && t.col === c) ?? null;
	}

	// SVG path helpers (same as Board.svelte)
	function straightPath(s: number): string {
		const h = s / 2;
		return `M 0 ${h} L ${s} ${h}`;
	}

	function cornerPath(s: number): string {
		const h = s / 2;
		return `M ${h} 0 L ${h} ${h} L ${s} ${h}`;
	}

	function teePath(s: number): string {
		const h = s / 2;
		return `M ${h} 0 L ${h} ${s} M ${h} ${h} L ${s} ${h}`;
	}

	function crossPath(s: number): string {
		const h = s / 2;
		return `M 0 ${h} L ${s} ${h} M ${h} 0 L ${h} ${s}`;
	}

	function bulbPath(s: number): string {
		const h = s / 2;
		return `M ${h} ${s} L ${h} ${h}`;
	}

	function getPipePath(type: string, s: number): string {
		switch (type) {
			case 'straight':
				return straightPath(s);
			case 'corner':
				return cornerPath(s);
			case 'tee':
				return teePath(s);
			case 'cross':
				return crossPath(s);
			case 'bulb':
				return bulbPath(s);
			case 'source':
				return crossPath(s);
			default:
				return '';
		}
	}
</script>

<div class="modal-backdrop">
	<div class="modal-content">
		<div class="modal-header">
			<div>
				<span class="difficulty-badge">{tutorial.title}</span>
				<h2>{currentStepData.title}</h2>
			</div>
			<span class="step-indicator">{step + 1} / {totalSteps}</span>
		</div>

		<div class="visual-area">
			<svg class="mini-board" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
				<!-- Background grid -->
				{#each { length: gridSize } as _, r}
					{#each { length: gridSize } as _, c}
						<rect
							x={c * cellSize}
							y={r * cellSize}
							width={cellSize}
							height={cellSize}
							class="cell-bg"
							class:cell-highlight={isHighlighted(r, c)}
							class:cell-powered={getTile(r, c)?.powered}
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
						stroke-width="0.3"
					/>
					<line
						x1={0}
						y1={i * cellSize}
						x2={100}
						y2={i * cellSize}
						stroke="#e2e8f0"
						stroke-width="0.3"
					/>
				{/each}

				<!-- Tiles -->
				{#each { length: gridSize } as _, r}
					{#each { length: gridSize } as _, c}
						{@const tile = getTile(r, c)}
						{#if tile}
							<g>
								<!-- Pipe path with rotation -->
								<g
									class="pipe-group"
									class:animate-rotate={isAnimateRotate(r, c)}
									style="
										transform-origin: {c * cellSize + half}px {r * cellSize + half}px;
										transform: rotate({tile.rotation * 90}deg);
									"
								>
									<path
										d={getPipePath(tile.type, cellSize)}
										transform="translate({c * cellSize}, {r * cellSize})"
										fill="none"
										stroke={tile.type === 'source'
											? '#f59e0b'
											: tile.powered
												? '#fbbf24'
												: '#94a3b8'}
										stroke-width={pipeWidth}
										stroke-linecap="round"
										stroke-linejoin="round"
										class:pipe-powered={tile.powered && tile.type !== 'source'}
									/>
								</g>

								<!-- Source icon -->
								{#if tile.type === 'source'}
									<circle
										cx={c * cellSize + half}
										cy={r * cellSize + half}
										r={cellSize * 0.22}
										class="source-circle"
									/>
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

								<!-- Bulb icon -->
								{#if tile.type === 'bulb'}
									<circle
										cx={c * cellSize + half}
										cy={r * cellSize + half}
										r={cellSize * 0.2}
										class="bulb-circle"
										class:bulb-on={tile.powered}
									/>
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

								<!-- Center dot for pipe tiles -->
								{#if tile.type !== 'source' && tile.type !== 'bulb'}
									<circle
										cx={c * cellSize + half}
										cy={r * cellSize + half}
										r={pipeWidth * 0.4}
										fill={tile.powered ? '#fbbf24' : '#94a3b8'}
									/>
								{/if}
							</g>
						{/if}
					{/each}
				{/each}
			</svg>
		</div>

		<div class="desc-area">
			<p>{@html currentStepData.desc}</p>
		</div>

		<div class="actions">
			{#if step > 0}
				<button class="btn-text" onclick={prev}>이전</button>
			{:else}
				<div></div>
			{/if}

			<div class="action-buttons">
				{#if step === totalSteps - 1}
					<button class="btn-primary" onclick={() => onclose()}>닫기</button>
				{:else}
					<button class="btn-primary" onclick={next}>다음</button>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 2000;
		backdrop-filter: blur(4px);
	}
	.modal-content {
		background: white;
		padding: 1.5rem;
		border-radius: 16px;
		width: 90%;
		max-width: 400px;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
	}
	.modal-header h2 {
		margin: 0.2rem 0 0 0;
		font-size: 1.25rem;
		color: #333;
	}
	.difficulty-badge {
		font-size: 0.75rem;
		background: #fef3c7;
		color: #92400e;
		padding: 0.1rem 0.5rem;
		border-radius: 4px;
		font-weight: 700;
		display: inline-block;
	}
	.step-indicator {
		font-size: 0.85rem;
		color: #888;
		font-weight: 600;
		background: #f1f3f5;
		padding: 0.2rem 0.6rem;
		border-radius: 12px;
	}

	.visual-area {
		background: #f8f9fa;
		border-radius: 8px;
		padding: 1rem;
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 200px;
	}

	.mini-board {
		width: 220px;
		height: 220px;
		border-radius: 8px;
		background: #f8fafc;
		box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.04);
	}

	/* Cell backgrounds */
	.cell-bg {
		fill: #f8fafc;
	}

	.cell-bg.cell-powered {
		fill: rgba(251, 191, 36, 0.06);
	}

	.cell-bg.cell-highlight {
		fill: #fff9db;
		animation: cellPulse 1.5s infinite;
	}

	@keyframes cellPulse {
		0%,
		100% {
			fill: #fff9db;
		}
		50% {
			fill: #fef3c7;
		}
	}

	/* Pipe powered glow */
	.pipe-powered {
		filter: drop-shadow(0 0 1.5px rgba(251, 191, 36, 0.6));
	}

	/* Rotate animation */
	.animate-rotate {
		animation: spinDemo 2s ease-in-out infinite;
	}

	@keyframes spinDemo {
		0%,
		20% {
			transform: rotate(0deg);
		}
		30%,
		45% {
			transform: rotate(90deg);
		}
		55%,
		70% {
			transform: rotate(180deg);
		}
		80%,
		100% {
			transform: rotate(270deg);
		}
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

	/* Text area */
	.desc-area {
		text-align: center;
		color: #495057;
		font-size: 0.95rem;
		line-height: 1.5;
		min-height: 4.5rem;
	}

	/* Actions */
	.actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 0.5rem;
	}

	.btn-primary {
		background: #f59e0b;
		color: white;
		border: none;
		padding: 0.6rem 1.2rem;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
	}
	.btn-primary:hover {
		background: #d97706;
	}
	.btn-text {
		background: none;
		border: none;
		color: #868e96;
		cursor: pointer;
		font-size: 0.9rem;
	}
	.btn-text:hover {
		color: #333;
	}

	.action-buttons {
		display: flex;
		gap: 0.5rem;
	}

	.btn-secondary {
		background: #f1f3f5;
		color: #495057;
		border: none;
		padding: 0.6rem 1.2rem;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
	}
	.btn-secondary:hover {
		background: #e9ecef;
	}
</style>
