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

	// Dynamic card overlap: ensure all cards fit within viewport (~380px usable)
	// Card width is 44px, we want total width <= ~380px
	// totalWidth = 44 + (n-1) * (44 - overlap) <= 380
	// overlap >= 44 - (380 - 44) / (n-1) = 44 - 336/(n-1)
	const cardOverlap = $derived.by(() => {
		const n = hand.length;
		if (n <= 1) return 0;
		const maxWidth = Math.min(window.innerWidth - 24, 400);
		const cardW = 44;
		const needed = cardW - (maxWidth - cardW) / (n - 1);
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

<div class="hand-area">
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

	<div class="hand-cards" style="--card-overlap: -{cardOverlap}px">
		{#each hand as card (card.id)}
			<CardComponent
				{card}
				selected={game.selectedCards.has(card.id) || isCardUsedInExchange(card.id) || exchangePendingCard === card.id}
				onclick={() => handleCardClick(card)}
			/>
		{/each}
	</div>

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
	.hand-area {
		padding: 8px 12px;
		padding-bottom: calc(8px + env(safe-area-inset-bottom));
		background: rgba(0,0,0,0.3);
		border-top: 1px solid rgba(255,255,255,0.1);
	}

	.hand-cards {
		display: flex;
		justify-content: center;
		padding: 4px 0;
	}

	/* Overlap cards dynamically based on hand size */
	.hand-cards :global(.card) {
		margin-left: var(--card-overlap, 0px);
	}
	.hand-cards :global(.card:first-child) {
		margin-left: 0;
	}

	.play-controls {
		display: flex;
		justify-content: center;
		gap: 8px;
		margin-top: 8px;
	}
	.btn-play {
		padding: 8px 24px;
		border-radius: 8px;
		border: none;
		background: #f59e0b;
		color: #000;
		font-weight: 600;
		font-size: 0.9rem;
		cursor: pointer;
	}
	.btn-play:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.btn-pass {
		padding: 8px 20px;
		border-radius: 8px;
		border: 1px solid rgba(255,255,255,0.3);
		background: rgba(255,255,255,0.1);
		color: white;
		font-size: 0.9rem;
		cursor: pointer;
	}
	.btn-pass:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.btn-bomb {
		padding: 8px 20px;
		border-radius: 8px;
		border: 2px solid #ef4444;
		background: rgba(239,68,68,0.3);
		color: #fca5a5;
		font-weight: 700;
		font-size: 0.9rem;
		cursor: pointer;
		animation: bombPulse 1s infinite;
	}
	.btn-bomb:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		animation: none;
	}
	@keyframes bombPulse {
		0%, 100% { box-shadow: 0 0 4px rgba(239,68,68,0.3); }
		50% { box-shadow: 0 0 12px rgba(239,68,68,0.6); }
	}
	.btn-clear {
		padding: 8px 16px;
		border-radius: 8px;
		border: none;
		background: rgba(239,68,68,0.3);
		color: white;
		font-size: 0.85rem;
		cursor: pointer;
	}

	/* Exchange */
	.exchange-controls {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		margin-bottom: 4px;
	}
	.exchange-slots {
		display: flex;
		gap: 12px;
		justify-content: center;
	}
	.exchange-slot {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 6px 10px;
		border-radius: 8px;
		border: 1px solid rgba(255,255,255,0.15);
		background: rgba(255,255,255,0.03);
		color: white;
		cursor: pointer;
		min-width: 54px;
	}
	.exchange-slot.target {
		border-color: #f59e0b;
		background: rgba(245,158,11,0.1);
		animation: slotPulse 1.2s infinite;
	}
	.exchange-slot.assigned {
		border-color: rgba(34,197,94,0.5);
		background: rgba(34,197,94,0.1);
	}
	@keyframes slotPulse {
		0%, 100% { box-shadow: 0 0 0 rgba(245,158,11,0); }
		50% { box-shadow: 0 0 8px rgba(245,158,11,0.3); }
	}
	.slot-label {
		font-size: 0.65rem;
		opacity: 0.6;
		font-weight: 500;
	}
	.slot-empty {
		width: 32px;
		height: 44px;
		border-radius: 4px;
		border: 1px dashed rgba(255,255,255,0.2);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.8rem;
		opacity: 0.3;
	}
	.exchange-hint {
		font-size: 0.7rem;
		opacity: 0.5;
	}
	.btn-exchange-submit {
		padding: 8px 24px;
		border-radius: 8px;
		border: none;
		background: #22c55e;
		color: white;
		font-weight: 600;
		font-size: 0.85rem;
		cursor: pointer;
	}
</style>
