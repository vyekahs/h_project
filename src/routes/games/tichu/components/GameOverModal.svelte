<script lang="ts">
	import { onMount } from 'svelte';

	let { game } = $props<{ game: any }>();

	const data = $derived(game.gameEndData);
	const myTeam = $derived(game.myTeam);
	const isWinner = $derived(data?.winner === myTeam);

	let saved = $state(false);

	onMount(() => {
		saveResult();
	});

	async function saveResult() {
		if (saved || !data) return;
		try {
			await fetch('/api/tichu/result', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					winner: data.winner,
					scoreA: data.scoreA,
					scoreB: data.scoreB,
					isAiGame: true,
					playerData: [{ id: -1, team: 'A' }]
				})
			});
			saved = true;
		} catch {
			// silently fail — result saving is best-effort
		}
	}

	function newGame() {
		game.showGameOverModal = false;
		game.startGame();
	}

	function goToSetup() {
		game.showGameOverModal = false;
		game.backToSetup();
	}

	function dismiss() {
		game.showGameOverModal = false;
	}
</script>

<div class="modal-overlay">
	<div class="modal-content" class:victory={isWinner}>
		<div class="result-icon">{isWinner ? '🏆' : '😢'}</div>
		<h2>{isWinner ? '승리!' : '패배'}</h2>
		<p class="winner-team">{isWinner ? '우리 팀 승리!' : '상대 팀 승리'}</p>

		<div class="final-scores">
			<div class="final-team">
				<span class="team-label">우리 팀</span>
				<span class="final-score">{data?.scoreA ?? 0}</span>
			</div>
			<div class="final-divider">vs</div>
			<div class="final-team">
				<span class="team-label">상대 팀</span>
				<span class="final-score">{data?.scoreB ?? 0}</span>
			</div>
		</div>

		<div class="btn-group">
			<button class="btn-review" onclick={dismiss}>
				결과 확인
			</button>
			<button class="btn-ok" onclick={newGame}>
				새 게임
			</button>
			<button class="btn-setup" onclick={goToSetup}>
				설정으로
			</button>
		</div>
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
		z-index: 1200;
	}
	.modal-content {
		background: #1e293b;
		border-radius: 16px;
		padding: 32px;
		text-align: center;
		color: white;
		max-width: 340px;
		width: 85%;
	}
	.modal-content.victory {
		border: 2px solid #f59e0b;
		box-shadow: 0 0 40px rgba(245,158,11,0.3);
	}
	.result-icon { font-size: 3rem; }
	h2 {
		margin: 8px 0 4px;
		font-size: 1.5rem;
	}
	.winner-team {
		font-size: 0.85rem;
		opacity: 0.6;
		margin: 0 0 24px;
	}

	.final-scores {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 20px;
		margin-bottom: 24px;
	}
	.final-team {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.team-label {
		font-size: 0.75rem;
		opacity: 0.5;
		text-transform: uppercase;
	}
	.final-score {
		font-size: 2rem;
		font-weight: 700;
	}
	.final-divider {
		font-size: 0.85rem;
		opacity: 0.3;
	}

	.btn-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.btn-review {
		padding: 10px 32px;
		border-radius: 10px;
		border: 1px solid rgba(255,255,255,0.2);
		background: rgba(255,255,255,0.1);
		color: white;
		font-weight: 500;
		font-size: 0.9rem;
		cursor: pointer;
		width: 100%;
	}
	.btn-ok {
		padding: 12px 32px;
		border-radius: 10px;
		border: none;
		background: #f59e0b;
		color: #000;
		font-weight: 600;
		font-size: 1rem;
		cursor: pointer;
		width: 100%;
	}
	.btn-setup {
		padding: 10px 32px;
		border-radius: 10px;
		border: 1px solid rgba(255,255,255,0.2);
		background: transparent;
		color: rgba(255,255,255,0.7);
		font-size: 0.85rem;
		cursor: pointer;
		width: 100%;
	}
</style>
