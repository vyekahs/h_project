<script lang="ts">
	import Board from './Board.svelte';
	import EnergyTutorialModal from './EnergyTutorialModal.svelte';
	import GamePauseModal from '$lib/components/games/GamePauseModal.svelte';
	import GameResultModal from '$lib/components/games/GameResultModal.svelte';
	import { goto, replaceState } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { user } from '$lib/stores/user';
	import {
		createEnergyGame,
		difficultyLabels,
		formatTime,
		type Difficulty
	} from './gameLogic.svelte';
	import { ENERGY_TUTORIALS, ENERGY_TUTORIAL_ORDER } from './energyTutorialData';

	const game = createEnergyGame();

	let isAutostart = false;

	function startWithTutorialCheck() {
		const seen = localStorage.getItem('energy_tutorial_v2');
		if (!seen) {
			game.activeTutorialId = 'energy_easy_1';
			game.showTutorial = true;
		} else {
			user.refresh().then(() => game.startGame());
		}
	}

	function closeTutorialAndStart() {
		localStorage.setItem('energy_tutorial_v2', '1');
		game.showTutorial = false;
		user.refresh().then(() => game.startGame());
	}

	// Handle autostart/resume from unified start page
	onMount(() => {
		if (!browser) return;
		const params = new URLSearchParams(window.location.search);
		if (params.get('autostart') === 'true') {
			isAutostart = true;
			const diff = params.get('difficulty');
			if (diff) game.difficulty = diff as Difficulty;
			// Remove query params so refresh won't restart
			replaceState(window.location.pathname, {});
			startWithTutorialCheck();
		} else if (params.get('resume') === 'true') {
			replaceState(window.location.pathname, {});
			game.loadGame();
		} else if (localStorage.getItem('energy_save')) {
			game.loadGame();
		} else {
			goto('/minigames/start/energy', { replaceState: true });
		}
	});

	// Prevent pull-to-refresh during gameplay
	$effect(() => {
		if (game.gameState !== 'playing' && game.gameState !== 'paused') return;
		const handler = (e: TouchEvent) => {
			e.preventDefault();
		};
		document.addEventListener('touchmove', handler, { passive: false });
		document.body.style.overscrollBehavior = 'none';
		return () => {
			document.removeEventListener('touchmove', handler);
			document.body.style.overscrollBehavior = '';
		};
	});
</script>

