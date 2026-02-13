<script lang="ts">
	import type { Card } from '$lib/games/tichu/types';
	import CardComponent from './CardComponent.svelte';
	import { detectCombination, isBomb } from '$lib/games/tichu/combinations';

	let { game } = $props<{ game: any }>();

	const hand = $derived(game.sortedHand);
	const isExchangePhase = $derived(game.gameState?.phase === 'exchange');
	const isPlaying = $derived(game.gameState?.phase === 'playing');

	// Detect if selected cards form a bomb (for out-of-turn bomb play)
	const selectedIsBomb = $derived.by(() => {
		if (game.selectedCards.size < 4) return false;
		const selectedCardObjs = hand.filter((c: Card) => game.selectedCards.has(c.id));
		const combo = detectCombination(selectedCardObjs);
		return combo !== null && isBomb(combo);
	});

	// Dynamic card overlap based on hand size
	const cardOverlap = $derived(hand.length > 10 ? Math.min(hand.length - 8, 16) : 8);

	function handleCardClick(card: Card) {
		if (isExchangePhase) {
			handleExchangeSelect(card.id);
		} else {
			game.toggleCard(card.id);
		}
	}

	// Exchange mode: assign card to partner/left/right
	let exchangeTarget = $state<'partner' | 'left' | 'right'>('partner');

	// Reset exchangeTarget when exchange phase starts
	$effect(() => {
		if (isExchangePhase) {
			exchangeTarget = 'partner';
		}
	});

	function handleExchangeSelect(cardId: string) {
		game.setExchangeCard(exchangeTarget, cardId);
		// Auto-advance target
		if (exchangeTarget === 'partner') exchangeTarget = 'left';
		else if (exchangeTarget === 'left') exchangeTarget = 'right';
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
			<div class="exchange-targets">
				<button
					class="exchange-btn"
					class:active={exchangeTarget === 'partner'}
					class:assigned={game.exchangePartner !== null}
					onclick={() => exchangeTarget = 'partner'}
				>
					파트너
					{#if game.exchangePartner}✓{/if}
				</button>
				<button
					class="exchange-btn"
					class:active={exchangeTarget === 'left'}
					class:assigned={game.exchangeLeft !== null}
					onclick={() => exchangeTarget = 'left'}
				>
					왼쪽
					{#if game.exchangeLeft}✓{/if}
				</button>
				<button
					class="exchange-btn"
					class:active={exchangeTarget === 'right'}
					class:assigned={game.exchangeRight !== null}
					onclick={() => exchangeTarget = 'right'}
				>
					오른쪽
					{#if game.exchangeRight}✓{/if}
				</button>
			</div>
			<button
				class="btn-exchange-submit"
				disabled={!game.exchangeReady}
				onclick={() => game.submitExchange()}
			>
				교환 확인
			</button>
		</div>
	{/if}

	<div class="hand-cards" style="--card-overlap: -{cardOverlap}px">
		{#each hand as card (card.id)}
			<CardComponent
				{card}
				selected={game.selectedCards.has(card.id) || isCardUsedInExchange(card.id)}
				onclick={() => handleCardClick(card)}
			/>
		{/each}
	</div>

	{#if !isExchangePhase && isPlaying}
		<div class="play-controls">
			<button
				class="btn-play"
				disabled={game.selectedCards.size === 0 || !game.isMyTurn}
				onclick={() => game.playSelectedCards()}
			>
				내기 ({game.selectedCards.size})
			</button>
			<button
				class="btn-pass"
				disabled={!game.isMyTurn}
				onclick={() => game.pass()}
			>
				패스
			</button>
			{#if selectedIsBomb}
				<button class="btn-bomb" onclick={playBomb}>
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
		gap: 2px;
		overflow-x: auto;
		padding: 4px 0;
		-webkit-overflow-scrolling: touch;
	}

	/* Overlap cards dynamically based on hand size */
	.hand-cards :global(.card) {
		margin-left: var(--card-overlap, -8px);
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
		margin-bottom: 8px;
		justify-content: center;
	}
	.exchange-targets {
		display: flex;
		gap: 4px;
	}
	.exchange-btn {
		padding: 6px 12px;
		border-radius: 6px;
		border: 1px solid rgba(255,255,255,0.2);
		background: rgba(255,255,255,0.05);
		color: white;
		font-size: 0.8rem;
		cursor: pointer;
	}
	.exchange-btn.active {
		border-color: #f59e0b;
		background: rgba(245,158,11,0.2);
	}
	.exchange-btn.assigned {
		background: rgba(34,197,94,0.2);
		border-color: rgba(34,197,94,0.4);
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
	.btn-exchange-submit:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
