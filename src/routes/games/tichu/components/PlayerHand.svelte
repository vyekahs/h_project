<script lang="ts">
	import type { Card } from '$lib/games/tichu/types';
	import CardComponent from './CardComponent.svelte';
	import { detectCombination, isBomb } from '$lib/games/tichu/combinations';

	let { game } = $props<{ game: any }>();

	const hand = $derived(game.sortedHand);
	const isExchangePhase = $derived(game.phase === 'exchange');
	const isPlaying = $derived(game.phase === 'playing');
	const busy = $derived(game.actionInProgress);

	// Detect if selected cards form a bomb (for out-of-turn bomb play)
	const selectedIsBomb = $derived.by(() => {
		if (game.selectedCards.size < 4) return false;
		const selectedCardObjs = hand.filter((c: Card) => game.selectedCards.has(c.id));
		const combo = detectCombination(selectedCardObjs);
		return combo !== null && isBomb(combo);
	});

	// 9장 이상이면 2줄 배치
	const useDoubleRow = $derived(hand.length > 8);
	const topRow = $derived(useDoubleRow ? hand.slice(0, Math.ceil(hand.length / 2)) : []);
	const bottomRow = $derived(useDoubleRow ? hand.slice(Math.ceil(hand.length / 2)) : hand);

	// Dynamic card overlap based on per-row card count
	const cardOverlap = $derived.by(() => {
		const perRow = useDoubleRow ? Math.ceil(hand.length / 2) : hand.length;
		if (perRow <= 1) return 0;
		const maxWidth = Math.min(window.innerWidth - 32, 400);
		const cardW = 46;
		const needed = cardW - (maxWidth - cardW) / (perRow - 1);
		return Math.max(needed, 0);
	});

	function handleCardClick(card: Card) {
		if (isExchangePhase) {
			handleExchangeCardClick(card.id);
		} else {
			game.toggleCard(card.id);
		}
	}

	// Exchange mode: select card first, then assign to target
	let exchangePendingCard = $state<string | null>(null);

	// Reset pending card when exchange phase starts
	$effect(() => {
		if (isExchangePhase) {
			exchangePendingCard = null;
		}
	});

	function handleExchangeCardClick(cardId: string) {
		// If card is already assigned to a target, unassign it
		if (cardId === game.exchangePartner) { game.setExchangeCard('partner', null); return; }
		if (cardId === game.exchangeLeft) { game.setExchangeCard('left', null); return; }
		if (cardId === game.exchangeRight) { game.setExchangeCard('right', null); return; }
		// If same card tapped again, deselect
		if (exchangePendingCard === cardId) { exchangePendingCard = null; return; }
		// Select this card as pending
		exchangePendingCard = cardId;
	}

	function assignExchangeTarget(target: 'partner' | 'left' | 'right') {
		if (!exchangePendingCard) return;
		game.setExchangeCard(target, exchangePendingCard);
		exchangePendingCard = null;
	}

	function exchangeLabel(cardId: string | null): string {
		if (cardId === game.exchangePartner) return '파트너';
		if (cardId === game.exchangeLeft) return '왼쪽';
		if (cardId === game.exchangeRight) return '오른쪽';
		return '';
	}

	function isCardUsedInExchange(cardId: string): boolean {
		return cardId === game.exchangePartner ||
			cardId === game.exchangeLeft ||
			cardId === game.exchangeRight;
	}

	function playBomb() {
		if (!selectedIsBomb) return;
		game.playBomb(Array.from(game.selectedCards));
	}

	// Find card object by ID for exchange preview
	function findCard(cardId: string | null): Card | null {
		if (!cardId) return null;
		return hand.find((c: Card) => c.id === cardId) ?? null;
	}

	type ExchangeTarget = 'left' | 'partner' | 'right';
	// Screen: left=seat3, top=seat2(partner), right=seat1
	// Game logic: 'left'→seat1(screen right), 'right'→seat3(screen left)
	// Slot order matches screen positions: seat3(left) → seat2(top) → seat1(right)
	const exchangeSlots = $derived.by(() => {
		void game.stateVersion;
		const players = game.gameState?.players;
		return [
			{ key: 'right' as ExchangeTarget, label: players?.[3]?.name ?? '왼쪽' },
			{ key: 'partner' as ExchangeTarget, label: players?.[2]?.name ?? '파트너' },
			{ key: 'left' as ExchangeTarget, label: players?.[1]?.name ?? '오른쪽' }
		];
	});
	function getExchangeCardId(key: ExchangeTarget): string | null {
		if (key === 'left') return game.exchangeLeft;
		if (key === 'partner') return game.exchangePartner;
		return game.exchangeRight;
	}
</script>

