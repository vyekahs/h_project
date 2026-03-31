<script lang="ts">
	import { SUIT_SYMBOL, SUIT_COLOR } from '$lib/games/regicide/types';
	import type { Card } from '$lib/games/regicide/types';

	let { card, selected = false, dimmed = false, compact = false, faceDown = false, highlighted = false, immune = false, onclick }: {
		card: Card;
		selected?: boolean;
		dimmed?: boolean;
		compact?: boolean;
		faceDown?: boolean;
		highlighted?: boolean;
		immune?: boolean;
		onclick?: () => void;
	} = $props();

	const color = $derived(SUIT_COLOR[card.suit] === 'red' ? '#dc2626' : '#1e293b');
	const symbol = $derived(SUIT_SYMBOL[card.suit]);
</script>

<button
	class="card"
	class:selected
	class:dimmed
	class:compact
	class:face-down={faceDown}
	class:highlighted
	onclick={onclick}
	type="button"
	aria-label={faceDown ? '뒷면 카드' : `${card.rank}${symbol}`}
>
	{#if faceDown}
		<div class="card-back">
			<div class="back-pattern">
				<div class="diamond"></div>
				<div class="diamond"></div>
				<div class="diamond"></div>
				<div class="diamond"></div>
			</div>
		</div>
	{:else}
		<div class="card-face" style:color={color}>
			<div class="corner top-left">
				<span class="rank">{card.rank}</span>
				<span class="suit-small">{symbol}</span>
			</div>
			<div class="center-suit">{symbol}</div>
			{#if immune}
				<div class="immune-overlay">
					<svg viewBox="0 0 60 84" class="immune-svg">
						<line x1="4" y1="4" x2="56" y2="80" stroke="rgba(239,68,68,0.4)" stroke-width="8" stroke-linecap="round" />
						<line x1="56" y1="4" x2="4" y2="80" stroke="rgba(239,68,68,0.4)" stroke-width="8" stroke-linecap="round" />
					</svg>
				</div>
			{/if}
			<div class="corner bottom-right">
				<span class="rank">{card.rank}</span>
				<span class="suit-small">{symbol}</span>
			</div>
		</div>
	{/if}
</button>

<style>
	.card {
		width: 60px;
		height: 84px;
		border-radius: 6px;
		background: white;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
		cursor: pointer;
		position: relative;
		transition: transform 0.15s ease, box-shadow 0.15s ease;
		user-select: none;
		border: 1px solid #e2e8f0;
		padding: 0;
		overflow: hidden;
		flex-shrink: 0;
		-webkit-tap-highlight-color: transparent;
	}

	.card:active {
		transform: scale(0.96);
	}

	.card.selected {
		transform: translateY(-12px);
		box-shadow: 0 0 0 2px #3b82f6, 0 4px 12px rgba(59, 130, 246, 0.3);
	}

	.card.selected:active {
		transform: translateY(-12px) scale(0.96);
	}

	.card.dimmed {
		opacity: 0.5;
	}

	.card.highlighted {
		animation: tutorialPulse 1.2s ease-in-out infinite;
		box-shadow: 0 0 0 3px #fbbf24, 0 0 16px rgba(251, 191, 36, 0.5);
		z-index: 10;
	}

	@keyframes tutorialPulse {
		0%, 100% { box-shadow: 0 0 0 3px #fbbf24, 0 0 16px rgba(251, 191, 36, 0.3); }
		50% { box-shadow: 0 0 0 5px #fbbf24, 0 0 24px rgba(251, 191, 36, 0.6); }
	}

	.card.compact {
		width: 32px;
		height: 44px;
		border-radius: 4px;
	}

	.card.compact .rank {
		font-size: 8px;
	}

	.card.compact .suit-small {
		font-size: 6px;
	}

	.card.compact .center-suit {
		font-size: 13px;
	}

	.card.compact .corner {
		padding: 1px 2px;
	}

	/* Face-down card */
	.card.face-down {
		cursor: default;
	}

	.card-back {
		width: 100%;
		height: 100%;
		background: linear-gradient(135deg, #1e3a5f 0%, #2d5a8e 50%, #1e3a5f 100%);
		border-radius: 5px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.back-pattern {
		width: 70%;
		height: 80%;
		border: 1.5px solid rgba(255, 255, 255, 0.2);
		border-radius: 3px;
		display: grid;
		grid-template-columns: 1fr 1fr;
		grid-template-rows: 1fr 1fr;
		gap: 4px;
		padding: 4px;
		align-items: center;
		justify-items: center;
	}

	.diamond {
		width: 8px;
		height: 8px;
		background: rgba(255, 255, 255, 0.15);
		transform: rotate(45deg);
	}

	/* Card face */
	.card-face {
		width: 100%;
		height: 100%;
		position: relative;
	}

	.corner {
		position: absolute;
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 1;
		padding: 3px 4px;
	}

	.top-left {
		top: 0;
		left: 0;
	}

	.bottom-right {
		bottom: 0;
		right: 0;
		transform: rotate(180deg);
	}

	.rank {
		font-size: 11px;
		font-weight: 700;
		font-family: 'Georgia', serif;
	}

	.suit-small {
		font-size: 9px;
		line-height: 1;
	}

	.center-suit {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 24px;
		line-height: 1;
	}

	.immune-overlay {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.immune-svg {
		width: 100%;
		height: 100%;
	}
</style>
