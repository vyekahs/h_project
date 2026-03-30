<script lang="ts">
	import Card from './Card.svelte';
	import type { Card as CardType } from '$lib/games/regicide/types';

	let {
		hand,
		discardIds,
		effectiveAttack,
		discardTotal,
		canConfirm,
		jestersRemaining,
		onToggleCard,
		onConfirm,
		onFlipJester
	}: {
		hand: CardType[];
		discardIds: Set<number>;
		effectiveAttack: number;
		discardTotal: number;
		canConfirm: boolean;
		jestersRemaining: number;
		onToggleCard: (id: number) => void;
		onConfirm: () => void;
		onFlipJester: () => void;
	} = $props();

	const progressPct = $derived(Math.min(100, effectiveAttack > 0 ? (discardTotal / effectiveAttack) * 100 : 0));
	const isMet = $derived(discardTotal >= effectiveAttack);
</script>

<div class="discard-overlay">
	<div class="discard-modal">
		<div class="modal-header">
			<h3>적의 공격!</h3>
			<p class="attack-info">공격력 <strong>{effectiveAttack}</strong> 이상의 카드를 버리세요</p>
		</div>

		<div class="progress-section">
			<div class="progress-bar">
				<div
					class="progress-fill"
					class:met={isMet}
					style:width="{progressPct}%"
				></div>
			</div>
			<div class="progress-label">
				<span class="discard-total" class:met={isMet}>{discardTotal}</span>
				<span class="separator">/</span>
				<span class="required">{effectiveAttack} 필요</span>
			</div>
		</div>

		<div class="cards-section">
			<div class="cards-scroll">
				{#each hand as card (card.id)}
					<Card
						{card}
						selected={discardIds.has(card.id)}
						onclick={() => onToggleCard(card.id)}
					/>
				{/each}
			</div>
			{#if hand.length === 0}
				<p class="empty-hand">손에 카드가 없습니다</p>
			{/if}
		</div>

		<div class="actions">
			<button
				class="btn-confirm"
				disabled={!canConfirm}
				onclick={onConfirm}
			>
				방어 확인
			</button>

			{#if jestersRemaining > 0}
				<button
					class="btn-jester"
					onclick={onFlipJester}
				>
					<span class="jester-icon">&#x1F0CF;</span>
					광대 사용 ({jestersRemaining})
				</button>
			{/if}
		</div>
	</div>
</div>

<style>
	.discard-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.75);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 90;
		padding: 1rem;
	}

	.discard-modal {
		background: var(--bg-primary);
		border: 1px solid var(--border-primary);
		border-radius: 20px;
		padding: 1.25rem;
		width: 100%;
		max-width: 400px;
		box-shadow: var(--shadow-heavy);
		animation: slideUp 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.modal-header {
		text-align: center;
		margin-bottom: 1rem;
	}

	.modal-header h3 {
		margin: 0 0 0.25rem 0;
		font-size: 1.2rem;
		color: #fb923c;
		font-weight: 700;
	}

	.attack-info {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-tertiary);
	}

	.attack-info strong {
		color: #f87171;
		font-size: 1rem;
	}

	.progress-section {
		margin-bottom: 1rem;
	}

	.progress-bar {
		width: 100%;
		height: 8px;
		background: var(--bg-tertiary);
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: #f87171;
		border-radius: 4px;
		transition: width 0.2s ease, background 0.2s ease;
	}

	.progress-fill.met {
		background: #4ade80;
	}

	.progress-label {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 0.25rem;
		margin-top: 0.5rem;
		font-size: 0.9rem;
	}

	.discard-total {
		font-size: 1.25rem;
		font-weight: 700;
		color: #f87171;
		font-variant-numeric: tabular-nums;
	}

	.discard-total.met {
		color: #4ade80;
	}

	.separator {
		color: var(--text-tertiary);
	}

	.required {
		color: var(--text-tertiary);
		font-size: 0.85rem;
	}

	.cards-section {
		margin-bottom: 1rem;
	}

	.cards-scroll {
		display: flex;
		gap: 0.4rem;
		overflow-x: auto;
		padding: 0.5rem 0.25rem;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
	}

	.cards-scroll::-webkit-scrollbar {
		display: none;
	}

	.empty-hand {
		text-align: center;
		color: var(--text-tertiary);
		font-size: 0.85rem;
		padding: 1rem 0;
		margin: 0;
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.btn-confirm {
		width: 100%;
		padding: 0.85rem;
		border: none;
		border-radius: 14px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		background: #3b82f6;
		color: white;
	}

	.btn-confirm:disabled {
		background: var(--bg-tertiary);
		color: var(--text-tertiary);
		cursor: default;
	}

	.btn-confirm:not(:disabled):active {
		transform: scale(0.97);
	}

	.btn-jester {
		width: 100%;
		padding: 0.7rem;
		border: 1px solid #7c3aed;
		border-radius: 14px;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		background: rgba(124, 58, 237, 0.08);
		color: #7c3aed;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
	}

	.btn-jester:active {
		transform: scale(0.97);
		background: rgba(124, 58, 237, 0.15);
	}

	.jester-icon {
		font-size: 1.1rem;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
