<script lang="ts">
    import type { PageData } from './$types';

    export let data: PageData;
</script>

<div class="rankings-container">
    <div class="header">
        <h1>🏆 명예의 전당</h1>
    </div>

    <div class="rankings-grid">
        <!-- Overall Rankings -->
        <section class="ranking-card">
            <h2>👑 최다 우승 랭킹</h2>
            <div class="ranking-list">
                {#each data.overallRankings as player, i}
                    <div class="ranking-item">
                        <span class="rank">{i + 1}</span>
                        <span class="name">{player.name}</span>
                        <span class="score">{player.wins}승</span>
                    </div>
                {/each}
                {#if data.overallRankings.length === 0}
                    <div class="empty-state">아직 기록이 없습니다.</div>
                {/if}
            </div>
        </section>

        <!-- Win Rate Rankings -->
        <section class="ranking-card">
            <h2>📈 승률 랭킹 (5판 이상)</h2>
            <div class="ranking-list">
                {#each data.winRateRankings as player, i}
                    <div class="ranking-item">
                        <span class="rank">{i + 1}</span>
                        <span class="name">{player.name}</span>
                        <div class="stats">
                            <span class="rate">{player.win_rate}%</span>
                            <span class="detail">({player.wins}/{player.total_games})</span>
                        </div>
                    </div>
                {/each}
                {#if data.winRateRankings.length === 0}
                    <div class="empty-state">아직 기록이 없습니다.</div>
                {/if}
            </div>
        </section>
    </div>

    <!-- Game Titles -->
    <section class="titles-section">
        <h2>🎖️ 게임별 타이틀 보유자</h2>
        <div class="titles-grid">
            {#each data.gameTitles as title}
                <div class="title-card">
                    <h3>{title.game_name}</h3>
                    <div class="holder">
                        <span class="crown">👑</span>
                        <span class="name">{title.holder_name}</span>
                    </div>
                    <p class="wins">{title.wins}회 우승</p>
                </div>
            {/each}
            {#if data.gameTitles.length === 0}
                <div class="empty-state">아직 타이틀이 없습니다.</div>
            {/if}
        </div>
    </section>
</div>

<style>
    .rankings-container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 2rem 1rem;
    }
    .header {
        text-align: center;
        margin-bottom: 3rem;
    }
    .header h1 {
        margin: 0 0 0.5rem 0;
        color: #333;
        font-size: 2rem;
    }
    .header p {
        color: #666;
    }

    .rankings-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 2rem;
        margin-bottom: 3rem;
    }
    .ranking-card {
        background: white;
        border-radius: 16px;
        padding: 1.5rem;
        box-shadow: 0 4px 15px rgba(0,0,0,0.05);
        border: 1px solid #eee;
    }
    .ranking-card h2 {
        margin: 0 0 1.5rem 0;
        font-size: 1.25rem;
        color: #333;
        text-align: center;
        padding-bottom: 1rem;
        border-bottom: 2px solid #f0f0f0;
    }
    .ranking-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }
    .ranking-item {
        display: flex;
        align-items: center;
        padding: 0.75rem;
        background: #f9f9f9;
        border-radius: 8px;
    }
    .ranking-item:nth-child(1) { background: #fff8e1; border: 1px solid #ffecb3; }
    .ranking-item:nth-child(2) { background: #f5f5f5; border: 1px solid #e0e0e0; }
    .ranking-item:nth-child(3) { background: #fff3e0; border: 1px solid #ffe0b2; }

    .rank {
        font-weight: bold;
        width: 30px;
        color: #666;
    }
    .ranking-item:nth-child(1) .rank { color: #ffc107; font-size: 1.2rem; }
    .ranking-item:nth-child(2) .rank { color: #9e9e9e; font-size: 1.1rem; }
    .ranking-item:nth-child(3) .rank { color: #ff9800; font-size: 1.1rem; }

    .name {
        flex: 1;
        font-weight: 500;
        color: #333;
    }
    .score {
        font-weight: bold;
        color: #007bff;
    }
    .stats {
        text-align: right;
    }
    .rate {
        display: block;
        font-weight: bold;
        color: #007bff;
    }
    .detail {
        font-size: 0.8rem;
        color: #999;
    }

    .titles-section h2 {
        text-align: center;
        margin-bottom: 2rem;
        color: #333;
    }
    .titles-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 1.5rem;
    }
    .title-card {
        background: white;
        padding: 1.5rem;
        border-radius: 12px;
        text-align: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        border: 1px solid #eee;
        transition: transform 0.2s;
    }
    .title-card:hover {
        transform: translateY(-5px);
    }
    .title-card h3 {
        margin: 0 0 1rem 0;
        font-size: 1rem;
        color: #666;
    }
    .holder {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
    }
    .holder .name {
        font-size: 1.1rem;
        font-weight: bold;
        color: #333;
        flex: initial;
    }
    .wins {
        color: #007bff;
        font-size: 0.9rem;
        margin: 0;
    }
    .empty-state {
        text-align: center;
        color: #999;
        padding: 2rem;
    }

    @media (max-width: 600px) {
        .rankings-grid {
            grid-template-columns: 1fr;
        }
    }
</style>
