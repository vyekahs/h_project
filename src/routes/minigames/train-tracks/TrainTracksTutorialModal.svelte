<script lang="ts">
	import { TUTORIAL_STEPS, type TutorialTile } from './tutorialData';

	let { onclose }: { onclose: () => void } = $props();

	let step = $state(0);
	let currentStepData = $derived(TUTORIAL_STEPS[step]);
	let totalSteps = TUTORIAL_STEPS.length;

	function next() {
		if (step < totalSteps - 1) step++;
		else onclose();
	}

	function prev() {
		if (step > 0) step--;
	}

	// Board rendering helpers
	function getTile(tiles: TutorialTile[] | undefined, r: number, c: number): TutorialTile | null {
		if (!tiles) return null;
		return tiles.find((t) => t.row === r && t.col === c) ?? null;
	}

	function statusColor(status: 'correct' | 'over' | 'under' | null): string {
		if (status === 'correct') return '#16a34a';
		if (status === 'over') return '#dc2626';
		return '#333';
	}
</script>

<div class="modal-backdrop">
	<div class="modal-content">
		<div class="modal-header">
			<div>
				<span class="difficulty-badge">튜토리얼</span>
				<h2>{currentStepData.title}</h2>
			</div>
			<span class="step-indicator">{step + 1} / {totalSteps}</span>
		</div>

		<div class="visual-area">
			{#if currentStepData.tiles}
				{@const gs = currentStepData.gridSize}
				{@const hasRowCounts = currentStepData.rowCounts?.some((v) => v !== null && v !== undefined)}
				{@const hasColCounts = currentStepData.colCounts?.some((v) => v !== null && v !== undefined)}
				{@const totalSize = gs + (hasRowCounts || hasColCounts ? 1 : 0)}
				{@const cellSize = 100 / totalSize}
				{@const offset = hasRowCounts || hasColCounts ? cellSize : 0}
				{@const imgRealH = cellSize * (1168 / 898)}
				{@const imgYOffset = (cellSize - imgRealH) / 2}
				{@const railWidth = cellSize * 0.08}

				<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
					<defs>
						<filter id="tut-glow-green" x="-50%" y="-50%" width="200%" height="200%">
							<feGaussianBlur stdDeviation="0.8" result="blur" />
							<feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
						</filter>
						<filter id="tut-glow-blue" x="-50%" y="-50%" width="200%" height="200%">
							<feGaussianBlur stdDeviation="0.8" result="blur" />
							<feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
						</filter>
					</defs>

					<!-- Column count labels -->
					{#if hasColCounts && currentStepData.colCounts}
						{#each currentStepData.colCounts as count, c}
							{#if count !== null && count !== undefined}
								<text
									x={offset + c * cellSize + cellSize / 2}
									y={cellSize * 0.6}
									text-anchor="middle"
									dominant-baseline="middle"
									font-size={cellSize * 0.4}
									font-weight="700"
									fill={currentStepData.colStatus?.[c] ? statusColor(currentStepData.colStatus[c]) : '#333'}
								>{count}</text>
							{/if}
						{/each}
					{/if}

					<!-- Row count labels -->
					{#if hasRowCounts && currentStepData.rowCounts}
						{#each currentStepData.rowCounts as count, r}
							{#if count !== null && count !== undefined}
								<text
									x={cellSize * 0.5}
									y={offset + r * cellSize + cellSize / 2}
									text-anchor="middle"
									dominant-baseline="middle"
									font-size={cellSize * 0.4}
									font-weight="700"
									fill={currentStepData.rowStatus?.[r] ? statusColor(currentStepData.rowStatus[r]) : '#333'}
								>{count}</text>
							{/if}
						{/each}
					{/if}

					<!-- Grid cells -->
					{#each Array(gs) as _, r}
						{#each Array(gs) as _, c}
							{@const tile = getTile(currentStepData.tiles, r, c)}
							{@const x = offset + c * cellSize}
							{@const y = offset + r * cellSize}
							{@const cx = x + cellSize / 2}
							{@const cy = y + cellSize / 2}
							{@const cs = cellSize}

							<!-- Background -->
							<rect
								{x} {y}
								width={cs} height={cs}
								fill={tile?.isStart ? '#dcfce7' : tile?.isFinish ? '#dbeafe' : tile?.isFixed ? '#f5f0e8' : '#fff'}
								stroke="#ccc"
								stroke-width="0.3"
							/>

							{#if tile}
								<!-- Track rendering -->
								{#if tile.trackType === 'straight'}
									<clipPath id="tut-clip-{step}-{r}-{c}">
										<rect {x} {y} width={cs} height={cs} />
									</clipPath>
									<g transform="rotate({tile.rotation * 90}, {cx}, {cy})" clip-path="url(#tut-clip-{step}-{r}-{c})">
										<image
											href="/train/straight.svg"
											{x} y={y + imgYOffset}
											width={cs} height={imgRealH}
											opacity={tile.isFixed ? 1 : 0.85}
										/>
									</g>
								{:else if tile.trackType === 'corner'}
									<clipPath id="tut-clip-{step}-{r}-{c}">
										<rect {x} {y} width={cs} height={cs} />
									</clipPath>
									<g transform="rotate({(tile.rotation - 1) * 90}, {cx}, {cy})" clip-path="url(#tut-clip-{step}-{r}-{c})">
										<image
											href="/train/curve.svg"
											{x} y={y + imgYOffset}
											width={cs} height={imgRealH}
											opacity={tile.isFixed ? 1 : 0.85}
										/>
									</g>
								{:else if tile.trackType === 'start' || tile.trackType === 'finish'}
									<g transform="rotate({(tile.rotation - 1) * 90}, {cx}, {cy})">
										<image
											href={tile.trackType === 'start' ? '/train/start.svg' : '/train/stop.svg'}
											{x} {y}
											width={cs} height={cs}
										/>
									</g>
								{/if}

								<!-- Player marked empty (X) -->
								{#if tile.playerMarkedEmpty && tile.trackType === 'empty'}
									<line x1={x + cs * 0.25} y1={y + cs * 0.25} x2={x + cs * 0.75} y2={y + cs * 0.75}
										stroke="#ccc" stroke-width={railWidth * 1.5} stroke-linecap="round" />
									<line x1={x + cs * 0.75} y1={y + cs * 0.25} x2={x + cs * 0.25} y2={y + cs * 0.75}
										stroke="#ccc" stroke-width={railWidth * 1.5} stroke-linecap="round" />
								{/if}

								<!-- Start/Finish glow border -->
								{#if tile.isStart || tile.isFinish}
									<rect
										{x} {y}
										width={cs} height={cs}
										fill="none"
										stroke={tile.isStart ? '#16a34a' : '#2563eb'}
										stroke-width="0.7"
										filter={tile.isStart ? 'url(#tut-glow-green)' : 'url(#tut-glow-blue)'}
									/>
								{/if}

								<!-- Highlight pulse (correct placement) -->
								{#if tile.highlight}
									<rect
										{x} {y}
										width={cs} height={cs}
										fill="#16a34a"
										opacity="0.15"
									>
										<animate attributeName="opacity" values="0.05;0.25;0.05" dur="1.5s" repeatCount="indefinite" />
									</rect>
								{/if}

								<!-- Wrong placement overlay -->
								{#if tile.wrong}
									<rect
										{x} {y}
										width={cs} height={cs}
										fill="#ef4444"
										opacity="0.25"
									>
										<animate attributeName="opacity" values="0.15;0.35;0.15" dur="1s" repeatCount="indefinite" />
									</rect>
								{/if}
							{/if}
						{/each}
					{/each}
				</svg>
			{:else if currentStepData.illustration}
				{#each currentStepData.illustration as line}
					<div class="illust-line">{line}</div>
				{/each}
			{/if}
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
					<button class="btn-primary" onclick={() => onclose()}>시작하기</button>
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
		background: var(--shadow-deep);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 2000;
		backdrop-filter: blur(4px);
	}
	.modal-content {
		background: var(--bg-primary);
		padding: 1.5rem;
		border-radius: 16px;
		width: 90%;
		max-width: 400px;
		box-shadow: 0 10px 25px var(--overlay-medium);
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
		color: var(--text-primary);
	}
	.difficulty-badge {
		font-size: 0.75rem;
		background: #dbeafe;
		color: var(--color-blue-bright);
		padding: 0.1rem 0.5rem;
		border-radius: 4px;
		font-weight: 700;
		display: inline-block;
	}
	.step-indicator {
		font-size: 0.85rem;
		color: var(--text-tertiary);
		font-weight: 600;
		background: var(--bg-tertiary);
		padding: 0.2rem 0.6rem;
		border-radius: 12px;
	}

	.visual-area {
		background: var(--bg-secondary);
		border-radius: 8px;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		min-height: 120px;
		gap: 0.4rem;
	}

	.visual-area svg {
		width: 100%;
		max-width: 280px;
		aspect-ratio: 1;
		display: block;
	}

	.illust-line {
		font-size: 0.9rem;
		white-space: pre;
		text-align: center;
		line-height: 1.6;
		color: var(--text-primary);
	}

	.desc-area {
		text-align: center;
		color: var(--text-dark);
		font-size: 0.95rem;
		line-height: 1.5;
		min-height: 4.5rem;
	}

	.actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 0.5rem;
	}

	.btn-primary {
		background: var(--color-blue);
		color: var(--bg-primary);
		border: none;
		padding: 0.6rem 1.2rem;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
	}
	.btn-primary:hover {
		background: var(--color-blue-bright);
	}
	.btn-text {
		background: none;
		border: none;
		color: var(--text-tertiary);
		cursor: pointer;
		font-size: 0.9rem;
	}
	.btn-text:hover {
		color: var(--text-primary);
	}

	.action-buttons {
		display: flex;
		gap: 0.5rem;
	}
</style>
