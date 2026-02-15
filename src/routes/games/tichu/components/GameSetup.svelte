<script lang="ts">
	import type { AiStrategy, AiSpeed } from '$lib/games/tichu/ai/types';
	import { STRATEGY_PRESETS } from '$lib/games/tichu/ai/presets';
	import type { createTichuGameState } from '../gameState.svelte';

	interface Props {
		game: ReturnType<typeof createTichuGameState>;
	}

	const { game }: Props = $props();

	const speedOptions: { id: AiSpeed; label: string }[] = [
		{ id: 'instant', label: '즉시' },
		{ id: 'fast', label: '빠름' },
		{ id: 'normal', label: '보통' },
		{ id: 'slow', label: '느림' }
	];

	const scoreOptions = [500, 1000, 1500, 2000];
</script>

<div class="setup-container">
	<div class="setup-content">
		<div class="header">
			<h1>티츄</h1>
			<p class="subtitle">AI와 함께하는 카드 게임</p>
		</div>

		<!-- Partner Strategy -->
		<section class="section">
			<h2 class="section-title">파트너 AI 전략</h2>
			<p class="section-desc">같은 팀 AI의 플레이 스타일을 선택하세요</p>
			<div class="strategy-grid">
				{#each STRATEGY_PRESETS as preset}
					<button
						class="strategy-card"
						class:selected={game.partnerStrategy === preset.id}
						onclick={() => { game.partnerStrategy = preset.id; }}
					>
						<span class="strategy-icon">{preset.icon}</span>
						<span class="strategy-name">{preset.name}</span>
						<span class="strategy-desc">{preset.description}</span>
					</button>
				{/each}
			</div>
		</section>

		<!-- AI Speed -->
		<section class="section">
			<h2 class="section-title">AI 속도</h2>
			<div class="speed-row">
				{#each speedOptions as opt}
					<button
						class="speed-btn"
						class:selected={game.aiSpeed === opt.id}
						onclick={() => { game.aiSpeed = opt.id; }}
					>
						{opt.label}
					</button>
				{/each}
			</div>
		</section>

		<!-- Target Score -->
		<section class="section">
			<h2 class="section-title">목표 점수</h2>
			<div class="score-row">
				{#each scoreOptions as score}
					<button
						class="score-btn"
						class:selected={game.targetScore === score}
						onclick={() => { game.targetScore = score; }}
					>
						{score}
					</button>
				{/each}
			</div>
		</section>

		<!-- Start Button -->
		<button class="start-btn" onclick={() => game.startGame()}>
			게임 시작
		</button>
	</div>
</div>

<style>
	.setup-container {
		min-height: 100vh;
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
		padding-top: calc(20px + env(safe-area-inset-top, 0px));
	}

	.setup-content {
		width: 100%;
		max-width: 480px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.header {
		text-align: center;
		margin-bottom: 8px;
	}

	.header h1 {
		font-size: 2rem;
		font-weight: 700;
		margin: 0;
	}

	.subtitle {
		margin: 4px 0 0;
		font-size: 0.85rem;
		opacity: 0.6;
	}

	.section {
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 12px;
		padding: 16px;
	}

	.section-title {
		font-size: 0.95rem;
		font-weight: 600;
		margin: 0 0 4px;
	}

	.section-desc {
		font-size: 0.75rem;
		opacity: 0.55;
		margin: 0 0 12px;
	}

	/* Strategy Grid */
	.strategy-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}

	.strategy-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 12px 8px;
		background: rgba(255, 255, 255, 0.05);
		border: 2px solid rgba(255, 255, 255, 0.1);
		border-radius: 10px;
		color: white;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s;
		text-align: center;
	}

	.strategy-card:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.strategy-card.selected {
		border-color: #f59e0b;
		background: rgba(245, 158, 11, 0.15);
	}

	.strategy-icon {
		font-size: 1.5rem;
		line-height: 1;
	}

	.strategy-name {
		font-size: 0.85rem;
		font-weight: 600;
	}

	.strategy-desc {
		font-size: 0.65rem;
		opacity: 0.6;
		line-height: 1.3;
	}

	/* Speed Row */
	.speed-row {
		display: flex;
		gap: 8px;
	}

	.speed-btn {
		flex: 1;
		padding: 10px 0;
		background: rgba(255, 255, 255, 0.05);
		border: 2px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		color: white;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s;
	}

	.speed-btn:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.speed-btn.selected {
		border-color: #f59e0b;
		background: rgba(245, 158, 11, 0.15);
	}

	/* Score Row */
	.score-row {
		display: flex;
		gap: 8px;
	}

	.score-btn {
		flex: 1;
		padding: 10px 0;
		background: rgba(255, 255, 255, 0.05);
		border: 2px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		color: white;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s;
	}

	.score-btn:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.score-btn.selected {
		border-color: #f59e0b;
		background: rgba(245, 158, 11, 0.15);
	}

	/* Start Button */
	.start-btn {
		width: 100%;
		padding: 16px;
		background: #f59e0b;
		color: #000;
		border: none;
		border-radius: 12px;
		font-size: 1.1rem;
		font-weight: 700;
		cursor: pointer;
		transition: background 0.15s;
	}

	.start-btn:hover {
		background: #fbbf24;
	}

	.start-btn:active {
		background: #d97706;
	}
</style>
