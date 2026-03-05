<script lang="ts">
	import { LESSONS } from '$lib/games/tichu/tutorial/tutorialScenarios';
	import type { createTichuGameState } from '../gameState.svelte';

	interface Props {
		game: ReturnType<typeof createTichuGameState>;
	}

	const { game }: Props = $props();

	// Load progress from localStorage
	function getProgress(): Record<string, boolean> {
		try {
			return JSON.parse(localStorage.getItem('tichu_tutorial_progress') || '{}');
		} catch {
			return {};
		}
	}

	let progress = $state(getProgress());

	function handleStart(lessonId: string) {
		game.startTutorial(lessonId);
	}
</script>

<div class="lesson-select">
	<p class="lesson-desc">직접 플레이하면서 티츄 규칙을 배워보세요!</p>

	<div class="lesson-list">
		{#each LESSONS as lesson, i}
			{@const completed = progress[lesson.id] ?? false}
			<button class="lesson-card" class:completed onclick={() => handleStart(lesson.id)}>
				<div class="lesson-icon">{lesson.icon}</div>
				<div class="lesson-info">
					<h3 class="lesson-title">
						{#if completed}
							<span class="check-mark">&#10003;</span>
						{/if}
						{lesson.title}
					</h3>
					<p class="lesson-description">{lesson.description}</p>
				</div>
				<div class="lesson-meta">
					<span class="lesson-time">~{lesson.estimatedMinutes}분</span>
				</div>
			</button>
		{/each}
	</div>
</div>

<style>
	.lesson-select {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.lesson-desc {
		text-align: center;
		font-size: 0.85rem;
		color: #94a3b8;
		margin: 0;
	}

	.lesson-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.lesson-card {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 18px 20px;
		background: rgba(255, 255, 255, 0.05);
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 20px;
		color: #e2e8f0;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
		text-align: left;
		box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.3);
	}

	.lesson-card:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(251, 191, 36, 0.4);
		transform: translateY(-2px);
		box-shadow: 0 15px 40px -10px rgba(0, 0, 0, 0.4);
	}

	.lesson-card:active {
		transform: translateY(0) scale(0.98);
	}

	.lesson-card.completed {
		border-color: rgba(16, 185, 129, 0.3);
	}

	.lesson-icon {
		font-size: 2rem;
		line-height: 1;
		flex-shrink: 0;
	}

	.lesson-info {
		flex: 1;
		min-width: 0;
	}

	.lesson-title {
		margin: 0 0 4px;
		font-size: 1rem;
		font-weight: 700;
		color: #f3f4f6;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.check-mark {
		color: #34d399;
		font-size: 0.9rem;
	}

	.lesson-description {
		margin: 0;
		font-size: 0.8rem;
		color: #94a3b8;
		line-height: 1.4;
	}

	.lesson-meta {
		flex-shrink: 0;
	}

	.lesson-time {
		font-size: 0.75rem;
		color: #64748b;
		font-weight: 600;
		background: rgba(255, 255, 255, 0.06);
		padding: 4px 10px;
		border-radius: 8px;
	}
</style>
