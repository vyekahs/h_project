<script lang="ts">
    import type { PageData } from './$types';
    import { trapFocus } from '$lib/actions/modal';
    export let data: PageData;

    // Modal states
    let showDailyTrendModal = false;
    let showTopVisitorsModal = false;
    let showPopularGamesModal = false;
    let showPeakHoursModal = false;

    // Helper for chart scaling
    $: maxGame = Math.max(...data.popularGames.map((g: any) => parseInt(g.count)), 1);
    $: maxDailyTrend = Math.max(...data.dailyTrend.map((d: any) => parseInt(d.count)), 1);
    $: maxHourly = Math.max(...data.peakHours.map((h: any) => parseInt(h.count)), 1);
    $: maxVisitor = Math.max(...(data.userStats?.topVisitors || []).map((v: any) => parseInt(v.visit_count)), 1);
    $: activeRate = data.userStats?.totalUsers > 0 ? Math.round((data.userStats.activeUsers / data.userStats.totalUsers) * 100) : 0;
</script>

<div class="stats-page">
    <div class="header">
        <h1>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:10px; vertical-align:text-bottom;"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            통계
        </h1>
    </div>

    <!-- KPI Cards -->
    <div class="kpi-grid">
        <div class="kpi-card">
            <h3>총 방문 수</h3>
            <div class="value">{data.kpis.totalVisits}</div>
            <div class="label">누적 방문 횟수</div>
        </div>
        <button type="button" class="kpi-card clickable" on:click={() => showTopVisitorsModal = true}>
            <h3>등록 멤버</h3>
            <div class="value">{data.kpis.totalMembers}</div>
            <div class="label">이번 달 방문 Top 10 보기</div>
        </button>
        <div class="kpi-card">
            <h3>평균 체류</h3>
            <div class="value">{data.kpis.avgDuration}분</div>
            <div class="label">1회 방문당 평균 머문 시간</div>
        </div>
    </div>

    <div class="kpi-extra-actions">
        <button type="button" class="btn-drilldown" on:click={() => showPopularGamesModal = true}>
            인기 게임 Top 5 보기
        </button>
    </div>

    <!-- User Stats Section -->
    <div class="section-header">
        <h2>
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:text-bottom;"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            유저 현황
        </h2>
        <span class="section-hint">일반 유저 (관리자 제외)</span>
    </div>

    <div class="kpi-grid kpi-grid-4">
        <button type="button" class="kpi-card clickable" on:click={() => showPeakHoursModal = true}>
            <h3>평균 주간 방문</h3>
            <div class="value">{data.userStats.avgWeeklyVisits}<span class="unit">일</span></div>
            <div class="label">1인당 주 평균 방문 일수 · 시간대별 분포 보기</div>
        </button>
        <button type="button" class="kpi-card clickable" on:click={() => showDailyTrendModal = true}>
            <h3>평균 월간 방문</h3>
            <div class="value">{data.userStats.avgMonthlyVisits}<span class="unit">일</span></div>
            <div class="label">1인당 월 평균 방문 일수 · 최근 30일 추이 보기</div>
        </button>
        <div class="kpi-card">
            <h3>활성 유저</h3>
            <div class="value">{data.userStats.activeUsers}<span class="unit">명</span> <span class="sub-value">({activeRate}%)</span></div>
            <div class="label">30일 내 2일 이상 방문 / 전체 {data.userStats.totalUsers}명</div>
        </div>
        <div class="kpi-card">
            <h3>정기권 보유</h3>
            <div class="value">{data.userStats.seasonPassUsers}<span class="unit">명</span></div>
            <div class="label">현재 유효한 정기권</div>
        </div>
    </div>
</div>

