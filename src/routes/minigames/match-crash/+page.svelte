<script lang="ts">
	import Board from './Board.svelte';
	import GamePauseModal from '$lib/components/games/GamePauseModal.svelte';
	import GameResultModal from '$lib/components/games/GameResultModal.svelte';
	import { goto, replaceState } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { user } from '$lib/stores/user';
	import { createMatchCrashGame, formatTime, type Difficulty } from './gameLogic.svelte';

	const game = createMatchCrashGame();

	onMount(() => {
		if (!browser) return;
		const params = new URLSearchParams(window.location.search);
		const diff = (params.get('difficulty') as Difficulty) || 'classic';

		if (params.get('autostart') === 'true') {
			replaceState(window.location.pathname, {});
			user.refresh().then(() => game.startGame(diff));
		} else if (params.get('resume') === 'true' && diff === 'infinite') {
			replaceState(window.location.pathname, {});
			game.loadGame();
		} else if (diff === 'infinite' && localStorage.getItem('match_crash_save')) {
			game.loadGame();
		} else {
			goto('/minigames/start/match-crash', { replaceState: true });
		}

		const onVisibilityChange = () => {
			if (document.visibilityState === 'hidden') game.saveGame();
		};
		const onBeforeUnload = () => game.saveGame();
		document.addEventListener('visibilitychange', onVisibilityChange);
		window.addEventListener('beforeunload', onBeforeUnload);
		return () => {
			document.removeEventListener('visibilitychange', onVisibilityChange);
			window.removeEventListener('beforeunload', onBeforeUnload);
			game.stopTimer();
		};
	});

	let gameAreaEl = $state<HTMLDivElement | null>(null);
	$effect(() => {
		if (game.gameState !== 'playing' && game.gameState !== 'paused') return;
		const el = gameAreaEl;
		if (!el) return;
		const handler = (e: TouchEvent) => { e.preventDefault(); };
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
				game.gameState === 'finished'}
		>
			<header>
				<div class="header-info">
					<span class="score-label">SCORE</span>
					<span class="score-value">{game.score.toLocaleString()}</span>
				</div>
				<div class="header-right">
					{#if game.combo > 1}
						<div class="combo">×{game.combo}</div>
					{/if}
					<div class="timer" class:urgent={game.isTimedMode && game.timeRemaining <= 10}>
						{#if game.isTimedMode}
							{formatTime(game.timeRemaining)}
						{:else}
							{formatTime(game.displayTimer)}
						{/if}
					</div>
					<button class="icon-btn" onclick={game.pauseGame} aria-label="Pause">
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="2" height="6"/><rect x="13" y="9" width="2" height="6"/></svg>
					</button>
				</div>
			</header>

			<div class="game-area">
				<Board
					flatTiles={game.flatTiles}
					matchedCells={game.matchedCells}
					isAnimating={game.isAnimating}
					shuffling={game.shuffling}
					onSwipe={game.handleSwipe}
				/>
			</div>
		</div>

		{#if game.gameState === 'paused'}
			<GamePauseModal
				stats={[
					{ label: '점수', value: game.score.toLocaleString() },
					{ label: '매치', value: `${game.matchCount}개` },
					{ label: '시간', value: game.isTimedMode ? formatTime(game.timeRemaining) : formatTime(game.displayTimer) }
				]}
				onResume={game.resumeGame}
				onQuit={() => {
					game.stopTimer();
					localStorage.removeItem('match_crash_save');
					goto('/minigames/start/match-crash');
				}}
				onRestart={game.restartGame}
			/>
		{/if}

		{#if game.gameState === 'finished'}
			<GameResultModal
				isWon={false}
				title={game.isTimedMode ? 'TIME UP!' : 'GAME OVER'}
				message={game.hasRestarted
					? '다시시작한 게임은 랭킹에 반영되지 않습니다'
					: undefined}
				stats={[
					{
						label: '점수',
						value: game.score.toLocaleString(),
						highlight: !game.hasRestarted
					},
					{ label: '매치', value: `${game.matchCount}개` },
					{ label: '최대 콤보', value: `×${game.maxCombo}` },
					{ label: '시간', value: game.isTimedMode ? formatTime(90 - game.timeRemaining) : formatTime(game.timerValue) }
				]}
				newTitleName={game.newTitleName}
				showVisitPrompt={game.showVisitPrompt}
				primaryAction={{ label: '다시 도전', onclick: () => game.startGame(game.difficulty) }}
				secondaryAction={{
					label: '나가기',
					onclick: () => goto('/minigames/start/match-crash')
				}}
			/>
		{/if}
	{/if}

	{#if game.alertMessage}
		<div class="overlay" onclick={() => (game.alertMessage = null)} onkeydown={(e) => e.key === 'Escape' && (game.alertMessage = null)} role="button" tabindex="-1">
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="modal alert-modal" onclick={(e) => e.stopPropagation()}>
				<p>{game.alertMessage}</p>
				<button class="btn-primary" onclick={() => (game.alertMessage = null)}>확인</button>
			</div>
		</div>
	{/if}

	{#if game.confirmMessage}
		<div class="overlay" onclick={() => game.handleConfirm(false)} onkeydown={(e) => e.key === 'Escape' && game.handleConfirm(false)} role="button" tabindex="-1">
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

	header {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0;
		flex-shrink: 0;
	}

	.header-info {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.score-label {
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--text-tertiary);
		text-transform: uppercase;
		letter-spacing: 1px;
	}

	.score-value {
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--text-primary);
		font-variant-numeric: tabular-nums;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.combo {
		font-size: 1.1rem;
		font-weight: 700;
		color: #e74c3c;
		animation: comboPop 0.3s ease-out;
	}

	@keyframes comboPop {
		0% { transform: scale(0.5); opacity: 0; }
		60% { transform: scale(1.2); }
		100% { transform: scale(1); opacity: 1; }
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
		transition: color 0.3s, background 0.3s;
	}

	.timer.urgent {
		color: #e74c3c;
		background: rgba(231, 76, 60, 0.1);
		animation: timerPulse 1s ease-in-out infinite;
	}

	@keyframes timerPulse {
		0%, 100% { transform: scale(1); }
		50% { transform: scale(1.05); }
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
		color: var(--text-primary);
	}

	.icon-btn:active {
		background: var(--bg-elevated);
	}

	.game-play-area {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-start;
		width: 100%;
		max-width: 500px;
		flex: 1;
		gap: 0.5rem;
		transition: filter 0.3s, opacity 0.3s;
		overflow: hidden;
		touch-action: none;
	}

	.game-play-area.blurred {
		filter: blur(15px);
		opacity: 0.5;
		pointer-events: none;
	}

	.game-area {
		width: 100%;
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
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

	.btn-primary:active { transform: scale(0.97); }

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

	.overlay {
		position: fixed;
		inset: 0;
		background: var(--shadow-heavy);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		touch-action: auto;
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
		from { opacity: 0; transform: scale(0.95); }
		to { opacity: 1; transform: scale(1); }
	}
</style>
