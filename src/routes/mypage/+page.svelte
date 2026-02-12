<script lang="ts">
    import { invalidateAll } from '$app/navigation';
    import { onMount } from 'svelte';
    import { fade } from 'svelte/transition';
    import type { PageData } from './$types';
    export let data: PageData;



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

    // Expired Pass Logic (show if expired within 2 months)
    $: expiredPass = (() => {
        if (hasSeasonPass || !data.user.season_pass_expires_at) return null;
        const expiresAt = new Date(data.user.season_pass_expires_at);
        const now = new Date();
        const daysSinceExpiry = Math.floor((now.getTime() - expiresAt.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceExpiry <= 60) {
            return {
                expiredDate: expiresAt.toLocaleDateString(),
                daysSinceExpiry
            };
        }
        return null;
    })();

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
    type Tab = 'dashboard' | 'titles' | 'history' | 'parties';
    let activeTab: Tab = 'dashboard';
    // Feedback Logic

    let showFeedbackModal = false;
    let showSuccessModal = false;
    let feedbackMessage = '';

    onMount(() => {
        if(data.user) {
            loadTitles();
        }
    });

    async function submitFeedback() {
        const message = feedbackMessage.trim();
        if (!message) return;
        
        // UI Immediate Response
        feedbackMessage = '';
        showFeedbackModal = false;
        showSuccessModal = true;
        
        // Auto-close success modal after 2 seconds (optional, but good UX)
        setTimeout(() => {
            showSuccessModal = false;
        }, 2000);

        // Background Send (Server handles storage)
        sendFeedback(message);
    }

    async function sendFeedback(message: string) {
        try {
            await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });
        } catch (e) {
            console.error('Feedback send failed (server should have logged it):', e);
        }
    }

    // Party (고정팟) Management
    let showPartyModal = false;
    let editingParty: any = null;
    let partyName = '';
    let partyGameId: string = '';
    let partyGameName = '';
    let partyDuration: string = '';
    let partyGuestCount = 0;
    let partyMemberIds: number[] = [];
    let partyGameDropdownOpen = false;
    let partyGameSearch = '';

    $: filteredPartyGames = (data.allGames || []).filter((g: any) =>
        g.name.toLowerCase().includes(partyGameSearch.toLowerCase())
    );

    function openCreatePartyModal() {
        editingParty = null;
        partyName = '';
        partyGameId = '';
        partyGameName = '';
        partyDuration = '';
        partyGuestCount = 0;
        partyMemberIds = data.user ? [data.user.id] : [];
        partyGameDropdownOpen = false;
        partyGameSearch = '';
        showPartyModal = true;
    }

    function openEditPartyModal(party: any) {
        editingParty = party;
        partyName = party.name;
        partyGameId = party.game_id?.toString() || '';
        partyGameName = party.game_name || party.resolved_game_name || '';
        partyDuration = party.duration?.toString() || '';
        partyGuestCount = party.guest_count || 0;
        partyMemberIds = party.members.map((m: any) => m.id);
        if (data.user && !partyMemberIds.includes(data.user.id)) {
            partyMemberIds = [data.user.id, ...partyMemberIds];
        }
        partyGameDropdownOpen = false;
        partyGameSearch = '';
        showPartyModal = true;
    }

    function selectPartyGame(game: any) {
        partyGameId = game.id.toString();
        partyGameName = game.name;
        if (game.playtime_min) partyDuration = game.playtime_min.toString();
        partyGameDropdownOpen = false;
        partyGameSearch = '';
    }

    function togglePartyMember(id: number) {
        if (data.user && id === data.user.id) return;
        if (partyMemberIds.includes(id)) {
            partyMemberIds = partyMemberIds.filter(mid => mid !== id);
        } else {
            partyMemberIds = [...partyMemberIds, id];
        }
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
            <button class="tab-item" class:active={activeTab === 'parties'} on:click={() => activeTab = 'parties'}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                고정팟
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
                {:else if expiredPass}
                    <div class="season-pass-banner expired">
                        <span class="badge">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; position:relative; top:1px;"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>
                            정기권 만료
                        </span>
                        <div class="pass-expired-date">{expiredPass.expiredDate} 만료</div>
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

                <div class="devices-section">
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
                </div>


                <div class="feedback-section">
                    <button class="btn-feedback-block" on:click={() => showFeedbackModal = true}>
                        <div class="feedback-content">
                            <span class="feedback-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                            </span>
                            <span class="text-group">
                                <span class="feedback-title">서비스 건의함</span>
                                <span class="feedback-subtitle">버그 제보나 기능 요청을 남겨주세요</span>
                            </span>
                        </div>
                        <span class="feedback-arrow">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        </span>
                    </button>
                </div>
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

        {#if activeTab === 'parties'}
            <div class="tab-content">
                <div class="parties-section">
                    <div class="section-header">
                        <h3>고정팟 관리</h3>
                        <button class="btn-create-party" on:click={openCreatePartyModal}>+ 새 고정팟</button>
                    </div>

                    {#if data.parties && data.parties.length > 0}
                        <div class="party-list">
                            {#each data.parties as party}
                                <div class="party-card-manage">
                                    <div class="party-info-block">
                                        <div class="party-name-row">
                                            <strong>{party.name}</strong>
                                            {#if party.game_name || party.resolved_game_name}
                                                <span class="party-game-label">{party.game_name || party.resolved_game_name}</span>
                                            {/if}
                                        </div>
                                        <div class="party-details">
                                            {#if party.duration}
                                                <span class="party-detail">{party.duration}분</span>
                                            {/if}
                                            {#if party.guest_count > 0}
                                                <span class="party-detail">게스트 {party.guest_count}명</span>
                                            {/if}
                                        </div>
                                        <div class="party-member-tags">
                                            {#each party.members as member}
                                                <span class="member-tag">{member.name}</span>
                                            {/each}
                                        </div>
                                    </div>
                                    <div class="party-actions-row">
                                        <button class="btn-edit-party" on:click={() => openEditPartyModal(party)}>수정</button>
                                        <form method="POST" action="?/deleteParty" use:enhance={() => {
                                            return async ({ result, update }) => {
                                                if (result.type === 'success') await update();
                                            };
                                        }}>
                                            <input type="hidden" name="partyId" value={party.id} />
                                            <button type="submit" class="btn-delete-party" on:click|preventDefault={(e) => {
                                                if (confirm(`'${party.name}' 고정팟을 삭제하시겠습니까?`)) {
                                                    const form = (e.currentTarget as HTMLElement).closest('form');
                                                    if (form) form.requestSubmit();
                                                }
                                            }}>삭제</button>
                                        </form>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <div class="empty-state-small">
                            아직 고정팟이 없습니다.<br>자주 함께 하는 멤버와 게임을 등록해보세요!
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

{#if showFeedbackModal}
    <div class="modal-backdrop" on:click|self={() => showFeedbackModal = false}>
        <div class="modal-content">
            <h3>건의사항 보내기</h3>
            <p class="modal-desc">
                더 좋은 서비스를 위해 여러분의 의견을 들려주세요.<br>
                버그 제보나 기능 요청도 환영합니다!
            </p>
            <textarea 
                bind:value={feedbackMessage} 
                placeholder="내용을 입력해주세요..." 
                rows="5"
                class="feedback-input"
            ></textarea>
            <div class="modal-actions">
                <button class="btn-cancel" on:click={() => showFeedbackModal = false}>취소</button>
                <button 
                    class="btn-submit" 
                    on:click={submitFeedback} 
                    disabled={!feedbackMessage.trim()}
                >
                    보내기
                </button>
            </div>
        </div>
    </div>
{/if}

{#if showSuccessModal}
    <div class="modal-backdrop" on:click|self={() => showSuccessModal = false} transition:fade>
        <div class="modal-content success-modal">
            <div class="success-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <h3>전송 완료!</h3>
            <p>소중한 의견 감사합니다.</p>
            <button class="modal-close-btn" on:click={() => showSuccessModal = false}>확인</button>
        </div>
    </div>
{/if}

{#if showPartyModal}
    <div class="modal-backdrop" on:click|self={() => showPartyModal = false}>
        <div class="modal-content party-modal">
            <h3>{editingParty ? '고정팟 수정' : '새 고정팟 만들기'}</h3>
            <form method="POST" action={editingParty ? '?/updateParty' : '?/createParty'} use:enhance={() => {
                return async ({ result, update }) => {
                    if (result.type === 'success') {
                        showPartyModal = false;
                        await update();
                    }
                };
            }}>
                {#if editingParty}
                    <input type="hidden" name="partyId" value={editingParty.id} />
                {/if}
                <input type="hidden" name="gameId" value={partyGameId} />
                <input type="hidden" name="gameName" value={partyGameName} />

                <div class="form-group">
                    <label for="partyName">팟 이름</label>
                    <input type="text" id="partyName" name="partyName" bind:value={partyName} placeholder="예: 금요일 전략팟" required />
                </div>

                <div class="form-group">
                    <label>게임 (선택사항)</label>
                    <div class="game-search-wrapper" on:click|stopPropagation>
                        <input
                            type="text"
                            placeholder="게임 검색..."
                            bind:value={partyGameSearch}
                            on:focus={() => partyGameDropdownOpen = true}
                            on:input={() => partyGameDropdownOpen = true}
                        />
                        {#if partyGameName && !partyGameDropdownOpen}
                            <div class="selected-game-tag">
                                {partyGameName}
                                <button type="button" class="btn-clear-game" on:click={() => { partyGameId = ''; partyGameName = ''; }}>x</button>
                            </div>
                        {/if}
                        {#if partyGameDropdownOpen}
                            <div class="game-dropdown">
                                {#each filteredPartyGames as game}
                                    <div class="game-option" on:click={() => selectPartyGame(game)} role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && selectPartyGame(game)}>
                                        {game.name}
                                        {#if game.playtime_min}
                                            <span class="game-time">({game.playtime_min}분)</span>
                                        {/if}
                                    </div>
                                {:else}
                                    <div class="game-option empty">검색 결과 없음</div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group half">
                        <label for="partyDuration">플레이 시간 (분)</label>
                        <input type="number" id="partyDuration" name="duration" bind:value={partyDuration} placeholder="60" min="1" />
                    </div>
                    <div class="form-group half">
                        <label for="partyGuestCount">게스트 수</label>
                        <input type="number" id="partyGuestCount" name="guestCount" bind:value={partyGuestCount} min="0" max="20" />
                    </div>
                </div>

                <div class="form-group">
                    <label>멤버 선택</label>
                    <div class="member-select-list">
                        {#each (data.allAttendees || []) as attendee}
                            <label class="member-checkbox" class:owner={data.user && attendee.id === data.user.id}>
                                <input
                                    type="checkbox"
                                    name="memberIds"
                                    value={attendee.id}
                                    checked={partyMemberIds.includes(attendee.id)}
                                    disabled={data.user && attendee.id === data.user.id}
                                    on:change={() => togglePartyMember(attendee.id)}
                                />
                                {attendee.name}
                                {#if data.user && attendee.id === data.user.id}
                                    <span class="owner-badge">(나)</span>
                                {/if}
                            </label>
                        {/each}
                    </div>
                </div>

                <div class="modal-actions">
                    <button type="button" class="btn-cancel" on:click={() => showPartyModal = false}>취소</button>
                    <button type="submit" class="btn-submit">{editingParty ? '수정' : '만들기'}</button>
                </div>
            </form>
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
    .season-pass-banner.expired {
        background: linear-gradient(135deg, #868e96 0%, #495057 100%);
        opacity: 0.85;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 0.5rem;
    }
    .pass-expired-cta {
        font-size: 0.85rem;
        opacity: 0.9;
    }
    .pass-expired-date {
        font-size: 0.8rem;
        opacity: 0.7;
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

    /* Feedback Styles */
    .btn-feedback {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        background: #e7f5ff;
        color: #339af0;
        border: none;
        padding: 0.4rem 0.8rem;
        border-radius: 20px;
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
        margin-right: 0.5rem;
        transition: all 0.2s;
    }
    .btn-feedback:hover {
        background: #d0ebff;
        color: #1c7ed6;
    }
    .divider {
        color: #eee;
        margin: 0 0.8rem;
        font-size: 0.8rem;
    }
    
    .modal-desc {
        font-size: 0.9rem;
        color: #666;
        margin-bottom: 1rem;
        text-align: center;
        line-height: 1.5;
    }
    .feedback-input {
        width: 100%;
        padding: 0.8rem;
        border: 1px solid #ddd;
        border-radius: 8px;
        font-size: 0.95rem;
        resize: vertical;
        box-sizing: border-box;
        margin-bottom: 1rem;
        font-family: inherit;
    }
    .feedback-input:focus {
        outline: none;
        border-color: #339af0;
        box-shadow: 0 0 0 3px rgba(51, 154, 240, 0.1);
    }
    .modal-actions {
        display: flex;
        gap: 0.8rem;
    }
    .modal-actions button {
        flex: 1;
        padding: 0.8rem;
        border-radius: 8px;
        border: none;
        font-weight: bold;
        cursor: pointer;
        font-size: 0.95rem;
    }
    .btn-cancel {
        background: #f1f3f5;
        color: #495057;
    }
    .btn-cancel:hover {
        background: #e9ecef;
    }
    .btn-submit {
        background: #339af0;
        color: white;
    }
    .btn-submit:hover {
        background: #228be6;
    }
    .btn-submit:disabled {
        background: #adb5bd;
        cursor: not-allowed;
    }

    /* Success Modal */
    .success-modal {
        text-align: center;
        max-width: 300px;
    }
    .success-icon {
        color: #2b8a3e;
        margin-bottom: 1rem;
    }
    .success-modal h3 {
        margin-bottom: 0.5rem;
    }
    .success-modal p {
        color: #666;
        margin-bottom: 1.5rem;
    }

    /* New Feedback Section Styles */
    .feedback-section {
        margin-top: 1rem;
        margin-bottom: 2rem;
    }
    .btn-feedback-block {
        width: 100%;
        background: white;
        border: 1px solid #eee;
        border-radius: 12px;
        padding: 1.2rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 2px 8px rgba(0,0,0,0.03);
        text-align: left;
    }
    .btn-feedback-block:hover {
        border-color: #339af0;
        background: #f8f9fa;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    }
    .feedback-content {
        display: flex;
        align-items: center;
        gap: 1rem;
    }
    .feedback-icon {
        width: 40px;
        height: 40px;
        background: #e7f5ff;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #339af0;
    }
    .text-group {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
    }
    .feedback-title {
        font-weight: 700;
        color: #333;
        font-size: 1rem;
    }
    .feedback-subtitle {
        font-size: 0.85rem;
        color: #888;
    }
    .feedback-arrow {
        color: #ccc;
    }

    /* Party (고정팟) Styles */
    .parties-section {
        margin-bottom: 2rem;
    }
    .btn-create-party {
        background: #339af0;
        color: white;
        border: none;
        padding: 0.4rem 0.8rem;
        border-radius: 8px;
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
    }
    .btn-create-party:hover {
        background: #228be6;
    }
    .party-list {
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
    }
    .party-card-manage {
        background: white;
        border: 1px solid #eee;
        border-radius: 12px;
        padding: 1rem;
        box-shadow: 0 2px 8px rgba(0,0,0,0.03);
    }
    .party-name-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.4rem;
        flex-wrap: wrap;
    }
    .party-name-row strong {
        font-size: 1.05rem;
        color: #333;
    }
    .party-game-label {
        font-size: 0.8rem;
        background: #e7f5ff;
        color: #339af0;
        padding: 0.15rem 0.5rem;
        border-radius: 4px;
        font-weight: 600;
    }
    .party-details {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
    }
    .party-detail {
        font-size: 0.8rem;
        color: #888;
    }
    .party-member-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 0.3rem;
    }
    .member-tag {
        font-size: 0.8rem;
        background: #f1f3f5;
        color: #495057;
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
    }
    .party-actions-row {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.8rem;
        justify-content: flex-end;
    }
    .btn-edit-party, .btn-delete-party {
        border: none;
        padding: 0.3rem 0.7rem;
        border-radius: 6px;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
    }
    .btn-edit-party {
        background: #f1f3f5;
        color: #495057;
    }
    .btn-edit-party:hover {
        background: #e9ecef;
    }
    .btn-delete-party {
        background: #fff5f5;
        color: #e03131;
    }
    .btn-delete-party:hover {
        background: #ffe3e3;
    }

    /* Party Modal */
    .party-modal {
        max-width: 450px;
        max-height: 85vh;
        overflow-y: auto;
    }
    .party-modal h3 {
        text-align: center;
    }
    .form-row {
        display: flex;
        gap: 0.8rem;
    }
    .form-group.half {
        flex: 1;
    }
    .game-search-wrapper {
        position: relative;
    }
    .game-search-wrapper input {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 0.9rem;
        box-sizing: border-box;
    }
    .selected-game-tag {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        margin-top: 0.3rem;
        background: #e7f5ff;
        color: #339af0;
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        font-size: 0.85rem;
        font-weight: 600;
    }
    .btn-clear-game {
        background: none;
        border: none;
        color: #339af0;
        cursor: pointer;
        font-size: 0.9rem;
        padding: 0 0.2rem;
        font-weight: bold;
    }
    .game-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: white;
        border: 1px solid #eee;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        max-height: 180px;
        overflow-y: auto;
        z-index: 50;
        margin-top: 4px;
    }
    .game-option {
        padding: 0.5rem 0.8rem;
        cursor: pointer;
        font-size: 0.9rem;
        color: #333;
    }
    .game-option:hover {
        background: #f8f9fa;
    }
    .game-option.empty {
        color: #adb5bd;
        cursor: default;
    }
    .game-time {
        color: #888;
        font-size: 0.8rem;
    }
    .member-select-list {
        max-height: 200px;
        overflow-y: auto;
        border: 1px solid #eee;
        border-radius: 8px;
        padding: 0.5rem;
    }
    .member-checkbox {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.35rem 0.3rem;
        font-size: 0.9rem;
        color: #333;
        cursor: pointer;
        border-radius: 4px;
    }
    .member-checkbox:hover {
        background: #f8f9fa;
    }
    .member-checkbox.owner {
        color: #339af0;
        font-weight: 600;
    }
    .owner-badge {
        font-size: 0.75rem;
        color: #888;
    }
</style>
