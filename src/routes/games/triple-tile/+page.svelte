<script lang="ts">
	import Board from './Board.svelte';
	import StagingArea from './StagingArea.svelte';
	import PowerUpBar from './PowerUpBar.svelte';
	import TripleTileTutorialModal from './TripleTileTutorialModal.svelte';
	import GamePauseModal from '$lib/components/games/GamePauseModal.svelte';
	import GameResultModal from '$lib/components/games/GameResultModal.svelte';
	import { goto, replaceState } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { user } from '$lib/stores/user';
	import { stagingOccupied } from '$lib/games/triple-tile/tileLogic';
	import { TILE_TYPES } from '$lib/games/triple-tile/types';
	import {
		createTripleTileGame,
		difficultyLabels,
		formatTime,
		type Difficulty,
	} from './gameLogic.svelte';

	const game = createTripleTileGame();

	let stagingContainerRef: HTMLElement | undefined = $state();
	let showTutorial = $state(false);
	const flyingTiles = new Map<number, { el: HTMLElement; anim: Animation }>();

	function handleTileSelect(tileId: number, tileRect: DOMRect) {
		const info = game.selectTile(tileId);
		if (!info) return;

		// Get target slot position by querying the nth .slot child
		const slotEl = stagingContainerRef?.children[info.insertIndex] as HTMLElement | undefined;
		if (!slotEl) {
			game.commitTile(info.tileId);
			return;
		}

		const slotRect = slotEl.getBoundingClientRect();
		const emoji = TILE_TYPES[info.typeId] ?? '❓';

		// Create a temporary DOM element and animate with Web Animations API
		const el = document.createElement('div');
		el.textContent = emoji;
		el.style.cssText = `
			position: fixed;
			z-index: 9999;
			font-size: 1.5rem;
			pointer-events: none;
			left: ${tileRect.left + tileRect.width / 2}px;
			top: ${tileRect.top + tileRect.height / 2}px;
			transform: translate(-50%, -50%);
			filter: drop-shadow(0 4px 8px rgba(0,0,0,0.2));
		`;
		document.body.appendChild(el);

		const dx = (slotRect.left + slotRect.width / 2) - (tileRect.left + tileRect.width / 2);
		const dy = (slotRect.top + slotRect.height / 2) - (tileRect.top + tileRect.height / 2);

		const anim = el.animate([
			{ transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
			{ transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.8)`, opacity: 0.85 },
		], {
			duration: 250,
			easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)',
			fill: 'forwards',
		});

		flyingTiles.set(info.tileId, { el, anim });

		const commitTileId = info.tileId;
		anim.onfinish = () => {
			el.remove();
			flyingTiles.delete(commitTileId);
			game.commitTile(commitTileId);
		};
	}

	function startWithTutorialCheck() {
		const seen = localStorage.getItem('triple_tile_tutorial_seen');
		if (!seen) {
			showTutorial = true;
		} else {
			user.refresh().then(() => game.startGame());
		}
	}

	function closeTutorial() {
		localStorage.setItem('triple_tile_tutorial_seen', '1');
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
		} else if (localStorage.getItem('triple_tile_save')) {
			game.loadGame();
		} else {
			goto('/games/start/triple-tile', { replaceState: true });
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

	const remainingTiles = $derived(game.tiles.filter((t) => !t.removed).length);
	const stagingFull = $derived(
		stagingOccupied(game.staging) >= game.stagingCapacity && game.matchingTypeId < 0
	);
</script>

<div class="game-container">
	{#if game.gameState !== 'start'}
		<div
			class="game-play-area"
			class:blurred={game.alertMessage ||
				game.confirmMessage ||
				game.gameState === 'paused' ||
				(game.gameState === 'finished')}
		>
			<header>
				<div class="header-info">
					<span class="difficulty-badge">{difficultyLabels[game.difficulty]}</span>
					<span class="remaining">남은 타일 {remainingTiles}</span>
				</div>
				<div class="timer-controls">
					<div class="timer">
						{formatTime(game.displayTimer)}
					</div>
					<button class="icon-btn" onclick={game.pauseGame} aria-label="Pause">
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="10" /><rect x="9" y="9" width="2" height="6" /><rect x="13" y="9" width="2" height="6" />
						</svg>
					</button>
				</div>
			</header>

			<Board
				tiles={game.tiles}
				matchingTypeId={game.matchingTypeId}
				onselect={handleTileSelect}
			/>

			<div class="bottom-area">
				<StagingArea
					staging={game.staging}
					capacity={game.stagingCapacity}
					matchingTypeId={game.matchingTypeId}
					isFull={stagingFull}
					bind:containerRef={stagingContainerRef}
				/>
				<PowerUpBar
					shuffleRemaining={game.shuffleRemaining}
					undoAvailable={game.history.length > 0 && !game.isAnimating}
					onshuffle={game.shuffle}
					onundo={game.undo}
				/>
			</div>
		</div>

		{#if game.gameState === 'paused'}
			<GamePauseModal
				stats={[
					{ label: '남은 타일', value: `${remainingTiles}개` },
					{ label: '시간', value: formatTime(game.displayTimer) },
				]}
				onResume={game.resumeGame}
				onQuit={() => {
					game.stopTimer();
					localStorage.removeItem('triple_tile_save');
					goto('/games/start/triple-tile');
				}}
				onRestart={game.restartGame}
			/>
		{/if}

		{#if game.gameState === 'finished' && game.isWon}
			<GameResultModal
				isWon={true}
				message={game.hasRestarted
					? '다시시작한 게임은 랭킹에 반영되지 않습니다'
					: undefined}
				stats={[
					{ label: '난이도', value: difficultyLabels[game.difficulty] },
					{ label: '시간', value: formatTime(game.timerValue) },
					{ label: '이동', value: `${game.moveCount}회` },
					{ label: '셔플 사용', value: `${game.shuffleUsed}회` },
					...(!game.hasRestarted
						? [
								{
									label: '점수',
									value: game.calculatedScore.toLocaleString(),
									highlight: true,
								},
							]
						: []),
				]}
				newTitleName={game.newTitleName}
				showVisitPrompt={game.showVisitPrompt}
				primaryAction={{ label: '다시 도전', onclick: game.startGame }}
				secondaryAction={{
					label: '나가기',
					onclick: () => goto('/games/start/triple-tile'),
				}}
			/>
		{/if}

		{#if game.gameState === 'finished' && !game.isWon}
			<GameResultModal
				isWon={false}
				title="게임 오버"
				message="슬롯이 가득 찼습니다"
				stats={[
					{ label: '난이도', value: difficultyLabels[game.difficulty] },
					{ label: '시간', value: formatTime(game.timerValue) },
					{ label: '이동', value: `${game.moveCount}회` },
				]}
				primaryAction={{
					label: game.history.length > 0 ? '되돌리기' : '다시 도전',
					onclick: () => {
						if (game.history.length > 0) {
							game.gameState = 'playing';
							game.startTimer();
							game.undo();
						} else {
							game.startGame();
						}
					},
				}}
				secondaryAction={{
					label: '나가기',
					onclick: () => {
						game.stopTimer();
						localStorage.removeItem('triple_tile_save');
						goto('/games/start/triple-tile');
					},
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

	{#if showTutorial}
		<TripleTileTutorialModal onclose={closeTutorial} />
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

	.game-play-area {
		display: flex;
		flex-direction: column;
		width: 100%;
		flex: 1;
		gap: 0.5rem;
		transition: opacity 0.3s;
		overflow: hidden;
	}

	.game-play-area.blurred {
		filter: blur(8px);
		opacity: 0.4;
		pointer-events: none;
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
		gap: 0.3rem;
	}

	.difficulty-badge {
		font-size: 0.75rem;
		font-weight: 600;
		color: #555;
		text-transform: uppercase;
		letter-spacing: 1px;
	}

	.remaining {
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

	.bottom-area {
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex-shrink: 0;
		padding-bottom: 0.5rem;
	}

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
