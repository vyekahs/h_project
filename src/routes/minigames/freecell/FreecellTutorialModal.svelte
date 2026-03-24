<script lang="ts">
	import { TUTORIALS } from './tutorialData';

	let { tutorialId = 'freecell_basics', onclose }: { tutorialId?: string; onclose: () => void } =
		$props();

	let step = $state(0);

	let tutorial = $derived(TUTORIALS[tutorialId] || TUTORIALS['freecell_basics']);
	let currentStep = $derived(tutorial.steps[step]);
	let totalSteps = $derived(tutorial.steps.length);

	function next() {
		if (step < totalSteps - 1) step++;
		else onclose();
	}

	function prev() {
		if (step > 0) step--;
	}

	function parseCard(s: string): { rank: string; suit: string; color: string; bold: boolean } {
		const bold = s.includes('<b>');
		const clean = s.replace(/<\/?b>/g, '');
		const suit = clean.slice(-1);
		const rank = clean.slice(0, -1);
		const color = suit === '♥' || suit === '♦' ? 'red' : 'black';
		return { rank, suit, color, bold };
	}

	function isAreaHighlighted(area: string): boolean {
		return currentStep.highlightAreas?.includes(area) ?? false;
	}
</script>

<div class="modal-backdrop" onclick={onclose} onkeydown={(e) => e.key === 'Escape' && onclose()} role="button" tabindex="-1">
	<div class="modal-content" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
		<div class="modal-header">
			<div>
				<span class="difficulty-badge">{tutorial.title}</span>
				<h2>{currentStep.title}</h2>
			</div>
			<span class="step-indicator">{step + 1} / {totalSteps}</span>
		</div>

		{#if currentStep.cards}
			<div class="visual-area">
				<!-- Top: FreeCells + Foundations -->
				<div class="mini-top">
					<div class="mini-slots" class:highlighted={isAreaHighlighted('freecell')}>
						{#each currentStep.cards.freeCells || [null, null, null, null] as cell}
							<div class="mini-slot fc">
								{#if cell}
									{@const c = parseCard(cell)}
									<div class="mini-card {c.color}">
										<span class="mc-rank">{c.rank}</span><span class="mc-suit">{c.suit}</span>
									</div>
								{:else}
									<span class="slot-text">FC</span>
								{/if}
							</div>
						{/each}
					</div>
					<div class="mini-slots" class:highlighted={isAreaHighlighted('foundation')}>
						{#each currentStep.cards.foundations || [null, null, null, null] as pile}
							<div class="mini-slot fn">
								{#if pile}
									{@const c = parseCard(pile)}
									<div class="mini-card {c.color}">
										<span class="mc-rank">{c.rank}</span><span class="mc-suit">{c.suit}</span>
									</div>
								{:else}
									<span class="slot-text suit-text">♠</span>
								{/if}
							</div>
						{/each}
					</div>
				</div>

				<!-- Tableau -->
				<div class="mini-tableau" class:highlighted={isAreaHighlighted('tableau')}>
					{#each currentStep.cards.tableau || [] as column, colIdx}
						<div class="mini-col">
							{#if column.length === 0}
								<div class="mini-empty"></div>
							{:else}
								{#each column as cardStr, idx}
									{@const c = parseCard(cardStr)}
									{@const isTarget = currentStep.targetCards?.some((t) => cardStr.replace(/<\/?b>/g, '').includes(t.replace(/<\/?b>/g, '')))}
									<div
										class="mini-card {c.color}"
										class:target={isTarget || c.bold}
										style="margin-top: {idx === 0 ? 0 : 14}px"
									>
										<span class="mc-rank">{c.rank}</span><span class="mc-suit">{c.suit}</span>
									</div>
								{/each}
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<div class="desc-area">
			<p>{@html currentStep.desc}</p>
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
		background: var(--bg-hover);
		color: var(--text-dark);
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

	/* ─── Visual Area ─── */

	.visual-area {
		background: var(--bg-secondary);
		border-radius: 8px;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.mini-top {
		display: flex;
		justify-content: space-between;
		gap: 6px;
	}

	.mini-slots {
		display: flex;
		gap: 3px;
		padding: 3px;
		border-radius: 6px;
		transition: background 0.2s;
	}

	.mini-slots.highlighted {
		background: var(--color-info-bg);
		outline: 2px solid var(--color-blue);
	}

	.mini-slot {
		width: 36px;
		height: 50px;
		border: 1.5px dashed var(--border-default);
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
	}

	.slot-text {
		font-size: 0.6rem;
		color: var(--text-tertiary);
		font-weight: 600;
	}

	.suit-text {
		font-size: 0.9rem;
		opacity: 0.3;
	}

	/* ─── Mini Cards ─── */

	.mini-card {
		width: 36px;
		height: 50px;
		background: linear-gradient(180deg, #ffffff 0%, #f8f8fa 100%);
		border: 1px solid #c8ccd0;
		border-radius: 4px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		justify-content: flex-start;
		padding: 2px 3px;
		font-weight: 800;
		line-height: 1;
		position: relative;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
	}

	.mini-card.red {
		color: #dc2626;
	}

	.mini-card.black {
		color: #1a1a1a;
	}

	.mini-card.target {
		border-color: var(--color-amber);
		box-shadow: 0 0 0 2px var(--color-amber);
		animation: pulse 1.5s infinite;
	}

	.mc-rank {
		font-size: 0.7rem;
	}

	.mc-suit {
		font-size: 0.55rem;
	}

	/* ─── Mini Tableau ─── */

	.mini-tableau {
		display: flex;
		gap: 3px;
		justify-content: center;
		padding: 3px;
		border-radius: 6px;
		transition: background 0.2s;
		min-height: 80px;
	}

	.mini-tableau.highlighted {
		background: var(--color-info-bg);
		outline: 2px solid var(--color-blue);
	}

	.mini-col {
		display: flex;
		flex-direction: column;
		min-width: 36px;
	}

	.mini-empty {
		width: 36px;
		height: 50px;
		border: 1.5px dashed var(--border-light);
		border-radius: 4px;
		opacity: 0.5;
	}

	@keyframes pulse {
		0% {
			box-shadow: 0 0 0 2px var(--color-amber);
		}
		70% {
			box-shadow: 0 0 0 6px rgba(250, 176, 5, 0);
		}
		100% {
			box-shadow: 0 0 0 2px var(--color-amber);
		}
	}

	/* ─── Description ─── */

	.desc-area {
		text-align: center;
		color: var(--text-dark);
		font-size: 0.95rem;
		line-height: 1.5;
		min-height: 4.5rem;
	}

	.desc-area :global(b) {
		color: var(--color-blue);
		font-weight: 700;
	}

	/* ─── Actions ─── */

	.actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 0.5rem;
	}

	.action-buttons {
		display: flex;
		gap: 0.5rem;
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

	.btn-primary:active {
		background: #364fc7;
	}

	.btn-text {
		background: none;
		border: none;
		color: var(--text-tertiary);
		cursor: pointer;
		font-size: 0.9rem;
	}

	.btn-text:active {
		color: var(--text-primary);
	}
</style>
