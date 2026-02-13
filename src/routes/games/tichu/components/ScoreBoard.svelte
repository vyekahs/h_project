<script lang="ts">
	let { game } = $props<{ game: any }>();

	const result = $derived(game.roundResult);
	const completedRounds = $derived(game.gameState?.completedRounds ?? []);

	function close() {
		game.showRoundEndModal = false;
	}
</script>

<div class="modal-overlay" onclick={close}>
	<div class="modal-content" onclick={(e: Event) => e.stopPropagation()}>
		<h2>라운드 {result?.roundNumber} 결과</h2>

		{#if result}
			<!-- Round Score -->
			<div class="round-score">
				<div class="team-score team-a">
					<span class="team-label">Team A</span>
					<span class="score" class:positive={result.teamAScore > 0} class:negative={result.teamAScore < 0}>
						{result.teamAScore > 0 ? '+' : ''}{result.teamAScore}
					</span>
				</div>
				<div class="team-score team-b">
					<span class="team-label">Team B</span>
					<span class="score" class:positive={result.teamBScore > 0} class:negative={result.teamBScore < 0}>
						{result.teamBScore > 0 ? '+' : ''}{result.teamBScore}
					</span>
				</div>
			</div>

			<!-- Special events -->
			{#if result.oneTwo}
				<div class="event one-two">원투! Team {result.oneTwo} (+200)</div>
			{/if}
			{#each result.grandTichuDeclarations as gt}
				<div class="event" class:success={gt.success} class:fail={!gt.success}>
					{game.gameState?.players[gt.seat]?.name ?? `P${gt.seat + 1}`} 그랜드 티츄 {gt.success ? '성공! (+200)' : '실패 (-200)'}
				</div>
			{/each}
			{#each result.smallTichuDeclarations as st}
				<div class="event" class:success={st.success} class:fail={!st.success}>
					{game.gameState?.players[st.seat]?.name ?? `P${st.seat + 1}`} 스몰 티츄 {st.success ? '성공! (+100)' : '실패 (-100)'}
				</div>
			{/each}
		{/if}

		<!-- Cumulative -->
		<div class="cumulative">
			<h3>누적 점수</h3>
			<div class="cumulative-scores">
				<div class="cum-team">
					<span class="team-label">Team A</span>
					<span class="cum-score">{game.gameState?.cumulativeScoreA ?? 0}</span>
				</div>
				<div class="cum-divider">:</div>
				<div class="cum-team">
					<span class="team-label">Team B</span>
					<span class="cum-score">{game.gameState?.cumulativeScoreB ?? 0}</span>
				</div>
			</div>
		</div>

		<!-- History -->
		{#if completedRounds.length > 1}
			<div class="history">
				<h4>라운드 히스토리</h4>
				<table>
					<thead>
						<tr><th>R</th><th>A</th><th>B</th></tr>
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
		max-width: 360px;
		width: 90%;
		text-align: center;
		color: white;
	}
	h2 {
		margin: 0 0 16px;
		font-size: 1.1rem;
	}

	.round-score {
		display: flex;
		justify-content: center;
		gap: 24px;
		margin-bottom: 12px;
	}
	.team-score {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}
	.team-label {
		font-size: 0.75rem;
		opacity: 0.6;
		text-transform: uppercase;
	}
	.score {
		font-size: 1.8rem;
		font-weight: 700;
	}
	.positive { color: #4ade80; }
	.negative { color: #f87171; }

	.event {
		font-size: 0.85rem;
		padding: 4px 12px;
		margin: 4px 0;
		border-radius: 4px;
	}
	.one-two { background: rgba(245,158,11,0.2); color: #fbbf24; }
	.success { background: rgba(34,197,94,0.2); color: #4ade80; }
	.fail { background: rgba(239,68,68,0.2); color: #f87171; }

	.cumulative {
		margin-top: 16px;
		padding-top: 16px;
		border-top: 1px solid rgba(255,255,255,0.1);
	}
	.cumulative h3 {
		margin: 0 0 8px;
		font-size: 0.85rem;
		opacity: 0.7;
	}
	.cumulative-scores {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 16px;
	}
	.cum-team {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.cum-score {
		font-size: 1.4rem;
		font-weight: 700;
	}
	.cum-divider {
		font-size: 1.2rem;
		opacity: 0.4;
	}

	.history {
		margin-top: 12px;
	}
	.history h4 {
		font-size: 0.75rem;
		opacity: 0.5;
		margin: 0 0 4px;
	}
	table {
		width: 100%;
		font-size: 0.8rem;
		border-collapse: collapse;
	}
	th, td {
		padding: 3px 8px;
		text-align: center;
	}
	th { opacity: 0.5; font-size: 0.7rem; }

	.btn-ok {
		margin-top: 16px;
		padding: 10px 32px;
		border-radius: 8px;
		border: none;
		background: #3b82f6;
		color: white;
		font-weight: 600;
		cursor: pointer;
	}
</style>