<div class="game-container">
	{#if game.gameState !== 'start'}
		<!-- Playing / Paused / Finished -->
		<div
			class="game-play-area"
			class:blurred={game.alertMessage ||
				game.confirmMessage ||
				game.gameState === 'paused' ||
				game.gameState === 'finished' ||
				game.showGuide ||
				game.showTutorial}
		>
			<header>
				<div class="header-info">
					<span class="difficulty-badge">{difficultyLabels[game.difficulty]}</span>
					<span class="moves">{game.moveCount}회 회전</span>
				</div>
				<div class="timer-controls">
					<div class="header-items">
						<button class="icon-btn theme-btn" onclick={() => game.showGuide = true} title="공략집">
							<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
						</button>
					</div>
					<div class="timer">
						{formatTime(game.displayTimer)}
					</div>
					<button class="icon-btn" onclick={game.pauseGame} aria-label="Pause">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							><circle cx="12" cy="12" r="10" /><rect
								x="9"
								y="9"
								width="2"
								height="6"
							/><rect x="13" y="9" width="2" height="6" /></svg
						>
					</button>
				</div>
			</header>

			<div class="game-area">
				<Board
					tiles={game.tiles}
					isGameOver={game.gameState === 'finished'}
					showWinAnimation={game.showWinAnimation}
					onrotate={game.rotateTile}
				/>
			</div>

			<div class="controls-area">
				<button
					class="undo-btn"
					onclick={game.undo}
					disabled={game.history.length === 0 || game.gameState !== 'playing'}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						><path d="M3 7v6h6" /><path
							d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"
						/></svg
					>
					<span>되돌리기</span>
				</button>
			</div>
		</div>

		<!-- Pause Overlay -->
		{#if game.gameState === 'paused'}
			<GamePauseModal
				stats={[
					{ label: '회전', value: `${game.moveCount}회` },
					{ label: '시간', value: formatTime(game.displayTimer) }
				]}
				onResume={game.resumeGame}
				onQuit={() => {
					game.stopTimer();
					localStorage.removeItem('energy_save');
					goto('/minigames/start/energy');
				}}
				onRestart={game.restartGame}
			/>
		{/if}

		<!-- Result Overlay -->
		{#if game.gameState === 'finished'}
			<GameResultModal
				isWon={true}
				message={game.hasRestarted
					? '다시시작한 게임은 랭킹에 반영되지 않습니다'
					: undefined}
				stats={[
					{ label: '난이도', value: difficultyLabels[game.difficulty] },
					{ label: '시간', value: formatTime(game.timerValue) },
					{ label: '회전', value: `${game.moveCount}회` },
					...(!game.hasRestarted
						? [
								{
									label: '점수',
									value: game.calculatedScore.toLocaleString(),
									highlight: true
								}
							]
						: [])
				]}
				newTitleName={game.newTitleName}
				showVisitPrompt={game.showVisitPrompt}
				primaryAction={{ label: '다시 도전', onclick: game.startGame }}
				secondaryAction={{
					label: '나가기',
					onclick: () => goto('/minigames/start/energy')
				}}
			/>
		{/if}
	{/if}

	<!-- Alert Modal -->
	{#if game.alertMessage}
		<div
			class="overlay"
			onclick={() => (game.alertMessage = null)}
			onkeydown={(e) => e.key === 'Escape' && (game.alertMessage = null)}
			role="button"
			tabindex="-1"
		>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="modal alert-modal" onclick={(e) => e.stopPropagation()}>
				<p>{game.alertMessage}</p>
				<button class="btn-primary" onclick={() => (game.alertMessage = null)}>확인</button>
			</div>
		</div>
	{/if}

	{#if game.showGuide && !game.showTutorial}
		<div class="overlay" onclick={() => game.showGuide = false} role="button" tabindex="-1" aria-label="공략집 닫기">
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="modal guide-modal" onclick={(e) => e.stopPropagation()}>
				<h3>공략집</h3>
				<div class="guide-list">
					{#each ENERGY_TUTORIAL_ORDER as tid}
						{@const t = ENERGY_TUTORIALS[tid]}
						{#if t}
							<button class="guide-item" onclick={() => { game.activeTutorialId = tid; game.showTutorial = true; }}>
								<span class="guide-diff-badge {t.difficulty}">{difficultyLabels[t.difficulty] || t.difficulty}</span>
								<span class="guide-title">{t.title}</span>
								<span class="guide-arrow">›</span>
							</button>
						{/if}
					{/each}
				</div>
				<button class="btn-secondary guide-close-btn" onclick={() => game.showGuide = false}>닫기</button>
			</div>
		</div>
	{/if}

	{#if game.showTutorial}
		<EnergyTutorialModal
			tutorialId={game.activeTutorialId}
			onclose={() => {
				if (game.gameState === 'start') {
					closeTutorialAndStart();
				} else {
					game.showTutorial = false;
				}
			}}
		/>
	{/if}

	{#if game.confirmMessage}
		<div
			class="overlay"
			onclick={() => game.handleConfirm(false)}
			onkeydown={(e) => e.key === 'Escape' && game.handleConfirm(false)}
			role="button"
			tabindex="-1"
		>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="modal alert-modal" onclick={(e) => e.stopPropagation()}>
				<p>{game.confirmMessage}</p>
				<div class="modal-actions">
					<button class="btn-secondary" onclick={() => game.handleConfirm(false)}
						>취소</button
					>
					<button class="btn-primary" onclick={() => game.handleConfirm(true)}>확인</button
					>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	:global(.app-layout:has(.game-container)) {
		min-height: 0 !important;
		height: 100dvh;
		padding-bottom: 0 !important;
		overflow: hidden;
	}

	.game-container {
		padding: 1rem;
		max-width: 500px;
		height: 100dvh;
		display: flex;
		flex-direction: column;
		overscroll-behavior: none;
		margin: 0 auto;
		background: var(--bg-secondary);
	}

	/* Buttons */
	.btn-primary {
		background: var(--bg-dark);
		color: var(--bg-primary);
		border: none;
		padding: 0.85rem 1.5rem;
		border-radius: 14px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		width: 100%;
	}

	.btn-primary:active {
		transform: scale(0.97);
		background: #111;
	}

	.btn-primary:disabled {
		opacity: 0.5;
		pointer-events: none;
	}

	.btn-secondary {
		background: var(--bg-tertiary);
		color: var(--text-primary);
		border: none;
		padding: 0.85rem 1.5rem;
		border-radius: 14px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		width: 100%;
	}

	.btn-secondary:active {
		transform: scale(0.97);
		background: var(--bg-hover);
	}

	/* Game Header */
	header {
		width: 100%;
		display: flex;
		flex-direction: row;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0;
		flex-shrink: 0;
	}

	.header-info {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.difficulty-badge {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-darker);
		text-transform: uppercase;
		letter-spacing: 1px;
	}

	.moves {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.timer-controls {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.timer {
		font-size: 1.6rem;
		font-weight: 400;
		font-variant-numeric: tabular-nums;
		color: var(--text-primary);
		background: var(--bg-surface);
		padding: 0.4rem 1rem;
		border-radius: 30px;
		min-width: 80px;
		text-align: center;
	}

	.icon-btn {
		background: none;
		border: none;
		cursor: pointer;
		padding: 4px;
		border-radius: 50%;
		transition: background 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.icon-btn:active {
		background: var(--bg-elevated);
	}

	.header-items {
		display: flex;
		gap: 0.5rem;
		margin-right: 0.5rem;
	}

	.theme-btn {
		background: var(--bg-elevated);
		width: 32px;
		height: 32px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* Guide Modal */
	.guide-modal {
		max-width: 360px;
		width: 90%;
		padding: 1.5rem;
	}
	.guide-modal h3 {
		margin: 0 0 1rem 0;
		font-size: 1.2rem;
		color: var(--text-primary);
		text-align: center;
	}
	.guide-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-height: 50vh;
		overflow-y: auto;
	}
	.guide-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: var(--bg-secondary);
		border: 1px solid var(--bg-hover);
		border-radius: 10px;
		cursor: pointer;
		transition: background 0.15s;
		width: 100%;
		text-align: left;
	}
	.guide-item:hover {
		background: var(--bg-hover);
	}
	.guide-diff-badge {
		font-size: 0.7rem;
		font-weight: 700;
		padding: 0.15rem 0.5rem;
		border-radius: 6px;
		white-space: nowrap;
		background: var(--bg-hover);
		color: var(--text-dark);
	}
	.guide-diff-badge.easy { background: var(--color-success-bg); color: var(--color-green-dark); }
	.guide-diff-badge.medium { background: var(--color-warning-bg); color: var(--color-orange-dark); }
	.guide-diff-badge.hard { background: var(--color-warning-bg); color: var(--color-orange-dark); }
	.guide-diff-badge.expert { background: var(--color-error-bg); color: var(--color-red-dark); }
	.guide-diff-badge.master { background: var(--color-info-bg); color: var(--color-blue-bright); }
	.guide-title {
		flex: 1;
		font-size: 0.9rem;
		color: var(--text-primary);
	}
	.guide-arrow {
		font-size: 1.2rem;
		color: var(--text-hint);
	}
	.guide-close-btn {
		margin-top: 1rem;
		width: 100%;
	}

	/* Game Play Area */
	.game-play-area {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 100%;
		max-width: 500px;
		flex: 1;
		gap: 1rem;
		transition:
			filter 0.3s,
			opacity 0.3s;
	}

	.game-play-area.blurred {
		filter: blur(15px);
		opacity: 0.5;
	}

	.game-area {
		width: 100%;
	}

	/* Controls */
	.controls-area {
		width: 100%;
		display: flex;
		justify-content: center;
		padding: 0.5rem 0;
		padding-bottom: env(safe-area-inset-bottom, 0.5rem);
	}

	.undo-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		background: var(--bg-elevated);
		border: none;
		padding: 0.7rem 1.4rem;
		border-radius: 50px;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text-darker);
		cursor: pointer;
		transition: all 0.2s;
	}

	.undo-btn:active:not(:disabled) {
		background: var(--border-default);
		transform: scale(0.95);
	}

	.undo-btn:disabled {
		opacity: 0.3;
		pointer-events: none;
	}

	/* Overlay / Modals */
	.overlay {
		position: fixed;
		inset: 0;
		background: var(--shadow-heavy);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.modal {
		background: var(--bg-primary);
		border-radius: 24px;
		padding: 2rem;
		width: 90%;
		max-width: 340px;
		text-align: center;
		box-shadow: 0 20px 60px var(--shadow-lg);
		animation: popIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.modal p {
		margin: 0 0 1.5rem 0;
		color: var(--text-darker);
		font-size: 0.95rem;
		line-height: 1.5;
	}

	.modal-actions {
		display: flex;
		gap: 0.8rem;
	}

	@keyframes popIn {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}
</style>
