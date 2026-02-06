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

    // Season Pass Logic
    $: hasSeasonPass = data.user.season_pass_expires_at && new Date(data.user.season_pass_expires_at) > new Date();
    $: seasonPassDaysLeft = hasSeasonPass 
        ? Math.ceil((new Date(data.user.season_pass_expires_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) 
        : 0;
    $: seasonPassEndDate = hasSeasonPass ? new Date(data.user.season_pass_expires_at).toLocaleDateString() : '';

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
    let showGuideModal = false;

    // Title Management
    interface Title {
        id: number;
        title_name: string;
        description: string;
        is_equipped: boolean;
    }
    let myTitles: Title[] = [];
    let loadingTitles = true;

    async function loadTitles(silent = false) {
        if (!silent) loadingTitles = true;
        try {
            const res = await fetch('/api/user/titles');
            if(res.ok) {
                myTitles = await res.json();
            }
        } catch(e) {
            console.error(e);
        } finally {
            if (!silent) loadingTitles = false;
        }
    }

    let equippingId: number | null = null;

    async function equipTitle(titleId: number | null) {
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
                await loadTitles(true); 
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

    import { enhance } from '$app/forms';

    function closeDropdowns() {
        isYearOpen = false;
        isMonthOpen = false;
    }
    
    // Pagination
    let visibleCount = 10;
    
    function loadMore() {
        visibleCount += 10;
    }

    // Tab State
    type Tab = 'dashboard' | 'titles' | 'history';
    let activeTab: Tab = 'dashboard';
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
        

                <form method="POST" action="/logout">
                    <button type="submit" class="btn-logout-text">로그아웃</button>
                </form>
            </div>
        {:else}
             <a href="/login" class="btn-login-text">로그인</a>
        {/if}
    </header>

    {#if data.user}
        <!-- Tab Navigation -->
        <div class="tabs">
            <button class="tab-item" class:active={activeTab === 'dashboard'} on:click={() => activeTab = 'dashboard'}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                대시보드
            </button>
            <button class="tab-item" class:active={activeTab === 'titles'} on:click={() => activeTab = 'titles'}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>
                칭호
            </button>
            <button class="tab-item" class:active={activeTab === 'history'} on:click={() => activeTab = 'history'}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                활동 기록
            </button>
        </div>

        {#if activeTab === 'dashboard'}
            <div class="tab-content">
                {#if hasSeasonPass}
                    <div class="season-pass-banner">
                        <div class="pass-info">
                            <span class="badge">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; position:relative; top:1px;"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>
                                정기권 사용 중
                            </span>
                            <span class="d-day">D-{seasonPassDaysLeft}</span>
                        </div>
                        <div class="pass-date">
                            종료일: {seasonPassEndDate}
                        </div>
                    </div>
                {/if}

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
                                <h4>
                                    최애 게임
                                </h4>
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

                <!-- My Devices Section (Moved to Dashboard) -->
                <!-- <div class="devices-section">
                    <div class="section-header">
                        <h3>
                            내 기기
                            <div class="header-actions">
                                <a href="/devices/register" class="btn-register">기기 등록</a>
                                <button class="btn-guide" on:click={() => showGuideModal = true} aria-label="기기 등록 방법">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                                </button>
                            </div>
                        </h3>
                    </div>

                    <div class="device-list">
                        {#if data.devices && data.devices.length > 0}
                            {#each data.devices as device}
                                <div class="device-card">
                                    <div class="device-info">
                                        <span class="device-name">{device.name}</span>
                                    </div>
                                    <form method="POST" action="?/deleteDevice" use:enhance>
                                        <input type="hidden" name="deviceId" value={device.id} />
                                        <button type="submit" class="btn-delete" aria-label="삭제">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                <path d="M3 6h18"></path>
                                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                            </svg>
                                        </button>
                                    </form>
                                </div>
                            {/each}
                        {:else}
                            <div class="empty-state-small" style="text-align:center; width:100%; color:#999; font-size:0.9rem;">
                                등록된 기기가 없습니다.
                            </div>
                        {/if}
                    </div>
                </div> -->
            </div>
        {/if}

        {#if activeTab === 'titles'}
            <div class="tab-content">
                <!-- My Titles Section -->
                <div class="titles-section">
                
                    {#if loadingTitles}
                        <div class="loading">불러오는 중...</div>
                    {:else if myTitles.length === 0}
                        <div class="empty-titles">보유한 칭호가 없습니다. 게임을 플레이하고 칭호를 획득해보세요!</div>
                    {:else}
                        <div class="titles-grid">
                            {#each myTitles as title (title.id)}
                                <div class="title-card" class:equipped={title.is_equipped}>
                                    <div class="title-header">
                                        <span class="title-name">{title.title_name}</span>
                                        <div class="actions">
                                            {#if title.is_equipped}
                                                <button 
                                                    class="btn-action unequip"
                                                    class:processing={equippingId === title.id}
                                                    on:click={() => equipTitle(null)} 
                                                    disabled={equippingId !== null}
                                                >
                                                    해제
                                                </button>
                                            {:else}
                                                <button 
                                                    class="btn-action equip" 
                                                    class:processing={equippingId === title.id}
                                                    on:click={() => equipTitle(title.id)}
                                                    disabled={equippingId !== null}
                                                >
                                                    장착
                                                </button>
                                            {/if}
                                        </div>
                                    </div>
                                    <p class="title-desc">{title.description || '특별한 칭호입니다.'}</p>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>
        {/if}

        {#if activeTab === 'history'}
            <div class="tab-content">
                <div class="history-section">
                    <div class="section-header">
                        <h3>
                            활동 기록
                        </h3>
                        <div class="filters">
                            <!-- Year Dropdown -->
                            <div class="custom-select" on:click|stopPropagation={toggleYear} role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && toggleYear()}>
                                <div class="select-trigger">
                                    {selectedYear === 'all' ? '전체 년도' : `${selectedYear}년`}
                                    <span class="chevron">▼</span>
                                </div>
                                {#if isYearOpen}
                                    <div class="options">
                                        <div class="option-item" 
                                            class:selected={selectedYear === 'all'}
                                            role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && selectYear('all')}
                                            on:click|stopPropagation={() => selectYear('all')}>
                                            전체 년도
                                        </div>
                                        {#each availableYears as year}
                                            <div class="option-item" 
                                                class:selected={selectedYear === year}
                                                role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && selectYear(year)}
                                                on:click|stopPropagation={() => selectYear(year)}>
                                                {year}년
                                            </div>
                                        {/each}
                                    </div>
                                {/if}
                            </div>

                            <!-- Month Dropdown -->
                            <div class="custom-select" on:click|stopPropagation={toggleMonth} role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && toggleMonth()}>
                                <div class="select-trigger">
                                    {selectedMonth === 'all' ? '전체 월' : `${selectedMonth}월`}
                                    <span class="chevron">▼</span>
                                </div>
                                {#if isMonthOpen}
                                    <div class="options">
                                        <div class="option-item" 
                                            class:selected={selectedMonth === 'all'}
                                            role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && selectMonth('all')}
                                            on:click|stopPropagation={() => selectMonth('all')}>
                                            전체 월
                                        </div>
                                        {#each Array(12) as _, i}
                                            <div class="option-item" 
                                                class:selected={selectedMonth === (i + 1).toString()}
                                                role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && selectMonth((i + 1).toString())}
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
        </div>
        {/if}
    {/if}
</div>

{#if showGuideModal}
    <div class="modal-backdrop" on:click|self={() => showGuideModal = false}>
        <div class="modal-content">
            <h3>기기 등록 방법</h3>
            <ol class="guide-steps">
                <li>
                    <span class="step-num">1</span>
                    마이페이지에서<br>
                    <strong>'기기 등록'</strong> 버튼을 누릅니다.
                </li>
                <li>
                    <span class="step-num">2</span>
                    <strong>'등록 시작'</strong>을 누르면<br>
                    4자리 비밀번호가 표시됩니다.
                </li>
                <li>
                    <span class="step-num">3</span>
                    폰 블루투스 설정에서<br>
                    <strong>'HonNol'</strong>을 찾아 연결합니다.
                </li>
                <li>
                    <span class="step-num">4</span>
                    화면에 표시된 비밀번호를 입력하면 <strong>완료!</strong>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#2b8a3e; vertical-align:text-bottom;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                </li>
            </ol>
            <button class="modal-close-btn" on:click={() => showGuideModal = false}>닫기</button>
        </div>
    </div>
{/if}

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
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
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
    
    /* Tabs */
    .tabs {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1.5rem;
        border-bottom: 1px solid #eee;
        padding-bottom: 0.5rem;
        overflow-x: auto;
    }
    .tab-item {
        background: none;
        border: none;
        padding: 0.6rem 1rem;
        font-size: 0.95rem;
        color: #888;
        cursor: pointer;
        border-radius: 8px;
        font-weight: 600;
        white-space: nowrap;
        transition: all 0.2s;
    }
    .tab-item:hover {
        background: #f8f9fa;
        color: #555;
    }
    .tab-item.active {
        background: #e7f5ff;
        color: #339af0;
    }

    .tab-content {
        animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(5px); }
        to { opacity: 1; transform: translateY(0); }
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


    /* Season Pass Banner */
    .season-pass-banner {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 1.5rem;
        border-radius: 12px;
        margin-bottom: 2rem;
        box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .pass-info {
        display: flex;
        align-items: center;
        gap: 1rem;
    }
    .pass-info .badge {
        background: rgba(255,255,255,0.2);
        padding: 0.4rem 0.8rem;
        border-radius: 20px;
        font-weight: bold;
        font-size: 0.9rem;
        backdrop-filter: blur(5px);
    }
    .pass-info .d-day {
        font-size: 1.5rem;
        font-weight: 800;
        color: #fff;
    }
    .pass-date {
        font-size: 0.9rem;
        opacity: 0.9;
    }
    
    @media (max-width: 480px) {
        .season-pass-banner {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.5rem;
        }
        .pass-date {
            align-self: flex-end;
        }
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
        align-items: flex-start;
        margin-bottom: 1rem;
        position: relative;
        z-index: 5;
    }
    .section-header h3 {
        font-size: 1.1rem;
        color: #444;
        margin: 0;
        display: flex;
        justify-content: space-between;
        width: 100%;
        align-items: center;
    }
    .header-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .btn-register {
        display: inline-block;
        background: #339af0;
        color: white;
        padding: 0.3rem 0.8rem;
        border-radius: 8px;
        font-size: 0.85rem;
        text-decoration: none;
        font-weight: 600;
        transition: background 0.2s;
    }
    .btn-register:hover {
        background: #228be6;
    }
    .filters {
        display: flex;
        gap: 0.5rem;
    }


    /* History List */
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
        margin-left: 0.5rem;
    }
    .result-badge {
        font-size: 0.8rem;
        padding: 0.15rem 0.5rem;
        border-radius: 4px;
        font-weight: bold;
    }
    .result-badge.win {
        background: #ffd43b;
        color: #945206; 
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

    /* Devices Section */
    .devices-section {
        margin-bottom: 2rem;
    }
    .btn-add-device {
        background: #4dabf7;
        color: white;
        border: none;
        padding: 0.3rem 0.8rem;
        border-radius: 6px;
        font-size: 0.85rem;
        cursor: pointer;
        font-weight: 600;
    }
    .add-device-form {
        background: #f8f9fa;
        padding: 1rem;
        border-radius: 8px;
        margin-bottom: 1rem;
        border: 1px solid #eee;
    }
    .form-group {
        margin-bottom: 0.8rem;
    }
    .form-group label {
        display: block;
        font-size: 0.85rem;
        color: #555;
        margin-bottom: 0.25rem;
        font-weight: 600;
    }
    .form-group input {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 0.9rem;
        box-sizing: border-box;
    }
    .help-text {
        display: block;
        font-size: 0.75rem;
        color: #999;
        margin-top: 0.2rem;
    }
    .btn-submit {
        width: 100%;
        background: #339af0;
        color: white;
        border: none;
        padding: 0.6rem;
        border-radius: 6px;
        font-weight: bold;
        cursor: pointer;
    }
    /* Devices Section */
    .devices-section {
        margin-bottom: 2rem;
        background: #fff;
        padding: 1rem;
        border-radius: 12px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.03);
    }
    .btn-add-device {
        background: #4dabf7;
        color: white;
        border: none;
        padding: 0.3rem 0.8rem;
        border-radius: 6px;
        font-size: 0.85rem;
        cursor: pointer;
        font-weight: 600;
        transition: background 0.2s;
    }
    .btn-add-device:hover {
        background: #339af0;
    }

    .device-list {
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
    }
    .device-card {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: .5rem;
        background: #f8f9fa;
        border-radius: 8px;
        border: 1px solid #eee;
    }
    .device-info {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
    }
    .device-name {
        font-weight: 600;
        color: #444;
    }
    .btn-delete {
        background: none;
        border: none;
        color: #adb5bd;
        padding: 0.4rem;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .btn-delete:hover {
        background: #f1f3f5;
        color: #495057;
    }
    .empty-state-small {
        text-align: center;
        color: #999;
        font-size: 0.9rem;
        padding: 1rem;
    }
    /* ... existing styles ... */
    
    /* Guide Modal */
    .btn-guide {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 1.1rem;
        padding: 0;
        margin-left: 0.5rem;
        color: #339af0;
        vertical-align: middle;
    }
    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        box-sizing: border-box;
    }
    .modal-content {
        background: white;
        padding: 2rem;
        border-radius: 16px;
        max-width: 400px;
        width: 100%;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        position: relative;
    }
    .modal-content h3 {
        margin: 0 0 1rem 0;
        color: #333;
        font-size: 1.2rem;
        text-align: center;
    }
    .guide-steps {
        padding: 0;
        margin: 0 0 1.5rem 0;
        list-style: none;
    }
    .guide-steps li {
        margin-bottom: 1rem;
        line-height: 1.5;
        color: #555;
        font-size: 0.95rem;
    }
    .step-num {
        display: inline-block;
        background: #e7f5ff;
        color: #339af0;
        font-weight: bold;
        padding: 0.1rem 0.5rem;
        border-radius: 6px;
        margin-right: 0.5rem;
    }
    .emphasis {
        color: #e03131;
        font-weight: bold;
    }
    .modal-close-btn {
        width: 100%;
        padding: 0.8rem;
        background: #339af0;
        color: white;
        border: none;
        border-radius: 8px;
        font-weight: bold;
        font-size: 1rem;
        cursor: pointer;
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
    .actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .btn-action {
        border: 1px solid transparent; /* Ensure constant border width */
        padding: 0.25rem 0.6rem;
        border-radius: 6px;
        font-size: 0.8rem;
        cursor: pointer;
        font-weight: 600;
        min-width: 60px;
        text-align: center;
        box-sizing: border-box; /* Prevent padding/border from affecting width */
    }
    .btn-action:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
    .btn-action.equip {
        background: #f0f0f0;
        color: #555;
    }
    .btn-action.equip:hover {
        background: #e0e0e0;
        color: #333;
    }
    .btn-action.unequip {
        background: white;
        border-color: #ff6b6b; /* Change color only */
        color: #ff6b6b;
    }
    .btn-action.unequip:hover {
        background: #fff5f5;
        color: #fa5252;
    }
    .btn-action.processing {
        background: #f8f9fa !important;
        color: #ccc !important;
        border-color: #ddd !important;
        cursor: wait;
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
