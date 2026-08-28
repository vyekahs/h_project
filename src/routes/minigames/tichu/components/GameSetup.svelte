<script lang="ts">
	import type { AiStrategy, AiSpeed } from '$lib/games/tichu/ai/types';
	import { STRATEGY_PRESETS } from '$lib/games/tichu/ai/presets';
	import type { createTichuGameState } from '../gameState.svelte';
	import LessonSelect from './LessonSelect.svelte';


	interface Props {
		game: ReturnType<typeof createTichuGameState>;
		user: App.Locals['user'] | null;
		isAdmin: boolean;
	}

	const { game, user, isAdmin }: Props = $props();

	const speedOptions: { id: AiSpeed; label: string }[] = [
		{ id: 'fast', label: '빠름' },
		{ id: 'normal', label: '보통' },
		{ id: 'slow', label: '느림' },
	];

	const scoreOptions = [300, 500, 700, 1000];

	let forceSetup = $state(false);
	let showSetup = $derived(!game.savedGameAvailable || forceSetup);
	let activeTab = $state<'setup' | 'ranking' | 'tutorial' | 'comments'>('setup');

	// Ranking state
	let rankings = $state<any[]>([]);
	let rankingLoading = $state(false);
	let rankingError = $state<string | null>(null);
	let rankingLoaded = $state(false);

	$effect(() => {
		if (activeTab === 'ranking' && !rankingLoaded) {
			loadRankings();
		}
	});

	async function loadRankings() {
		rankingLoading = true;
		rankingError = null;
		try {
			const res = await fetch('/api/ranking/tichu');
			if (res.ok) {
				rankings = await res.json();
			} else {
				rankingError = '랭킹을 불러올 수 없습니다';
			}
		} catch {
			rankingError = '랭킹을 불러올 수 없습니다';
		} finally {
			rankingLoading = false;
			rankingLoaded = true;
		}
	}
</script>