<div class="hand-area" class:is-my-turn={game.isMyTurn}>
	{#if isExchangePhase}
		<div class="exchange-controls">
			<div class="exchange-slots">
				{#each exchangeSlots as slot (slot.key)}
					{@const cardId = getExchangeCardId(slot.key)}
					{@const card = findCard(cardId)}
					<button
						class="exchange-slot"
						class:assigned={card !== null}
						class:target={exchangePendingCard !== null && card === null}
						onclick={() => {
							if (card) {
								game.setExchangeCard(slot.key, null);
							} else if (exchangePendingCard) {
								assignExchangeTarget(slot.key);
							}
						}}
					>
						<span class="slot-label">{slot.label}</span>
						{#if card}
							<CardComponent {card} small />
						{:else}
							<div class="slot-empty">?</div>
						{/if}
					</button>
				{/each}
			</div>
			{#if !exchangePendingCard && !game.exchangeReady}
				<span class="exchange-hint">카드를 선택하세요</span>
			{:else if exchangePendingCard}
				<span class="exchange-hint">대상을 선택하세요</span>
			{/if}
			{#if game.exchangeReady}
				<button
					class="btn-exchange-submit"
					onclick={() => game.submitExchange()}
				>
					교환 확인
				</button>
			{/if}
		</div>
	{/if}

	{#if useDoubleRow}
		<div class="hand-cards" style="--card-overlap: -{cardOverlap}px">
			{#each topRow as card (card.id)}
				<CardComponent
					{card}
					selected={game.selectedCards.has(card.id) || isCardUsedInExchange(card.id) || exchangePendingCard === card.id}
					onclick={() => handleCardClick(card)}
				/>
			{/each}
		</div>
		<div class="hand-cards" style="--card-overlap: -{cardOverlap}px">
			{#each bottomRow as card (card.id)}
				<CardComponent
					{card}
					selected={game.selectedCards.has(card.id) || isCardUsedInExchange(card.id) || exchangePendingCard === card.id}
					onclick={() => handleCardClick(card)}
				/>
			{/each}
		</div>
	{:else}
		<div class="hand-cards" style="--card-overlap: -{cardOverlap}px">
			{#each hand as card (card.id)}
				<CardComponent
					{card}
					selected={game.selectedCards.has(card.id) || isCardUsedInExchange(card.id) || exchangePendingCard === card.id}
					onclick={() => handleCardClick(card)}
				/>
			{/each}
		</div>
	{/if}

	{#if !isExchangePhase && isPlaying}
		<div class="play-controls">
			<button
				class="btn-play"
				disabled={game.selectedCards.size === 0 || !game.isMyTurn || busy}
				onclick={() => game.playSelectedCards()}
			>
				내기 ({game.selectedCards.size})
			</button>
			<button
				class="btn-pass"
				disabled={!game.isMyTurn || busy}
				onclick={() => game.pass()}
			>
				패스
			</button>
			{#if selectedIsBomb}
				<button class="btn-bomb" disabled={busy} onclick={playBomb}>
					폭탄!
				</button>
			{/if}
			{#if game.selectedCards.size > 0}
				<button class="btn-clear" onclick={() => game.clearSelection()}>
					취소
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* Fonts */
	@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

	.hand-area {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 16px;
		padding-bottom: calc(8px + env(safe-area-inset-bottom));
		background: rgba(0, 0, 0, 0.45);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border-top: 1px solid rgba(251, 191, 36, 0.3);
		box-shadow: 0 -4px 20px rgba(0,0,0,0.4);
		font-family: 'Inter', sans-serif;
		transition: all 0.3s ease;
	}
	.hand-area.is-my-turn {
		background: rgba(40, 25, 0, 0.6);
		border-top: 1px solid rgba(251, 191, 36, 0.8);
		box-shadow: 0 -10px 30px rgba(251, 191, 36, 0.15), inset 0 20px 30px rgba(251, 191, 36, 0.05);
	}

	.hand-cards {
		display: flex;
		justify-content: center;
		padding: 4px 0;
		align-items: flex-end;
	}

	/* Overlap cards dynamically based on hand size */
	.hand-cards :global(.card) {
		margin-left: var(--card-overlap, 0px);
		transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), margin-left 0.2s;
	}
	.hand-cards :global(.card:first-child) {
		margin-left: 0;
	}
	@media (hover: hover) {
		.hand-cards :global(.card:hover) {
			transform: translateY(-20px) scale(1.1) rotate(2deg);
			z-index: 10;
		}
		/* Add extra space for the hovered card so neighbors aren't obscured */
		.hand-cards :global(.card:hover + .card) {
			margin-left: calc(var(--card-overlap, 0px) + 20px);
		}
	}
	/* Give breathing room after selected cards */
	.hand-cards :global(.card.selected + .card) {
		margin-left: calc(var(--card-overlap, 0px) + 6px);
	}

	.play-controls {
		display: flex;
		justify-content: center;
		gap: 12px;
		margin-top: 12px;
	}
	.btn-play {
		padding: 10px 32px;
		border-radius: 14px;
		border: 1px solid rgba(255,255,255,0.2);
		background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); /* Imperial Gold */
		color: #fff;
		font-weight: 700;
		font-size: 1rem;
		cursor: pointer;
		box-shadow: 0 4px 15px rgba(245,158,11,0.4);
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		text-shadow: 0 1px 1px rgba(0,0,0,0.2);
	}
	.btn-play:hover:not(:disabled) {
		transform: translateY(-2px) scale(1.02);
		box-shadow: 0 8px 25px rgba(245,158,11,0.6);
	}
	.btn-play:active:not(:disabled) {
		transform: translateY(1px);
	}
	.btn-play:disabled {
		background: rgba(107, 114, 128, 0.5);
		box-shadow: none;
		border-color: transparent;
		opacity: 0.6;
		cursor: not-allowed;
		color: #d1d5db;
	}

	.btn-pass {
		padding: 10px 24px;
		border-radius: 14px;
		border: 1px solid rgba(255,255,255,0.15);
		background: rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		color: #e5e7eb;
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}
	.btn-pass:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.2);
		transform: translateY(-2px);
		border-color: rgba(255,255,255,0.3);
	}
	.btn-pass:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.btn-bomb {
		padding: 10px 24px;
		border-radius: 14px;
		border: 1px solid rgba(239,68,68,0.5);
		background: linear-gradient(135deg, rgba(220, 38, 38, 0.2), rgba(185, 28, 28, 0.3));
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		color: #fca5a5;
		font-weight: 700;
		font-size: 0.95rem;
		cursor: pointer;
		animation: bombPulse 1.5s infinite;
		box-shadow: 0 0 10px rgba(220, 38, 38, 0.2);
		transition: all 0.2s;
	}
	.btn-bomb:hover:not(:disabled) {
		background: linear-gradient(135deg, rgba(220, 38, 38, 0.4), rgba(185, 28, 28, 0.5));
		transform: scale(1.05);
	}
	.btn-bomb:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		animation: none;
	}
	@keyframes bombPulse {
		0%, 100% { box-shadow: 0 0 5px rgba(239,68,68,0.3); border-color: rgba(239,68,68,0.5); }
		50% { box-shadow: 0 0 20px rgba(239,68,68,0.6); border-color: rgba(239,68,68,0.8); }
	}

	.btn-clear {
		padding: 10px 20px;
		border-radius: 14px;
		border: 1px solid rgba(255,255,255,0.1);
		background: rgba(0, 0, 0, 0.3);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		color: #9ca3af;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}
	.btn-clear:hover {
		background: rgba(255,255,255,0.1);
		color: #e5e7eb;
	}

	/* Exchange */
	.exchange-controls {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		margin-bottom: 12px;
		width: 100%;
	}
	.exchange-slots {
		display: flex;
		gap: 16px;
		justify-content: center;
		width: 100%;
		max-width: 400px;
	}
	.exchange-slot {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 10px 8px;
		border-radius: 16px;
		border: 1px solid rgba(255,255,255,0.15);
		background: rgba(255, 255, 255, 0.05);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		color: #e5e7eb;
		cursor: pointer;
		transition: all 0.2s;
	}
	.exchange-slot:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255,255,255,0.3);
	}
	.exchange-slot.target {
		border-color: #fbbf24;
		background: rgba(251, 191, 36, 0.15);
		box-shadow: 0 0 15px rgba(251, 191, 36, 0.2);
		animation: slotPulse 1.5s infinite;
	}
	.exchange-slot.assigned {
		border-color: rgba(16, 185, 129, 0.5);
		background: rgba(16, 185, 129, 0.15);
		box-shadow: 0 0 10px rgba(16, 185, 129, 0.2);
	}
	/* Allow clicks to pass through card preview to the exchange slot button */
	.exchange-slot :global(.card) {
		pointer-events: none;
	}
	@keyframes slotPulse {
		0%, 100% { box-shadow: 0 0 5px rgba(251, 191, 36, 0.2); }
		50% { box-shadow: 0 0 20px rgba(251, 191, 36, 0.4); transform: scale(1.02); }
	}
	.slot-label {
		font-size: 0.75rem;
		color: #d1d5db;
		font-weight: 600;
		letter-spacing: 0.05em;
	}
	.slot-empty {
		width: 36px;
		height: 48px;
		border-radius: 6px;
		border: 2px dashed rgba(255,255,255,0.2);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.9rem;
		color: #6b7280;
		transition: all 0.2s;
	}
	.exchange-slot:hover .slot-empty {
		border-color: rgba(255,255,255,0.4);
		color: #9ca3af;
	}
	.exchange-hint {
		font-size: 0.8rem;
		color: #fbbf24;
		font-weight: 600;
		text-shadow: 0 1px 2px rgba(0,0,0,0.5);
		background: rgba(0,0,0,0.3);
		padding: 4px 12px;
		border-radius: 10px;
	}
	.btn-exchange-submit {
		padding: 10px 32px;
		border-radius: 14px;
		border: none;
		background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
		color: #fff;
		font-weight: 700;
		font-size: 0.95rem;
		cursor: pointer;
		box-shadow: 0 4px 15px rgba(245,158,11,0.3);
		transition: all 0.2s;
	}
	.btn-exchange-submit:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 20px rgba(245,158,11,0.5);
	}
</style>
