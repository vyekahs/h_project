<script lang="ts">
	let { game } = $props<{ game: any }>();
</script>

<!-- Exchange phase is handled within PlayerHand.svelte -->
<div class="exchange-info">
	<p>각 상대에게 카드 1장씩을 교환하세요</p>
	<div class="exchange-status">
		<span class:done={game.exchangePartner}>파트너 {game.exchangePartner ? '✓' : '?'}</span>
		<span class:done={game.exchangeLeft}>왼쪽 {game.exchangeLeft ? '✓' : '?'}</span>
		<span class:done={game.exchangeRight}>오른쪽 {game.exchangeRight ? '✓' : '?'}</span>
	</div>
</div>

<style>
	.exchange-info {
		text-align: center;
		padding: 8px;
		background: rgba(59,130,246,0.15);
		border-radius: 8px;
		margin: 8px 16px;
	}
	.exchange-info p {
		margin: 0 0 6px;
		font-size: 0.85rem;
		opacity: 0.8;
	}
	.exchange-status {
		display: flex;
		justify-content: center;
		gap: 12px;
		font-size: 0.8rem;
	}
	.exchange-status span {
		padding: 2px 8px;
		border-radius: 4px;
		background: rgba(255,255,255,0.1);
	}
	.exchange-status .done {
		background: rgba(34,197,94,0.3);
		color: #4ade80;
	}
</style>
