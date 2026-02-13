<script lang="ts">
	import { goto } from '$app/navigation';

	let { game } = $props<{ game: any }>();
	let targetScore = $state(1000);
	let refreshing = $state(false);

	function refresh() {
		refreshing = true;
		game.listRooms();
		setTimeout(() => refreshing = false, 500);
	}

	function createRoom() {
		game.createRoom(targetScore);
	}

	function joinRoom(roomId: string) {
		game.joinRoom(roomId);
	}
</script>

<div class="lobby">
	<header class="lobby-header">
		<button class="btn-back" onclick={() => goto('/games')}>
			<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
		</button>
		<h1>티츄</h1>
		<div class="spacer"></div>
	</header>

	<div class="lobby-content">
		<!-- Create Room -->
		<section class="create-section">
			<h2>새 게임 만들기</h2>
			<div class="create-form">
				<label class="score-label">
					목표 점수
					<select bind:value={targetScore}>
						<option value={500}>500점</option>
						<option value={700}>700점</option>
						<option value={1000}>1000점 (기본)</option>
					</select>
				</label>
				<button class="btn-create" onclick={createRoom} disabled={!game.isConnected}>
					방 만들기
				</button>
			</div>
		</section>

		<!-- Room List -->
		<section class="rooms-section">
			<div class="rooms-header">
				<h2>게임 목록</h2>
				<button class="btn-refresh" onclick={refresh} disabled={refreshing || !game.isConnected}>
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class:spinning={refreshing}><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
				</button>
			</div>

			{#if game.rooms.length === 0}
				<div class="empty-rooms">
					<p>대기 중인 방이 없습니다</p>
					<p class="sub">새 게임을 만들어 보세요!</p>
				</div>
			{:else}
				<div class="room-list">
					{#each game.rooms as room (room.roomId)}
						<button
							class="room-card"
							onclick={() => joinRoom(room.roomId)}
							disabled={room.playerCount >= 4 || !game.isConnected}
						>
							<div class="room-info">
								<div class="room-players">
									{#each room.players as p}
										<span class="player-tag team-{p.team}">{p.name}</span>
									{/each}
									{#each Array(4 - room.playerCount) as _}
										<span class="player-tag empty">빈 자리</span>
									{/each}
								</div>
								<div class="room-meta">
									<span>{room.playerCount}/4</span>
									<span>목표 {room.config.targetScore}점</span>
								</div>
							</div>
							<div class="room-action">
								{#if room.playerCount >= 4}
									만석
								{:else}
									참여
								{/if}
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</section>
	</div>
</div>

<style>
	.lobby {
		min-height: 100vh;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}
	.lobby-header {
		display: flex;
		align-items: center;
		padding: 12px 16px;
		gap: 12px;
		background: rgba(0,0,0,0.2);
	}
	.lobby-header h1 {
		font-size: 1.2rem;
		margin: 0;
		flex: 1;
	}
	.spacer { width: 32px; }
	.btn-back {
		background: none;
		border: none;
		color: white;
		cursor: pointer;
		padding: 4px;
		display: flex;
	}

	.lobby-content {
		flex: 1;
		padding: 16px;
		max-width: 500px;
		margin: 0 auto;
		width: 100%;
	}

	.create-section {
		margin-bottom: 24px;
	}
	.create-section h2 {
		font-size: 1rem;
		margin: 0 0 12px;
		opacity: 0.8;
	}
	.create-form {
		display: flex;
		gap: 12px;
		align-items: flex-end;
	}
	.score-label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 0.8rem;
		opacity: 0.7;
		flex: 1;
	}
	.score-label select {
		padding: 10px 12px;
		border-radius: 8px;
		border: 1px solid rgba(255,255,255,0.2);
		background: rgba(255,255,255,0.1);
		color: white;
		font-size: 0.9rem;
	}
	.btn-create {
		padding: 10px 20px;
		border-radius: 8px;
		border: none;
		background: #f59e0b;
		color: #000;
		font-weight: 600;
		font-size: 0.9rem;
		cursor: pointer;
		white-space: nowrap;
	}
	.btn-create:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.rooms-section h2 {
		font-size: 1rem;
		margin: 0;
		opacity: 0.8;
	}
	.rooms-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
	}
	.btn-refresh {
		background: none;
		border: none;
		color: white;
		cursor: pointer;
		padding: 4px;
		display: flex;
		opacity: 0.7;
	}
	.btn-refresh:hover { opacity: 1; }
	.spinning { animation: spin 0.5s linear; }
	@keyframes spin { to { transform: rotate(360deg); } }

	.empty-rooms {
		text-align: center;
		padding: 2rem 1rem;
		opacity: 0.6;
	}
	.empty-rooms p { margin: 0; }
	.empty-rooms .sub { font-size: 0.85rem; margin-top: 4px; }

	.room-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.room-card {
		display: flex;
		align-items: center;
		padding: 12px 16px;
		background: rgba(255,255,255,0.1);
		border: 1px solid rgba(255,255,255,0.15);
		border-radius: 10px;
		cursor: pointer;
		color: white;
		text-align: left;
		width: 100%;
	}
	.room-card:hover:not(:disabled) {
		background: rgba(255,255,255,0.15);
	}
	.room-card:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.room-info {
		flex: 1;
	}
	.room-players {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-bottom: 6px;
	}
	.player-tag {
		padding: 2px 8px;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 500;
	}
	.player-tag.team-A { background: rgba(239,68,68,0.3); }
	.player-tag.team-B { background: rgba(59,130,246,0.3); }
	.player-tag.empty {
		background: rgba(255,255,255,0.1);
		opacity: 0.5;
		border: 1px dashed rgba(255,255,255,0.2);
	}
	.room-meta {
		display: flex;
		gap: 12px;
		font-size: 0.75rem;
		opacity: 0.6;
	}
	.room-action {
		font-size: 0.85rem;
		font-weight: 600;
		padding: 6px 14px;
		border-radius: 6px;
		background: rgba(34,197,94,0.3);
	}
</style>