<!-- Peak Hours Modal -->
{#if showPeakHoursModal}
    <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 모달의 Escape(trapFocus)와 닫기 버튼이 담당한다. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div 
        class="modal-backdrop" 
        on:click={() => showPeakHoursModal = false}
        role="button"
        tabindex="-1"
        aria-label="모달 닫기"
    >
        <div class="modal-content" use:trapFocus={() => (showPeakHoursModal = false)} on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true" tabindex="-1">
            <div class="modal-header">
                <h3>시간대별 방문 (혼잡도)</h3>
                <button class="modal-close" on:click={() => showPeakHoursModal = false}>&times;</button>
            </div>
            <div class="modal-body">
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
        </div>
    </div>
{/if}

<!-- Daily Trend Modal (Last 30 days) -->
{#if showDailyTrendModal}
    <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 모달의 Escape(trapFocus)와 닫기 버튼이 담당한다. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div 
        class="modal-backdrop" 
        on:click={() => showDailyTrendModal = false}
        role="button"
        tabindex="-1"
        aria-label="모달 닫기"
    >
        <div class="modal-content" use:trapFocus={() => (showDailyTrendModal = false)} on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true" tabindex="-1">
            <div class="modal-header">
                <h3>최근 30일 방문자 추이</h3>
                <button class="modal-close" on:click={() => showDailyTrendModal = false}>&times;</button>
            </div>
            <div class="modal-body">
                <div class="chart-container line-chart">
                    <svg viewBox="0 0 1000 200" preserveAspectRatio="none">
                        <line x1="0" y1="0" x2="1000" y2="0" stroke="#eee" stroke-width="1" />
                        <line x1="0" y1="50" x2="1000" y2="50" stroke="#eee" stroke-width="1" />
                        <line x1="0" y1="100" x2="1000" y2="100" stroke="#eee" stroke-width="1" />
                        <line x1="0" y1="150" x2="1000" y2="150" stroke="#eee" stroke-width="1" />
                        <line x1="0" y1="200" x2="1000" y2="200" stroke="#eee" stroke-width="1" />
                        <polyline
                            points={data.dailyTrend.map((d, i) => {
                                const x = (i / (data.dailyTrend.length - 1 || 1)) * 1000;
                                const y = 200 - (parseInt(d.count) / maxDailyTrend) * 200;
                                return `${x},${y}`;
                            }).join(' ')}
                            fill="none" stroke="#007bff" stroke-width="2"
                        />
                        {#each data.dailyTrend as item, i}
                            <circle
                                cx={(i / (data.dailyTrend.length - 1 || 1)) * 1000}
                                cy={200 - (parseInt(item.count) / maxDailyTrend) * 200}
                                r="4" fill="#007bff" stroke="white" stroke-width="2"
                            >
                                <title>{item.date}: {item.count}명</title>
                            </circle>
                        {/each}
                    </svg>
                    <div class="x-axis">
                        {#each data.dailyTrend as item, i}
                            {#if data.dailyTrend.length <= 15 || i % Math.ceil(data.dailyTrend.length / 10) === 0}
                                <div class="label" style="left: {(i / (data.dailyTrend.length - 1 || 1)) * 100}%">
                                    {item.date.slice(5)}
                                </div>
                            {/if}
                        {/each}
                    </div>
                    {#if data.dailyTrend.length === 0}
                        <div class="empty-chart">데이터가 없습니다.</div>
                    {/if}
                </div>
            </div>
        </div>
    </div>
{/if}

<!-- Top 10 Visitors Modal -->
{#if showTopVisitorsModal}
    <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 모달의 Escape(trapFocus)와 닫기 버튼이 담당한다. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div 
        class="modal-backdrop" 
        on:click={() => showTopVisitorsModal = false}
        role="button"
        tabindex="-1"
        aria-label="모달 닫기"
    >
        <div class="modal-content" use:trapFocus={() => (showTopVisitorsModal = false)} on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true" tabindex="-1">
            <div class="modal-header">
                <h3>이번 달 Top 10 방문자</h3>
                <button class="modal-close" on:click={() => showTopVisitorsModal = false}>&times;</button>
            </div>
            <div class="modal-body">
                <div class="ranking-list">
                    {#each data.userStats.topVisitors as visitor, i}
                        <div class="rank-item">
                            <div class="rank-info">
                                <span class="rank-num">{i + 1}</span>
                                <span class="game-name">{visitor.name}</span>
                                <span class="play-count">{visitor.visit_count}회</span>
                            </div>
                            <div class="progress-bg">
                                <div class="progress-bar visitor-bar" style="width: {(parseInt(visitor.visit_count) / maxVisitor) * 100}%"></div>
                            </div>
                        </div>
                    {/each}
                    {#if data.userStats.topVisitors.length === 0}
                        <div class="empty-chart">데이터가 없습니다.</div>
                    {/if}
                </div>
            </div>
        </div>
    </div>
{/if}

<!-- Popular Games Modal -->
{#if showPopularGamesModal}
    <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 모달의 Escape(trapFocus)와 닫기 버튼이 담당한다. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div 
        class="modal-backdrop" 
        on:click={() => showPopularGamesModal = false}
        role="button"
        tabindex="-1"
        aria-label="모달 닫기"
    >
        <div class="modal-content" use:trapFocus={() => (showPopularGamesModal = false)} on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true" tabindex="-1">
            <div class="modal-header">
                <h3>인기 게임 Top 5</h3>
                <button class="modal-close" on:click={() => showPopularGamesModal = false}>&times;</button>
            </div>
            <div class="modal-body">
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
{/if}

<style>
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

    /* Bar Chart */
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
        border-radius: 4px 4px 0 0;
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

    /* Section Header */
    .section-header {
        display: flex;
        align-items: baseline;
        gap: 0.75rem;
        margin-top: 3rem;
        margin-bottom: 1.5rem;
    }
    .section-header h2 {
        margin: 0;
        font-size: 1.3rem;
        color: #333;
    }
    .section-hint {
        font-size: 0.8rem;
        color: #999;
    }

    /* 4-column KPI grid */
    .kpi-grid-4 {
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    }
    .kpi-card .unit {
        font-size: 1.2rem;
        font-weight: normal;
        color: #666;
        margin-left: 2px;
    }
    .kpi-card .sub-value {
        font-size: 1rem;
        font-weight: normal;
        color: #999;
    }

    /* Clickable KPI card */
    button.kpi-card {
        font: inherit;
        text-align: left;
        width: 100%;
        color: inherit;
    }
    .kpi-extra-actions {
        margin: 0.75rem 0 0;
    }
    .btn-drilldown {
        min-height: 44px;
        padding: 0 0.9rem;
        border-radius: 6px;
        border: 1px solid var(--border-medium, #ced4da);
        background: var(--bg-primary, #fff);
        color: var(--text-primary, #333);
        font-size: 0.88rem;
        font-weight: 600;
        cursor: pointer;
    }
    .kpi-card.clickable {
        cursor: pointer;
        transition: transform 0.15s, box-shadow 0.15s;
    }
    .kpi-card.clickable:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        border-color: #007bff;
    }

    /* Visitor progress bar color */
    .visitor-bar {
        background: #007bff;
    }

    /* Modal */
    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }
    .modal-content {
        background: white;
        border-radius: 16px;
        width: 90%;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 8px 32px rgba(0,0,0,0.15);
    }
    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1.25rem 1.5rem;
        border-bottom: 1px solid #eee;
    }
    .modal-header h3 {
        margin: 0;
        font-size: 1.1rem;
        color: #333;
    }
    .modal-close {
        background: none;
        border: none;
        font-size: 1.5rem;
        color: #999;
        cursor: pointer;
        padding: 0;
        line-height: 1;
    }
    .modal-close:hover {
        color: #333;
    }
    .modal-body {
        padding: 1.5rem;
    }
</style>
