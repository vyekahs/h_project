<script lang="ts">
	let { game } = $props<{ game: any }>();

	const players = $derived(game.gameState?.players ?? []);
	const mySeat = $derived(game.gameState?.mySeat ?? -1);
	const playerCount = $derived(players.length);
	const readyStatus = $derived(game.gameState?.readyStatus ?? [false, false, false, false]);
	const isReady = $derived(mySeat >= 0 ? readyStatus[mySeat] : false);
	const readyCount = $derived(
		readyStatus.filter((r: boolean) => r).length
	);
	const allReady = $derived(playerCount === 4 && readyCount === 4);

	function getPlayerBySeat(seatIdx: number) {
		return players.find((p: any) => p.seat === seatIdx) ?? null;
	}

	function handleSeatClick(seatIdx: number) {
		if (seatIdx === mySeat) return;
		game.swapSeat(seatIdx);
	}
</script>

<div class="waiting-room">
	<header class="wr-header">
		<button class="btn-leave" onclick={() => game.leaveRoom()}>
			<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
			나가기
		</button>
		<h1>대기실</h1>
		<div class="room-id">#{game.currentRoomId?.slice(-4) ?? ''}</div>
	</header>

	<div class="wr-content">
		<!-- Team Layout -->
		<div class="teams">
			<!-- Team A -->
			<div class="team team-a">
				<div class="team-label">Team A</div>
				<div class="seats">
					{#each [0, 2] as seatIdx}
						{@const player = getPlayerBySeat(seatIdx)}
						<button
							class="seat"
							class:occupied={player}
							class:me={seatIdx === mySeat}
							class:clickable={seatIdx !== mySeat}
							onclick={() => handleSeatClick(seatIdx)}
							disabled={seatIdx === mySeat}
						>
							{#if player}
								<div class="player-avatar">{player.name.charAt(0)}</div>
								<div class="player-name">{player.name}</div>
								<div class="ready-badge" class:ready={readyStatus[seatIdx]}>
									{readyStatus[seatIdx] ? '준비완료' : '대기중'}
								</div>
							{:else}
								<div class="empty-seat">
									<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a8.38 8.38 0 0 1 13 0"/></svg>
								</div>
								<div class="player-name empty">빈 자리</div>
							{/if}
						</button>
					{/each}
				</div>
			</div>

			<div class="vs">VS</div>

			<!-- Team B -->
			<div class="team team-b">
				<div class="team-label">Team B</div>
				<div class="seats">
					{#each [1, 3] as seatIdx}
						{@const player = getPlayerBySeat(seatIdx)}
						<button
							class="seat"
							class:occupied={player}
							class:me={seatIdx === mySeat}
							class:clickable={seatIdx !== mySeat}
							onclick={() => handleSeatClick(seatIdx)}
							disabled={seatIdx === mySeat}
						>
							{#if player}
								<div class="player-avatar">{player.name.charAt(0)}</div>
								<div class="player-name">{player.name}</div>
								<div class="ready-badge" class:ready={readyStatus[seatIdx]}>
									{readyStatus[seatIdx] ? '준비완료' : '대기중'}
								</div>
							{:else}
								<div class="empty-seat">
									<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a8.38 8.38 0 0 1 13 0"/></svg>
								</div>
								<div class="player-name empty">빈 자리</div>
							{/if}
						</button>
					{/each}
				</div>
			</div>
		</div>

		<div class="swap-section">
			<p class="swap-hint">다른 자리를 눌러 팀을 바꿀 수 있습니다</p>
			{#if playerCount >= 2}
				<button class="btn-shuffle" onclick={() => game.shuffleSeats()}>
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" x2="21" y1="20" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" x2="21" y1="15" y2="21"/><line x1="4" x2="9" y1="4" y2="9"/></svg>
					랜덤 팀
				</button>
			{/if}
		</div>

		<!-- Ready Status & Buttons -->
		<div class="ready-section">
			<p class="ready-status">준비 현황: {readyCount}/4</p>
			{#if allReady}
				<button class="btn-start" onclick={() => game.startGame()}>
					게임 시작
				</button>
			{:else if !isReady}
				<button class="btn-ready" onclick={() => game.setReady()}>
					준비
				</button>
			{:else}
				<button class="btn-unready" onclick={() => game.setUnready()}>
					준비 취소
				</button>
			{/if}
		</div>

		<div class="target-info">
			목표: {game.gameState?.config.targetScore ?? 1000}점
		</div>
	</div>
</div>

<style>
	.waiting-room {
		min-height: 100vh;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}
	.wr-header {
		display: flex;
		align-items: center;
		padding: 12px 16px;
		gap: 12px;
		background: rgba(0,0,0,0.2);
	}
	.wr-header h1 {
		font-size: 1.1rem;
		margin: 0;
		flex: 1;
		text-align: center;
	}
	.btn-leave {
		background: none;
		border: none;
		color: white;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 0.85rem;
		padding: 4px 8px;
	}
	.room-id {
		font-size: 0.8rem;
		opacity: 0.5;
		min-width: 50px;
		text-align: right;
	}

	.wr-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		padding: 24px 16px;
		gap: 32px;
		max-width: 500px;
		margin: 0 auto;
		width: 100%;
	}

	.teams {
		display: flex;
		align-items: center;
		gap: 16px;
		width: 100%;
	}
	.team {
		flex: 1;
		padding: 16px 12px;
		border-radius: 12px;
		text-align: center;
	}
	.team-a { background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); }
	.team-b { background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.3); }
	.team-label {
		font-size: 0.8rem;
		font-weight: 600;
		opacity: 0.7;
		margin-bottom: 12px;
		text-transform: uppercase;
		letter-spacing: 1px;
	}
	.vs {
		font-size: 1.2rem;
		font-weight: 700;
		opacity: 0.4;
	}
	.seats {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.seat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 10px;
		border-radius: 8px;
		background: rgba(255,255,255,0.05);
		border: 1px solid transparent;
		color: white;
		cursor: default;
		width: 100%;
		font-family: inherit;
		transition: background 0.15s, border-color 0.15s;
	}
	.seat.clickable {
		cursor: pointer;
	}
	.seat.clickable:hover {
		background: rgba(255,255,255,0.12);
		border-color: rgba(255,255,255,0.2);
	}
	.seat.me {
		border: 1px solid rgba(245,158,11,0.5);
		background: rgba(245,158,11,0.1);
	}
	.player-avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: rgba(255,255,255,0.15);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		font-size: 1.1rem;
	}
	.player-name {
		font-size: 0.85rem;
		font-weight: 500;
	}
	.player-name.empty {
		opacity: 0.3;
		font-size: 0.8rem;
	}
	.empty-seat {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.ready-badge {
		font-size: 0.7rem;
		padding: 2px 8px;
		border-radius: 4px;
		background: rgba(255,255,255,0.1);
		opacity: 0.5;
	}
	.ready-badge.ready {
		background: rgba(34,197,94,0.3);
		color: #4ade80;
		opacity: 1;
	}

	.ready-section {
		text-align: center;
	}
	.ready-status {
		opacity: 0.6;
		font-size: 0.9rem;
		margin: 0 0 12px;
	}
	.btn-start {
		padding: 14px 48px;
		border-radius: 12px;
		border: none;
		background: #f59e0b;
		color: #000;
		font-size: 1.1rem;
		font-weight: 700;
		cursor: pointer;
	}
	.btn-ready {
		padding: 14px 48px;
		border-radius: 12px;
		border: none;
		background: #22c55e;
		color: white;
		font-size: 1.1rem;
		font-weight: 700;
		cursor: pointer;
	}
	.btn-unready {
		padding: 14px 48px;
		border-radius: 12px;
		border: 1px solid rgba(255,255,255,0.3);
		background: rgba(255,255,255,0.1);
		color: white;
		font-size: 1rem;
		font-weight: 500;
		cursor: pointer;
	}

	.swap-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}
	.swap-hint {
		font-size: 0.75rem;
		opacity: 0.4;
		text-align: center;
		margin: 0;
	}
	.btn-shuffle {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 16px;
		border-radius: 8px;
		border: 1px solid rgba(255,255,255,0.2);
		background: rgba(255,255,255,0.08);
		color: white;
		font-size: 0.8rem;
		cursor: pointer;
		font-family: inherit;
		transition: background 0.15s;
	}
	.btn-shuffle:hover {
		background: rgba(255,255,255,0.15);
	}

	.target-info {
		font-size: 0.8rem;
		opacity: 0.4;
	}
</style>
