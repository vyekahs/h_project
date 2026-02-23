<script lang="ts">
	import Board from './Board.svelte';
	import EnergyTutorialModal from './EnergyTutorialModal.svelte';
	import GamePauseModal from '$lib/components/games/GamePauseModal.svelte';
	import GameResultModal from '$lib/components/games/GameResultModal.svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { user } from '$lib/stores/user';
	import {
		createEnergyGame,
		difficultyLabels,
		formatTime,
		type Difficulty
	} from './gameLogic.svelte';
	import { createEnergyTutorialLogic } from './tutorialLogic.svelte';

	const game = createEnergyGame();

	function openTutorial(id: string) {
		game.activeTutorialId = id;
		game.showTutorial = true;
	}

	const tutorial = createEnergyTutorialLogic(
		() => $user.completedTutorials || [],
		openTutorial
	);

	game.setTutorialChecker(tutorial.checkAndShowTutorial);

	let isAutostart = false;

	// Handle autostart/resume from unified start page
	onMount(() => {
		if (!browser) return;
		const params = new URLSearchParams(window.location.search);
		if (params.get('autostart') === 'true') {
			isAutostart = true;
			const diff = params.get('difficulty');
			if (diff) game.difficulty = diff as Difficulty;
			user.refresh().then(() => game.startGame());
		} else if (params.get('resume') === 'true') {
			game.loadGame();
		} else {
			goto('/games/start/energy', { replaceState: true });
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
				game.gameState === 'finished'}
		>
			<header>
				<div class="header-info">
					<span class="difficulty-badge">{difficultyLabels[game.difficulty]}</span>
					<span class="moves">{game.moveCount}회 회전</span>
				</div>
				<div class="timer-controls">
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
					goto('/games/start/energy');
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
					onclick: () => goto('/games/start/energy')
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

	<!-- Confirm Modal -->
	{#if game.showTutorial}
		<EnergyTutorialModal
			tutorialId={game.activeTutorialId}
			onclose={(shouldStart: boolean) => {
				if (shouldStart) {
					game.startGame(true);
				} else {
					game.showTutorial = false;
					if (isAutostart) {
						goto('/games/start/energy');
					}
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
		background: #f8f9fa;
	}

	/* Buttons */
	.btn-primary {
		background: #333;
		color: white;
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
		background: #f1f3f5;
		color: #333;
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
		background: #e9ecef;
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
		color: #555;
		text-transform: uppercase;
		letter-spacing: 1px;
	}

	.moves {
		font-size: 0.85rem;
		font-weight: 600;
		color: #333;
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
		color: #333;
		background: #f5f5f7;
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
		background: #f0f0f0;
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
		background: #f0f0f0;
		border: none;
		padding: 0.7rem 1.4rem;
		border-radius: 50px;
		font-size: 0.9rem;
		font-weight: 600;
		color: #555;
		cursor: pointer;
		transition: all 0.2s;
	}

	.undo-btn:active:not(:disabled) {
		background: #e0e0e0;
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
		background: rgba(0, 0, 0, 0.3);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.modal {
		background: white;
		border-radius: 24px;
		padding: 2rem;
		width: 90%;
		max-width: 340px;
		text-align: center;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
		animation: popIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.modal p {
		margin: 0 0 1.5rem 0;
		color: #555;
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
