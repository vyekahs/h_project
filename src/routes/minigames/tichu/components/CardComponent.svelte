<script lang="ts">
	import type { Card } from '$lib/games/tichu/types';

	let { card, selected = false, highlighted = false, small = false, onclick = undefined } = $props<{
		card: Card;
		selected?: boolean;
		highlighted?: boolean;
		small?: boolean;
		onclick?: () => void;
	}>();

	// Special Card Images
	const specialImages: Record<string, string> = {
		dragon: '/tichu/dragon.svg',
		phoenix: '/tichu/phoenix.svg',
		dog: '/tichu/dog.svg',
		mahjong: '/tichu/bird.svg'
	};

	// Standard Suit Images
	const suitImages: Record<string, string> = {
		spade: '/tichu/spade.svg',
		heart: '/tichu/heart.svg',
		diamond: '/tichu/diamond.svg',
		club: '/tichu/clover.svg'
	};

	const suitMap: Record<string, string> = {
		jade: 'club',
		sword: 'spade',
		pagoda: 'diamond',
		star: 'heart'
	};

	const suitColors: Record<string, string> = {
		club: '#374151',   // Black-ish
		spade: '#374151',  // Black-ish
		diamond: '#dc2626', // Red
		heart: '#dc2626'   // Red
	};

	const specialDisplay: Record<string, { color: string; name: string; gradient: string }> = {
		dragon: { 
			color: '#ef4444', 
			name: 'Dragon', 
			gradient: 'linear-gradient(135deg, #fca5a5 0%, #ef4444 100%)' 
		},
		phoenix: { 
			color: '#f59e0b', 
			name: 'Phoenix',
			gradient: 'linear-gradient(135deg, #fcd34d 0%, #f59e0b 100%)'
		},
		mahjong: { 
			color: '#10b981', 
			name: 'Mahjong',
			gradient: 'linear-gradient(135deg, #6ee7b7 0%, #10b981 100%)'
		},
		dog: { 
			color: '#8b5cf6', 
			name: 'Dog',
			gradient: 'linear-gradient(135deg, #c4b5fd 0%, #8b5cf6 100%)'
		}
	};

	const rankDisplay: Record<number, string> = {
		2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8',
		9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A'
	};

	const isSpecial = $derived(card.type === 'special');
	
	const displayInfo = $derived.by(() => {
		if (card.type === 'special') {
			const info = specialDisplay[card.special];
			return { 
				rank: '', 
				imageSrc: specialImages[card.special],
				color: info.color, 
				name: info.name,
				isSpecial: true,
				gradient: info.gradient,
				isClub: false
			};
		}
		
		const mappedSuit = suitMap[card.suit] ?? 'spade';
		return {
			rank: rankDisplay[card.rank] ?? String(card.rank),
			imageSrc: suitImages[mappedSuit],
			color: suitColors[mappedSuit] ?? '#374151',
			name: '',
			isSpecial: false,
			gradient: 'none',
			isClub: mappedSuit === 'club'
		};
	});
</script>

<button
	class="card"
	class:selected
	class:highlighted
	class:small
	class:special={isSpecial}
	style="--card-color: {displayInfo.color}"
	{onclick}
	disabled={!onclick}
