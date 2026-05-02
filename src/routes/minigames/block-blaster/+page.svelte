<script lang="ts">
	import Board from './Board.svelte';
	import BlockTray from './BlockTray.svelte';
	import AbilityInventory from './AbilityInventory.svelte';
	import AbilityDraftModal from './AbilityDraftModal.svelte';
	import SlotDiscardModal from './SlotDiscardModal.svelte';
	import TransformModal from './TransformModal.svelte';
	import SwapBlockModal from './SwapBlockModal.svelte';
	import DrawBlockModal from './DrawBlockModal.svelte';
	import ColorChooseModal from './ColorChooseModal.svelte';
	import PeekStrip from './PeekStrip.svelte';
	import AbilityIcon from './AbilityIcon.svelte';
	import GamePauseModal from '$lib/components/games/GamePauseModal.svelte';
	import GameResultModal from '$lib/components/games/GameResultModal.svelte';
	import { goto, replaceState } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { user } from '$lib/stores/user';
	import { createBlockBlasterGame, formatTime, computeAbilityPreview, type GameMode } from './gameLogic.svelte';
	import type { BlockShape } from '$lib/games/block-blaster/types';

	const game = createBlockBlasterGame();

	// 탭 선택 블록
	const selectedBlock = $derived(
		game.selectedBlockIndex !== null ? game.currentBlocks[game.selectedBlockIndex] ?? null : null
	);

	// 드래그 상태
	let isDragging = $state(false);
	let dragBlockIndex: number | null = $state(null);
	let dragBlock: BlockShape | null = $state(null);
	let pointerX = $state(0);
	let pointerY = $state(0);
	let dragX = $state(0);
	let dragY = $state(0);
	let dragStartX = 0;
	let dragStartY = 0;
	let hasMoved = false;
	const DRAG_THRESHOLD = 8;
	const FINGER_OFFSET = 80;

	// 능력 드래그 상태
	let abilityDragSlot: number | null = $state(null);
	let isAbilityDragging = $state(false);
	let abilityDragStartX = 0;
	let abilityDragStartY = 0;
	let abilityHasMoved = false;
	let abilityPreviewCells: [number, number][] = $state([]);

	let boardRef: Board | null = $state(null);

	function handleDragStart(index: number, e: PointerEvent) {
		if (game.gameState !== 'playing' || game.isAnimating) return;
		const block = game.currentBlocks[index];
		if (!block) return;

		// block 타겟형 능력 발동 대기 중이면 트레이 블록 클릭 = 타겟 적용
		if (game.pendingAbilitySlot !== null) {
			game.applyAbilityToTarget({ kind: 'block', index });
			return;
		}

		dragBlockIndex = index;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
		dragX = e.clientX;
		dragY = e.clientY;
		hasMoved = false;

		(e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId);
	}

	function handlePointerMove(e: PointerEvent) {
		// 능력 드래그 우선 처리
		if (abilityDragSlot !== null) {
			const dx = e.clientX - abilityDragStartX;
			const dy = e.clientY - abilityDragStartY;
			if (!isAbilityDragging && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
				isAbilityDragging = true;
				abilityHasMoved = true;
			}
			if (isAbilityDragging) {
				// 능력 드래그는 손가락 위치 그대로 사용 (블록처럼 위로 보정 X)
				dragX = e.clientX;
				dragY = e.clientY;
				updateAbilityPreview(e.clientX, e.clientY);
			}
			return;
		}

		if (dragBlockIndex === null) return;

		const dx = e.clientX - dragStartX;
		const dy = e.clientY - dragStartY;

		if (!isDragging && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
			isDragging = true;
			hasMoved = true;
			dragBlock = game.currentBlocks[dragBlockIndex] ?? null;
			// 드래그 시작하면 탭 선택 해제
			game.selectBlock(-1);
		}

		if (isDragging) {
			pointerX = e.clientX;
			pointerY = e.clientY;
			// 손가락 위로 오프셋 — 플로팅 블록 표시용
			dragX = e.clientX;
			dragY = e.clientY - FINGER_OFFSET;
		}
	}

	function handlePointerUp(e: PointerEvent) {
		// 능력 드래그 종료
		if (abilityDragSlot !== null) {
			const slot = abilityDragSlot;
			if (isAbilityDragging && boardRef) {
				const cell = boardRef.getCellFromXY(dragX, dragY);
				if (cell) {
					// pending 상태로 전환 후 타겟 적용
					game.useAbility(slot);
					if (game.pendingAbilitySlot !== null) {
						game.applyAbilityToTarget({ kind: 'cell', row: cell.row, col: cell.col });
					}
				}
			}
			// 탭(드래그 없음)은 onclick에서 처리됨 — 여기서는 호출하지 않음
			abilityDragSlot = null;
			isAbilityDragging = false;
			// abilityHasMoved는 onclick 핸들러가 무시 여부 결정에 쓰므로 그대로 전달
			abilityPreviewCells = [];
			dragX = 0;
			dragY = 0;
			return;
		}

		if (dragBlockIndex === null) return;

		if (isDragging && dragBlock && boardRef) {
			// 드롭: 블록 중심 보정된 좌표로 보드 셀 계산
			const cell = boardRef.getCellFromXY(dragX, dragY, dragBlock);
			if (cell) {
				game.selectBlock(dragBlockIndex);
				game.placeBlockAt(cell.row, cell.col);
			}
		} else if (!hasMoved) {
			// 드래그하지 않은 탭 → 기존 탭 선택
			game.selectBlock(dragBlockIndex);
		}

		// 드래그 상태 초기화
		isDragging = false;
		dragBlockIndex = null;
		dragBlock = null;
		dragX = 0;
		dragY = 0;
	}

	function handleAbilityPointerDown(slotIndex: number, e: PointerEvent) {
		const owned = game.inventory[slotIndex];
		if (!owned) return;
		const t = owned.ability.targetType;
		if (t === 'passive') return;
		if (owned.cooldownRemaining > 0) return;

		// instant: pointerdown에서 즉시 발동 (onclick에 의존하지 않음)
		if (t === 'instant') {
			game.useAbility(slotIndex);
			return;
		}

		// block: pointerdown에서 pending 모드만 진입 (트레이 블록 클릭으로 타겟)
		if (t === 'block') {
			game.useAbility(slotIndex);
			return;
		}

		// cell/row/col — 드래그로 보드 타겟
		abilityDragSlot = slotIndex;
		abilityDragStartX = e.clientX;
		abilityDragStartY = e.clientY;
		abilityHasMoved = false;
		isAbilityDragging = false;
		(e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId);
	}

	function updateAbilityPreview(px: number, py: number) {
		if (abilityDragSlot === null || !boardRef) {
			abilityPreviewCells = [];
			return;
		}
		const cell = boardRef.getCellFromXY(px, py);
		if (!cell) {
			abilityPreviewCells = [];
			return;
		}
		const owned = game.inventory[abilityDragSlot];
		if (!owned) {
			abilityPreviewCells = [];
			return;
		}
		abilityPreviewCells = computeAbilityPreview(
			game.grid,
			owned.ability,
			owned.level,
			cell.row,
			cell.col
		);
	}

	function getFloatingBounds(block: BlockShape) {
		let maxR = 0, maxC = 0;
		for (const [r, c] of block.cells) {
			if (r > maxR) maxR = r;
			if (c > maxC) maxC = c;
		}
		return { rows: maxR + 1, cols: maxC + 1 };
	}

	onMount(() => {
		if (!browser) return;
		const params = new URLSearchParams(window.location.search);
		const diffParam = params.get('difficulty');
		const mode: GameMode = diffParam === 'special' ? 'special' : 'classic';

		if (params.get('autostart') === 'true') {
			replaceState(window.location.pathname, {});
			user.refresh().then(() => game.startGame(mode));
		} else if (params.get('resume') === 'true') {
			replaceState(window.location.pathname, {});
			game.loadGame();
		} else if (localStorage.getItem('block_blaster_save')) {
			game.loadGame();
		} else {
			goto('/minigames/start/block-blaster', { replaceState: true });
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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="game-container"
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
>
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
					<span class="score-label">
						SCORE
						{#if game.isSpecialMode}
							{@const ds = game.currentDangerStage}
							<span class="mode-tag" class:danger={ds !== null}>
								{#if ds}
									STAGE {ds.stageNumber}/{game.maxStage} · 위험 {ds.dangers.filter((d) => !d.resolved).length}/{ds.dangers.length}
								{:else}
									STAGE {game.stagesCleared}/{game.maxStage} · 다음 위험까지 {game.linesUntilNextDanger}줄
								{/if}
							</span>
						{/if}
					</span>
					<span class="score-value">{game.score.toLocaleString()}</span>
				</div>
				<div class="header-right">
					{#if game.combo > 0}
						<div class="combo">×{game.combo}</div>
					{/if}
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
						><circle cx="12" cy="12" r="10" /><rect x="9" y="9" width="2" height="6" /><rect x="13" y="9" width="2" height="6" /></svg>
					</button>
				</div>
			</header>

			<div class="center-group">
			{#if game.isSpecialMode}
				<AbilityInventory
					inventory={game.inventory}
					pendingSlot={game.pendingAbilitySlot}
					onSlotClick={(i: number) => {
						if (abilityHasMoved) return;
						const owned = game.inventory[i];
						if (!owned) return;
						const t = owned.ability.targetType;
						if (t === 'instant' || t === 'block') return;
						game.useAbility(i);
					}}
					onSlotPointerDown={handleAbilityPointerDown}
				/>
			{/if}

			<div class="game-area">
				<Board
					bind:this={boardRef}
					grid={game.grid}
					{selectedBlock}
					{dragBlock}
					{dragX}
					{dragY}
					onCellClick={game.placeBlockAt}
					onDrop={game.placeBlockAt}
					lastPlacedCells={game.lastPlacedCells}
					clearingRows={game.clearingRows}
					clearingCols={game.clearingCols}
					isAnimating={game.isAnimating}
					abilityFx={game.abilityFx}
					abilityPreviewCells={abilityPreviewCells}
				/>
			</div>

			<BlockTray
				blocks={game.currentBlocks}
				selectedIndex={isDragging ? null : game.selectedBlockIndex}
				onSelect={(i: number) => {
					if (game.pendingAbilitySlot !== null) {
						game.applyAbilityToTarget({ kind: 'block', index: i });
					} else {
						game.selectBlock(i);
					}
				}}
				onDragStart={handleDragStart}
			/>

			{#if game.isSpecialMode && game.peekBlocks.length > 0}
				<PeekStrip blocks={game.peekBlocks} />
			{/if}
			</div>
		</div>

		{#if game.pendingDraftOptions}
			<AbilityDraftModal
				options={game.pendingDraftOptions}
				owned={game.inventory}
				stage={game.stage}
				onPick={game.pickAbility}
			/>
		{/if}

		{#if game.pendingDiscardForAbility}
			<SlotDiscardModal
				ability={game.pendingDiscardForAbility}
				inventory={game.inventory}
				onDiscard={game.discardSlotForAbility}
				onCancel={game.cancelDiscard}
			/>
		{/if}

		{#if game.pendingTransform}
			<TransformModal
				options={game.pendingTransform.options}
				onPick={game.pickTransform}
				onCancel={game.cancelTransform}
			/>
		{/if}

		{#if game.pendingSwap}
			<SwapBlockModal
				options={game.pendingSwap.options}
				onPick={game.pickSwap}
				onCancel={game.cancelSwap}
			/>
		{/if}

		{#if game.pendingDraw}
			<DrawBlockModal
				cellCount={game.pendingDraw.cellCount}
				onConfirm={game.confirmDrawnBlock}
				onCancel={game.cancelDrawnBlock}
			/>
		{/if}

		{#if game.pendingColorChoose}
			<ColorChooseModal
				availableColors={game.pendingColorChoose.availableColors}
				level={game.pendingColorChoose.level}
				onConfirm={game.confirmClearColor}
				onCancel={game.cancelClearColor}
			/>
		{/if}

		{#if game.gameState === 'paused'}
			<GamePauseModal
				stats={[
					{ label: '점수', value: game.score.toLocaleString() },
					{ label: '줄 제거', value: `${game.linesCleared}줄` },
					{ label: '시간', value: formatTime(game.displayTimer) }
				]}
				onResume={game.resumeGame}
				onQuit={() => {
					game.stopTimer();
					localStorage.removeItem('block_blaster_save');
					goto('/minigames/start/block-blaster');
				}}
				onRestart={game.restartGame}
			/>
		{/if}

		{#if game.gameState === 'finished'}
			<GameResultModal
				isWon={game.isCleared}
				title={game.isCleared ? `🏆 STAGE ${game.maxStage} 클리어!` : 'GAME OVER'}
				message={game.isCleared
					? `${game.maxStage}스테이지를 모두 클리어했습니다!`
					: undefined}
				stats={[
					{
						label: '점수',
						value: game.score.toLocaleString(),
						highlight: true
					},
					{ label: '줄 제거', value: `${game.linesCleared}줄` },
					{ label: '최대 콤보', value: `×${game.maxCombo}` },
					{ label: '시간', value: formatTime(game.timerValue) }
				]}
				newTitleName={game.newTitleName}
				showVisitPrompt={game.showVisitPrompt}
				primaryAction={{ label: '다시 도전', onclick: () => game.startGame(game.gameMode) }}
				secondaryAction={{
					label: '나가기',
					onclick: () => goto('/minigames/start/block-blaster')
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

	<!-- 드래그 중인 플로팅 블록 -->
	{#if isAbilityDragging && abilityDragSlot !== null && game.inventory[abilityDragSlot]}
		{@const owned = game.inventory[abilityDragSlot]}
		<div class="floating-ability" style="left: {dragX}px; top: {dragY}px;">
			<span class="fab-icon"><AbilityIcon id={owned.ability.id} size={28} /></span>
		</div>
	{/if}

	{#if isDragging && dragBlock}
		{@const bounds = getFloatingBounds(dragBlock)}
		<div
			class="floating-block"
			style="left: {dragX}px; top: {dragY}px;"
		>
			<div
				class="floating-grid"
				style="
					grid-template-rows: repeat({bounds.rows}, 1fr);
					grid-template-columns: repeat({bounds.cols}, 1fr);
				"
			>
				{#each Array(bounds.rows * bounds.cols) as _, idx}
					{@const r = Math.floor(idx / bounds.cols)}
					{@const c = idx % bounds.cols}
					{@const filled = dragBlock.cells.some(([cr, cc]: [number, number]) => cr === r && cc === c)}
					<div
						class="floating-cell"
						class:filled
						style={filled ? `--block-color: var(--block-color-${dragBlock.color})` : ''}
					></div>
				{/each}
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
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.mode-tag {
		text-transform: none;
		letter-spacing: 0;
		color: #f59e0b;
		font-size: 0.65rem;
		font-weight: 700;
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
		color: #8b5cf6;
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
		max-width: 400px;
		margin: 0 auto;
		flex: 1;
		transition:
			filter 0.3s,
			opacity 0.3s;
		overflow: hidden;
		touch-action: none;
	}

	.game-play-area > :global(header) {
		flex-shrink: 0;
		width: 100%;
	}

	/* 스킬+보드+트레이+NEXT 그룹: 헤더 아래 남는 공간에서 세로 중앙 정렬 */
	.center-group {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 100%;
	}

	.center-group > :global(.inventory),
	.center-group > :global(.tray),
	.center-group > :global(.peek-strip) {
		max-width: 100%;
		align-self: center;
	}

	/* 스킬창 ↔ 보드 */
	.center-group > :global(.inventory) {
		margin-bottom: 0.85rem;
	}

	.game-play-area.blurred {
		filter: blur(15px);
		opacity: 0.5;
		pointer-events: none;
	}

	.game-area {
		width: 100%;
		flex: 0 1 auto;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		/* 보드 ↔ 트레이 */
		margin-bottom: 0.85rem;
	}

	/* 트레이 ↔ NEXT 미리보기 */
	.center-group > :global(.peek-strip) {
		margin-top: 0.85rem;
	}

	.floating-ability {
		position: fixed;
		pointer-events: none;
		z-index: 200;
		transform: translate(-50%, -50%);
		width: 56px;
		height: 56px;
		border-radius: 14px;
		background: linear-gradient(135deg, rgba(245, 158, 11, 0.95), rgba(239, 68, 68, 0.95));
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 8px 24px rgba(245, 158, 11, 0.5), 0 0 16px rgba(251, 191, 36, 0.6);
		animation: fabPulse 1s ease-in-out infinite;
	}

	.fab-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4));
	}

	@keyframes fabPulse {
		0%, 100% { transform: translate(-50%, -50%) scale(1); }
		50% { transform: translate(-50%, -50%) scale(1.08); }
	}

	/* 플로팅 블록 (드래그 중) */
	.floating-block {
		position: fixed;
		pointer-events: none;
		z-index: 200;
		opacity: 0.75;
		transform: translate(-50%, -50%);
	}

	.floating-grid {
		display: grid;
		gap: 3px;
	}

	.floating-cell {
		width: 28px;
		height: 28px;
		border-radius: 4px;
		background: transparent;
	}

	.floating-cell.filled {
		background: var(--block-color);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
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
