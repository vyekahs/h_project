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
        <h1>🎲 보드게임 동아리 현황판</h1>
        <div class="header-info">
            <p class="last-updated">최근 업데이트: {lastUpdated.toLocaleTimeString()}</p>
            <p class="live-indicator">● 실시간</p>
        </div>
    </header>

    {#if data.notice}
        <div class="notice-banner">
            📢 {data.notice}
        </div>
    {/if}

    <main>
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
                    <p class="empty-state">아직 아무도 없어요. 첫 번째로 오세요!</p>
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
        color: #999;
        text-align: center;
        padding: 2rem;
        background: rgba(255,255,255,0.5);
        border-radius: 8px;
    }
</style>
