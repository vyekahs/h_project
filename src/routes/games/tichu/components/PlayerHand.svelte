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
</script>

<div class="hand-area">
	{#if isExchangePhase}
		<div class="exchange-controls">
			{#if exchangePendingCard}
				<span class="exchange-hint">누구에게?</span>
				<div class="exchange-targets">
					<button
						class="exchange-btn"
						class:assigned={game.exchangePartner !== null}
						disabled={game.exchangePartner !== null}
						onclick={() => assignExchangeTarget('partner')}
					>
						파트너
					</button>
					<button
						class="exchange-btn"
						class:assigned={game.exchangeLeft !== null}
						disabled={game.exchangeLeft !== null}
						onclick={() => assignExchangeTarget('left')}
					>
						왼쪽
					</button>
					<button
						class="exchange-btn"
						class:assigned={game.exchangeRight !== null}
						disabled={game.exchangeRight !== null}
						onclick={() => assignExchangeTarget('right')}
					>
						오른쪽
					</button>
				</div>
			{:else}
				<span class="exchange-hint">교환할 카드를 선택하세요</span>
				<div class="exchange-status">
					<span class:done={game.exchangePartner !== null}>파트너{game.exchangePartner ? ' ✓' : ''}</span>
					<span class:done={game.exchangeLeft !== null}>왼쪽{game.exchangeLeft ? ' ✓' : ''}</span>
					<span class:done={game.exchangeRight !== null}>오른쪽{game.exchangeRight ? ' ✓' : ''}</span>
				</div>
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
		align-items: center;
		gap: 8px;
		margin-bottom: 6px;
		justify-content: center;
		flex-wrap: wrap;
	}
	.exchange-hint {
		font-size: 0.75rem;
		opacity: 0.7;
	}
	.exchange-targets {
		display: flex;
		gap: 4px;
	}
	.exchange-btn {
		padding: 6px 14px;
		border-radius: 6px;
		border: 1px solid #f59e0b;
		background: rgba(245,158,11,0.15);
		color: white;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
	}
	.exchange-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
		border-color: rgba(255,255,255,0.2);
		background: rgba(255,255,255,0.05);
	}
	.exchange-btn.assigned {
		background: rgba(34,197,94,0.2);
		border-color: rgba(34,197,94,0.4);
	}
	.exchange-status {
		display: flex;
		gap: 8px;
		font-size: 0.7rem;
		opacity: 0.5;
	}
	.exchange-status .done {
		opacity: 1;
		color: #4ade80;
	}
	.btn-exchange-submit {
		padding: 6px 16px;
		border-radius: 6px;
		border: none;
		background: #22c55e;
		color: white;
		font-weight: 600;
		font-size: 0.85rem;
		cursor: pointer;
	}
</style>
