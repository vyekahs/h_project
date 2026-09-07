<script lang="ts">
	import type { FreecellState, Location, Card as CardType } from '$lib/games/freecell/types';
	import { SUITS, SUIT_SYMBOL, SUIT_COLOR, locationsEqual } from '$lib/games/freecell/types';
	import { getMovableSequenceLength } from '$lib/games/freecell/gameLogic';
	import Card from './Card.svelte';

	import type { MoveAction } from '$lib/games/freecell/types';

	let {
		state: boardState,
		selectedLocation = null,
		validTargets = [],
		isDragging = false,
		dragCards = [],
		dragX = 0,
		dragY = 0,
		onCardClick,
		onCardDoubleClick,
		onSlotClick,
		onDragStart,
		onDragMove,
		onDrop,
		onCancelDrag,
		isValidTarget,
		registerFlyCallback
	}: {
		state: FreecellState;
		selectedLocation: Location | null;
		validTargets: Location[];
		isDragging: boolean;
		dragCards: CardType[];
		dragX: number;
		dragY: number;
		onCardClick: (loc: Location) => void;
		onCardDoubleClick: (loc: Location) => void;
		onSlotClick: (loc: Location) => void;
		onDragStart: (loc: Location, cards: CardType[], x: number, y: number) => void;
		onDragMove: (x: number, y: number) => void;
		onDrop: (loc: Location) => void;
		onCancelDrag: () => void;
		isValidTarget: (loc: Location) => boolean;
		registerFlyCallback?: (cb: (move: MoveAction) => Promise<void>) => void;
	} = $props();

	// ─── 열 쌓기 간격 ───
	// 카드 간격이 고정이면 열이 길어질 때 아래쪽 카드가 화면 밖으로 밀려
	// .game-play-area의 overflow:hidden에 잘려 보이지 않는다.
	// 남은 높이에 맞춰 열마다 간격을 좁히되, 랭크 글자는 계속 보이도록 하한을 둔다.

	let tableauEl: HTMLElement | undefined = $state();
	let availH = $state(0);
	let cardH = $state(0);
	let viewportW = $state(0);

	// 지금까지의 실효 간격과 같은 값 — 열이 짧을 때는 그대로 유지한다
	// (기존 CSS는 margin-top과 top이 겹쳐 clamp(18px,4.5vw,26px)의 2배로 그려지고 있었다)
	const defaultStep = $derived(Math.min(52, Math.max(36, viewportW * 0.09)));
	// 랭크 글자 clamp(10px, 2.8vw, 16px)가 가려지지 않을 만큼은 남긴다
	const minStep = $derived(Math.min(16, Math.max(10, viewportW * 0.028)) + 3);

	// 드래그 중인 카드 뭉치도 원래 열과 같은 간격으로 보여야 자연스럽다
	let dragStep = $state(36);

	function stackStep(len: number): number {
		if (len <= 1 || !availH || !cardH) return defaultStep;
		const fit = (availH - cardH) / (len - 1);
		return Math.max(minStep, Math.min(defaultStep, fit));
	}

	function measure() {
		if (!tableauEl || !boardEl) return;
		viewportW = window.innerWidth;

		const col = tableauEl.querySelector('.tableau-column');
		if (col) cardH = col.getBoundingClientRect().width * 7 / 5;

		// 카드를 잘라내는 조상(overflow hidden)의 아래쪽까지가 실제로 쓸 수 있는 높이
		let clipper: HTMLElement | null = boardEl.parentElement;
		while (clipper && getComputedStyle(clipper).overflow === 'visible') {
			clipper = clipper.parentElement;
		}
		const bottom = (clipper ?? boardEl).getBoundingClientRect().bottom;
		availH = Math.max(0, bottom - tableauEl.getBoundingClientRect().top - 4);
	}

	$effect(() => {
		measure();
		const ro = new ResizeObserver(measure);
		if (boardEl) ro.observe(boardEl);
		window.addEventListener('resize', measure);
		return () => {
			ro.disconnect();
			window.removeEventListener('resize', measure);
		};
	});

	// ─── Drag handling ───

	let longPressTimer: any = null;
	let pendingDragLoc: Location | null = null;
	let pendingDragCards: CardType[] = [];
	const LONG_PRESS_MS = 250;

	function handlePointerDown(e: PointerEvent, loc: Location, cards: CardType[]) {
		if (e.button !== 0) return;
		pendingDragLoc = loc;
		pendingDragCards = cards;

		// On touch devices, require long press to start drag
		const isTouchDevice = e.pointerType === 'touch';
		if (isTouchDevice) {
			longPressTimer = setTimeout(() => {
				onDragStart(loc, cards, e.clientX, e.clientY);
				longPressTimer = null;
			}, LONG_PRESS_MS);
		}
	}

	function handlePointerMove(e: PointerEvent) {
		if (isDragging) {
			e.preventDefault();
			onDragMove(e.clientX, e.clientY);
		} else if (pendingDragLoc && e.pointerType !== 'touch') {
			// Mouse: start drag immediately on move
			const dx = Math.abs(e.clientX - dragX);
			const dy = Math.abs(e.clientY - dragY);
			if (dx > 3 || dy > 3) {
				if (longPressTimer) {
					clearTimeout(longPressTimer);
					longPressTimer = null;
				}
				onDragStart(pendingDragLoc, pendingDragCards, e.clientX, e.clientY);
			}
		}
	}

	function handlePointerUp(e: PointerEvent) {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}

		if (isDragging) {
			// Find drop target from pointer position
			const target = findDropTarget(e.clientX, e.clientY);
			if (target) {
				onDrop(target);
			} else {
				onCancelDrag();
			}
		}

		pendingDragLoc = null;
		pendingDragCards = [];
	}

	// ─── Drop target detection ───

	let boardEl: HTMLElement;

	function findDropTarget(x: number, y: number): Location | null {
		if (!boardEl) return null;
		const el = document.elementFromPoint(x, y);
		if (!el) return null;

		// Walk up to find a drop zone
		let current: Element | null = el;
		while (current && current !== boardEl) {
			const zone = current.getAttribute('data-drop-zone');
			if (zone) {
				const loc = JSON.parse(zone) as Location;
				if (isValidTarget(loc)) return loc;
			}
			current = current.parentElement;
		}
		return null;
	}

	// ─── Card selection helpers ───

	function isCardSelected(loc: Location): boolean {
		if (!selectedLocation) return false;

		if (selectedLocation.type === 'freecell' && loc.type === 'freecell') {
			return selectedLocation.index === loc.index;
		}
		if (selectedLocation.type === 'tableau' && loc.type === 'tableau') {
			return selectedLocation.col === loc.col && loc.cardIndex >= selectedLocation.cardIndex;
		}
		return false;
	}

	function isCardInDrag(card: CardType): boolean {
		return isDragging && dragCards.some((c: CardType) => c.id === card.id);
	}

	function isSlotHighlighted(loc: Location): boolean {
		return validTargets.some((t: Location) => locationsEqual(t, loc));
	}

	function getTableauCardLoc(col: number, idx: number): Location {
		return { type: 'tableau', col, cardIndex: idx };
	}

	function getFreeCellLoc(idx: number): Location {
		return { type: 'freecell', index: idx };
	}

	function getFoundationLoc(idx: number): Location {
		return { type: 'foundation', index: idx };
	}

	function getMovableCards(col: number, cardIndex: number): CardType[] {
		return boardState.tableau[col].slice(cardIndex);
	}

	// ─── Flying card animation ───

	import { onMount } from 'svelte';

	function getLocationSelector(loc: Location): string {
		if (loc.type === 'freecell') return `[data-loc="fc-${loc.index}"]`;
		if (loc.type === 'foundation') return `[data-loc="fn-${loc.index}"]`;
		if (loc.type === 'tableau') return `[data-loc="tab-${loc.col}"]`;
		return '';
	}

	function getSourceRect(move: MoveAction): DOMRect | null {
		if (!boardEl) return null;
		const sel = getLocationSelector(move.from);
		const el = boardEl.querySelector(sel);
		if (!el) return null;
		// For tableau, find the specific card
		if (move.from.type === 'tableau') {
			const cards = el.querySelectorAll('.tableau-card');
			const cardEl = cards[move.from.cardIndex];
			return cardEl ? cardEl.getBoundingClientRect() : el.getBoundingClientRect();
		}
		return el.getBoundingClientRect();
	}

	function getTargetRect(move: MoveAction): DOMRect | null {
		if (!boardEl) return null;
		const sel = getLocationSelector(move.to);
		const el = boardEl.querySelector(sel);
		return el ? el.getBoundingClientRect() : null;
	}

	async function flyCard(move: MoveAction): Promise<void> {
		const fromRect = getSourceRect(move);
		const toSel = getLocationSelector(move.to);
		const toEl = boardEl?.querySelector(toSel);
		const toRect = toEl?.getBoundingClientRect();

		if (!fromRect || !toRect || !boardEl) {
			// Fallback: just wait a bit
			await new Promise((r) => setTimeout(r, 60));
			return;
		}

		const card = move.cards[0];
		const sym = SUIT_SYMBOL[card.suit];
		const col = SUIT_COLOR[card.suit];
		const textColor = col === 'red' ? '#dc2626' : '#1a1a1a';

		// Create flying element
		const el = document.createElement('div');
		el.className = 'flying-card';
		el.innerHTML = `<span style="color:${textColor};font-weight:800;font-size:clamp(10px,2.8vw,16px);line-height:1">${card.rank}</span><span style="color:${textColor};font-size:clamp(8px,2.2vw,13px);line-height:1">${sym}</span>`;
		el.style.cssText = `
			position: fixed;
			left: ${fromRect.left}px;
			top: ${fromRect.top}px;
			width: ${fromRect.width}px;
			height: ${fromRect.height}px;
			background: linear-gradient(180deg, #ffffff 0%, #f8f8fa 100%);
			border: 1px solid #c8ccd0;
			border-radius: clamp(4px, 1vw, 8px);
			box-shadow: 0 4px 16px rgba(0,0,0,0.15);
			z-index: 200;
			pointer-events: none;
			display: flex;
			flex-direction: column;
			align-items: flex-start;
			padding: clamp(1px,0.5vw,3px) clamp(2px,0.6vw,4px);
		`;
		document.body.appendChild(el);

		const dx = toRect.left - fromRect.left;
		const dy = toRect.top - fromRect.top;

		const anim = el.animate([
			{ transform: 'translate(0, 0) scale(1)', opacity: 1 },
			{ transform: `translate(${dx}px, ${dy}px) scale(0.9)`, opacity: 0.9 }
		], {
			duration: 200,
			easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)',
			fill: 'forwards'
		});

		return new Promise((resolve) => {
			anim.onfinish = () => {
				el.remove();
				resolve();
			};
		});
	}

	onMount(() => {
		if (registerFlyCallback) {
			registerFlyCallback(flyCard);
		}
	});
