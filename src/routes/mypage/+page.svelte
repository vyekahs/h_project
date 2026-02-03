<script lang="ts">
    import { invalidateAll } from '$app/navigation';
    import { onMount } from 'svelte';
    import type { PageData } from './$types';
    export let data: PageData;

    onMount(() => {
        if(data.user) {
            loadTitles();
        }
    });

    let selectedYear: string = 'all';
    let selectedMonth: string = 'all';

    // Extract available years from history
    $: availableYears = data.history 
        ? [...new Set(data.history.map((h: any) => new Date(h.end_time).getFullYear().toString()))].sort((a: any, b: any) => b.localeCompare(a))
        : [];

    // Filter history
    $: filteredHistory = (data.history || []).filter((game: any) => {
        const date = new Date(game.end_time);
        const yearMatch = selectedYear === 'all' || date.getFullYear().toString() === selectedYear;
        const monthMatch = selectedMonth === 'all' || (date.getMonth() + 1).toString() === selectedMonth;
        return yearMatch && monthMatch;
    });
    // Dynamic Stats Analysis
    $: filteredTotalGames = filteredHistory.length;
    $: filteredTotalWins = filteredHistory.filter((g: any) => g.is_winner).length;

    // Top Opponents
    $: topOpponents = (() => {
        const counts: Record<string, number> = {};
        for (const game of filteredHistory) {
            if (game.opponents) {
                for (const opp of game.opponents) {
                    counts[opp.name] = (counts[opp.name] || 0) + 1;
                }
            }
        }
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
    })();

    // Top Games
    $: topGames = (() => {
        const counts: Record<string, number> = {};
        for (const game of filteredHistory) {
            counts[game.game_name] = (counts[game.game_name] || 0) + 1;
        }
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
    })();
    
    // ... toggle functions ...
    let isYearOpen = false;
    let isMonthOpen = false;

    // Title Management
    interface Title {
        id: number;
        title_name: string;
        description: string;
        is_equipped: boolean;
    }
    let myTitles: Title[] = [];
    let loadingTitles = true;

    async function loadTitles() {
        loadingTitles = true;
        try {
            const res = await fetch('/api/user/titles');
            if(res.ok) {
                myTitles = await res.json();
            }
        } catch(e) {
            console.error(e);
        } finally {
            loadingTitles = false;
        }
    }

    let equippingId: number | null = null;

    async function equipTitle(titleId: number) {
        if (equippingId) return; // Prevent double clicks
        // Removed native confirm for smoother UX
        equippingId = titleId;
        
        try {
            const res = await fetch('/api/user/titles/equip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ titleId })
            });
            if (res.ok) {
                await loadTitles(); 
                await invalidateAll(); 
            } else {
                // Silent fail or toast? For now just log
                console.error('Failed to equip');
            }
        } catch(e) {
            console.error(e);
        } finally {
            equippingId = null;
        }
    }

    // Load titles on mount
    
    function toggleYear() {
        isYearOpen = !isYearOpen;
        isMonthOpen = false;
    }

    function toggleMonth() {
        isMonthOpen = !isMonthOpen;
        isYearOpen = false;
    }

    function selectYear(year: any) {
        selectedYear = year;
        isYearOpen = false;
        visibleCount = 10; // Reset pagination
    }

    function selectMonth(month: any) {
        selectedMonth = month;
        isMonthOpen = false;
        visibleCount = 10; // Reset pagination
    }

    function closeDropdowns() {
        isYearOpen = false;
        isMonthOpen = false;
    }
    
    // Pagination
    let visibleCount = 10;
    
    function loadMore() {
        visibleCount += 10;
    }
</script>

<svelte:window on:click={() => closeDropdowns()} />

