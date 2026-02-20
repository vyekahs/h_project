<script lang="ts">
	import { type Card } from '$lib/games/tichu/types';
	import CardComponent from './CardComponent.svelte';

	let { game } = $props<{ game: any }>();

	const ranks = [
		{ value: 2, label: '2' },
		{ value: 3, label: '3' },
		{ value: 4, label: '4' },
		{ value: 5, label: '5' },
		{ value: 6, label: '6' },
		{ value: 7, label: '7' },
		{ value: 8, label: '8' },
		{ value: 9, label: '9' },
		{ value: 10, label: '10' },
		{ value: 11, label: 'J' },
		{ value: 12, label: 'Q' },
		{ value: 13, label: 'K' },
		{ value: 14, label: 'A' }
	];

	function selectRank(rank: number) {
		game.setWish(rank);
		game.showWishModal = false;
	}

	function skipWish() {
		game.setWish(null);
		game.showWishModal = false;
	}

	const mahjongCard: Card = { type: 'special', special: 'mahjong', rank: 1, suit: 'mahjong' };
</script>

<div class="modal-overlay">
	<div class="modal-content">
		<div class="wish-card-wrapper">
			<CardComponent card={mahjongCard} />
		</div>
		<h2>소원 선택</h2>
		<p>상대에게 요청할 카드 값을 선택하세요</p>

		<div class="rank-grid">
			{#each ranks as r}
				<button class="rank-btn" onclick={() => selectRank(r.value)}>
					{r.label}
				</button>
			{/each}
		</div>

		<button class="skip-btn" onclick={skipWish}>소원 없음</button>
	</div>
</div>

<style>
	/* Fonts */
	@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1100;
		font-family: 'Inter', sans-serif;
	}

	.modal-content {
		background: rgba(10, 30, 20, 0.9); /* Dark Green tint */
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		border: 1px solid rgba(16, 185, 129, 0.4); /* Jade Border */
		border-radius: 24px;
		padding: 32px;
		text-align: center;
		color: #f3f4f6;
		max-width: 340px;
		width: 85%;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
		animation: popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.wish-card-wrapper {
		display: flex;
		justify-content: center;
		margin-bottom: 20px;
		transform: scale(1.5);
		filter: drop-shadow(0 4px 10px rgba(16, 185, 129, 0.4));
		animation: pulse 2s infinite;
	}
	/* Prevent full card click sound/interaction if CardComponent has onclick */
	.wish-card-wrapper :global(.card) {
		cursor: default;
	}
	@keyframes pulse {
		0%, 100% { transform: scale(1); opacity: 1; }
		50% { transform: scale(1.05); opacity: 0.8; }
	}

	h2 {
		margin: 0 0 8px;
		font-size: 1.4rem;
		font-weight: 800;
		background: linear-gradient(135deg, #34d399 0%, #059669 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		letter-spacing: -0.02em;
	}

	p {
		font-size: 0.9rem;
		color: #d1d5db;
		margin: 0 0 24px;
	}

	.rank-grid {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 10px;
		margin-bottom: 24px;
	}

	.rank-btn {
		padding: 12px 0;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.05);
		color: #e5e7eb;
		font-size: 1rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.2s;
	}
	.rank-btn:hover {
		background: rgba(16, 185, 129, 0.2);
		border-color: rgba(16, 185, 129, 0.5);
		color: #fff;
		transform: translateY(-2px);
		box-shadow: 0 4px 10px rgba(16, 185, 129, 0.2);
	}

	.skip-btn {
		width: 100%;
		padding: 12px;
		border-radius: 14px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: transparent;
		color: #9ca3af;
		font-size: 0.95rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}
	.skip-btn:hover {
		background: rgba(255, 255, 255, 0.05);
		color: #f3f4f6;
		border-color: rgba(255, 255, 255, 0.3);
	}

	@keyframes popIn {
		from { opacity: 0; transform: scale(0.9) translateY(20px); }
		to { opacity: 1; transform: scale(1) translateY(0); }
	}
</style>
