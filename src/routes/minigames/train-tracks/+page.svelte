<script lang="ts">
	import Board from './Board.svelte';
	import GamePauseModal from '$lib/components/games/GamePauseModal.svelte';
	import GameResultModal from '$lib/components/games/GameResultModal.svelte';
	import { goto, replaceState } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { user } from '$lib/stores/user';
	import {
		createTrainTracksGame,
		difficultyLabels,
		formatTime,
		type Difficulty
	} from './gameLogic.svelte';
	import type { ToolType } from '$lib/games/train-tracks/types';
	import TrainTracksTutorialModal from './TrainTracksTutorialModal.svelte';

	const game = createTrainTracksGame();
	let showTutorial = $state(false);

	function startWithTutorialCheck() {
		const seen = localStorage.getItem('train_tracks_tutorial_seen');
		if (!seen) {
			showTutorial = true;
		} else {
			user.refresh().then(() => game.startGame());
		}
	}

	function closeTutorial() {
		localStorage.setItem('train_tracks_tutorial_seen', '1');
		showTutorial = false;
		user.refresh().then(() => game.startGame());
	}

	onMount(() => {
		if (!browser) return;
		const params = new URLSearchParams(window.location.search);
		if (params.get('autostart') === 'true') {
			const diff = params.get('difficulty');
			if (diff) game.difficulty = diff as Difficulty;
			replaceState(window.location.pathname, {});
			startWithTutorialCheck();
		} else if (params.get('resume') === 'true') {
			replaceState(window.location.pathname, {});
			game.loadGame();
		} else if (localStorage.getItem('train_tracks_save')) {
			game.loadGame();
		} else {
			goto('/minigames/start/train-tracks', { replaceState: true });
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

	const tools: { id: ToolType; label: string }[] = [
		{ id: 'straight_h', label: '━' },
		{ id: 'straight_v', label: '┃' },
		{ id: 'corner_tr', label: '┗' },
		{ id: 'corner_rb', label: '┏' },
		{ id: 'corner_bl', label: '┓' },
		{ id: 'corner_lt', label: '┛' },
		{ id: 'eraser', label: '⌫' },
		{ id: 'mark_empty', label: '✕' }
	];
</script>

<div class="game-container">
	{#if game.gameState !== 'start'}
		<div
			class="game-play-area"
			class:blurred={game.alertMessage ||
				game.confirmMessage ||
				game.gameState === 'paused' ||
				game.gameState === 'finished'}
		>
			<header>
				<div class="header-info">
					<span class="difficulty-badge">{difficultyLabels[game.difficulty]}</span>
					<span class="mistakes">{game.mistakes}/{game.maxMistakes} 실수</span>
				</div>
				<div class="timer-controls">
					<div class="timer">
						{formatTime(game.displayTimer)}
					</div>
					<button class="icon-btn" onclick={game.pauseGame} aria-label="Pause">
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
							fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="10" />
							<rect x="9" y="9" width="2" height="6" />
							<rect x="13" y="9" width="2" height="6" />
						</svg>
					</button>
				</div>
			</header>

			<div class="game-area">
				<Board
					grid={game.grid}
					rowCounts={game.rowCounts}
					colCounts={game.colCounts}
					rowStatus={game.rowStatus}
					colStatus={game.colStatus}
					isGameOver={game.gameState === 'finished'}
					showWinAnimation={game.showWinAnimation}
					errorCell={game.errorCell}
					oncellclick={game.placeTrack}
				/>
			</div>

			<!-- Track Palette -->
			<div class="palette-area">
				<div class="palette">
					{#each tools as tool}
						<button
							class="palette-btn"
							class:selected={game.selectedTool === tool.id}
							onclick={() => game.selectTool(tool.id)}
							aria-label={tool.label}
						>
							{#if tool.id === 'straight_h'}
								<svg viewBox="0 0 24 24"><line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
							{:else if tool.id === 'straight_v'}
								<svg viewBox="0 0 24 24"><line x1="12" y1="2" x2="12" y2="22" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
							{:else if tool.id === 'corner_tr'}
								<svg viewBox="0 0 24 24"><path d="M12 2 L12 12 L22 12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
							{:else if tool.id === 'corner_rb'}
								<svg viewBox="0 0 24 24"><path d="M22 12 L12 12 L12 22" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
							{:else if tool.id === 'corner_bl'}
								<svg viewBox="0 0 24 24"><path d="M12 22 L12 12 L2 12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
							{:else if tool.id === 'corner_lt'}
								<svg viewBox="0 0 24 24"><path d="M2 12 L12 12 L12 2" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
							{:else if tool.id === 'eraser'}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M20 20H7L3 16l9-9 8 8-4 4"/>
									<path d="m6.5 13.5 5 5"/>
								</svg>
							{:else if tool.id === 'mark_empty'}
								<svg viewBox="0 0 24 24"><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
							{/if}
						</button>
					{/each}
				</div>
				<button
					class="undo-btn"
					onclick={game.undo}
					disabled={game.history.length === 0 || game.gameState !== 'playing'}
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
						fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
					</svg>
					<span>되돌리기</span>
				</button>
			</div>
		</div>

		<!-- Pause Overlay -->
		{#if game.gameState === 'paused'}
			<GamePauseModal
				stats={[
					{ label: '실수', value: `${game.mistakes}/${game.maxMistakes}` },
					{ label: '조작', value: `${game.moveCount}회` },
					{ label: '시간', value: formatTime(game.displayTimer) }
				]}
				onResume={game.resumeGame}
				onQuit={() => {
					game.stopTimer();
					localStorage.removeItem('train_tracks_save');
					goto('/minigames/start/train-tracks');
				}}
				onRestart={game.restartGame}
			/>
		{/if}

		<!-- Result Overlay -->
		{#if game.gameState === 'finished'}
			<GameResultModal
				isWon={game.isWon}
				message={game.hasRestarted
					? '다시시작한 게임은 랭킹에 반영되지 않습니다'
					: game.isWon
						? undefined
						: '실수가 너무 많습니다! 다음에 다시 도전하세요'}
				stats={[
					{ label: '난이도', value: difficultyLabels[game.difficulty] },
					{ label: '시간', value: formatTime(game.timerValue) },
					{ label: '실수', value: `${game.mistakes}/${game.maxMistakes}` },
					{ label: '조작', value: `${game.moveCount}회` },
					...(game.isWon && !game.hasRestarted
						? [{ label: '점수', value: game.calculatedScore.toLocaleString(), highlight: true }]
						: [])
				]}
				newTitleName={game.newTitleName}
				showVisitPrompt={game.showVisitPrompt}
				primaryAction={{ label: '다시 도전', onclick: game.startGame }}
				secondaryAction={{
					label: '나가기',
					onclick: () => goto('/minigames/start/train-tracks')
				}}
			/>
		{/if}
	{/if}

	<!-- Alert Modal -->
	{#if game.alertMessage}
		<div class="overlay" onclick={() => (game.alertMessage = null)}
			onkeydown={(e) => e.key === 'Escape' && (game.alertMessage = null)}
			role="button" tabindex="-1">
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="modal alert-modal" onclick={(e) => e.stopPropagation()}>
				<p>{game.alertMessage}</p>
				<button class="btn-primary" onclick={() => (game.alertMessage = null)}>확인</button>
			</div>
		</div>
	{/if}

	{#if game.confirmMessage}
		<div class="overlay" onclick={() => game.handleConfirm(false)}
			onkeydown={(e) => e.key === 'Escape' && game.handleConfirm(false)}
			role="button" tabindex="-1">
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

	{#if showTutorial}
		<TrainTracksTutorialModal onclose={closeTutorial} />
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
		padding: 0.25rem 0;
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

	.mistakes {
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
		transition: filter 0.3s, opacity 0.3s;
	}

	.game-play-area.blurred {
		filter: blur(15px);
		opacity: 0.5;
	}

	.game-area {
		width: 100%;
	}

	/* Palette */
	.palette-area {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0 0;
		padding-bottom: env(safe-area-inset-bottom, 0.5rem);
		flex-shrink: 0;
	}

	.palette {
		display: flex;
		gap: 0.35rem;
		justify-content: center;
		flex-wrap: wrap;
	}

	.palette-btn {
		width: 40px;
		height: 40px;
		border-radius: 10px;
		border: 2px solid var(--border-default);
		background: var(--bg-primary);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
		color: var(--text-darker);
		padding: 6px;
	}

	.palette-btn svg {
		width: 100%;
		height: 100%;
	}

	.palette-btn.selected {
		border-color: var(--bg-dark);
		background: var(--bg-dark);
		color: var(--bg-primary);
		box-shadow: 0 2px 8px var(--shadow-md);
		transform: scale(1.08);
	}

	.palette-btn:active:not(.selected) {
		transform: scale(0.95);
		background: var(--bg-hover);
	}

	.undo-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		background: var(--bg-elevated);
		border: none;
		padding: 0.5rem 1.2rem;
		border-radius: 50px;
		font-size: 0.85rem;
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
		from { opacity: 0; transform: scale(0.95); }
		to { opacity: 1; transform: scale(1); }
	}
</style>