>
	{#if isSpecial}
		<div class="special-bg" style="background: {displayInfo.gradient}"></div>
		<div class="special-content">
			<img src={displayInfo.imageSrc} alt={displayInfo.name} class="special-image" />
		</div>
		{#if card.type === 'special' && card.special === 'mahjong'}
			<div class="special-label mahjong-label">1</div>
		{:else if card.type === 'special' && card.special === 'dragon'}
			<div class="special-label dragon-label">용</div>
		{:else if card.type === 'special' && card.special === 'phoenix'}
			<div class="special-label phoenix-label">봉</div>
		{/if}
		<div class="glow"></div>
	{:else}
		<div class="card-top-left">
			<span class="rank-text" style="color: {displayInfo.color}">{displayInfo.rank}</span>
			<div 
				class="suit-icon-small" 
				class:club-icon={displayInfo.isClub}
				style="background-color: {displayInfo.color}; -webkit-mask-image: url('{displayInfo.imageSrc}'); mask-image: url('{displayInfo.imageSrc}')"
			></div>
		</div>
		
		<div class="card-center">
			<div 
				class="suit-icon-large" 
				class:club-icon={displayInfo.isClub}
				style="background-color: {displayInfo.color}; -webkit-mask-image: url('{displayInfo.imageSrc}'); mask-image: url('{displayInfo.imageSrc}')"
			></div>
		</div>

		<div class="card-bottom-right">
			<span class="rank-text" style="color: {displayInfo.color}">{displayInfo.rank}</span>
			<div 
				class="suit-icon-small" 
				class:club-icon={displayInfo.isClub}
				style="background-color: {displayInfo.color}; -webkit-mask-image: url('{displayInfo.imageSrc}'); mask-image: url('{displayInfo.imageSrc}')"
			></div>
		</div>
	{/if}
</button>

<style>
	/* Use Inter font */
	@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

	.card {
		width: 46px;
		height: 66px;
		border-radius: 6px;
		background: #fff;
		border: 1px solid rgba(0,0,0,0.1);
		box-shadow: 0 2px 5px rgba(0,0,0,0.15);
		position: relative;
		flex-shrink: 0;
		font-family: 'Inter', sans-serif;
		cursor: pointer;
		transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 3px;
		isolation: isolate;
	}

	/* Hover effect for mouse users */
	@media (hover: hover) {
		.card:not(:disabled):not(.selected):hover {
			transform: translateY(-4px);
			box-shadow: 0 6px 12px rgba(0,0,0,0.15);
			z-index: 10;
		}
	}

	.card:disabled { cursor: default; }

	.card.selected {
		transform: translateY(-12px);
		border: 2px solid #fbbf24;
		box-shadow: 0 0 15px rgba(251, 191, 36, 0.5);
		z-index: 20;
	}

	.card.highlighted {
		animation: highlightPulse 1.2s ease-in-out infinite;
		border: 2.5px solid #34d399;
		z-index: 15;
		background: linear-gradient(180deg, #ecfdf5 0%, #fff 40%);
	}
	.card.highlighted.selected {
		border-color: #fbbf24;
		animation: none;
	}
	@keyframes highlightPulse {
		0%, 100% {
			box-shadow: 0 0 10px rgba(52, 211, 153, 0.5), 0 0 25px rgba(52, 211, 153, 0.2);
			transform: translateY(-4px);
		}
		50% {
			box-shadow: 0 0 20px rgba(52, 211, 153, 0.8), 0 0 40px rgba(52, 211, 153, 0.3);
			transform: translateY(-10px);
		}
	}

	/* Special Card Styling */
	.card.special {
		border: none;
	}
	.special-bg {
		position: absolute;
		inset: 0;
		padding: 2px; /* inner border feel */
		opacity: 0.15;
	}
	.card.special.selected .special-bg { opacity: 0.25; }
	
	.special-content {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		z-index: 2;
	}
	.special-image {
		width: 36px;
		height: 36px;
		object-fit: contain;
		filter: drop-shadow(0 2px 4px rgba(0,0,0,0.15));
	}
	.special-label {
		position: absolute;
		top: 2px;
		left: 4px;
		font-size: 0.7rem;
		font-weight: 800;
		z-index: 3;
		line-height: 1;
	}
	.mahjong-label { color: #065f46; }
	.dragon-label { color: #1e3a5f; }
	.phoenix-label { color: #7c2d12; }

	/* Normal Card Layout */
	.card-top-left {
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 0.8;
		width: 12px;
	}
	.card-bottom-right {
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 0.8;
		transform: rotate(180deg);
		width: 12px;
		align-self: flex-end;
	}
	.card-center {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
	}

	.rank-text {
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: -0.05em;
	}
	.suit-icon-small {
		width: 8px;
		height: 8px;
		margin-top: 1px;
		-webkit-mask-size: contain;
		mask-size: contain;
		-webkit-mask-repeat: no-repeat;
		mask-repeat: no-repeat;
		-webkit-mask-position: center;
		mask-position: center;
	}
	.suit-icon-large {
		width: 22px;
		height: 22px;
		opacity: 1;
		-webkit-mask-size: contain;
		mask-size: contain;
		-webkit-mask-repeat: no-repeat;
		mask-repeat: no-repeat;
		-webkit-mask-position: center;
		mask-position: center;
	}
	.club-icon {
		transform: scale(0.85); /* Reduce clover size slightly */
	}
	/* Small Variant (e.g. for history, opponent hand count, etc if needed) */
	.card.small {
		width: 32px;
		height: 44px;
		border-radius: 4px;
		padding: 2px;
	}
	.small .rank-text { font-size: 0.65rem; }
	.small .suit-icon-small { width: 6px; height: 6px; }
	.small .suit-icon-large { width: 14px; height: 14px; }
	.small .special-image { width: 24px; height: 24px; }

</style>
