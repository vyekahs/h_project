<script lang="ts">
    import type { PageData } from './$types';
    import { onMount } from 'svelte';

    export let data: PageData;

    let lastUpdated = new Date();

    onMount(() => {
        const interval = setInterval(() => {
            window.location.reload();
        }, 5 * 60 * 1000); // 5 minutes

        return () => clearInterval(interval);
    });

    interface Attendee {
        id: number;
        name: string;
        arrival_time: string;
        is_playing: boolean;
    }

    interface GameSession {
        id: number;
        game_name: string;
        game_id: number | null;
        end_time: string;
        status: string;
        image_url: string | null;
        min_players: number;
        max_players: number;
        participants: { id: number; name: string }[];
        players: string[];
        scheduled_at: string;
    }

    interface Reservation {
        id: number;
        session_id: number;
        game_id: number;
        attendee_id: number;
        status: string;
        attendee_name: string;
        game_name: string;
    }

    $: attendees = data.attendees as Attendee[];
    $: games = data.games as GameSession[];
    $: scheduledGames = data.scheduledGames as GameSession[];
    $: userReservation = data.userReservation as Reservation | null;
    $: userScheduledGame = data.userScheduledGame as GameSession | null;

    function getTimeRemaining(endTime: string) {
        const end = new Date(endTime).getTime();
        const now = new Date().getTime();
        const diff = end - now;
        if (diff <= 0) return '종료됨';
        const mins = Math.floor(diff / 60000);
        return `${mins}분 남음`;
    }
</script>

