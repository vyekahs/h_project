<script lang="ts">
	let { castleCount, tavernCount, discardCount, enemiesDefeated }: {
		castleCount: number;
		tavernCount: number;
		discardCount: number;
		enemiesDefeated: number;
	} = $props();
</script>

<div class="deck-info">
	<div class="deck-item">
		<div class="deck-icon castle">
			<span class="stack-icon">🏰</span>
			<span class="count">{castleCount}</span>
		</div>
		<div class="deck-label">성 덱</div>
		<div class="deck-sub">적 {enemiesDefeated}/12</div>
	</div>

	<div class="deck-item">
		<div class="deck-icon tavern">
			<span class="stack-icon">🍺</span>
			<span class="count">{tavernCount}</span>
		</div>
		<div class="deck-label">주점 덱</div>
	</div>

	<div class="deck-item">
		<div class="deck-icon discard">
			<span class="stack-icon">🗑️</span>
			<span class="count">{discardCount}</span>
		</div>
		<div class="deck-label">버림패</div>
	</div>
</div>

<style>
	.deck-info {
		display: flex;
		justify-content: center;
		gap: 16px;
		padding: 0px 12px;
		background: var(--bg-secondary);
		border-radius: 10px;
	}

	.deck-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		min-width: 64px;
	}

	.deck-icon {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		border-radius: 6px;
		background: var(--bg-tertiary);
	}

	.stack-icon {
		font-size: 16px;
	}

	.count {
		font-size: 14px;
		font-weight: 700;
		color: var(--text-primary);
	}

	.deck-label {
		font-size: 10px;
		color: var(--text-tertiary);
		font-weight: 500;
	}

	.deck-sub {
		font-size: 10px;
		color: #f59e0b;
		font-weight: 600;
	}
</style>
