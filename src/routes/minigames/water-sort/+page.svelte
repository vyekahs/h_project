<script lang="ts">
	import Board from './Board.svelte';
	import GamePauseModal from '$lib/components/games/GamePauseModal.svelte';
	import GameResultModal from '$lib/components/games/GameResultModal.svelte';
	import { goto, replaceState } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { user } from '$lib/stores/user';
	import {
		createWaterSortGame,
		difficultyLabels,
		formatTime,
		type Difficulty
	} from './gameLogic.svelte';

	const game = createWaterSortGame();

	let isAutostart = false;
	let dismissedWarning = $state(false);

	// Auto-reset dismissedWarning when unsolvable state clears (e.g. after undo)
	$effect(() => {
		if (!game.isWarnedUnsolvable) {
			dismissedWarning = false;
		}
	});

	onMount(() => {
		if (!browser) return;
		const params = new URLSearchParams(window.location.search);
		if (params.get('autostart') === 'true') {
			isAutostart = true;
			const diff = params.get('difficulty');
			if (diff) game.difficulty = diff as Difficulty;
			// Remove query params so refresh won't restart
			replaceState(window.location.pathname, {});
			user.refresh().then(() => game.startGame());
		} else if (params.get('resume') === 'true') {
			replaceState(window.location.pathname, {});
			game.loadGame();
		} else if (localStorage.getItem('watersort_save')) {
			game.loadGame();
		} else {
			goto('/minigames/start/water-sort', { replaceState: true });
		}
	});

	// Prevent pull-to-refresh during gameplay
	let gameAreaEl = $state<HTMLDivElement | null>(null);
	$effect(() => {
		if (game.gameState !== 'playing' && game.gameState !== 'paused') return;
		const el = gameAreaEl;
		if (!el) return;
		const handler = (e: TouchEvent) => {
			e.preventDefault();
		};
		el.addEventListener('touchmove', handler, { passive: false });
		document.body.style.overscrollBehavior = 'none';
		return () => {
			el.removeEventListener('touchmove', handler);
			document.body.style.overscrollBehavior = '';
		};
	});
</script>

<div class="game-container">
	{#if game.gameState !== 'start'}
		<div
			bind:this={gameAreaEl}
			class="game-play-area"
			class:blurred={game.alertMessage ||
				game.confirmMessage ||
				game.gameState === 'paused' ||
				game.gameState === 'finished' ||
				game.isGameStuck}
		>
			<header>
				<div class="header-info">
					<span class="difficulty-badge">{difficultyLabels[game.difficulty]}</span>
					<span class="moves">{game.moveCount}회</span>
				</div>
				<div class="timer-controls">
					<button
						class="undo-btn"
						onclick={game.undo}
						disabled={game.history.length === 0 || game.gameState !== 'playing'}
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>
						<span>되돌리기</span>
					</button>
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
					tubes={game.tubes}
					selectedTubeId={game.selectedTubeId}
					isGameOver={game.gameState === 'finished'}
					showWinAnimation={game.showWinAnimation}
					pouringAnimation={game.pouringAnimation}
					returningTubeId={game.returningTubeId}
					justCompletedIds={game.justCompletedIds}
					onselect={game.selectTube}
				/>
			</div>

		</div>

		{#if game.isWarnedUnsolvable && !dismissedWarning && !game.isGameStuck && game.gameState === 'playing'}
			<div class="unsolvable-banner">
				<div class="banner-content">
					<span class="banner-icon">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
					</span>
					<span class="banner-text">더 이상 풀 수 없습니다</span>
				</div>
				<div class="banner-actions">
					{#if game.history.length > 0}
						<button class="banner-btn" onclick={game.undo}>되돌리기</button>
					{/if}
					<button class="banner-btn" onclick={game.startGame}>다시 도전</button>
					<button class="banner-close" onclick={() => dismissedWarning = true} aria-label="닫기">
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
					</button>
				</div>
			</div>
		{/if}

		{#if game.gameState === 'paused'}
			<GamePauseModal
				stats={[
					{ label: '이동', value: `${game.moveCount}회` },
					{ label: '시간', value: formatTime(game.displayTimer) }
				]}
				onResume={game.resumeGame}
				onQuit={() => {
					game.stopTimer();
					localStorage.removeItem('watersort_save');
					goto('/minigames/start/water-sort');
				}}
				onRestart={game.restartGame}
			/>
		{/if}

		{#if game.gameState === 'finished'}
			<GameResultModal
				isWon={true}
				message={game.hasRestarted
					? '다시시작한 게임은 랭킹에 반영되지 않습니다'
					: undefined}
				stats={[
					{ label: '난이도', value: difficultyLabels[game.difficulty] },
					{ label: '시간', value: formatTime(game.timerValue) },
					{ label: '이동', value: `${game.moveCount}회` },
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
					onclick: () => goto('/minigames/start/water-sort')
				}}
			/>
		{/if}

		{#if game.isGameStuck}
			<GameResultModal
				isWon={false}
				title="막힘!"
				message="가능한 이동이 없습니다"
				stats={[
					{ label: '난이도', value: difficultyLabels[game.difficulty] },
					{ label: '시간', value: formatTime(game.timerValue) },
					{ label: '이동', value: `${game.moveCount}회` }
				]}
				primaryAction={{
					label: game.history.length > 0 ? '되돌리기' : '다시 도전',
					onclick: () => {
						if (game.history.length > 0) {
							game.undo();
						} else {
							game.startGame();
						}
					}
				}}
				secondaryAction={{
					label: '나가기',
					onclick: () => {
						game.stopTimer();
						localStorage.removeItem('watersort_save');
						goto('/minigames/start/water-sort');
					}
				}}
			/>
		{/if}
	{/if}

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
					<button class="btn-secondary" onclick={() => game.handleConfirm(false)}>취소</button>
					<button class="btn-primary" onclick={() => game.handleConfirm(true)}>확인</button>
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
		flex: 1;
		display: flex;
		align-items: center;
	}

	.undo-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		background: var(--bg-elevated);
		border: none;
		padding: 0.4rem 0.8rem;
		border-radius: 50px;
		font-size: 0.8rem;
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

	/* Unsolvable warning banner */
	.unsolvable-banner {
		position: fixed;
		bottom: 1.5rem;
		left: 50%;
		transform: translateX(-50%);
		width: calc(100% - 2rem);
		max-width: 460px;
		background: var(--bg-primary);
		border: 1.5px solid var(--color-amber-dark);
		border-radius: 16px;
		padding: 0.8rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		z-index: 50;
		box-shadow: 0 8px 24px var(--shadow-heavy);
		animation: slideUp 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.banner-content {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.banner-icon {
		display: flex;
		align-items: center;
		color: var(--color-amber-dark);
		flex-shrink: 0;
	}

	.banner-text {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.banner-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.banner-btn {
		flex: 1;
		background: var(--bg-tertiary);
		color: var(--text-primary);
		border: none;
		padding: 0.55rem 0.8rem;
		border-radius: 10px;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
	}

	.banner-btn:active {
		transform: scale(0.96);
		background: var(--bg-hover);
	}

	.banner-close {
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		padding: 0.4rem;
		border-radius: 8px;
		color: var(--text-tertiary);
		cursor: pointer;
		flex-shrink: 0;
		transition: all 0.15s;
	}

	.banner-close:active {
		background: var(--bg-tertiary);
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(1rem);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}
</style>
