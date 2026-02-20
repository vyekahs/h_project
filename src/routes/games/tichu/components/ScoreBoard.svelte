<script lang="ts">
	let { game } = $props<{ game: any }>();

	function gs() { void game.stateVersion; return game.gameState; }

	const result = $derived(game.roundResult);
	const completedRounds = $derived.by(() => gs()?.completedRounds ?? []);

	function close() {
		game.startNextRound();
	}
</script>

<div class="modal-overlay" onclick={close}>
	<div class="modal-content" onclick={(e: Event) => e.stopPropagation()}>
		<h2>라운드 {result?.roundNumber} 결과</h2>

		{#if result}
			<!-- Round Score -->
			<div class="round-score">
				<div class="team-score team-a">
					<span class="team-label">우리 팀</span>
					<span class="score" class:positive={result.teamAScore > 0} class:negative={result.teamAScore < 0}>
						{result.teamAScore > 0 ? '+' : ''}{result.teamAScore}
					</span>
				</div>
				<div class="team-score team-b">
					<span class="team-label">상대 팀</span>
					<span class="score" class:positive={result.teamBScore > 0} class:negative={result.teamBScore < 0}>
						{result.teamBScore > 0 ? '+' : ''}{result.teamBScore}
					</span>
				</div>
			</div>

			<!-- Special events -->
			{#if result.oneTwo}
				<div class="event one-two">원투! {result.oneTwo === 'A' ? '우리 팀' : '상대 팀'} (+200)</div>
			{/if}
			{#each result.grandTichuDeclarations as gt}
				<div class="event" class:success={gt.success} class:fail={!gt.success}>
					{gs()?.players[gt.seat]?.name ?? `P${gt.seat + 1}`} 그랜드 티츄 {gt.success ? '성공! (+200)' : '실패 (-200)'}
				</div>
			{/each}
			{#each result.smallTichuDeclarations as st}
				<div class="event" class:success={st.success} class:fail={!st.success}>
					{gs()?.players[st.seat]?.name ?? `P${st.seat + 1}`} 스몰 티츄 {st.success ? '성공! (+100)' : '실패 (-100)'}
				</div>
			{/each}
		{/if}

		<!-- Cumulative -->
		<div class="cumulative">
			<h3>누적 점수</h3>
			<div class="cumulative-scores">
				<div class="cum-team">
					<span class="team-label">우리 팀</span>
					<span class="cum-score">{gs()?.cumulativeScoreA ?? 0}</span>
				</div>
				<div class="cum-divider">:</div>
				<div class="cum-team">
					<span class="team-label">상대 팀</span>
					<span class="cum-score">{gs()?.cumulativeScoreB ?? 0}</span>
				</div>
			</div>
		</div>

		<!-- History -->
		{#if completedRounds.length > 1}
			<div class="history">
				<h4>라운드 히스토리</h4>
				<table>
					<thead>
						<tr><th>R</th><th>우리</th><th>상대</th></tr>
					</thead>
					<tbody>
						{#each completedRounds as round}
							<tr>
								<td>{round.roundNumber}</td>
								<td class:positive={round.teamAScore > 0} class:negative={round.teamAScore < 0}>{round.teamAScore}</td>
								<td class:positive={round.teamBScore > 0} class:negative={round.teamBScore < 0}>{round.teamBScore}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		<button class="btn-ok" onclick={close}>확인</button>
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
		background: rgba(20, 20, 20, 0.85); /* Deep Dark Glass */
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		border: 1px solid rgba(251, 191, 36, 0.3); /* Gold Border */
		border-radius: 24px;
		padding: 28px;
		max-width: 400px;
		width: 90%;
		text-align: center;
		color: #f3f4f6;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1);
		animation: modalPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	h2 {
		margin: 0 0 20px;
		font-size: 1.3rem;
		color: #fbbf24; /* Imperial Gold */
		font-weight: 800;
		text-shadow: 0 2px 4px rgba(0,0,0,0.3);
		letter-spacing: -0.02em;
	}

	.round-score {
		display: flex;
		justify-content: center;
		gap: 32px;
		margin-bottom: 20px;
		padding: 16px;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 16px;
		border: 1px solid rgba(255, 255, 255, 0.05);
	}

	.team-score {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
	}

	.team-label {
		font-size: 0.75rem;
		color: #9ca3af;
		text-transform: uppercase;
		font-weight: 600;
		letter-spacing: 0.05em;
	}

	.score {
		font-size: 2.2rem;
		font-weight: 800;
		line-height: 1;
		font-variant-numeric: tabular-nums;
		text-shadow: 0 2px 4px rgba(0,0,0,0.3);
	}
	.positive { color: #4ade80; } /* Brighter Green */
	.negative { color: #f87171; } /* Brighter Red */

	.event {
		font-size: 0.85rem;
		padding: 8px 16px;
		margin: 6px 0;
		border-radius: 12px;
		font-weight: 500;
		backdrop-filter: blur(4px);
	}
	.one-two { 
		background: rgba(245, 158, 11, 0.15); 
		color: #fbbf24; 
		border: 1px solid rgba(245, 158, 11, 0.3);
	}
	.success { 
		background: rgba(34, 197, 94, 0.15); 
		color: #4ade80; 
		border: 1px solid rgba(34, 197, 94, 0.3);
	}
	.fail { 
		background: rgba(239, 68, 68, 0.15); 
		color: #f87171; 
		border: 1px solid rgba(239, 68, 68, 0.3);
	}

	.cumulative {
		margin-top: 24px;
		padding-top: 20px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}
	.cumulative h3 {
		margin: 0 0 12px;
		font-size: 0.9rem;
		color: #d1d5db;
		font-weight: 600;
	}
	.cumulative-scores {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 24px;
	}
	.cum-team {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.cum-score {
		font-size: 1.6rem;
		font-weight: 700;
		color: #f3f4f6;
	}
	.cum-divider {
		font-size: 1.2rem;
		color: #6b7280;
		margin-top: 18px;
	}

	.history {
		margin-top: 20px;
		max-height: 150px;
		overflow-y: auto;
	}
	.history h4 {
		font-size: 0.8rem;
		color: #9ca3af;
		margin: 0 0 8px;
	}
	table {
		width: 100%;
		font-size: 0.85rem;
		border-collapse: separate;
		border-spacing: 0 4px;
	}
	th {
		color: #6b7280;
		font-size: 0.7rem;
		font-weight: 600;
		padding-bottom: 4px;
	}
	td {
		padding: 6px 8px;
		text-align: center;
		background: rgba(255, 255, 255, 0.03);
		color: #d1d5db;
	}
	td:first-child { border-top-left-radius: 6px; border-bottom-left-radius: 6px; color: #9ca3af; }
	td:last-child { border-top-right-radius: 6px; border-bottom-right-radius: 6px; }

	.btn-ok {
		margin-top: 24px;
		padding: 12px 48px;
		border-radius: 16px;
		border: 1px solid rgba(255,255,255,0.2);
		background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
		color: #fff;
		font-weight: 700;
		font-size: 1rem;
		cursor: pointer;
		box-shadow: 0 4px 15px rgba(245, 158, 11, 0.4);
		transition: transform 0.2s, box-shadow 0.2s;
		text-shadow: 0 1px 1px rgba(0,0,0,0.2);
	}
	.btn-ok:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 25px rgba(245, 158, 11, 0.6);
	}
	.btn-ok:active {
		transform: translateY(0);
	}

	@keyframes modalPop {
		from { opacity: 0; transform: scale(0.95); }
		to { opacity: 1; transform: scale(1); }
	}
</style>