</script>

<div
	class="board"
	bind:this={boardEl}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onpointercancel={() => { if (isDragging) onCancelDrag(); }}
	role="application"
	aria-label="Freecell game board"
>
	<!-- Top Area: Free Cells + Foundations -->
	<div class="top-area">
		<div class="free-cells">
			{#each boardState.freeCells as cell, i}
				{@const loc = getFreeCellLoc(i)}
				{@const highlighted = isSlotHighlighted(loc)}
				<div
					class="slot free-cell"
					class:highlighted
					class:occupied={cell !== null}
					data-drop-zone={JSON.stringify(loc)}
					data-loc={`fc-${i}`}
					onclick={() => cell ? onCardClick(loc) : onSlotClick(loc)}
					onkeydown={(e) => { if (e.key === 'Enter') { cell ? onCardClick(loc) : onSlotClick(loc); } }}
					role="button"
					tabindex="-1"
				>
					{#if cell}
						{@const selected = isCardSelected(loc)}
						{@const inDrag = isCardInDrag(cell)}
						<div
							class="slot-card"
							class:hidden={inDrag}
							onpointerdown={(e) => handlePointerDown(e, loc, [cell])}
							role="button"
							tabindex="-1"
						>
							<Card
								card={cell}
								{selected}
								onclick={() => onCardClick(loc)}
								ondblclick={() => onCardDoubleClick(loc)}
							/>
						</div>
					{:else}
						<span class="slot-label">FC</span>
					{/if}
				</div>
			{/each}
		</div>

		<div class="foundations">
			{#each boardState.foundations as pile, i}
				{@const loc = getFoundationLoc(i)}
				{@const highlighted = isSlotHighlighted(loc)}
				{@const topCard = pile.length > 0 ? pile[pile.length - 1] : null}
				<div
					class="slot foundation"
					class:highlighted
					class:occupied={topCard !== null}
					data-drop-zone={JSON.stringify(loc)}
					data-loc={`fn-${i}`}
					onclick={() => onSlotClick(loc)}
					onkeydown={(e) => { if (e.key === 'Enter') onSlotClick(loc); }}
					role="button"
					tabindex="-1"
				>
					{#if topCard}
						<Card card={topCard} />
					{:else}
						<span class="slot-label suit-label">{SUIT_SYMBOL[SUITS[i]]}</span>
					{/if}
				</div>
			{/each}
		</div>
	</div>

	<!-- Tableau -->
	<div class="tableau" bind:this={tableauEl}>
		{#each boardState.tableau as column, col}
			{@const colLoc = { type: 'tableau' as const, col, cardIndex: 0 }}
			{@const highlighted = column.length === 0 && isSlotHighlighted(colLoc)}
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<div
				class="tableau-column"
				class:highlighted
				style="--stack-step: {stackStep(column.length)}px"
				data-drop-zone={JSON.stringify(colLoc)}
				data-loc={`tab-${col}`}
				onclick={() => { if (column.length === 0) onSlotClick(colLoc); }}
				onkeydown={(e) => { if (e.key === 'Enter' && column.length === 0) onSlotClick(colLoc); }}
				role="list"
			>
				{#if column.length === 0}
					<div class="empty-column"></div>
				{:else}
					{#each column as card, idx (card.id)}
						{@const cardLoc = getTableauCardLoc(col, idx)}
						{@const selected = isCardSelected(cardLoc)}
						{@const inDrag = isCardInDrag(card)}
						{@const seqLen = getMovableSequenceLength(column)}
						{@const isInSequence = idx >= column.length - seqLen}
						{@const isBottom = idx === column.length - 1}
						<div
							class="tableau-card"
							class:hidden={inDrag}
							style="--card-offset: {idx}"
							data-drop-zone={isBottom ? JSON.stringify({ type: 'tableau', col, cardIndex: 0 }) : ''}
							onpointerdown={(e) => {
								if (isInSequence) {
									dragStep = stackStep(column.length);
									handlePointerDown(e, cardLoc, getMovableCards(col, idx));
								}
							}}
							role="button"
							tabindex="-1"
						>
							<Card
								{card}
								{selected}
								dimmed={!isInSequence}
								compact={idx < column.length - 1}
								onclick={() => onCardClick(cardLoc)}
								ondblclick={() => { if (isBottom) onCardDoubleClick(cardLoc); }}
							/>
						</div>
					{/each}
				{/if}
			</div>
		{/each}
	</div>

	<!-- Floating drag cards -->
	{#if isDragging && dragCards.length > 0}
		<div
			class="drag-ghost"
			style="left: {dragX}px; top: {dragY}px;"
		>
			{#each dragCards as card, i (card.id)}
				<div class="drag-card" style="top: calc({i} * {dragStep}px)">
					<Card {card} />
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.board {
		width: 100%;
		max-width: 500px;
		margin: 0 auto;
		padding: 4px;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
	}

	/* ─── Top Area ─── */

	.top-area {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 8px;
	}

	.free-cells,
	.foundations {
		display: flex;
		gap: clamp(2px, 0.8vw, 4px);
	}

	.slot {
		width: clamp(36px, 10.5vw, 56px);
		aspect-ratio: 5 / 7;
		border: 2px dashed var(--border-default);
		border-radius: clamp(4px, 1vw, 8px);
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s;
	}

	.slot.occupied {
		border-color: transparent;
	}

	.slot.highlighted {
		border-color: var(--color-green);
		background: var(--color-success-bg);
	}

	.slot-label {
		font-size: clamp(10px, 2.5vw, 16px);
		color: var(--text-tertiary);
		font-weight: 600;
	}

	.suit-label {
		font-size: clamp(14px, 3.5vw, 22px);
		opacity: 0.4;
	}

	.slot-card {
		position: absolute;
		inset: 0;
	}

	.slot-card.hidden {
		visibility: hidden;
	}

	.slot-card :global(.card) {
		border-radius: clamp(4px, 1vw, 8px);
	}

	/* ─── Tableau ─── */

	.tableau {
		display: grid;
		grid-template-columns: repeat(8, 1fr);
		gap: clamp(2px, 0.8vw, 4px);
		min-height: 300px;
	}

	.tableau-column {
		position: relative;
		min-height: clamp(50px, 14vw, 80px);
		border-radius: clamp(4px, 1vw, 8px);
		transition: background 0.15s;
	}

	.tableau-column.highlighted {
		background: var(--color-success-bg);
		border: 1px dashed var(--color-green);
	}

	.empty-column {
		width: 100%;
		aspect-ratio: 5 / 7;
		border: 2px dashed var(--border-light);
		border-radius: clamp(4px, 1vw, 8px);
		opacity: 0.5;
	}

	.tableau-card {
		position: absolute;
		width: 100%;
		left: 0;
		right: 0;
		/* 간격은 열 길이에 따라 스크립트가 --stack-step으로 정한다 */
		top: calc(var(--card-offset) * var(--stack-step, 36px));
		transition: transform 0.15s ease;
	}

	.tableau-card.hidden {
		visibility: hidden;
	}

	/* ─── Drag Ghost ─── */

	.drag-ghost {
		position: fixed;
		pointer-events: none;
		z-index: 100;
		transform: translate(-50%, -30px);
		width: clamp(36px, 10.5vw, 56px);
	}

	.drag-card {
		position: absolute;
		left: 0;
		right: 0;
		filter: drop-shadow(0 4px 12px var(--shadow-lg));
	}
</style>
