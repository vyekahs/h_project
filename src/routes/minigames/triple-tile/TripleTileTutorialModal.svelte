<script lang="ts">
	import { TUTORIALS } from './tutorialData';

	let { tutorialId = 'triple_tile_easy_1', onclose } = $props();

	let step = $state(0);

	let tutorial = $derived(TUTORIALS[tutorialId] || TUTORIALS['triple_tile_easy_1']);
	let currentStepData = $derived(tutorial.steps[step]);
	let totalSteps = $derived(tutorial.steps.length);

	function next() {
		if (step < totalSteps - 1) step++;
		else onclose();
	}

	function prev() {
		if (step > 0) step--;
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
			{#if currentStepData.illustration}
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
		padding: 1.2rem 1rem;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		min-height: 120px;
		gap: 0.4rem;
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