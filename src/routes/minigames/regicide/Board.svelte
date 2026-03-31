<script lang="ts">
	import Card from './Card.svelte';
	import EnemyCard from './EnemyCard.svelte';
	import DeckInfo from './DeckInfo.svelte';
	import type { Card as CardType, Enemy, TurnPhase } from '$lib/games/regicide/types';

	let {
		currentEnemy,
		castleDeck,
		tavernDeck,
		discardPile,
		currentShield,
		playedCardsThisEnemy,
		animEvent = null,
	}: {
		currentEnemy: Enemy | null;
		castleDeck: CardType[];
		tavernDeck: CardType[];
		discardPile: CardType[];
		currentShield: number;
		playedCardsThisEnemy: CardType[];
		animEvent?: any;
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



</div>

<style>
	.board {
		display: flex;
		flex-direction: column;
		gap: 4px;
		width: 100%;
		flex: 1;
		min-height: 0;
		box-sizing: border-box;
	}

	.board-section {
		width: 100%;
	}

	/* Enemy */
	.enemy-section {
		display: flex;
		justify-content: center;
		padding: 4px 0;
		flex-shrink: 1;
		min-height: 0;
	}

	.no-enemy {
		color: var(--text-tertiary, #64748b);
		font-size: 14px;
		text-align: center;
		padding: 40px 0;
	}

	/* Played cards */
	.played-section {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		padding: 2px 0;
	}

	.section-label {
		font-size: 10px;
		color: var(--text-tertiary, #64748b);
		margin-bottom: 2px;
		font-weight: 500;
		flex-shrink: 0;
	}

	.played-row {
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
		overflow-y: auto;
		flex: 1;
		min-height: 0;
		align-content: flex-start;
	}

	/* Scale played cards based on screen height */
	.played-row :global(.card.compact) {
		width: clamp(38px, 7.2vh, 64px);
		height: clamp(53px, 10vh, 90px);
	}


</style>
