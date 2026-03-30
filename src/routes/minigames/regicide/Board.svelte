<script lang="ts">
	import Card from './Card.svelte';
	import EnemyCard from './EnemyCard.svelte';
	import PlayerHand from './PlayerHand.svelte';
	import DeckInfo from './DeckInfo.svelte';
	import type { Card as CardType, Enemy, TurnPhase } from '$lib/games/regicide/types';

	let {
		currentEnemy,
		playerHand,
		castleDeck,
		tavernDeck,
		discardPile,
		selectedCardIds,
		currentShield,
		turnPhase,
		canPlay,
		playedCardsThisEnemy,
		highlightCardIds,
		interactionBlocked = false,
		animEvent = null,
		onToggleCard,
		onPlayCards
	}: {
		currentEnemy: Enemy | null;
		playerHand: CardType[];
		castleDeck: CardType[];
		tavernDeck: CardType[];
		discardPile: CardType[];
		selectedCardIds: Set<number>;
		currentShield: number;
		turnPhase: TurnPhase;
		canPlay: boolean;
		playedCardsThisEnemy: CardType[];
		highlightCardIds?: Set<number>;
		interactionBlocked?: boolean;
		animEvent?: any;
		onToggleCard: (cardId: number) => void;
		onPlayCards: () => void;
	} = $props();

	const enemiesDefeated = $derived(12 - (castleDeck.filter(c => c.rank === 'J' || c.rank === 'Q' || c.rank === 'K').length + (currentEnemy ? 1 : 0)));
</script>

<div class="board">
	<!-- Deck Info -->
	<div class="board-section">
		<DeckInfo
			castleCount={castleDeck.length}
			tavernCount={tavernDeck.length}
			discardCount={discardPile.length}
			{enemiesDefeated}
		/>
	</div>

	<!-- Enemy -->
	<div class="board-section enemy-section">
		{#if currentEnemy}
			<EnemyCard enemy={currentEnemy} {enemiesDefeated} {animEvent} />
		{:else}
			<div class="no-enemy">적 없음</div>
		{/if}
	</div>

	<!-- Played Cards This Enemy -->
	{#if playedCardsThisEnemy.length > 0}
		<div class="board-section played-section">
			<div class="section-label">이번 적에게 사용한 카드</div>
			<div class="played-row">
				{#each playedCardsThisEnemy as card (card.id)}
					<Card {card} compact dimmed />
				{/each}
			</div>
		</div>
	{/if}

	<!-- Shield info -->
	{#if currentShield > 0}
		<div class="shield-info">
			🛡️ 방어막: {currentShield}
		</div>
	{/if}

	<!-- Player Hand -->
	<div class="board-section hand-section">
		<div class="suit-ref">
			<span class="ref-item"><span class="ref-s" style:color="#ef4444">♥</span>치유</span>
			<span class="ref-item"><span class="ref-s" style:color="#3b82f6">♦</span>드로우</span>
			<span class="ref-item"><span class="ref-s" style:color="#1e293b">♣</span>×2</span>
			<span class="ref-item"><span class="ref-s" style:color="#1e293b">♠</span>방어</span>
		</div>
		<PlayerHand
			hand={playerHand}
			selectedIds={selectedCardIds}
			mode="play"
			highlightIds={highlightCardIds}
			enemySuit={currentEnemy?.card.suit}
			onCardClick={interactionBlocked ? () => {} : onToggleCard}
		/>
	</div>

	<!-- Play Button -->
	{#if turnPhase === 'select_cards'}
		<div class="action-bar">
			<button
				class="btn btn-play"
				type="button"
				disabled={!canPlay || interactionBlocked}
				onclick={onPlayCards}
			>
				▶ 플레이
			</button>
		</div>
	{/if}
</div>

<style>
	.board {
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
		flex: 1;
		box-sizing: border-box;
	}

	.board-section {
		width: 100%;
	}

	/* Enemy */
	.enemy-section {
		display: flex;
		justify-content: center;
		flex: 1;
		padding: 4px 0;
	}

	.no-enemy {
		color: var(--text-tertiary, #64748b);
		font-size: 14px;
		text-align: center;
		padding: 40px 0;
	}

	/* Played cards */
	.played-section {
		padding: 4px 0;
	}

	.section-label {
		font-size: 10px;
		color: var(--text-tertiary, #64748b);
		margin-bottom: 4px;
		font-weight: 500;
	}

	.played-row {
		display: flex;
		gap: 4px;
		overflow-x: auto;
		padding: 2px 0;
		-webkit-overflow-scrolling: touch;
	}

	/* Shield info */
	.shield-info {
		text-align: center;
		font-size: 12px;
		font-weight: 600;
		color: var(--color-blue, #60a5fa);
		padding: 4px 0;
	}

	/* Suit reference */
	.suit-ref {
		display: flex;
		justify-content: center;
		gap: 10px;
		padding: 2px 0;
	}

	.ref-item {
		display: flex;
		align-items: center;
		gap: 2px;
		font-size: 11px;
		font-weight: 600;
		color: var(--text-tertiary);
	}

	.ref-s {
		font-size: 13px;
	}

	/* Hand */
	.hand-section {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		min-height: 110px;
	}

	/* Action Bar */
	.action-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 0;
		flex-shrink: 0;
	}

	.btn {
		padding: 10px 16px;
		border: none;
		border-radius: 12px;
		font-size: 14px;
		font-weight: 700;
		cursor: pointer;
		transition: opacity 0.15s ease, transform 0.1s ease;
		-webkit-tap-highlight-color: transparent;
	}

	.btn:active {
		transform: scale(0.96);
	}

	.btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.btn:disabled:active {
		transform: none;
	}

	.btn-play {
		background: var(--bg-dark, #1e293b);
		color: var(--bg-primary, #fff);
		width: 100%;
	}
</style>