<div class="container">
    <header>
        <div class="title-section">
            <h1>🎲현황판</h1>
            <nav class="main-nav">
                <a href="/games" class="nav-link">📚 보드게임 목록</a>
                <!-- <a href="/rankings" class="nav-link">🏆 랭킹</a> -->
            </nav>
        </div>
        <div class="header-info">
            <div class="user-status">
                {#if data.user}
                    <span class="welcome-msg">👋 <strong>{data.user.name}</strong>님</span>
                    <form method="POST" action="/logout" style="display:inline;">
                        <button type="submit" class="btn-logout">로그아웃</button>
                    </form>
                {:else}
                    <a href="/login" class="btn-login">로그인 / 회원가입</a>
                {/if}
            </div>
            <!-- <p class="last-updated">최근 </p> -->
            <div class="status-indicators">
                {#if data.isOpen}
                    <span class="status-badge open">🟢 오픈</span>
                {:else}
                    <span class="status-badge closed">🔴 마감</span>
                {/if}
                <p class="live-indicator">● 실시간 {lastUpdated.toLocaleTimeString()}</p>
            </div>
        </div>
    </header>

    {#if data.notice}
        <div class="notice-banner">
            📢 {data.notice}
        </div>
    {/if}

    <main>
        {#if data.user}
            <section class="my-status-section">
                <h2>🎫 나의 예약 현황</h2>
                <div class="my-status-grid">
                    {#if data.userPenaltyInfo && data.userPenaltyInfo.penalty_points > 0}
                        <div class="status-card penalty-warning">
                            <span class="label">⚠️ 누적 페널티</span>
                            <span class="value">{data.userPenaltyInfo.penalty_points} / 3</span>
                            {#if data.userPenaltyInfo.penalty_points >= 3}
                                <p class="warning-text">예약이 제한되었습니다.</p>
                            {/if}
                        </div>
                    {/if}

                    {#if data.userScheduledGame}
                        <div class="status-card scheduled">
                            <span class="label">📅 참여 예정 게임</span>
                            <span class="value">{data.userScheduledGame.game_name}</span>
                            <span class="sub-value">{new Date(data.userScheduledGame.scheduled_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} 시작</span>
                            <form method="POST" action="?/leaveScheduledGame" on:submit|preventDefault={(e) => {
                                const scheduledAt = new Date(data.userScheduledGame.scheduled_at).getTime();
                                const now = Date.now();
                                if (scheduledAt - now < 10 * 60 * 1000) {
                                    if (confirm('⚠️ 시작 10분 전입니다. 지금 취소하면 페널티가 부여됩니다. 정말 취소하시겠습니까?')) {
                                        e.target.submit();
                                    }
                                } else {
                                    if (confirm('정말 참여를 취소하시겠습니까?')) {
                                        e.target.submit();
                                    }
                                }
                            }}>
                                <input type="hidden" name="sessionId" value={data.userScheduledGame.id}>
                                <button type="submit" class="btn-cancel-small">참여 취소</button>
                            </form>
                        </div>
                    {:else}
                        <div class="status-card">
                            <span class="label">🎮 참여 중인 게임</span>
                            <span class="value">
                                {#if data.attendees.find(a => a.id === data.user.id)?.is_playing}
                                    진행 중인 게임이 있습니다.
                                {:else}
                                    없음
                                {/if}
                            </span>
                        </div>
                    {/if}

                    {#if data.userReservation}
                        <div class="status-card reservation">
                            <span class="label">🎟️ 예약 내역</span>
                            <span class="value">{data.userReservation.game_name}</span>
                            <span class="status-tag {data.userReservation.status}">
                                {data.userReservation.status === 'pending' ? '대기 중' : 
                                 data.userReservation.status === 'waitlisted' ? '대기 순번' : '확정'}
                            </span>
                            <form method="POST" action="?/cancelReservation" on:submit|preventDefault={(e) => {
                                // For reservations, we need to check the session's scheduled_at
                                // But data.userReservation might not have it directly in the same format
                                // Let's assume the user knows the rules or we can fetch it if available
                                if (confirm('정말 예약을 취소하시겠습니까? (시작 10분 전 이내인 경우 페널티가 부여될 수 있습니다)')) {
                                    e.target.submit();
                                }
                            }}>
                                <input type="hidden" name="reservationId" value={data.userReservation.id}>
                                <button type="submit" class="btn-cancel-small">예약 취소</button>
                            </form>
                        </div>
                    {/if}
                </div>
            </section>
        {/if}

        <section class="attendees-section">
            <h2>👥 현재 참여 인원 ({data.attendees.length})</h2>
            <div class="attendee-grid">
                {#each data.attendees as attendee}
                    <div class="attendee-card {attendee.is_playing ? 'playing' : ''}">
                        <span class="name">{attendee.name}</span>
                        <span class="time">
                            {new Date(attendee.arrival_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            {#if attendee.is_playing}
                                <br><span class="playing-text">게임 중</span>
                            {/if}
                        </span>
                    </div>
                {/each}
                {#if data.attendees.length === 0}
                    {#if !data.isOpen}
                        <p class="empty-state closed-state">🌙 금일 마감되었습니다. 오픈 전입니다.</p>
                    {:else}
                        <p class="empty-state">아직 아무도 없어요. 첫 번째로 오세요!</p>
                    {/if}
                {/if}
            </div>
        </section>

        <section class="scheduled-section">
            <div class="section-header">
                <h2>📅 시작 예정 게임 ({data.scheduledGames.length})</h2>
                {#if data.user && !data.userScheduledGame && !data.userReservation}
                    <a href="/reserve/new" class="btn-create-game">+ 게임 생성</a>
                {/if}
            </div>
            <div class="scheduled-grid">
                {#each data.scheduledGames as game}
                    <div class="scheduled-card">
                        <div class="game-info">
                            <h3>{game.game_name}</h3>
                            <span class="start-time">{new Date(game.scheduled_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                        <div class="participants">
                            <span class="count">👥 {game.participants.length} / {game.max_players} (최소 {game.min_players}인)</span>
                            {#if game.participants.length < game.min_players}
                                <span class="min-warning">⚠️ {game.min_players - game.participants.length}명 더 필요 (미달 시 폭파)</span>
                            {/if}
                            <div class="participant-list">
                                {#each game.participants as p}
                                    <span class="p-name">{p.name}</span>
                                {/each}
                            </div>
                        </div>
                        <div class="actions">
                            {#if data.user && !data.userScheduledGame && !data.userReservation}
                                <form method="POST" action="?/joinScheduledGame">
                                    <input type="hidden" name="sessionId" value={game.id}>
                                    <button type="submit" class="btn-join">
                                        {game.participants.length >= game.max_players ? '대기열 합류' : '참여하기'}
                                    </button>
                                </form>
                            {/if}
                        </div>
                    </div>
                {/each}
                {#if data.scheduledGames.length === 0}
                    <p class="empty-state">예정된 게임이 없습니다.</p>
                {/if}
            </div>
        </section>

        <section class="games-section">
            <h2>♟️ 진행 중인 게임 ({data.games.length})</h2>
            <div class="games-grid">
                {#each data.games as game}
                    <div class="game-card">
                        <div class="game-header">
                            <h3>{game.game_name}</h3>
                            <span class="time-remaining">{getTimeRemaining(game.end_time)}</span>
                        </div>
                        <div class="players">
                            {#each game.players as player}
                                <span class="player-tag">{player}</span>
                            {/each}
                        </div>
                        <div class="game-footer">
                            {#if data.user && !data.userScheduledGame && !data.userReservation}
                                <form method="POST" action="?/reserveGame">
                                    <input type="hidden" name="sessionId" value={game.id}>
                                    <button type="submit" class="btn-reserve">다음 판 예약</button>
                                </form>
                            {/if}
                        </div>
                    </div>
                {/each}
                {#if data.games.length === 0}
                    <p class="empty-state">현재 진행 중인 게임이 없습니다.</p>
                {/if}
            </div>
        </section>
    </main>
</div>

<style>
    :global(body) {
        margin: 0;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        background: #f0f2f5;
        color: #333;
    }
    .container {
        max-width: 600px;
        margin: 0 auto;
        padding: 1rem;
    }
    header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
    }
    .header-info {
        text-align: right;
    }
    .last-updated {
        font-size: 0.8rem;
        color: #888;
        margin: 0 0 0.25rem 0;
    }
    h1 {
        font-size: 1.5rem;
        margin: 0;
        color: #1a1a1a;
    }
    .title-section {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .main-nav {
        display: flex;
        gap: 1rem;
    }
    .nav-link {
        text-decoration: none;
        color: #666;
        font-size: 0.9rem;
        font-weight: 500;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        background: #e0e0e0;
        transition: background 0.2s;
    }
    .nav-link:hover {
        background: #d0d0d0;
        color: #333;
    }
    .status-indicators {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.5rem;
    }
    .status-badge {
        font-size: 0.85rem;
        font-weight: bold;
        padding: 0.2rem 0.5rem;
        border-radius: 12px;
    }
    .status-badge.open {
        background: #e8f5e9;
        color: #2e7d32;
        border: 1px solid #c8e6c9;
    }
    .status-badge.closed {
        background: #ffebee;
        color: #c62828;
        border: 1px solid #ffcdd2;
    }
    .live-indicator {
        color: #00c853;
        font-weight: bold;
        font-size: 0.9rem;
        animation: pulse 2s infinite;
        margin: 0;
    }
    @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
    }
    .notice-banner {
        background: #fff3e0;
        color: #e65100;
        padding: 1rem;
        border-radius: 8px;
        margin-bottom: 2rem;
        font-weight: bold;
        text-align: center;
        border: 1px solid #ffe0b2;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    section {
        margin-bottom: 2rem;
    }
    h2 {
        font-size: 1.2rem;
        color: #555;
        margin-bottom: 1rem;
        border-bottom: 2px solid #e0e0e0;
        padding-bottom: 0.5rem;
    }
    .attendee-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
        gap: 1rem;
    }
    .attendee-card {
        background: white;
        padding: 1rem;
        border-radius: 12px;
        text-align: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        display: flex;
        flex-direction: column;
        align-items: center;
    }
    .name {
        font-weight: 600;
        font-size: 0.9rem;
    }
    .time {
        font-size: 0.75rem;
        color: #888;
        margin-top: 0.25rem;
    }
    .attendee-card.playing {
        background: #f5f5f5;
        border: 1px solid #e0e0e0;
        opacity: 0.8;
    }
    .playing-text {
        color: #ff9800;
        font-weight: bold;
        font-size: 0.7rem;
    }
    .games-grid {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .game-card {
        background: white;
        padding: 1.25rem;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        border-left: 5px solid #ff9800;
    }
    .game-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
    }
    .game-header h3 {
        margin: 0;
        font-size: 1.1rem;
    }
    .time-remaining {
        background: #fff3e0;
        color: #ef6c00;
        padding: 0.25rem 0.75rem;
        border-radius: 20px;
        font-size: 0.85rem;
        font-weight: 600;
    }
    .players {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    .player-tag {
        background: #f5f5f5;
        padding: 0.25rem 0.75rem;
        border-radius: 6px;
        font-size: 0.85rem;
        color: #666;
    }
    .empty-state {
        grid-column: 1 / -1;
        color: #999;
        text-align: center;
        padding: 2rem;
        background: rgba(255,255,255,0.5);
        border-radius: 8px;
        width: 100%;
        box-sizing: border-box;
    }
    .closed-state {
        background: #eceff1;
        color: #546e7a;
        font-weight: bold;
        border: 1px solid #cfd8dc;
    }
    .user-status {
        margin-bottom: 0.5rem;
        font-size: 0.9rem;
    }
    .welcome-msg {
        margin-right: 0.5rem;
        color: #333;
    }
    .btn-login {
        text-decoration: none;
        color: #007bff;
        font-weight: bold;
        border: 1px solid #007bff;
        padding: 0.25rem 0.75rem;
        border-radius: 16px;
        transition: all 0.2s;
    }
    .btn-login:hover {
        background: #007bff;
        color: white;
    }
    .btn-logout {
        background: none;
        border: none;
        color: #666;
        text-decoration: underline;
        cursor: pointer;
        font-size: 0.85rem;
        padding: 0;
    }
    .btn-logout:hover {
        color: #333;
    }

    .my-status-section {
        background: #fff;
        padding: 1.5rem;
        border-radius: 16px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        margin-bottom: 2rem;
        border: 1px solid #eee;
    }
    .my-status-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 1rem;
    }
    .status-card {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        padding: 1rem;
        background: #f8f9fa;
        border-radius: 12px;
        border: 1px solid #e9ecef;
    }
    .status-card .label {
        font-size: 0.75rem;
        color: #6c757d;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    .status-card .value {
        font-size: 1rem;
        font-weight: 700;
        color: #212529;
    }
    .status-card .sub-value {
        font-size: 0.8rem;
        color: #6c757d;
    }
    .status-card.penalty-warning {
        background: #fff5f5;
        border-color: #ffe3e3;
    }
    .status-card.penalty-warning .value {
        color: #fa5252;
    }
    .warning-text {
        font-size: 0.7rem;
        color: #fa5252;
        margin: 0.25rem 0 0 0;
        font-weight: 600;
    }
    .status-card.scheduled {
        background: #f3f0ff;
        border-color: #e5dbff;
    }
    .status-card.reservation {
        background: #e7f5ff;
        border-color: #d0ebff;
    }
    .status-tag {
        display: inline-block;
        font-size: 0.7rem;
        font-weight: 700;
        padding: 0.1rem 0.4rem;
        border-radius: 4px;
        margin-top: 0.25rem;
        width: fit-content;
    }
    .status-tag.pending { background: #fff3bf; color: #f08c00; }
    .status-tag.waitlisted { background: #e9ecef; color: #495057; }
    .status-tag.confirmed { background: #d3f9d8; color: #2b8a3e; }

    .btn-cancel-small {
        background: none;
        border: none;
        color: #adb5bd;
        font-size: 0.75rem;
        text-decoration: underline;
        cursor: pointer;
        padding: 0;
        margin-top: 0.5rem;
        text-align: left;
    }
    .btn-cancel-small:hover {
        color: #495057;
    }

    .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
        border-bottom: 2px solid #e0e0e0;
        padding-bottom: 0.5rem;
    }
    .section-header h2 {
        margin-bottom: 0;
        border-bottom: none;
        padding-bottom: 0;
    }
    .btn-create-game {
        text-decoration: none;
        background: #4c6ef5;
        color: white;
        font-size: 0.85rem;
        font-weight: 600;
        padding: 0.4rem 0.8rem;
        border-radius: 8px;
        transition: background 0.2s;
    }
    .btn-create-game:hover {
        background: #364fc7;
    }

    .scheduled-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 1rem;
        margin-bottom: 2rem;
    }
    .scheduled-card {
        background: white;
        padding: 1.25rem;
        border-radius: 16px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        border: 1px solid #eee;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .scheduled-card h3 {
        margin: 0;
        font-size: 1.1rem;
        color: #212529;
    }
    .start-time {
        font-size: 0.9rem;
        font-weight: 700;
        color: #4c6ef5;
        background: #edf2ff;
        padding: 0.2rem 0.5rem;
        border-radius: 6px;
    }
    .game-info {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
    }
    .participants {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .participants .count {
        font-size: 0.85rem;
        font-weight: 600;
        color: #495057;
    }
    .participant-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
    }
    .p-name {
        font-size: 0.8rem;
        background: #f1f3f5;
        color: #495057;
        padding: 0.1rem 0.5rem;
        border-radius: 4px;
    }
    .btn-join {
        width: 100%;
        background: #4c6ef5;
        color: white;
        border: none;
        padding: 0.6rem;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
    }
    .btn-join:hover {
        background: #364fc7;
    }

    .game-footer {
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 1px solid #f1f3f5;
    }
    .btn-reserve {
        width: 100%;
        background: #fab005;
        color: white;
        border: none;
        padding: 0.6rem;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
    }
    .btn-reserve:hover {
        background: #f59f00;
    }
</style>