<div class="setup-container">
	<div class="setup-content">
		<div class="top-nav">
			<a href="/minigames" class="nav-btn back-btn" aria-label="뒤로 가기">
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
			</a>
			<h1 class="nav-title">티츄</h1>
			<div class="nav-spacer"></div>
		</div>

		<!-- Tab Navigation -->
		<div class="tab-nav">
			<button class="tab-btn" class:active={activeTab === 'setup'} onclick={() => activeTab = 'setup'}>
				설정
			</button>
			<button class="tab-btn" class:active={activeTab === 'tutorial'} onclick={() => activeTab = 'tutorial'}>
				튜토리얼
			</button>
			<button class="tab-btn" class:active={activeTab === 'ranking'} onclick={() => activeTab = 'ranking'}>
				랭킹
			</button>
			</div>

		{#if activeTab === 'setup'}
			{#if showSetup}
				<!-- Partner Strategy -->
				<section class="section">
					<h2 class="section-title">파트너 선택하기</h2>
					<div class="strategy-grid">
						{#each STRATEGY_PRESETS as preset}
							<button
								class="strategy-card"
								class:selected={game.partnerStrategy === preset.id}
								onclick={() => { game.partnerStrategy = preset.id; }}
							>
								<span class="strategy-character">{preset.characterName}</span>
							</button>
						{/each}
					</div>
				</section>

				<!-- AI Speed -->
				<section class="section">
					<h2 class="section-title">속도</h2>
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

				<button class="start-btn" onclick={() => game.startGame()}>
					게임 시작
				</button>
			{:else}
				<button class="resume-btn" onclick={() => game.resumeGame()}>
					이어하기
				</button>
				<button class="new-game-btn" onclick={() => { forceSetup = true; }}>
					새 게임
				</button>
			{/if}

		{:else if activeTab === 'tutorial'}
			<LessonSelect {game} />

		{:else if activeTab === 'ranking'}
			<div class="ranking-container">
				<p class="ranking-desc">매월 1일 초기화</p>
				<p class="ranking-formula">우리팀 점수 - 상대팀 점수 (최소 100점)</p>
				<div class="ranking-panel">
					<h3 class="ranking-title">이달의 랭킹</h3>
					{#if rankingLoading}
						<div class="ranking-empty">불러오는 중...</div>
					{:else if rankingError}
						<div class="ranking-empty">{rankingError}</div>
					{:else if rankings.length === 0}
						<div class="ranking-empty">아직 이번 달 기록이 없습니다.</div>
					{:else}
						<table class="ranking-table">
							<thead>
								<tr>
									<th>순위</th>
									<th>닉네임</th>
									<th>누적 점수</th>
								</tr>
							</thead>
							<tbody>
								{#each rankings as rank}
									<tr class:top3={rank.rank <= 3}>
										<td class="rank-cell">
											{#if rank.rank === 1}🥇
											{:else if rank.rank === 2}🥈
											{:else if rank.rank === 3}🥉
											{:else}{rank.rank}{/if}
										</td>
										<td class="name-cell">{rank.nickname || '익명'}</td>
										<td class="score-cell">{rank.score?.toLocaleString() ?? 0} P</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	/* Fonts */
	@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

	.setup-container {
		height: 100%;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 24px;
		padding-top: calc(24px + env(safe-area-inset-top, 0px));
		padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
		font-family: 'Inter', sans-serif;
		overflow-y: auto;
		overflow-x: hidden;
		-webkit-overflow-scrolling: touch;
	}

	.setup-content {
		width: 100%;
		max-width: 440px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		animation: fadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1);
		padding-top: 16px;
	}

	@keyframes fadeIn {
		from { opacity: 0; transform: translateY(20px); }
		to { opacity: 1; transform: translateY(0); }
	}

	/* Top Navigation */
	.top-nav {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.nav-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.06);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: #cbd5e1;
		text-decoration: none;
		transition: all 0.2s;
	}
	.nav-btn:hover {
		background: rgba(255, 255, 255, 0.12);
		color: #fff;
		border-color: rgba(255, 255, 255, 0.2);
	}

	.nav-title {
		font-size: 1.8rem;
		font-weight: 800;
		margin: 0;
		letter-spacing: -0.05em;
		text-transform: uppercase;
		color: #e6d3a3;
		text-shadow: 0 2px 12px rgba(168, 130, 79, 0.5);
	}

	.nav-spacer {
		width: 40px;
	}

	/* Tab Navigation */
	.tab-nav {
		display: flex;
		gap: 4px;
		padding: 4px;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 16px;
		border: 1px solid rgba(255, 255, 255, 0.06);
	}

	.tab-btn {
		flex: 1;
		padding: 10px 0;
		background: transparent;
		border: none;
		border-radius: 12px;
		color: #94a3b8;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.tab-btn.active {
		background: rgba(255, 255, 255, 0.1);
		color: #e6d3a3;
		border: 1px solid rgba(230, 211, 163, 0.3);
	}

	/* Sections */
	.section {
		background: rgba(255, 255, 255, 0.05);
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 28px;
		padding: 24px;
		box-shadow:
			0 20px 40px -10px rgba(0,0,0,0.4),
			inset 0 1px 0 rgba(255,255,255,0.15);
	}

	.section-title {
		font-size: 1.05rem;
		font-weight: 700;
		letter-spacing: -0.01em;
		margin: 0 0 12px;
		color: #f1f5f9;
		padding-left: 4px;
		text-shadow: 0 1px 2px rgba(0,0,0,0.5);
	}

	/* Strategy Grid */
	.strategy-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}

	.strategy-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 16px 12px;
		background: rgba(0, 0, 0, 0.2);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 20px;
		color: #e2e8f0;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
		text-align: center;
		position: relative;
		overflow: hidden;
	}


	.strategy-card.selected {
		border-color: rgba(230, 211, 163, 0.8);
		background: linear-gradient(135deg, rgba(45, 35, 75, 0.4), rgba(60, 45, 95, 0.4));
		color: #e6d3a3;
		box-shadow:
			0 0 0 1px rgba(230, 211, 163, 0.3),
			0 10px 30px -5px rgba(203, 170, 110, 0.2),
			inset 0 0 20px rgba(203, 170, 110, 0.1);
	}

	.strategy-character {
		display: inline-flex;
		align-items: center;
		padding: 0;
		border-radius: 0;
		background: transparent;
		border: none;
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
		color: #e6d3a3;
		font-size: 0.9rem;
		font-weight: 800;
		letter-spacing: -0.01em;
		box-shadow: none;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
		transition: all 0.2s;
	}
	.strategy-card:hover .strategy-character {
		transform: scale(1.02);
		background: transparent;
		border-color: transparent;
		box-shadow: none;
	}
	
	.strategy-card.selected .strategy-character {
		background: transparent;
		border-color: transparent;
		color: #fff;
		text-shadow: 0 0 8px rgba(230, 211, 163, 0.6);
		box-shadow: none;
	}

	/* Speed Row */
	.speed-row {
		display: flex;
		gap: 10px;
		overflow-x: auto;
		padding-bottom: 2px;
		scrollbar-width: none;
	}
	.speed-row::-webkit-scrollbar { display: none; }

	.speed-btn {
		flex: 1;
		white-space: nowrap;
		min-width: 60px;
		padding: 14px 10px;
		background: rgba(0, 0, 0, 0.2);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 18px;
		color: #cbd5e1;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
	}

	.speed-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
		transform: translateY(-1px);
	}

	.speed-btn.selected {
		border-color: rgba(230, 211, 163, 0.8);
		background: linear-gradient(135deg, rgba(45, 35, 75, 0.4), rgba(60, 45, 95, 0.4));
		color: #e6d3a3;
		box-shadow: 0 4px 15px rgba(203,170,110,0.2);
	}

	/* Score Row */
	.score-row {
		display: flex;
		gap: 10px;
	}

	.score-btn {
		flex: 1;
		padding: 14px 0;
		background: rgba(0, 0, 0, 0.2);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 18px;
		color: #cbd5e1;
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
		font-feature-settings: "tnum";
		font-variant-numeric: tabular-nums;
		transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
	}

	.score-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
		transform: translateY(-1px);
	}

	.score-btn.selected {
		border-color: rgba(230, 211, 163, 0.8);
		background: linear-gradient(135deg, rgba(45, 35, 75, 0.4), rgba(60, 45, 95, 0.4));
		color: #e6d3a3;
		box-shadow: 0 4px 15px rgba(203,170,110,0.2);
	}

	/* Resume Button - Jade Green */
	.resume-btn {
		width: 100%;
		padding: 20px;
		background: linear-gradient(135deg, #10b981 0%, #059669 100%);
		color: #fff;
		border: 1px solid rgba(255,255,255,0.2);
		border-radius: 22px;
		font-size: 1.25rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
		box-shadow:
			0 10px 25px -5px rgba(16, 185, 129, 0.4),
			inset 0 1px 1px rgba(255,255,255,0.3);
		text-shadow: 0 1px 2px rgba(0,0,0,0.2);
	}
	.resume-btn:hover {
		transform: translateY(-2px) scale(1.01);
		background: linear-gradient(135deg, #34d399 0%, #059669 100%);
		box-shadow: 0 15px 35px -5px rgba(16, 185, 129, 0.5);
	}
	.resume-btn:active {
		transform: translateY(1px) scale(0.98);
	}

	/* New Game Button */
	.new-game-btn {
		width: 100%;
		padding: 18px;
		background: rgba(255, 255, 255, 0.05);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		color: #cbd5e1;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 22px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}
	.new-game-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
		border-color: rgba(255, 255, 255, 0.2);
		transform: translateY(-1px);
	}

	/* Start Button - Cream Gold */
	.start-btn {
		width: 100%;
		padding: 20px;
		background: linear-gradient(135deg, #e6d3a3 0%, #c9a668 100%);
		color: #4a3820;
		border: 1px solid rgba(255,255,255,0.3);
		border-radius: 22px;
		font-size: 1.35rem;
		font-weight: 800;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
		box-shadow:
			0 10px 25px -5px rgba(168, 130, 79, 0.5),
			inset 0 1px 1px rgba(255,255,255,0.5);
		text-shadow: 0 1px 0 rgba(255,255,255,0.3);
		letter-spacing: -0.01em;
	}

	.start-btn:hover {
		transform: translateY(-2px) scale(1.01);
		background: linear-gradient(135deg, #f0e2c0 0%, #c9a668 100%);
		box-shadow: 0 15px 35px -5px rgba(168, 130, 79, 0.6);
	}

	.start-btn:active {
		transform: translateY(1px) scale(0.98);
	}

	/* Ranking Tab */
	.ranking-container {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.ranking-desc {
		text-align: center;
		font-size: 0.8rem;
		color: #94a3b8;
		margin: 0;
	}

	.ranking-formula {
		text-align: center;
		font-size: 0.75rem;
		color: #64748b;
		margin: 0 0 8px;
	}

	.ranking-panel {
		background: rgba(255, 255, 255, 0.05);
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 24px;
		padding: 20px;
		box-shadow: 0 20px 40px -10px rgba(0,0,0,0.4);
	}

	.ranking-title {
		margin: 0 0 16px;
		text-align: center;
		color: #e2e8f0;
		font-size: 1.1rem;
		font-weight: 700;
	}

	.ranking-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.95rem;
	}

	.ranking-table th {
		text-align: left;
		padding: 8px;
		color: #94a3b8;
		font-weight: 500;
		font-size: 0.85rem;
		border-bottom: 1px solid rgba(255,255,255,0.1);
	}

	.ranking-table td {
		padding: 8px;
		color: #cbd5e1;
		border-bottom: 1px solid rgba(255,255,255,0.05);
	}

	.rank-cell {
		font-weight: 700;
		width: 40px;
		text-align: center;
	}

	.name-cell {
		max-width: 120px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.score-cell {
		font-weight: 700;
		color: #e6d3a3;
	}

	.top3 {
		background: rgba(230, 211, 163, 0.08);
	}

	.ranking-empty {
		text-align: center;
		padding: 24px;
		color: #94a3b8;
		font-size: 0.9rem;
	}

	/* Comments Tab */
	.comments-wrapper {
		height: calc(100dvh - 240px);
		min-height: 300px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.comments-empty {
		text-align: center;
		padding: 24px;
		color: #94a3b8;
		font-size: 0.9rem;
	}
</style>
