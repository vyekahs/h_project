<script lang="ts">
	import Board from './Board.svelte';
	import GamePauseModal from '$lib/components/games/GamePauseModal.svelte';
	import GameResultModal from '$lib/components/games/GameResultModal.svelte';
	import { goto, replaceState } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { user } from '$lib/stores/user';
	import { getMaxTile } from '$lib/games/2048/gameLogic';
	import { create2048Game, formatTime } from './gameLogic.svelte';
	import type { Direction } from '$lib/games/2048/types';

	const game = create2048Game();

	onMount(() => {
		if (!browser) return;
		const params = new URLSearchParams(window.location.search);
		if (params.get('autostart') === 'true') {
			replaceState(window.location.pathname, {});
			user.refresh().then(() => game.startGame());
		} else if (params.get('resume') === 'true') {
			replaceState(window.location.pathname, {});
			game.loadGame();
		} else if (localStorage.getItem('2048_save')) {
			game.loadGame();
		} else {
			goto('/minigames/start/2048', { replaceState: true });
		}

		// PWA 백그라운드 전환 / 새로고침 시 즉시 저장
		const onVisibilityChange = () => {
			if (document.visibilityState === 'hidden') game.saveGame();
		};
		const onBeforeUnload = () => game.saveGame();
		document.addEventListener('visibilitychange', onVisibilityChange);
		window.addEventListener('beforeunload', onBeforeUnload);
		return () => {
			document.removeEventListener('visibilitychange', onVisibilityChange);
			window.removeEventListener('beforeunload', onBeforeUnload);
		};
	});

	// Keyboard controls
	function handleKeydown(e: KeyboardEvent) {
		if (game.gameState !== 'playing') return;
		if (game.alertMessage || game.confirmMessage) return;

		const dirMap: Record<string, Direction> = {
			ArrowUp: 'up',
			ArrowDown: 'down',
			ArrowLeft: 'left',
			ArrowRight: 'right'
		};

		if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
			e.preventDefault();
			game.undo();
			return;
		}

		const dir = dirMap[e.key];
		if (dir) {
			e.preventDefault();
			game.handleMove(dir);
		}
	}

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

<svelte:window onkeydown={handleKeydown} />

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
					<span class="score-value">{game.board.score.toLocaleString()}</span>
				</div>
				<div class="timer-controls">
					<div class="move-count">{game.moveCount}회</div>
					<div class="timer">
						{formatTime(game.displayTimer)}
					</div>
					<button
						class="icon-btn"
						onclick={game.undo}
						disabled={!game.canUndo}
						aria-label="되돌리기"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="22"
							height="22"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
					</button>
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
						><circle cx="12" cy="12" r="10" /><rect x="9" y="9" width="2" height="6" /><rect x="13" y="9" width="2" height="6" /></svg>
					</button>
				</div>
			</header>

			<div class="game-area">
				<Board
					board={game.board}
					lastSpawnedId={game.lastSpawnedId}
					onswipe={game.handleMove}
				/>
			</div>
		</div>

		{#if game.gameState === 'paused'}
			<GamePauseModal
				stats={[
					{ label: '점수', value: game.board.score.toLocaleString() },
					{ label: '이동', value: `${game.moveCount}회` },
					{ label: '시간', value: formatTime(game.displayTimer) }
				]}
				onResume={game.resumeGame}
				onQuit={() => {
					game.stopTimer();
					localStorage.removeItem('2048_save');
					goto('/minigames/start/2048');
				}}
				onRestart={game.restartGame}
			/>
		{/if}

		{#if game.gameState === 'finished'}
			<GameResultModal
				isWon={false}
				title="GAME OVER"
				message={game.hasRestarted
					? '다시시작한 게임은 랭킹에 반영되지 않습니다'
					: undefined}
				stats={[
					...(!game.hasRestarted
						? [{
							label: '점수',
							value: game.calculatedScore.toLocaleString(),
							highlight: true
						}]
						: [{
							label: '점수',
							value: game.board.score.toLocaleString()
						}]),
					{ label: '최대 타일', value: getMaxTile(game.board).toLocaleString() },
					{ label: '이동', value: `${game.moveCount}회` },
					{ label: '시간', value: formatTime(game.timerValue) }
				]}
				newTitleName={game.newTitleName}
				showVisitPrompt={game.showVisitPrompt}
				primaryAction={{ label: '다시 도전', onclick: game.startGame }}
				secondaryAction={{
					label: '나가기',
					onclick: () => goto('/minigames/start/2048')
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

	.timer-controls {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.move-count {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-darker);
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
		color: var(--text-primary);
	}

	.icon-btn:active {
		background: var(--bg-elevated);
	}

	.icon-btn:disabled {
		opacity: 0.25;
		cursor: default;
		pointer-events: none;
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
		pointer-events: none;
	}

	.game-area {
		width: 100%;
		flex: 1;
		display: flex;
		align-items: center;
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
