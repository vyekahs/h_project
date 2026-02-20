<script lang="ts">
	let { game } = $props<{ game: any }>();

	const data = $derived(game.gameEndData);
	const myTeam = $derived(game.myTeam);
	const isWinner = $derived(data?.winner === myTeam);

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

		{#if game.rankingResult}
			<div class="ranking-info">
				<div class="ranking-score">획득 점수: {game.rankingResult.score}</div>
				{#if game.rankingResult.earnedPoints > 0}
					<div class="ranking-points">+{game.rankingResult.earnedPoints}P</div>
				{/if}
			</div>
		{/if}

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
	/* Fonts */
	@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.8);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1200;
		font-family: 'Inter', sans-serif;
	}

	.modal-content {
		background: rgba(20, 20, 20, 0.85);
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 24px;
		padding: 40px 32px;
		text-align: center;
		color: #f3f4f6;
		max-width: 360px;
		width: 85%;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
		animation: modalPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
		position: relative;
		overflow: hidden;
	}

	.modal-content.victory {
		border: 1px solid rgba(251, 191, 36, 0.5);
		box-shadow: 0 0 50px rgba(245, 158, 11, 0.2), inset 0 0 20px rgba(245, 158, 11, 0.1);
	}
	/* Shine effect for victory */
	.modal-content.victory::before {
		content: '';
		position: absolute;
		top: -50%; left: -50%; width: 200%; height: 200%;
		background: radial-gradient(circle, rgba(251, 191, 36, 0.1) 0%, transparent 60%);
		animation: rotateShine 10s linear infinite;
		pointer-events: none;
	}

	.result-icon { 
		font-size: 4rem; 
		margin-bottom: 16px;
		filter: drop-shadow(0 4px 10px rgba(0,0,0,0.3));
		animation: bounce 1s infinite alternate;
	}
	@keyframes bounce { from { transform: translateY(0); } to { transform: translateY(-10px); } }

	h2 {
		margin: 8px 0 4px;
		font-size: 2rem;
		font-weight: 800;
		color: #fff;
		text-shadow: 0 2px 4px rgba(0,0,0,0.5);
		letter-spacing: -0.02em;
	}
	.modal-content.victory h2 {
		color: #fbbf24;
		text-shadow: 0 0 20px rgba(251, 191, 36, 0.5);
	}

	.winner-team {
		font-size: 0.9rem;
		color: #d1d5db;
		margin: 0 0 32px;
		font-weight: 500;
	}

	.final-scores {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 32px;
		margin-bottom: 32px;
		position: relative;
		z-index: 10;
	}
	.final-team {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.team-label {
		font-size: 0.75rem;
		color: #9ca3af;
		text-transform: uppercase;
		margin-bottom: 4px;
		letter-spacing: 0.05em;
	}
	.final-score {
		font-size: 2.5rem;
		font-weight: 800;
		line-height: 1;
		color: #f3f4f6;
		text-shadow: 0 4px 8px rgba(0,0,0,0.3);
	}
	.modal-content.victory .final-team:first-child .final-score {
		color: #fbbf24;
	}
	.final-divider {
		font-size: 1rem;
		color: #6b7280;
		font-weight: 600;
		margin-top: 20px;
	}

	.ranking-info {
		margin-bottom: 24px;
		padding: 14px;
		border-radius: 14px;
		background: rgba(255,255,255,0.08);
		border: 1px solid rgba(255,255,255,0.12);
		position: relative;
		z-index: 10;
	}
	.ranking-score {
		font-size: 0.85rem;
		color: #d1d5db;
	}
	.ranking-points {
		font-size: 1.2rem;
		font-weight: 700;
		color: #fbbf24;
		margin-top: 4px;
		text-shadow: 0 0 12px rgba(251,191,36,0.4);
	}

	.btn-group {
		display: flex;
		flex-direction: column;
		gap: 12px;
		position: relative;
		z-index: 10;
	}

	.btn-ok {
		padding: 14px 32px;
		border-radius: 16px;
		border: none;
		background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
		color: #fff;
		font-weight: 700;
		font-size: 1.1rem;
		cursor: pointer;
		box-shadow: 0 4px 15px rgba(245, 158, 11, 0.4);
		transition: all 0.2s;
	}
	.btn-ok:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(245, 158, 11, 0.6); }

	.btn-review {
		padding: 12px 32px;
		border-radius: 16px;
		border: 1px solid rgba(255,255,255,0.15);
		background: rgba(255,255,255,0.05);
		color: #e5e7eb;
		font-weight: 600;
		font-size: 0.95rem;
		cursor: pointer;
		transition: all 0.2s;
	}
	.btn-review:hover { background: rgba(255,255,255,0.1); }

	.btn-setup {
		padding: 8px 32px;
		border-radius: 12px;
		border: none;
		background: transparent;
		color: #9ca3af;
		font-size: 0.85rem;
		cursor: pointer;
		text-decoration: underline;
		opacity: 0.8;
	}
	.btn-setup:hover { opacity: 1; color: #d1d5db; }

	@keyframes modalPop {
		from { opacity: 0; transform: scale(0.9); }
		to { opacity: 1; transform: scale(1); }
	}
	@keyframes rotateShine {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}
</style>
