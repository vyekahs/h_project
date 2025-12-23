<script lang="ts">
    import type { PageData } from './$types';
    export let data: PageData;

    let trendMode = 'daily'; // 'daily' | 'monthly'

    // Helper for chart scaling
    $: currentTrendData = trendMode === 'daily' ? data.dailyTrend : data.monthlyTrend;
    $: maxTrend = Math.max(...currentTrendData.map((d: any) => parseInt(d.count)), 1);
    $: maxHourly = Math.max(...data.peakHours.map((h: any) => parseInt(h.count)), 1);
    $: maxGame = Math.max(...data.popularGames.map((g: any) => parseInt(g.count)), 1);
</script>

<div class="stats-page">
    <div class="header">
        <h1>📊 통계 대시보드</h1>
    </div>

    <!-- KPI Cards -->
    <div class="kpi-grid">
        <div class="kpi-card">
            <h3>총 방문 수</h3>
            <div class="value">{data.kpis.totalVisits}</div>
            <div class="label">누적 방문 횟수</div>
        </div>
        <div class="kpi-card">
            <h3>등록 멤버</h3>
            <div class="value">{data.kpis.totalMembers}</div>
            <div class="label">총 회원 수</div>
        </div>
        <div class="kpi-card">
            <h3>평균 체류</h3>
            <div class="value">{data.kpis.avgDuration}분</div>
            <div class="label">방문 당 평균 시간</div>
        </div>
    </div>

    <!-- Charts Grid -->
    <div class="charts-grid">
        <!-- Trend Chart -->
        <div class="chart-card wide">
            <div class="chart-header">
                <h3>📅 {trendMode === 'daily' ? '최근 30일' : '최근 12개월'} 방문자 추이</h3>
                <div class="toggle-group">
                    <button class:active={trendMode === 'daily'} on:click={() => trendMode = 'daily'}>일별</button>
                    <button class:active={trendMode === 'monthly'} on:click={() => trendMode = 'monthly'}>월별</button>
                </div>
            </div>
            <div class="chart-container line-chart">
                <svg viewBox="0 0 1000 200" preserveAspectRatio="none">
                    <!-- Grid lines -->
                    <line x1="0" y1="0" x2="1000" y2="0" stroke="#eee" stroke-width="1" />
                    <line x1="0" y1="50" x2="1000" y2="50" stroke="#eee" stroke-width="1" />
                    <line x1="0" y1="100" x2="1000" y2="100" stroke="#eee" stroke-width="1" />
                    <line x1="0" y1="150" x2="1000" y2="150" stroke="#eee" stroke-width="1" />
                    <line x1="0" y1="200" x2="1000" y2="200" stroke="#eee" stroke-width="1" />

                    <!-- Line -->
                    <polyline 
                        points={currentTrendData.map((d, i) => {
                            const x = (i / (currentTrendData.length - 1 || 1)) * 1000;
                            const y = 200 - (parseInt(d.count) / maxTrend) * 200;
                            return `${x},${y}`;
                        }).join(' ')}
                        fill="none" 
                        stroke="#007bff" 
                        stroke-width="2"
                    />

                    <!-- Dots -->
                    {#each currentTrendData as item, i}
                        <!-- svelte-ignore a11y-no-static-element-interactions -->
                        <circle 
                            cx={(i / (currentTrendData.length - 1 || 1)) * 1000} 
                            cy={200 - (parseInt(item.count) / maxTrend) * 200} 
                            r="4" 
                            fill="#007bff"
                            stroke="white"
                            stroke-width="2"
                        >
                            <title>{item.date}: {item.count}명</title>
                        </circle>
                    {/each}
                </svg>
                
                <!-- X-axis Labels -->
                <div class="x-axis">
                    {#each currentTrendData as item, i}
                        {#if currentTrendData.length <= 15 || i % Math.ceil(currentTrendData.length / 10) === 0}
                            <div class="label" style="left: {(i / (currentTrendData.length - 1 || 1)) * 100}%">
                                {trendMode === 'daily' ? item.date.slice(5) : item.date.slice(2)}
                            </div>
                        {/if}
                    {/each}
                </div>

                {#if currentTrendData.length === 0}
                    <div class="empty-chart">데이터가 없습니다.</div>
                {/if}
            </div>
        </div>

        <!-- Peak Hours -->
        <div class="chart-card">
            <h3>⏰ 시간대별 방문 (혼잡도)</h3>
            <div class="chart-container bar-chart">
                {#each data.peakHours as hour}
                    <div class="bar-group" title="{hour.hour}시: {hour.count}명">
                        <div class="bar peak" style="height: {(hour.count / maxHourly) * 100}%"></div>
                        {#if hour.hour % 3 === 0}
                            <div class="x-label">{hour.hour}</div>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>

        <!-- Popular Games -->
        <div class="chart-card">
            <h3>🎲 인기 게임 Top 5</h3>
            <div class="ranking-list">
                {#each data.popularGames as game, i}
                    <div class="rank-item">
                        <div class="rank-info">
                            <span class="rank-num">{i + 1}</span>
                            <span class="game-name">{game.game_name}</span>
                            <span class="play-count">{game.count}회</span>
                        </div>
                        <div class="progress-bg">
                            <div class="progress-bar" style="width: {(game.count / maxGame) * 100}%"></div>
                        </div>
                    </div>
                {/each}
                {#if data.popularGames.length === 0}
                    <div class="empty-chart">데이터가 없습니다.</div>
                {/if}
            </div>
        </div>
    </div>
</div>

<style>
    .stats-page {
        /* Padding is handled by layout */
    }
    .header {
        margin-bottom: 2rem;
    }
    
    /* KPI Grid */
    .kpi-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1.5rem;
        margin-bottom: 2rem;
    }
    .kpi-card {
        background: white;
        padding: 1.5rem;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        text-align: center;
        border: 1px solid #eee;
    }
    .kpi-card h3 {
        margin: 0;
        font-size: 0.9rem;
        color: #666;
        font-weight: normal;
    }
    .kpi-card .value {
        font-size: 2.5rem;
        font-weight: bold;
        color: #333;
        margin: 0.5rem 0;
    }
    .kpi-card .label {
        font-size: 0.8rem;
        color: #999;
    }

    /* Charts Grid */
    .charts-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
        gap: 1.5rem;
    }
    .chart-card {
        background: white;
        padding: 1.5rem;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        border: 1px solid #eee;
    }
    .chart-card.wide {
        grid-column: 1 / -1;
    }
    .chart-card h3 {
        margin: 0;
        font-size: 1.1rem;
        color: #333;
    }
    .chart-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
    }
    .toggle-group {
        display: flex;
        background: #f0f0f0;
        border-radius: 8px;
        padding: 4px;
        gap: 4px;
    }
    .toggle-group button {
        border: none;
        background: transparent;
        padding: 4px 12px;
        border-radius: 6px;
        font-size: 0.85rem;
        cursor: pointer;
        color: #666;
        transition: all 0.2s;
    }
    .toggle-group button.active {
        background: white;
        color: #007bff;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        font-weight: bold;
    }

    /* Line Chart */
    .line-chart {
        position: relative;
        height: 240px; /* Increased height for labels */
        display: block;
        padding-bottom: 30px;
    }
    .line-chart svg {
        width: 100%;
        height: 200px;
        overflow: visible;
    }
    .line-chart circle {
        cursor: pointer;
        transition: r 0.2s;
    }
    .line-chart circle:hover {
        r: 6;
    }
    .x-axis {
        position: relative;
        height: 30px;
        margin-top: 10px;
    }
    .x-axis .label {
        position: absolute;
        transform: translateX(-50%);
        font-size: 0.75rem;
        color: #666;
        white-space: nowrap;
    }

    /* Bar Chart (for Peak Hours) */
    .bar-chart {
        height: 200px;
        display: flex;
        align-items: flex-end;
        gap: 4px;
        padding-bottom: 20px;
    }
    .bar-group {
        flex: 1;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        position: relative;
    }
    .bar {
        background: #007bff;
        border-radius: 4px 4px 0 0;
        transition: height 0.3s ease;
        min-height: 2px;
        opacity: 0.8;
    }
    .bar:hover {
        opacity: 1;
    }
    .bar.peak {
        background: #ff9800;
    }
    .x-label {
        position: absolute;
        bottom: -20px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 0.7rem;
        color: #666;
        white-space: nowrap;
    }

    /* Ranking List */
    .ranking-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .rank-item {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    .rank-info {
        display: flex;
        justify-content: space-between;
        font-size: 0.9rem;
    }
    .rank-num {
        font-weight: bold;
        width: 20px;
        color: #666;
    }
    .game-name {
        flex: 1;
        font-weight: 500;
    }
    .play-count {
        color: #666;
        font-size: 0.8rem;
    }
    .progress-bg {
        height: 8px;
        background: #eee;
        border-radius: 4px;
        overflow: hidden;
    }
    .progress-bar {
        height: 100%;
        background: #4caf50;
        border-radius: 4px;
    }
    .empty-chart {
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #999;
        font-size: 0.9rem;
    }
</style>
