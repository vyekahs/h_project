<script lang="ts">
	import Card from './Card.svelte';
	import { SUITS, SUIT_SYMBOL, getCardValue } from '$lib/games/regicide/types';
	import type { Card as CardType, Suit, Rank } from '$lib/games/regicide/types';

	let { hand, selectedIds, mode, discardIds, highlightIds, enemySuit, onCardClick }: {
		hand: CardType[];
		selectedIds: Set<number>;
		mode: 'play' | 'discard';
		discardIds?: Set<number>;
		highlightIds?: Set<number>;
		enemySuit?: Suit;
		onCardClick: (cardId: number) => void;
	} = $props();

	const SUIT_ORDER: Record<Suit, number> = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };
	const RANK_ORDER: Record<Rank, number> = {
		'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6,
		'7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13
	};

	const sortedHand = $derived(
		[...hand].sort((a, b) => {
			const suitDiff = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
			if (suitDiff !== 0) return suitDiff;
			return RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
		})
	);

	const activeIds = $derived(mode === 'discard' ? (discardIds ?? new Set()) : selectedIds);

	const selectedTotal = $derived(() => {
		const ids = activeIds;
		return hand
			.filter(c => ids.has(c.id))
			.reduce((sum, c) => sum + getCardValue(c), 0);
	});

	const hasSelection = $derived(activeIds.size > 0);

	const POWER_LABELS: Record<Suit, { icon: string; label: string; color: string }> = {
		hearts: { icon: '♥', label: '치유', color: '#ef4444' },
		diamonds: { icon: '♦', label: '드로우', color: '#3b82f6' },
		clubs: { icon: '♣', label: '×2', color: '#1e293b' },
		spades: { icon: '♠', label: '방어', color: '#1e293b' }
	};

	// Validation error message for invalid combos
	const validationError = $derived(() => {
		if (mode !== 'play' || !hasSelection) return '';
		const selected = hand.filter(c => activeIds.has(c.id));
		if (selected.length <= 1) return '';

		const total = selected.reduce((s, c) => s + getCardValue(c), 0);
		const aceCount = selected.filter(c => c.rank === 'A').length;

		// Ace rules
		if (aceCount > 0) {
			if (selected.length > 2) return '에이스는 1장의 카드와만 페어 가능';
			return '';
		}

		// Same-rank combo
		const allSameRank = selected.every(c => c.rank === selected[0].rank);
		if (!allSameRank) return '같은 숫자끼리만 콤보 가능 (또는 A+카드 페어)';
		if (selected.length > 4) return '최대 4장까지 콤보 가능';
		if (total > 10) return `합계 ${total} > 10! 콤보는 합계 10 이하`;

		return '';
	});

	const selectedPowers = $derived(() => {
		if (mode !== 'play' || !hasSelection) return [];
		const selected = hand.filter(c => activeIds.has(c.id));
		const suits = new Set(selected.map(c => c.suit));
		const atk = selected.reduce((s, c) => s + getCardValue(c), 0);
		const ordered: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
		return ordered
			.filter(s => suits.has(s))
			.map(s => {
				const immune = enemySuit === s;
				const info = POWER_LABELS[s];
				let desc = '';
				if (s === 'hearts') desc = `${atk}장 복구`;
				else if (s === 'diamonds') desc = `${atk}장 드로우`;
				else if (s === 'clubs') desc = `데미지 ${atk}×2=${atk * 2}`;
				else if (s === 'spades') desc = `공격력 -${atk}`;
				return { ...info, desc, immune };
			});
	});
</script>

<div class="player-hand-wrapper">
	{#if hasSelection}
		{#if mode === 'play' && validationError()}
			<div class="selection-error">
				⚠️ {validationError()}
			</div>
		{:else}
			<div class="selection-badge" class:discard={mode === 'discard'}>
				{#if mode === 'play'}
					공격력: {selectedTotal()}
					{#each selectedPowers() as power}
						<span class="power-preview" class:immune={power.immune} style:color={power.immune ? '#9ca3af' : power.color}>
							{power.icon}{#if power.immune}면역{:else}{power.desc}{/if}
						</span>
					{/each}
				{:else}
					버림: {selectedTotal()}
				{/if}
			</div>
		{/if}
	{/if}

	<div class="hand-scroll">
		<div class="hand-row" style:--card-count={sortedHand.length}>
			{#each sortedHand as card (card.id)}
				<div class="card-slot" class:selected-discard={mode === 'discard' && (discardIds?.has(card.id) ?? false)}>
					<Card
						{card}
						selected={activeIds.has(card.id)}
						highlighted={highlightIds?.has(card.id) ?? false}
						onclick={() => onCardClick(card.id)}
					/>
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	.player-hand-wrapper {
		position: relative;
		width: 100%;
	}

	.selection-badge {
		text-align: center;
		font-size: 13px;
		font-weight: 700;
		color: #3b82f6;
		padding: 4px 0;
		margin-bottom: 4px;
	}

	.selection-badge.discard {
		color: #ef4444;
	}

	.selection-error {
		text-align: center;
		font-size: 12px;
		font-weight: 600;
		color: #dc2626;
		padding: 4px 8px;
		margin-bottom: 4px;
		background: #fef2f2;
		border-radius: 6px;
		border: 1px solid #fecaca;
	}

	.power-preview {
		display: inline-block;
		font-size: 11px;
		font-weight: 600;
		margin-left: 6px;
	}

	.power-preview.immune {
		text-decoration: line-through;
	}

	.hand-scroll {
		width: 100%;
		overflow-x: hidden;
		overflow-y: visible;
		padding: 16px 4px 4px;
	}

	.hand-row {
		display: flex;
		justify-content: center;
		padding: 0;
	}

	/* Card overlap: 60px card width. Available = 100%.
	   Overlap = max(0, (count * 60 - available) / (count - 1))
	   Using CSS: each card except first gets negative margin based on card count */
	.card-slot {
		transition: margin 0.15s ease;
		/* Default overlap for small hands (≤5 cards): no overlap */
		margin-left: 2px;
	}
	.card-slot:first-child {
		margin-left: 0;
	}

	/* 6+ cards: progressive overlap to fit screen */
	.hand-row[style*="--card-count: 6"] .card-slot:not(:first-child) { margin-left: -6px; }
	.hand-row[style*="--card-count: 7"] .card-slot:not(:first-child) { margin-left: -10px; }
	.hand-row[style*="--card-count: 8"] .card-slot:not(:first-child) { margin-left: -14px; }
	.hand-row[style*="--card-count: 9"] .card-slot:not(:first-child) { margin-left: -16px; }
	.hand-row[style*="--card-count: 10"] .card-slot:not(:first-child) { margin-left: -18px; }
	.hand-row[style*="--card-count: 11"] .card-slot:not(:first-child) { margin-left: -20px; }
	.hand-row[style*="--card-count: 12"] .card-slot:not(:first-child) { margin-left: -22px; }

	.card-slot.selected-discard :global(.card.selected) {
		box-shadow: 0 0 0 2px #ef4444, 0 4px 12px rgba(239, 68, 68, 0.3);
	}
</style>
