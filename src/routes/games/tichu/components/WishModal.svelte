<script lang="ts">
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
</script>

<div class="modal-overlay">
	<div class="modal-content">
		<div class="wish-icon">🀄</div>
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
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1100;
	}
	.modal-content {
		background: #1e293b;
		border-radius: 16px;
		padding: 24px;
		text-align: center;
		color: white;
		max-width: 340px;
		width: 85%;
	}
	.wish-icon { font-size: 2rem; }
	h2 { margin: 8px 0; font-size: 1.1rem; }
	p { font-size: 0.85rem; opacity: 0.7; margin: 0 0 16px; }

	.rank-grid {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 8px;
	}
	.rank-btn {
		padding: 12px 8px;
		border-radius: 8px;
		border: 1px solid rgba(255,255,255,0.2);
		background: rgba(255,255,255,0.05);
		color: white;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
	}
	.rank-btn:hover {
		background: rgba(245,158,11,0.3);
		border-color: #f59e0b;
	}
	.skip-btn {
		margin-top: 12px;
		width: 100%;
		padding: 10px;
		border-radius: 8px;
		border: 1px solid rgba(255,255,255,0.15);
		background: rgba(255,255,255,0.03);
		color: rgba(255,255,255,0.6);
		font-size: 0.9rem;
		cursor: pointer;
	}
	.skip-btn:hover {
		background: rgba(255,255,255,0.1);
		color: white;
	}
</style>
