<script lang="ts">
	let { game } = $props<{ game: any }>();

	// Helper: access stateVersion to trigger reactivity on mutable engine state
	function gs() {
		void game.stateVersion;
		return game.gameState;
	}

	// 남은 수 = "내가 위치를 모르는" 용/봉/A/K 개수.
	// 위치를 아는 카드: 나온 카드(wonCards + 진행 중 트릭), 내 손패,
	// 그리고 교환 때 내가 내보낸 카드(어느 자리로 갔는지 아니까).
	// 카드 id로 Set 집계 — 교환으로 준 카드가 나중에 플레이되어도 중복 차감되지 않음.
	const counts = $derived.by(() => {
		const s = gs();
		if (!s?.round) return null;

		const knownIds = new Set<string>();
		for (const player of s.players) {
			for (const card of player.wonCards) knownIds.add(card.id);
		}
		const trick = s.round.trick;
		if (trick) {
			for (const play of trick.plays) {
				for (const card of play.combination.cards) knownIds.add(card.id);
			}
		}
		for (const card of s.players[0].hand) knownIds.add(card.id);
		for (const id of game.humanExchangeIds as string[]) knownIds.add(id);

		let aces = 4;
		let kings = 4;
		for (const id of knownIds) {
			if (id.endsWith('_14')) aces--;
			else if (id.endsWith('_13')) kings--;
		}

		return {
			dragon: knownIds.has('dragon') ? 0 : 1,
			phoenix: knownIds.has('phoenix') ? 0 : 1,
			aces: Math.max(0, aces),
			kings: Math.max(0, kings)
		};
	});

	const visible = $derived.by(() => {
		const p = game.phase;
		return (p === 'playing' || p === 'wish_declare' || p === 'dragon_gift') && counts !== null;
	});
</script>

{#if visible && counts}
	<div class="card-counter" title="위치를 모르는 카드 수 (나온 카드·내 손패·교환으로 준 카드 제외)">
		<span class="counter-title">남은 수</span>
		<div class="counter-item" class:depleted={counts.dragon === 0}>
			<span class="counter-letter dragon">용</span>
			<span class="counter-num">{counts.dragon}</span>
		</div>
		<div class="counter-item" class:depleted={counts.phoenix === 0}>
			<span class="counter-letter phoenix">봉</span>
			<span class="counter-num">{counts.phoenix}</span>
		</div>
		<div class="counter-item" class:depleted={counts.aces === 0}>
			<span class="counter-letter">A</span>
			<span class="counter-num">{counts.aces}</span>
		</div>
		<div class="counter-item" class:depleted={counts.kings === 0}>
			<span class="counter-letter">K</span>
			<span class="counter-num">{counts.kings}</span>
		</div>
	</div>
{/if}

<style>
	.card-counter {
		position: absolute;
		bottom: 12px;
		left: 16px;
		z-index: 50;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 12px;
		border-radius: 14px;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid rgba(230, 211, 163, 0.3);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}

	.counter-title {
		font-size: 0.68rem;
		font-weight: 700;
		color: #9ca3af;
		white-space: nowrap;
		padding-right: 8px;
		border-right: 1px solid rgba(255, 255, 255, 0.15);
	}

	.counter-item {
		display: flex;
		align-items: center;
		gap: 3px;
		transition: opacity 0.3s ease;
	}
	.counter-item.depleted {
		opacity: 0.3;
	}

	.counter-letter {
		font-size: 0.8rem;
		font-weight: 800;
		color: #e6d3a3;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
		text-align: center;
	}
	.counter-letter.dragon { color: #fca5a5; }
	.counter-letter.phoenix { color: #fdba74; }

	.counter-num {
		font-size: 0.8rem;
		font-weight: 700;
		color: #f3f4f6;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 480px) {
		.card-counter {
			gap: 8px;
			padding: 5px 10px;
			bottom: 8px;
			left: 8px;
		}
		.counter-title { font-size: 0.62rem; padding-right: 6px; }
		.counter-letter { font-size: 0.74rem; }
		.counter-num { font-size: 0.72rem; }
	}
</style>
