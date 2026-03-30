<script lang="ts">
	import Board from './Board.svelte';
	import DiscardModal from './DiscardModal.svelte';
	import JesterPanel from './JesterPanel.svelte';
	import CombatLog from './CombatLog.svelte';
	import TutorialOverlay from './TutorialOverlay.svelte';
	import GamePauseModal from '$lib/components/games/GamePauseModal.svelte';
	import GameResultModal from '$lib/components/games/GameResultModal.svelte';
	import { goto, replaceState } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { user } from '$lib/stores/user';
	import { createRegicideGame, formatTime } from './gameLogic.svelte';

	const game = createRegicideGame();

	onMount(() => {
		if (!browser) return;
		const params = new URLSearchParams(window.location.search);
		if (params.get('autostart') === 'true') {
			const diff = params.get('difficulty') || 'classic';
			replaceState(window.location.pathname, {});
			user.refresh().then(() => {
				if (!localStorage.getItem('regicide_tutorial_done')) {
					game.startTutorial();
				} else {
					game.startGame(diff);
				}
			});
		} else if (params.get('resume') === 'true') {
			replaceState(window.location.pathname, {});
			game.loadGame();
		} else if (localStorage.getItem('regicide_save')) {
			game.loadGame();
		} else {
			goto('/minigames/start/regicide', { replaceState: true });
		}
	});

	// Keyboard controls
	function handleKeydown(e: KeyboardEvent) {
		if (game.gamePhase !== 'playing') return;
		if (game.alertMessage || game.confirmMessage) return;

		if (e.key === 'Escape') {
			game.pauseGame();
		}
	}

	// Prevent pull-to-refresh during gameplay
	let gameAreaEl = $state<HTMLDivElement | null>(null);
	$effect(() => {
		if (game.gamePhase !== 'playing' && game.gamePhase !== 'paused') return;
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

	const difficultyLabel: Record<string, string> = {
		classic: '클래식',
		hard: '어려움',
		nightmare: '악몽'
	};

	const tutorialHighlightIds = $derived(
		game.tutorialStep?.highlightCardIds
			? new Set(game.tutorialStep.highlightCardIds)
			: undefined
	);

	const tutorialBlocked = $derived(
		game.isTutorial && game.tutorialStep?.expectedAction.type === 'tap_next'
	);

	const victoryLabel: Record<string, string> = {
		gold: '골드',
		silver: '실버',
		bronze: '브론즈'
	};
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="game-container">
	{#if game.gamePhase !== 'start'}
		<div
			bind:this={gameAreaEl}
			class="game-play-area"
			class:blurred={game.alertMessage ||
				game.confirmMessage ||
				game.gamePhase === 'paused' ||
				game.gamePhase === 'finished' ||
				(game.turnPhase === 'enemy_attacks' && !tutorialBlocked)}
		>
			<header>
				<div class="header-left">
					<span class="difficulty-badge">{difficultyLabel[game.difficulty] || game.difficulty}</span>
					<span class="turn-num">턴 {game.turnNumber}</span>
				</div>
				<div class="timer-controls">
					<div class="enemy-count">{game.enemiesDefeated}/12</div>
					<div class="timer">
						{formatTime(game.displayTimer)}
					</div>
					<button class="icon-btn" onclick={game.pauseGame} aria-label="일시정지">
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><rect x="9" y="9" width="2" height="6" /><rect x="13" y="9" width="2" height="6" /></svg>
					</button>
				</div>
			</header>

			<div class="game-area">
				<Board
					playerHand={game.playerHand}
					currentEnemy={game.currentEnemy}
					castleDeck={game.castleDeck}
					tavernDeck={game.tavernDeck}
					discardPile={game.discardPile}
					selectedCardIds={game.selectedCardIds}
					currentShield={game.currentShield}
					turnPhase={game.turnPhase}
					canPlay={game.canPlay}
					playedCardsThisEnemy={game.playedCardsThisEnemy}
					highlightCardIds={tutorialHighlightIds}
					interactionBlocked={tutorialBlocked || game.isAnimating}
					animEvent={game.animEvent}
					onToggleCard={game.toggleCardSelection}
					onPlayCards={game.playSelectedCards}
				/>

				<div class="bottom-bar">
					<JesterPanel
						jestersRemaining={game.jestersRemaining}
						jestersUsed={game.jestersUsed}
						canUse={game.turnPhase === 'select_cards' && game.jestersRemaining > 0 && game.gamePhase === 'playing'}
						onFlip={game.flipJester}
					/>
					<CombatLog entries={game.combatLog} />
				</div>
			</div>
		</div>

		{#if game.tutorialStep}
			<TutorialOverlay
				step={game.tutorialStep}
				progress={game.tutorialProgress}
				hint={game.tutorialHint}
				onTapNext={game.tutorialTapNext}
				onSkip={game.skipTutorial}
			/>
		{/if}

		{#if game.turnPhase === 'enemy_attacks' && game.gamePhase === 'playing' && !tutorialBlocked}
			<DiscardModal
				hand={game.playerHand}
				discardIds={game.discardCardIds}
				effectiveAttack={game.effectiveEnemyAttack}
				discardTotal={game.discardTotal}
				canConfirm={game.canConfirmDiscard}
				jestersRemaining={game.jestersRemaining}
				onToggleCard={game.toggleDiscardSelection}
				onConfirm={game.confirmDiscard}
				onFlipJester={game.flipJester}
			/>
		{/if}

		{#if game.gamePhase === 'paused'}
			<GamePauseModal
				stats={[
					{ label: '난이도', value: difficultyLabel[game.difficulty] || game.difficulty },
					{ label: '적 처치', value: `${game.enemiesDefeated}/12` },
					{ label: '시간', value: formatTime(game.displayTimer) },
					{ label: '광대', value: `${game.jestersRemaining}장 남음` }
				]}
				onResume={game.resumeGame}
				onQuit={() => {
					game.stopTimer();
					localStorage.removeItem('regicide_save');
					goto('/minigames/start/regicide');
				}}
				onRestart={game.restartGame}
			/>
		{/if}

		{#if game.gamePhase === 'finished'}
			<GameResultModal
				isWon={game.won}
				title={game.won
					? game.victoryTier
						? `${victoryLabel[game.victoryTier]} 승리!`
						: 'CLEAR!'
					: 'GAME OVER'}
				message={game.hasRestarted
					? '다시시작한 게임은 랭킹에 반영되지 않습니다'
					: undefined}
				stats={[
					...(!game.hasRestarted && game.won
						? [{
							label: '점수',
							value: game.calculatedScore.toLocaleString(),
							highlight: true
						}]
						: []),
					...(game.won && game.victoryTier
						? [{ label: '등급', value: victoryLabel[game.victoryTier] }]
						: []),
					{ label: '적 처치', value: `${game.enemiesDefeated}/12` },
					{ label: '시간', value: formatTime(game.timerValue) },
					{ label: '광대 사용', value: `${game.jestersUsed}회` }
				]}
				newTitleName={game.newTitleName}
				showVisitPrompt={game.showVisitPrompt}
				primaryAction={{ label: '다시 도전', onclick: () => game.startGame() }}
				secondaryAction={{
					label: '나가기',
					onclick: () => goto('/minigames/start/regicide')
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
		padding: 0.5rem;
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
		padding: 0.25rem 0;
		flex-shrink: 0;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.difficulty-badge {
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--bg-primary);
		background: var(--color-green);
		padding: 2px 8px;
		border-radius: 10px;
	}

	.turn-num {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-tertiary);
		font-variant-numeric: tabular-nums;
	}

	.timer-controls {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.enemy-count {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-darker);
	}

	.timer {
		font-size: 1.2rem;
		font-weight: 400;
		font-variant-numeric: tabular-nums;
		color: var(--text-primary);
		background: var(--bg-surface);
		padding: 0.25rem 0.75rem;
		border-radius: 20px;
		min-width: 60px;
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

	.game-play-area {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
		max-width: 500px;
		flex: 1;
		transition:
			filter 0.3s,
			opacity 0.3s;
		overflow: hidden;
	}

	.game-play-area.blurred {
		filter: blur(15px);
		opacity: 0.5;
		pointer-events: none;
	}

	.game-area {
		width: 100%;
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		-webkit-overflow-scrolling: touch;
		display: flex;
		flex-direction: column;
	}

	.bottom-bar {
		flex-shrink: 0;
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.5rem 0;
		width: 100%;
		max-height: 120px;
	}

	/* ─── Modals ─── */

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