<div class="mypage-container">
    <header class="page-header">
        <h1>마이페이지</h1>
        {#if data.user}
            <div class="user-simple">
                <span class="user-name">
                    {#if data.user.title}
                        <span class="user-title">[{data.user.title.title_name}]</span>
                    {/if}
                    <strong>{data.user.name}</strong> 님
                </span>
                
                {#if data.user.is_admin}
                    <a href="/admin/games" class="btn-admin-link">⚙️</a>
                {/if}

                <form method="POST" action="/logout">
                    <button type="submit" class="btn-logout-text">로그아웃</button>
                </form>
            </div>
        {:else}
             <a href="/login" class="btn-login-text">로그인</a>
        {/if}
    </header>

    {#if data.user}
        <div class="stats-overview">
            <div class="stats-row primary">
                <div class="stat-card">
                    <span class="stat-value">{filteredTotalGames}</span>
                    <span class="stat-label">플레이</span>
                </div>
                <div class="stat-card highlight">
                    <span class="stat-value">{filteredTotalWins}</span>
                    <span class="stat-label">승리</span>
                </div>
            </div>
            
            {#if filteredTotalGames > 0}
                <div class="analysis-row">
                    <!-- Top Opponents -->
                    <div class="analysis-card">
                        <h4>자주 만난 친구</h4>
                        <ul>
                            {#each topOpponents as [name, count]}
                                <li>
                                    <span class="name">{name}</span>
                                    <span class="count">{count}회</span>
                                </li>
                            {:else}
                                <li class="empty">-</li>
                            {/each}
                        </ul>
                    </div>

                    <!-- Top Games -->
                    <div class="analysis-card">
                        <h4>🎲 최애 게임</h4>
                         <ul>
                            {#each topGames as [game, count]}
                                <li>
                                    <span class="name text-truncate" title={game}>{game}</span>
                                    <span class="count">{count}회</span>
                                </li>
                            {:else}
                                <li class="empty">-</li>
                            {/each}
                        </ul>
                </div>
                </div>
            {/if}
        </div>

        <!-- My Titles Section -->
        <div class="titles-section">
            <h3>🎖 나의 칭호</h3>
            {#if loadingTitles}
                <div class="loading">불러오는 중...</div>
            {:else if myTitles.length === 0}
                <div class="empty-titles">보유한 칭호가 없습니다. 게임을 플레이하고 칭호를 획득해보세요!</div>
            {:else}
                <div class="titles-grid">
                    {#each myTitles as title}
                        <div class="title-card" class:equipped={title.is_equipped}>
                            <div class="title-header">
                                <span class="title-name">{title.title_name}</span>
                                {#if title.is_equipped}
                                    <span class="badge-equipped">장착 중</span>
                                {/if}
                            </div>
                            <p class="title-desc">{title.description || '특별한 칭호입니다.'}</p>
                            
                            {#if !title.is_equipped}
                                <button 
                                    class="btn-equip" 
                                    class:loading={equippingId === title.id}
                                    on:click={() => equipTitle(title.id)}
                                    disabled={equippingId !== null}
                                >
                                    {equippingId === title.id ? '장착 중...' : '장착하기'}
                                </button>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}
        </div>

        <div class="history-section">
            <div class="section-header">
                <h3>📜 활동 기록</h3>
                <div class="filters">
                    <!-- Year Dropdown -->
                    <div class="custom-select" on:click|stopPropagation={toggleYear}>
                        <div class="select-trigger">
                            {selectedYear === 'all' ? '전체 년도' : `${selectedYear}년`}
                            <span class="chevron">▼</span>
                        </div>
                        {#if isYearOpen}
                            <div class="options">
                                <div class="option-item" 
                                    class:selected={selectedYear === 'all'}
                                    on:click|stopPropagation={() => selectYear('all')}>
                                    전체 년도
                                </div>
                                {#each availableYears as year}
                                    <div class="option-item" 
                                        class:selected={selectedYear === year}
                                        on:click|stopPropagation={() => selectYear(year)}>
                                        {year}년
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>

                    <!-- Month Dropdown -->
                    <div class="custom-select" on:click|stopPropagation={toggleMonth}>
                         <div class="select-trigger">
                            {selectedMonth === 'all' ? '전체 월' : `${selectedMonth}월`}
                            <span class="chevron">▼</span>
                        </div>
                        {#if isMonthOpen}
                            <div class="options">
                                <div class="option-item" 
                                    class:selected={selectedMonth === 'all'}
                                    on:click|stopPropagation={() => selectMonth('all')}>
                                    전체 월
                                </div>
                                {#each Array(12) as _, i}
                                    <div class="option-item" 
                                        class:selected={selectedMonth === (i + 1).toString()}
                                        on:click|stopPropagation={() => selectMonth((i + 1).toString())}>
                                        {i + 1}월
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
            
            <div class="history-list">
                {#if filteredHistory.length > 0}
                    {#each filteredHistory.slice(0, visibleCount) as game}
                    <div class="history-card" class:winner={game.is_winner}>
                        <div class="history-header">
                        <div class="game-info">
                            <span class="game-name text-truncate" title={game.game_name}>{game.game_name}</span>
                            <div class="my-result">
                                {#if game.is_winner}
                                    <span class="result-badge win">승리</span>
                                {/if}
                                {#if game.my_score && game.my_score !== 0}
                                    <span class="score">{game.my_score}점</span>
                                {/if}
                            </div>
                        </div>
                        <span class="game-date">{new Date(game.end_time).toLocaleDateString()}</span>
                    </div>
                    <div class="history-body">
                       
                            <div class="opponents">
                                with 
                                {#if game.opponents && game.opponents.length > 0}
                                    {#each game.opponents as opp, i}

                                        <span class="opp-name">
                                            {opp.name}
                                            {#if opp.score}({opp.score}){/if}
                                            {i < game.opponents.length - 1 ? ', ' : ''}
                                        </span>
                                    {/each}
                                {:else}
                                    -
                                {/if}
                            </div>
                        </div>
                    </div>
                {/each}

                {#if filteredHistory.length > visibleCount}
                    <button class="btn-load-more" on:click={loadMore}>더보기 ({filteredHistory.length - visibleCount}개 남음)</button>
                {/if}
            {:else}
                <div class="empty-state">
                    <p>아직 플레이 기록이 없습니다.</p>
                </div>
            {/if}
        </div>
        </div>

    {/if}
</div>

<style>
    /* ... existing styles ... */
    
    .btn-load-more {
        width: 100%;
        padding: 0.9rem;
        background: white;
        border: 1px solid #ddd;
        border-radius: 12px;
        color: #555;
        font-weight: 600;
        cursor: pointer;
        margin-top: 0.5rem;
        transition: all 0.2s;
    }
    
    .btn-load-more:hover {
        background: #f8f9fa;
        color: #333;
        border-color: #ccc;
    }

    .mypage-container {
        max-width: 600px;
        margin: 0 auto;
        padding: 1rem;
        padding-bottom: 2rem;
    }
    .page-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid #eee;
    }
    .page-header h1 {
        font-size: 1.5rem;
        margin: 0;
        color: #333;
    }
    .user-simple {
        display: flex;
        align-items: center;
        gap: 1rem;
        font-size: 0.95rem;
    }
    .user-name {
        color: #555;
    }
    .user-title {
        color: #e67700;
        font-weight: 700;
        margin-right: 4px;
        font-size: 0.9em;
    }
    .btn-logout-text {
        background: none;
        border: none;
        color: #888;
        font-size: 0.85rem;
        cursor: pointer;
        padding: 0;
        text-decoration: underline;
    }
    .btn-logout-text:hover {
        color: #555;
    }
    .btn-login-text {
        color: #333;
        text-decoration: none;
        font-weight: bold;
    }
    .btn-admin-link {
        text-decoration: none;
        font-size: 1.2rem;
        padding: 0 5px;
    }


    /* Stats */
    .stats-overview {
        margin-bottom: 2rem;
    }
    .stats-row.primary {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        margin-bottom: 1rem;
    }
    .stat-card {
        background: white;
        padding: 1.5rem;
        border-radius: 12px;
        text-align: center;
        box-shadow: 0 2px 10px rgba(0,0,0,0.03);
    }
    .stat-card.highlight {
        background: #e7f5ff;
    }
    .stat-value {
        display: block;
        font-size: 1.8rem;
        font-weight: 800;
        color: #333;
        margin-bottom: 0.25rem;
    }
    .stat-label {
        color: #666;
        font-size: 0.9rem;
    }

    .analysis-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
    }
    .analysis-card {
        background: white;
        padding: 1rem;
        border-radius: 12px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.03);
        font-size: 0.9rem;
    }
    .analysis-card h4 {
        margin: 0 0 0.8rem 0;
        font-size: 0.95rem;
        color: #555;
        border-bottom: 1px solid #eee;
        padding-bottom: 0.5rem;
    }
    .analysis-card ul {
        list-style: none;
        padding: 0;
        margin: 0;
    }
    .analysis-card li {
        display: flex;
        justify-content: space-between;
        margin-bottom: 0.4rem;
        color: #333;
    }
    .analysis-card li:last-child {
        margin-bottom: 0;
    }
    .analysis-card .count {
        font-weight: bold;
        color: #888;
        font-size: 0.8rem;
        flex-shrink: 0;
    }
    .analysis-card .empty {
        color: #ccc;
        text-align: center;
    }
    .text-truncate {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: inline-block;
        vertical-align: middle;
        max-width: 110px; /* Mobile default */
    }
    
    @media (min-width: 600px) {
        .text-truncate {
            max-width: 200px; /* PC/Tablet */
        }
    }


    /* History Headers & Filters */
    .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
        position: relative;
        z-index: 5; /* Ensure filters are above list */
    }
    .section-header h3 {
        font-size: 1.1rem;
        color: #444;
        margin: 0;
    }
    .filters {
        display: flex;
        gap: 0.5rem;
    }
    
    /* Custom Select Styles */
    .custom-select {
        position: relative;
        font-size: 0.85rem;
        min-width: 90px;
    }
    .select-trigger {
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 0.4rem 0.6rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        cursor: pointer;
        color: #555;
    }
    .select-trigger .chevron {
        font-size: 0.6rem;
        color: #999;
    }
    .options {
        position: absolute;
        top: 100%;
        right: 0; /* Align right */
        margin-top: 4px;
        background: white;
        border: 1px solid #eee;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        max-height: 200px;
        overflow-y: auto;
        z-index: 100;
        min-width: 100px;
    }
    .option-item {
        padding: 0.5rem 0.8rem;
        cursor: pointer;
        color: #555;
        white-space: nowrap;
    }
    .option-item:hover {
        background: #f8f9fa;
    }
    .option-item.selected {
        background: #e7f5ff;
        color: #333;
        font-weight: bold;
    }

    /* History */
    .history-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .history-card {
        background: white;
        padding: 1.2rem;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.03);
        border: 1px solid #f0f0f0;
    }
    .history-card.winner {
        border-left: 4px solid #ffd43b;
        background: linear-gradient(to right, #fff9db 0%, #fff 20%);
    }
    .history-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.8rem;
    }
    .game-info {
        display: flex;
        flex-direction: row;
        gap: 0.5rem;
    }
    .game-name {
        font-weight: 700;
        font-size: 1.1rem;
        color: #333;
    }
    .game-date {
        font-size: 0.8rem;
        color: #888;
        white-space: nowrap;
        margin-left: 1rem;
    }
    .history-body {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .my-result {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .result-badge {
        font-size: 0.8rem;
        padding: 0.15rem 0.5rem;
        border-radius: 4px;
        font-weight: bold;
    }
    .result-badge.win {
        background: #ffd43b;
        color: #945206; /* Dark gold */
    }
    .result-badge.lose {
        background: #f1f3f5;
        color: #888;
    }
    .score {
        font-weight: bold;
        color: #333;
    }
    .opponents {
        font-size: 0.85rem;
        color: #666;
    }
    .opp-name {
        display: inline-block;
    }
    .empty-state {
        text-align: center;
        padding: 3rem;
        color: #888;
    }
    
    /* Title Section Styles */
    .titles-section {
        margin-bottom: 2rem;
    }
    .titles-section h3 {
        font-size: 1.1rem;
        color: #444;
        margin-bottom: 1rem;
    }
    .titles-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 0.8rem;
    }
    .title-card {
        background: white;
        border: 1px solid #eee;
        border-radius: 12px;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        transition: all 0.2s;
    }
    .title-card.equipped {
        border-color: #333;
        background: #fdfdfd;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    .title-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .title-name {
        font-weight: 700;
        color: #333;
    }
    .title-desc {
        font-size: 0.85rem;
        color: #666;
        margin: 0;
        flex-grow: 1;
    }
    .badge-equipped {
        font-size: 0.75rem;
        background: #333;
        color: white;
        padding: 2px 6px;
        border-radius: 4px;
        font-weight: 600;
    }
    .btn-equip {
        background: #f0f0f0;
        border: none;
        padding: 0.4rem;
        border-radius: 6px;
        font-size: 0.85rem;
        cursor: pointer;
        color: #555;
        font-weight: 600;
        margin-top: 0.5rem;
    }
    .btn-equip:hover {
        background: #e0e0e0;
        color: #333;
    }
    .btn-equip:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
    .btn-equip.loading {
        background: #f8f9fa;
        color: #999;
    }
    .loading, .empty-titles {
        text-align: center;
        padding: 2rem;
        color: #888;
        font-size: 0.9rem;
        background: white;
        border-radius: 12px;
    }
</style>
