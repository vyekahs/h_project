<script lang="ts">
    import type { PageData } from './$types';
    import { onMount } from 'svelte';
    import { enhance, applyAction } from '$app/forms';
    import { invalidateAll } from '$app/navigation';



    let lastUpdated = new Date();

    interface User {
        id: number;
        name: string;
        can_manage_games: boolean;
        title?: { title_name: string };
    }
    
    export let data: {
        attendees: Attendee[];
        games: GameSession[];
        scheduledGames: GameSession[];
        userReservation: Reservation | null;
        userScheduledGames: GameSession[]; // Changed from userScheduledGame
        userPlayingGame: GameSession | null;
        user: User | null;
        isOpen: boolean;
        notice: string | null;
        userPenaltyInfo: { penalty_points: number } | null;
        isAdmin: boolean;
        reservations: Reservation[];
        allGames: any[]; // Using any[] for simplicity or define Game interface
    };

    interface Attendee {
        id: number;
        name: string;
        arrival_time: string;
        is_playing: boolean;
        title_name?: string;
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
        created_by: number;
        participants: { id: number; name: string }[];
        players: { id: number; name: string }[];
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
        scheduled_at?: string;
    }

    interface Table {
        id: number;
        name: string;
        currentSession: GameSession | null;
        nextSession: GameSession | null;
        reservations: Reservation[];
    }

    $: attendees = data.attendees as Attendee[];
    $: games = data.games as GameSession[];
    $: scheduledGames = data.scheduledGames as GameSession[];
    $: userReservation = data.userReservation as Reservation | null;
    $: userScheduledGames = (data.userScheduledGames || []) as GameSession[]; // Change to array

    function getGameReservations(gameId: number) {
        return (data.reservations || []).filter((r: any) => r.session_id === gameId);
    }

    // --- Game Management Logic ---
    let showModal = false;
    let selectedGameName = '';
    let selectedDuration = '';
    let selectedGameId = '';
    let dropdownOpen = false;
    let searchInput: HTMLInputElement;

    let showScheduledGameModal = false;
    let scheduledGameName = '';
    let scheduledAt = '';
    let minPlayers = 2;
    let maxPlayers = 4;

    let endGameModalVisible = false;
    let selectedEndGame: GameSession | null = null;

    let alertVisible = false;
    let alertMessage = '';

    // PWA Install Guide
    let showInstallGuide = false;
    let isIOS = false;
    let isStandalone = false;

    onMount(() => {
        isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        isStandalone = window.matchMedia('(display-mode: standalone)').matches
            || (navigator as any).standalone === true;
    });

    // Limit visible games
    let limitGames = 5;
    let limitScheduledGames = 5;

    function toggleLimitGames() {
        limitGames = limitGames === 5 ? games.length : 5;
    }

    function toggleLimitScheduledGames() {
        limitScheduledGames = limitScheduledGames === 5 ? scheduledGames.length : 5;
    }

    function showAlert(msg: string) {
        alertMessage = msg;
        alertVisible = true;
    }



    function openEndGameModal(game: GameSession) {
        selectedEndGame = game;
        endGameModalVisible = true;
    }

    function openScheduledGameModal() {
        showScheduledGameModal = true;
        scheduledGameName = '';
        dropdownOpen = false;
        
        const now = new Date();
        now.setMinutes(Math.ceil((now.getMinutes() + 30) / 10) * 10);
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        scheduledAt = `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    const handleJoinRequest: import('@sveltejs/kit').SubmitFunction = () => {
        return async ({ result }) => {
            if (result.type === 'failure') {
                showAlert((result.data?.error as string) || '요청 실패');
            } else if (result.type === 'success') {
                showAlert('참여 요청이 전송되었습니다.');
                await invalidateAll(); 
            }
            await applyAction(result);
        };
    };

    $: filteredGames = (data.allGames as any[])?.filter((g: any) => 
        g.name.toLowerCase().includes(selectedGameName.toLowerCase())
    ) || [];

    $: filteredScheduledGames = (data.allGames as any[])?.filter((g: any) => 
        g.name.toLowerCase().includes(scheduledGameName.toLowerCase())
    ) || [];

    function selectGame(game: { name: string, id: number, playtime_min: number }) {
        selectedGameName = game.name;
        selectedGameId = String(game.id);
        selectedDuration = String(game.playtime_min);
        dropdownOpen = false;
    }

    function selectScheduledGame(game: any) {
        scheduledGameName = game.name;
        minPlayers = game.min_players;
        maxPlayers = game.max_players;
        dropdownOpen = false;
    }

    function handleInputClick() {
        dropdownOpen = true;
    }

    function handleModalClick(event: MouseEvent) {
        event.stopPropagation();
        const target = event.target as HTMLElement;
        if (!target.closest('.custom-dropdown')) {
            dropdownOpen = false;
        }
    }

    function canManageGame(game: GameSession) {
        if (!data.user) return false;
        if (data.isAdmin) return true;
        // Check if user is manager AND creator
        // Note: game.created_by comes from server now
        return data.user.can_manage_games && (game as any).created_by === data.user.id;
    }
    function getTimeRemaining(endTime: string) {
        const end = new Date(endTime).getTime();
        const now = new Date().getTime();
        const diff = end - now;
        
        // Show "X mins past" if expired
        if (diff <= 0) {
            const pastMins = Math.floor(Math.abs(diff) / 60000);
            return `${pastMins}분 지남`;
        }
        
        const totalMins = Math.floor(diff / 60000);
        if (totalMins < 60) {
            return `${totalMins}분 남음`;
        } else {
            const hours = Math.floor(totalMins / 60);
            const mins = totalMins % 60;
            return `${hours}시간 ${mins}분 남음`;
        }
    }
    
    // ... (rest of functions)

    function formatScheduledTime(dateString: string) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = date.getTime() - now.getTime();
        
        const timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
        const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        const fullTimeStr = isToday ? timeStr : `${dateStr} ${timeStr}`;

        if (diffMs < 0) return { relative: "곧 시작", absolute: fullTimeStr };

        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

        // Calculate calendar days difference
        const todayMidnight = new Date(now);
        todayMidnight.setHours(0, 0, 0, 0);
        const targetMidnight = new Date(date);
        targetMidnight.setHours(0, 0, 0, 0);
        const diffValidMs = targetMidnight.getTime() - todayMidnight.getTime();
        const calendarDays = Math.round(diffValidMs / (1000 * 60 * 60 * 24));

        let relativeStr = "";
        
        if (isToday) {
            if (diffMins < 60) {
                relativeStr = `${diffMins}분 뒤`;
            } else {
                relativeStr = `${diffHours}시간 뒤`;
            }
        } else {
            relativeStr = `${calendarDays}일 뒤`;
        }

        return { relative: relativeStr, absolute: fullTimeStr };
    }
</script>

<div class="container">
    <header class="app-header">
        <div class="app-bar">
            <div class="brand-section">
                <h1>혼놀 라운지</h1> 
                {#if data.user}
                    <div class="user-greeting">
                        {#if data.user.title}
                            <span class="user-title">[{data.user.title.title_name}]</span>
                        {/if}
                        <span class="user-name">{data.user.name}님</span>
                    </div>
                {/if}
            </div>
            <div class="status-section">
                {#if data.isAdmin}
                    <a href="/admin" class="status-pill admin-panel">관리자 페이지</a>
                {:else if data.user && data.user.can_manage_games}
                    <a href="/admin" class="status-pill admin-panel">관리자 로그인</a>
                {/if}
                {#if data.isOpen}
                    <span class="status-pill open">오픈</span>
                {:else}
                    <span class="status-pill closed">마감</span>
                {/if}
                <span class="live-time">{lastUpdated.toLocaleTimeString()}</span>
            </div>
        </div>
    </header>

    {#if data.notice}
        <div class="notice-banner">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:text-bottom;"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>
            {data.notice}
        </div>
    {/if}

    <!-- {#if !isStandalone}
        <button class="install-guide-btn" on:click={() => showInstallGuide = true}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            앱 설치 방법
        </button>
    {/if} -->

    <main>
        {#if data.user && ((data.userPenaltyInfo && data.userPenaltyInfo.penalty_points > 0) || (data.userScheduledGames && data.userScheduledGames.length > 0) || data.userPlayingGame || data.userReservation)}
            <section class="my-status-section">
                <h2>나의 예약 현황</h2>
                <div class="my-status-grid">
                    {#if data.userPenaltyInfo && data.userPenaltyInfo.penalty_points > 0}
                        <div class="status-card penalty-warning">
                            <span class="label">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; margin-bottom:-2px;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                누적 페널티
                            </span>
                            <span class="value">{data.userPenaltyInfo.penalty_points} / 3</span>
                            {#if data.userPenaltyInfo.penalty_points >= 3}
                                <p class="warning-text">예약이 제한되었습니다.</p>
                            {/if}
                        </div>
                    {/if}

                    {#if data.userScheduledGames && data.userScheduledGames.length > 0}
                        {#each data.userScheduledGames as game}
                            {@const time = formatScheduledTime(game.scheduled_at)}
                            <div class="status-card scheduled">
                                <span class="label">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; margin-bottom:-2px;"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                    참여 예정 게임
                                </span>
                                <span class="value">{game.game_name}</span>
                                <span class="sub-value"><span class="highlight-orange">{time.relative}</span> ({time.absolute} 시작)</span>
                                <form method="POST" action="?/leaveScheduledGame" on:submit|preventDefault={(e) => {
                                    const scheduledAt = new Date(game.scheduled_at).getTime();
                                    const now = Date.now();
                                    const form = e.target as HTMLFormElement;
                                    if (scheduledAt - now < 10 * 60 * 1000) {
                                        if (confirm('시작 10분 전입니다. 지금 취소하면 페널티가 부여됩니다. 정말 취소하시겠습니까?')) {
                                            form.submit();
                                        }
                                    } else {
                                        if (confirm('정말 참여를 취소하시겠습니까?')) {
                                            form.submit();
                                        }
                                    }
                                }}>
                                    <input type="hidden" name="sessionId" value={game.id}>
                                    <button type="submit" class="btn-cancel-small">참여 취소</button>
                                </form>
                            </div>
                        {/each}
                    {:else if data.userPlayingGame}
                        <div class="status-card playing">
                            <span class="label">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; margin-bottom:-2px;"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg>
                                참여 중인 게임
                            </span>
                            <span class="value">{data.userPlayingGame.game_name}</span>
                        </div>
                    {/if}

                    {#if data.userReservation}
                        <div class="status-card reservation">
                            <span class="label">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; margin-bottom:-2px;"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>
                                예약 내역
                            </span>
                            <span class="value">{data.userReservation.game_name}</span>
                            <span class="status-tag {data.userReservation.status}">
                                {data.userReservation.status === 'pending' ? '대기 중' : 
                                 data.userReservation.status === 'waitlisted' ? '대기 순번' : '확정'}
                            </span>
                            <form method="POST" action="?/cancelReservation" on:submit|preventDefault={(e) => {
                                if (confirm('정말 예약을 취소하시겠습니까? (시작 10분 전 이내인 경우 페널티가 부여될 수 있습니다)')) {
                                    const target = e.target as HTMLFormElement;
                                    target.submit();
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
            <h2>현재 참여 인원 ({(data.attendees || []).length})</h2>
            <div class="attendee-grid">
                {#each (data.attendees || []) as attendee}
                    {@const a = attendee as Attendee}
                    <div class="attendee-card {a.is_playing ? 'playing' : ''}">
                        <div class="attendee-info">
                            {#if a.title_name}
                                <span class="mini-title">[{a.title_name}]</span>
                            {/if}
                            <span class="name">{a.name}</span>
                        </div>
                        <span class="time">
                            {new Date(a.arrival_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            {#if a.is_playing}
                                <br><span class="playing-text">게임 중</span>
                            {/if}
                        </span>
                    </div>
                {/each}
                {#if (data.attendees || []).length === 0}
                    {#if !data.isOpen}
                        <p class="empty-state closed-state">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; vertical-align:middle; display: inline-block; position: relative; top: -1px;"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
                            금일 마감되었습니다. 오픈 전입니다.
                        </p>
                    {:else}
                        <p class="empty-state">아직 아무도 없어요. 첫 번째로 오세요!</p>
                    {/if}
                {/if}
            </div>
        </section>

        <section class="tables-section">
            <div class="section-header">
                <h2>진행 중인 게임 ({games.length})</h2>
                {#if data.user && (data.user.can_manage_games || data.isAdmin)}
                    <button class="btn-create" on:click={() => {
                        showModal = true; 
                        selectedGameName = '';
                        selectedDuration = '';
                        selectedGameId = '';
                        dropdownOpen = false;
                    }}>+ 게임 시작</button>
                {/if}
            </div>
            <div class="tables-grid">
                {#each games.slice(0, limitGames) as game}
                    {@const gameReservations = getGameReservations(game.id)}
                    {@const isParticipant = data.user && (game.players || []).some(p => p.id === data.user.id)}
                    {@const myReservation = data.user && gameReservations.find((r: any) => r.attendee_id === data.user?.id)}
                    
                    <div class="table-card playing">
                        <div class="table-header">
                            <h3>{game.game_name}</h3>
                            <div class="header-meta-row">
                                {#if canManageGame(game)}
                                    <div class="manage-controls">
                                        <button class="btn-action-text danger" on:click={() => openEndGameModal(game)}>종료</button>
                                        <form method="POST" action="?/extendGame" use:enhance style="display:inline;">
                                            <input type="hidden" name="id" value={game.id}>
                                            <input type="hidden" name="minutes" value="30">
                                            <button class="btn-action-text">연장</button>
                                        </form>
                                    </div>
                                {/if}
                                 
                                {#if data.user}
                                    <div class="user-actions">
                                        {#if isParticipant}
                                             <form method="POST" action="?/leavePlayingGame" on:submit|preventDefault={(e) => {
                                                  if ((game.players || []).length <= 2) {
                                                      alert('게임을 진행하기 위한 최소 인원(2명)이므로 나갈 수 없습니다.');
                                                      return;
                                                  }
                                                  if(confirm('정말 게임에서 나가시겠습니까?')) e.currentTarget.submit();
                                              }}>
                                                <input type="hidden" name="sessionId" value={game.id}>
                                                <button class="btn-cancel-small">나가기</button>
                                            </form>
                                        {:else if myReservation && myReservation.status === 'pending_approval'}
                                            <span class="status-text">요청 대기 중...</span>
                                        {:else if !myReservation}
                                            <form method="POST" action="?/reserveGame" use:enhance={handleJoinRequest}>
                                                <input type="hidden" name="sessionId" value={game.id}>
                                                <button class="btn-reserve">참여 요청</button>
                                            </form>
                                        {/if}
                                    </div>
                                {/if}
                            </div>
                        </div>

                        <div class="table-content">
                            <div class="session-info current">
                                <div class="session-header">
                                    <span class="time-remaining highlight-orange">{getTimeRemaining(game.end_time)}</span>
                                    <span class="end-time-label">({new Date(game.end_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} 종료 예정)</span>
                                </div>
                                <div class="players">
                                    {#each (game.players || []) as player}
                                        {@const p = player as any}
                                        <div class="player-tag">
                                            {#if p.title_name}
                                                <span class="tag-title">[{p.title_name}]</span>
                                            {/if}
                                            {p.name}
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        </div>


                    {#if canManageGame(game) || isParticipant}
                        {@const pendingRequests = gameReservations.filter((r: any) => r.status === 'pending_approval')}
                        {#if pendingRequests.length > 0}
                             <div class="game-reservations pending-requests">
                                <span class="res-label">참여 요청 ({pendingRequests.length}):</span>
                                <div class="res-list">
                                    {#each pendingRequests as req}
                                        <div class="res-item request-item">
                                            <span class="res-name">{req.attendee_name}</span>
                                            {#if data.user && req.attendee_id !== data.user.id}
                                                <div class="request-actions">
                                                    <form method="POST" action="?/approveJoinRequest" use:enhance class="inline-form">
                                                        <input type="hidden" name="reservationId" value={req.id}>
                                                        <button class="btn-icon check" aria-label="승인">
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                                        </button>
                                                    </form>
                                                    <form method="POST" action="?/rejectJoinRequest" use:enhance class="inline-form">
                                                        <input type="hidden" name="reservationId" value={req.id}>
                                                        <button class="btn-icon cross" aria-label="거절">
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                                        </button>
                                                    </form>
                                                </div>
                                            {/if}
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    {/if}

                    {#if gameReservations.filter((r: any) => r.status !== 'pending_approval').length > 0}
                        <div class="game-reservations">
                            <span class="res-label">대기열:</span>
                            <div class="res-list">
                                {#each gameReservations.filter((r: any) => r.status !== 'pending_approval') as res}
                                    <div class="res-item">
                                        <span class="res-name">{res.attendee_name}</span>
                                        {#if data.user && data.userReservation && data.userReservation.id === res.id}
                                            <form method="POST" action="?/cancelReservation" class="cancel-form-inline">
                                                <input type="hidden" name="reservationId" value={res.id}>
                                                <button type="submit" class="btn-cancel-x" aria-label="취소">×</button>
                                            </form>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}
                    </div>
                    
                {/each}
                {#if games.length === 0}
                    <div class="empty-state-message">
                        <p>현재 진행 중인 게임이 없습니다.</p>
                    </div>
                {/if}
            </div>
            {#if games.length > 5}
                <div class="show-more-container">
                    <button class="btn-show-more" on:click={toggleLimitGames}>
                        {limitGames === 5 ? '더보기 (+)' : '접기 (-)'}
                    </button>
                </div>
            {/if}
        </section>


        <section class="tables-section">
            <div class="section-header">
                <h2>시작 예정 게임 ({scheduledGames.length})</h2>
                 {#if data.user && (data.user.can_manage_games || data.isAdmin)}
                    <button class="btn-create" on:click={openScheduledGameModal}>+ 예정 생성</button>
                {/if}
            </div>
            <div class="tables-grid">
                {#each scheduledGames.slice(0, limitScheduledGames) as game}
                    {@const time = formatScheduledTime(game.scheduled_at)}
                    <div class="table-card available">
                        <div class="table-header">
                            <h3>
                                <span class="game-title-text">{game.game_name}</span>
                                <span class="sub-text">({(game.participants || []).length} / {game.max_players})</span>
                            </h3>
                            <div class="header-meta-row">
                                {#if canManageGame(game)}
                                    <div class="manage-controls">
                                        <form method="POST" action="?/startScheduledGame" use:enhance style="display:inline;">
                                            <input type="hidden" name="sessionId" value={game.id}>
                                            <button class="btn-action-text primary">시작</button>
                                        </form>
                                        <form method="POST" action="?/dissolveScheduledGame" use:enhance style="display:inline;">
                                            <input type="hidden" name="sessionId" value={game.id}>
                                            <button class="btn-action-text danger">삭제</button>
                                        </form>
                                    </div>
                                {/if}
                                {#if data.user && !(game.participants || []).some((p: any) => p.id === data.user!.id)}
                                    {@const hasConflict = (() => {
                                        const targetDate = new Date(game.scheduled_at).toDateString();
                                        if (data.userPlayingGame) {
                                            const today = new Date().toDateString();
                                            if (targetDate === today) return true;
                                        }
                                        const conflicts = [
                                            ...(data.userScheduledGames || []),
                                            ...(data.userReservation ? [data.userReservation] : [])
                                        ];
                                        return conflicts.some(c => {
                                            if (!c.scheduled_at) return false;
                                            return new Date(c.scheduled_at).toDateString() === targetDate;
                                        });
                                    })()}
                                    
                                    {#if !hasConflict}
                                        <div class="actions">
                                            <form method="POST" action="?/joinScheduledGame">
                                                <input type="hidden" name="sessionId" value={game.id}>
                                                <button type="submit" class="btn-join">
                                                    {(game.participants || []).length >= game.max_players ? '대기열 합류' : '참여하기'}
                                                </button>
                                            </form>
                                        </div>
                                    {/if}
                                {/if}
                            </div>
                        </div>

                        <div class="table-content">
                            <div class="session-info next">
                                <div class="session-header">
                                    <span class="start-time">
                                        <span class="highlight-green">{time.relative}</span>
                                        <span class="sub-text">({time.absolute} 시작)</span>
                                    </span>
                                </div>
                                <div class="participants">
                                    <div class="participant-list">
                                        {#each (game.participants || []) as p}
                                            {@const participant = p as Attendee}
                                            <span class="p-name">
                                                {#if participant.title_name}
                                                    <span class="p-title">[{participant.title_name}]</span>
                                                {/if}
                                                {participant.name}
                                            </span>
                                        {/each}
                                    </div>
                                </div>
                                
                            </div>
                        </div>
                    </div>
                {/each}
                {#if scheduledGames.length === 0}
                    <div class="empty-state-message">
                        <p>예정된 게임이 없습니다.</p>
                    </div>
                {/if}
            </div>
            {#if scheduledGames.length > 5}
                <div class="show-more-container">
                    <button class="btn-show-more" on:click={toggleLimitScheduledGames}>
                        {limitScheduledGames === 5 ? '더보기 (+)' : '접기 (-)'}
                    </button>
                </div>
            {/if}
        </section>
    </main>
</div>

{#if showModal}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div class="modal-backdrop" on:click={() => showModal = false} role="presentation">
        <div class="modal-content" on:click={handleModalClick} role="dialog">
            <h2>새 게임 시작</h2>
            <form method="POST" action="?/createGame" use:enhance={() => {
                return async ({ result, update }) => {
                    if (result.type === 'failure') {
                        const data = result.data as any;
                        if (data?.missing) {
                            showAlert('필수 입력 항목을 입력해주세요.');
                        } else {
                            showAlert(data?.error || '오류가 발생했습니다.');
                        }
                    } else {
                        showModal = false;
                    }
                    await update();
                };
            }} class="game-form">
                <input type="hidden" name="gameId" value={selectedGameId} />
                <div class="input-group custom-dropdown">
                    <input 
                        type="text" 
                        name="gameName" 
                        placeholder="게임 이름 (직접 입력 또는 선택)" 
                        bind:value={selectedGameName} 
                        bind:this={searchInput}
                        on:click={handleInputClick}
                        on:focus={handleInputClick}
                        required 
                        autocomplete="off" 
                    />
                    
                    {#if dropdownOpen && filteredGames.length > 0}
                        <ul class="dropdown-menu">
                            {#each filteredGames as game}
                                <li>
                                    <button type="button" on:click={() => selectGame(game)}>
                                        {#if game.image_url}
                                            <img src={game.image_url} alt="" class="mini-thumb" />
                                        {/if}
                                        <div class="game-option-info">
                                            <span class="name">{game.name}</span>
                                            <span class="meta">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align:middle;"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> {game.min_players}-{game.max_players}인 | 
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; margin-left:4px; vertical-align:middle;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> {game.playtime_min}분
                                            </span>
                                        </div>
                                    </button>
                                </li>
                            {/each}
                        </ul>
                    {/if}
                </div>

                <div class="input-group">
                    <label for="duration">예상 플레이 시간 (분)</label>
                    <input 
                        type="number" 
                        id="duration"
                        name="duration" 
                        bind:value={selectedDuration} 
                        placeholder="분 단위 입력" 
                        required 
                        min="1" 
                        class="duration-input"
                    />
                </div>

                <div class="player-select">
                    <p>참여자 선택:</p>
                    {#each (attendees || []) as attendee (attendee.id)}
                        <label class:disabled={attendee.is_playing}>
                            <input type="checkbox" name="players" value={attendee.id} disabled={attendee.is_playing} />
                            {attendee.name}
                            {#if attendee.is_playing}
                                <span class="status-text">(게임 중)</span>
                            {/if}
                        </label>
                    {/each}
                </div>
                
                <div class="modal-actions">
                    <button type="button" on:click={() => showModal = false} class="btn-cancel">취소</button>
                    <button type="submit" class="btn-primary">게임 시작</button>
                </div>
            </form>
        </div>
    </div>
{/if}

<!-- End Game Modal -->
{#if endGameModalVisible && selectedEndGame}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div class="modal-backdrop" on:click={() => endGameModalVisible = false} role="presentation">
        <div class="modal-content" on:click|stopPropagation role="dialog">
            <h2>
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:bottom; color:#fab005;"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
                게임 종료 및 승자 선택
            </h2>
            <p><strong>{selectedEndGame.game_name}</strong> 게임을 종료합니다.</p>
            <p>승리한 플레이어를 선택해주세요 (복수 선택 가능):</p>
            
            <form method="POST" action="?/endGame" use:enhance={() => {
                return async ({ result, update }) => {
                    if (result.type === 'failure') {
                        const data = result.data as any;
                        showAlert(data?.error || '오류가 발생했습니다.');
                    } else {
                        endGameModalVisible = false;
                        showAlert('게임이 종료되고 승자가 기록되었습니다!');
                    }
                    await update();
                };
            }}>
                <input type="hidden" name="id" value={selectedEndGame.id} />
                
                <div class="player-select">
                    {#if selectedEndGame?.players && selectedEndGame.players.length > 0}
                        {#each selectedEndGame.players as player}
                            <div class="player-score-row">
                                <label class="checkbox-label">
                                    <input type="checkbox" name="winnerIds" value={player.id}>
                                    <span class="p-name">{player.name}</span>
                                    {#if player.id === selectedEndGame.created_by}
                                        <span class="owner-badge">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>
                                        </span>
                                    {/if}
                                </label>
                                <input 
                                    type="number" 
                                    name="score_{player.id}" 
                                    placeholder="점수" 
                                    class="score-input"
                                >
                            </div>
                        {/each}
                    {:else}
                        <p class="no-players">플레이어 정보가 없습니다.</p>
                    {/if}
                </div>

                <div class="modal-actions">
                    <button type="button" class="btn-cancel" on:click={() => endGameModalVisible = false}>취소</button>
                    <button type="submit" class="btn-primary">게임 종료 및 승점 기록</button>
                </div>
            </form>
        </div>
    </div>
{/if}

{#if showScheduledGameModal}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div class="modal-backdrop" on:click={() => showScheduledGameModal = false} role="presentation">
        <div class="modal-content" on:click={handleModalClick} role="dialog">
            <h2>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:text-bottom;"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                시작 예정 게임 생성
            </h2>

            <form method="POST" action="?/createScheduledGame" use:enhance={() => {
                return async ({ result, update }) => {
                    if (result.type === 'failure') {
                        const data = result.data as any;
                        showAlert(data?.error || '오류가 발생했습니다.');
                    } else {
                        showScheduledGameModal = false;
                        showAlert('예약 게임이 생성되었습니다.');
                    }
                    await update();
                };
            }} class="game-form">
                
                <div class="input-group custom-dropdown">
                    <label for="scheduledGameName">게임 이름</label>
                    <input 
                        type="text" 
                        id="scheduledGameName"
                        name="gameName" 
                        placeholder="게임 이름 (직접 입력 또는 선택)" 
                        bind:value={scheduledGameName} 
                        bind:this={searchInput}
                        on:click={handleInputClick}
                        on:focus={handleInputClick}
                        required 
                        autocomplete="off" 
                    />
                    
                    {#if dropdownOpen && filteredScheduledGames.length > 0}
                        <ul class="dropdown-menu">
                            {#each filteredScheduledGames as game}
                                <li>
                                    <button type="button" on:click={() => selectScheduledGame(game)}>
                                        {#if game.image_url}
                                            <img src={game.image_url} alt="" class="mini-thumb" />
                                        {/if}
                                        <div class="game-option-info">
                                            <span class="name">{game.name}</span>
                                            <span class="meta">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align:middle;"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> {game.min_players}-{game.max_players}인 | 
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; margin-left:4px; vertical-align:middle;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> {game.playtime_min}분
                                            </span>
                                        </div>
                                    </button>
                                </li>
                            {/each}
                        </ul>
                    {/if}
                </div>

                <div class="input-group">
                    <label for="scheduledAt">시작 예정 시간</label>
                    <input type="datetime-local" id="scheduledAt" name="scheduledAt" bind:value={scheduledAt} required class="full-width-input">
                    <p class="hint">※ 시작 10분 전까지 최소 인원이 모이지 않으면 자동 폭파됩니다.</p>
                </div>

                <div class="player-limits">
                    <div class="input-group">
                        <label for="minPlayers">최소 인원</label>
                        <input type="number" id="minPlayers" name="minPlayers" min="1" bind:value={minPlayers} required class="number-input">
                    </div>
                    <div class="input-group">
                        <label for="maxPlayers">최대 인원</label>
                        <input type="number" id="maxPlayers" name="maxPlayers" min="1" bind:value={maxPlayers} required class="number-input">
                    </div>
                </div>
                
                <div class="modal-actions">
                    <button type="button" on:click={() => showScheduledGameModal = false} class="btn-cancel">취소</button>
                    <button type="submit" class="btn-primary">예약 생성</button>
                </div>
            </form>
        </div>
    </div>
{/if}


<!-- Alert Modal -->
{#if alertVisible}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div class="modal-backdrop" on:click={() => alertVisible = false} role="presentation">
        <div class="modal-content alert-modal" on:click|stopPropagation role="alertdialog">
            <h3>알림</h3>
            <p>{alertMessage}</p>
            <div class="modal-actions">
                <button class="btn-primary" on:click={() => alertVisible = false}>확인</button>
            </div>
        </div>
    </div>
{/if}

{#if showInstallGuide}
    <div class="modal-backdrop" on:click|self={() => showInstallGuide = false}>
        <div class="modal-content install-guide-modal">
            <h3>앱 설치 방법</h3>
            {#if isIOS}
                <ol class="guide-steps">
                    <li>
                        <span class="step-num">1</span>
                        <strong>Safari</strong>에서 이 페이지를 엽니다.
                    </li>
                    <li>
                        <span class="step-num">2</span>
                        하단의 <strong>공유 버튼</strong>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:text-bottom;"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                        을 누릅니다.
                        <div class="guide-img-placeholder">공유 버튼 스크린샷</div>
                    </li>
                    <li>
                        <span class="step-num">3</span>
                        <strong>'홈 화면에 추가'</strong>를 선택합니다.
                        <div class="guide-img-placeholder">홈 화면에 추가 스크린샷</div>
                    </li>
                    <li>
                        <span class="step-num">4</span>
                        오른쪽 상단의 <strong>'추가'</strong>를 누르면 완료!
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#2b8a3e; vertical-align:text-bottom;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    </li>
                </ol>
            {:else}
                <ol class="guide-steps">
                    <li>
                        <span class="step-num">1</span>
                        <strong>Chrome</strong>에서 이 페이지를 엽니다.
                    </li>
                    <li>
                        <span class="step-num">2</span>
                        주소창 오른쪽의 <strong>메뉴(⋮)</strong>를 누릅니다.
                        <div class="guide-img-placeholder">Chrome 메뉴 스크린샷</div>
                    </li>
                    <li>
                        <span class="step-num">3</span>
                        <strong>'앱 설치'</strong> 또는 <strong>'홈 화면에 추가'</strong>를 선택합니다.
                        <div class="guide-img-placeholder">앱 설치 스크린샷</div>
                    </li>
                    <li>
                        <span class="step-num">4</span>
                        <strong>'설치'</strong>를 누르면 완료!
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#2b8a3e; vertical-align:text-bottom;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    </li>
                </ol>
            {/if}
            <p class="guide-note">설치하면 앱처럼 바로 접속할 수 있어요.</p>
            <button class="btn-modal-close" on:click={() => showInstallGuide = false}>닫기</button>
        </div>
    </div>
{/if}

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
    /* App Header Styles */
    header.app-header {
        margin: -1rem -1rem 1.5rem -1rem; /* Negative margin to span full width */
        background: rgba(255, 255, 255, 0.85); /* Translucent white */
        backdrop-filter: blur(12px); /* Glassmorphism effect */
        -webkit-backdrop-filter: blur(12px);
        box-shadow: 0 4px 20px rgba(0,0,0,0.05);
        position: sticky;
        top: 0;
        z-index: 100;
        transition: background 0.3s ease;
    }
    .app-bar {
        padding: 0.75rem 1rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    .top-bar {
        border-bottom: none;
        padding-bottom: 0;
    }

    /* Brand Section */
    .brand-section {
        display: flex;
        align-items: center;
    }
    .brand-section h1 {
        margin: 0;
        font-size: 1.25rem;
        color: #e67700;
        font-weight: 800;
        letter-spacing: -0.5px;
    }
    


    /* Status Bar Items */
    /* Removed action-section and btn-action-pill */

    .status-section {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }
    .status-pill {
        font-size: 0.8rem;
        font-weight: 700;
        padding: 0.25rem 0.6rem;
        border-radius: 12px;
    }
    .status-pill.open {
        background: #e6fcf5;
        color: #0ca678;
        position: relative;
        padding-left: 1.2rem;
    }
    .status-pill.open::before {
        content: '';
        position: absolute;
        left: 0.4rem;
        top: 50%;
        transform: translateY(-50%);
        width: 6px;
        height: 6px;
        background-color: #0ca678;
        border-radius: 50%;
        box-shadow: 0 0 0 rgba(12, 166, 120, 0.4);
        animation: pulse-ring 2s infinite;
    }
    @keyframes pulse-ring {
        0% {
            box-shadow: 0 0 0 0 rgba(12, 166, 120, 0.7);
        }
        70% {
            box-shadow: 0 0 0 6px rgba(12, 166, 120, 0);
        }
        100% {
            box-shadow: 0 0 0 0 rgba(12, 166, 120, 0);
        }
    }
    .status-pill.closed {
        background: #fff5f5;
        color: #fa5252;
    }
    .status-pill.admin-panel {
        background: #e7f5ff;
        color: #1971c2;
        text-decoration: none;
        cursor: pointer;
        transition: background 0.2s;
        border: 1px solid #d0ebff;
    }
    .status-pill.admin-panel:hover {
        background: #d0ebff;
    }
    .live-time {
        font-family: monospace;
        font-size: 0.85rem;
        color: #666;
        background: #e9ecef;
        padding: 0.1rem 0.4rem;
        border-radius: 4px;
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
    .manager-actions {
        margin-bottom: 2rem;
        text-align: center;
    }
    .btn-manager {
        background: #2b8a3e;
        color: white;
        text-decoration: none;
        padding: 0.75rem 1.5rem;
        border-radius: 8px;
        font-weight: bold;
        display: inline-block;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn-manager:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        background: #237032;
    }
    section {
        margin-bottom: 2rem;
    }
    h2 {
        font-size: 1.2rem;
        color: #555;
        border-bottom: 2px solid #e0e0e0;
        padding-bottom: 0.5rem;
        margin: 0;
        margin-bottom: 1rem;
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
        overflow: hidden; /* Ensure content stays inside */
    }
    .name {
        font-weight: 600;
        font-size: 0.9rem;
        max-width: 100%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: block;
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
        color: #ef6c00;
        border-radius: 20px;
        font-weight: 600;
        font-size: 0.8rem;
        white-space: nowrap;
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

    .btn-action-text {
        background: none;
        border: none;
        padding: 0.2rem 0.5rem;
        cursor: pointer;
        font-size: 0.85rem;
        color: #495057;
        border-radius: 4px;
        transition: all 0.2s;
        font-weight: 600;
    }
    .btn-action-text:hover {
        background-color: #f1f3f5;
        color: #212529;
    }
    .btn-action-text.danger {
        color: #fa5252;
    }
    .btn-action-text.danger:hover {
        background-color: #fff5f5;
        color: #c92a2a;
    }
    .btn-action-text.primary {
        color: #339af0;
    }
    .btn-action-text.primary:hover {
        background-color: #e7f5ff;
        color: #1864ab;
    }

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

    .tables-grid {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-bottom: 2rem;
    }
    .table-card {
        background: white;
        padding: 0.75rem 1rem;
        border-radius: 12px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        border: 1px solid #eee;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        transition: transform 0.2s, box-shadow 0.2s;
    }
    .table-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    }
    .table-card.playing {
        border-left: 6px solid #ff9800;
    }
    .table-card.available {
        border-left: 6px solid #4caf50;
    }
    .table-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        margin-bottom: 0;
    }
    .table-header h3 {
        margin: 0;
        font-size: 1rem;
        color: #1a1a1a;
        order: 0;
        flex: 1; /* Allow it to take up space but shrink */
        min-width: 0; /* Crucial for flex truncation */
        display: flex;
        align-items: center;
        gap: 0.3rem;
    }
    .game-title-text {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 0 1 auto;
    }
    .sub-text {
        font-weight: normal;
        color: #888;
        font-size: 0.75rem;
        white-space: nowrap;
        flex-shrink: 0;
    }
    .status-badge {
        font-size: 0.65rem;
        padding: 0.15rem 0.5rem;
        display: inline-block;
    }
    .status-badge.playing {
        background: #fff3e0;
        color: #ef6c00;
    }
    .status-badge.available {
        background: #e8f5e9;
        color: #2e7d32;
    }
    .header-meta-row {
        width: auto;
        margin-top: 0;
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }
    .table-content {
        flex: 1;
        display: flex;
        flex-direction: row;
        align-items: center;
        width: auto;
        gap: 0;
    }
    .session-info {
        padding: 0;
        border-radius: 0;
        background: none !important;
        border: none !important;
        display: flex;
        flex-direction: row;
        align-items: center;
        width: 100%;
        gap: 1rem;
    }
    .session-info.current, .session-info.next {
        background: none;
        border: none;
    }
    .session-header {
        margin-bottom: 0;
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 0.5rem;
        min-width: 100px;
    }
    .session-header h4 {
        margin: 0;
        font-size: 0.9rem;
    }
    .time-remaining {
        font-weight: bold;
        color: #e65100;
    }
    
    .game-reservations {
        margin-top: 0;
        padding-top: 0;
        border-top: none;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-shrink: 0;
    }
    .res-label {
        font-size: 0.75rem;
        color: #888;
        margin-top: 0;
    }
    .res-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    .res-item {
        background: #fff;
        border: 1px solid #dee2e6;
        padding: 0.1rem 0.4rem;
        border-radius: 12px;
        font-size: 0.75rem;
        display: flex;
        align-items: center;
        gap: 0.25rem;
    }
    .res-name {
        font-weight: 500;
        color: #495057;
    }
    .cancel-form-inline {
        display: inline-flex;
        align-items: center;
    }
    .btn-cancel-x {
        background: none;
        border: none;
        color: #adb5bd;
        padding: 0;
        width: 14px;
        height: 14px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .btn-cancel-x:hover {
        background: #f1f3f5;
        color: #fa5252;
        border-radius: 50%;
    }

    .start-time {
        font-size: 0.8rem;
        font-weight: 600;
        color: #4c6ef5;
    }
    .end-time-label {
        font-size: 0.85rem;
        color: #888;
        font-weight: normal;
    }
    .players, .participants {
        flex-direction: row;
        flex-wrap: wrap;
        flex: 1;
        gap: 0.25rem;
        align-items: center;
    }
    .count {
        font-size: 0.8rem;
        color: #888;
        margin-right: 0.5rem;
    }
    .player-tag, .p-name {
        margin-right: 0;
        font-size: 0.75rem;
        padding: 0.1rem 0.4rem;
        background: white;
        border-radius: 6px;
        color: #495057;
        border: 1px solid #dee2e6;
        display: inline-block;
        /* max-width removed to allow full name display */
        /* white-space: nowrap; removed */
        /* overflow: hidden; removed */
        /* text-overflow: ellipsis; removed */
        vertical-align: middle;
    }
    .user-actions, .actions {
        margin-top: 0;
    }
    .btn-reserve, .btn-join {
        width: auto;
        padding: 0.3rem 0.8rem;
        font-size: 0.8rem;
        border-radius: 6px;
        background: #fab005;
        color: white;
        border: none;
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
    }
    
    @media (max-width: 768px) {
        .table-card {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.35rem;
        }
        .table-header {
            width: 100%;
            flex: none;
            justify-content: space-between;
        }
        .table-content {
            width: 100%;
        }
        .session-info {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.35rem;
        }
        .end-time-label {
            display: inline;
        }
        .game-reservations {
            margin-top: 0.5rem;
            margin-left: 0;
            width: 100%;
        }
    }
    .participant-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
    }
    .p-name {
        font-size: 0.75rem;
        background: white;
        color: #495057;
        padding: 0.1rem 0.5rem;
        border-radius: 4px;
        border: 1px solid #dee2e6;
    }
    .admin-actions {
        margin-top: 0.75rem;
        padding-top: 0.75rem;
        border-top: 1px dashed #dee2e6;
    }
    .attendee-select-mini {
        flex: 1;
        padding: 0.3rem;
        border-radius: 6px;
        border: 1px solid #ddd;
        font-size: 0.8rem;
    }

    .reservations-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 1rem;
        margin-bottom: 2rem;
    }
    .reservation-card {
        background: white;
        padding: 1rem;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        border: 1px solid #eee;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .res-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .res-game {
        font-weight: 600;
        font-size: 0.9rem;
        color: #555;
    }
    .reservations-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 1rem;
        margin-bottom: 2rem;
    }
    .reservation-card {
        background: white;
        padding: 1rem;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        border: 1px solid #eee;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .res-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .res-game {
        font-weight: 600;
        font-size: 0.9rem;
        color: #555;
    }
    .res-name {
        padding: 0.1rem;
        color: #333;
    }

    .btn-reserve {
        width: 100%;
        background: #fab005;
        color: white;
        border: none;
        border-radius: 8px;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.2s;
    }
    
    .highlight-orange {
        color: #ef6c00;
        font-weight: 700;
        margin-right: 0.25rem;
    }
    .highlight-green {
        color: #4caf50;
        font-weight: 700;
        margin-right: 0.25rem;
    }
    .sub-text {
        font-weight: normal;
        color: #888;
        font-size: 0.75rem;
    }

    .btn-reserve:hover {
        background: #f08c00;
    }
    .btn-reserve-mini, .btn-join-mini {
        background: #fab005;
        color: white;
        border: none;
        padding: 0.3rem 0.6rem;
        border-radius: 6px;
        font-weight: 600;
        font-size: 0.8rem;
        cursor: pointer;
    }
    .btn-join-mini {
        background: #4c6ef5;
    }
    .btn-create-session-small {
        display: block;
        text-align: center;
        text-decoration: none;
        background: #f1f3f5;
        color: #495057;
        font-size: 0.85rem;
        font-weight: 600;
        padding: 0.75rem;
        border-radius: 12px;
        border: 2px dashed #dee2e6;
        transition: all 0.2s;
    }
    .btn-create-session-small:hover {
        background: #e9ecef;
        border-color: #adb5bd;
        color: #212529;
    }
    
    /* Modal Styles */
    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }
    .modal-content {
        background: white;
        padding: 2rem;
        border-radius: 12px;
        width: 90%;
        max-width: 500px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        max-height: 90vh;
        overflow-y: auto;
    }
    .modal-content h2 {
        margin-top: 0;
        border-bottom: 2px solid #f0f0f0;
        padding-bottom: 0.5rem;
    }
    .input-group {
        margin-bottom: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        position: relative;
    }
    .input-group label {
        font-weight: 600;
        font-size: 0.9rem;
        color: #555;
    }
    .input-group input {
        padding: 0.75rem;
        border: 1px solid #ddd;
        border-radius: 8px;
        font-size: 1rem;
    }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 2rem;
    }
    .btn-primary {
        background: #4c6ef5;
        color: white;
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 8px;
        font-weight: bold;
        cursor: pointer;
    }
    .btn-cancel {
        background: #f1f3f5;
        color: #495057;
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 8px;
        font-weight: bold;
        cursor: pointer;
    }


    .player-select {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        max-height: 200px;
        overflow-y: auto;
        border: 1px solid #eee;
        padding: 0.5rem;
        border-radius: 8px;
    }
    .player-select label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.25rem;
        cursor: pointer;
    }
    .player-select label:hover {
        background: #f8f9fa;
    }
    
    .manage-controls {
        display: flex;
        gap: 0.25rem;
    }

    .res-item.request-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0rem 0.8rem;
        background: #fff;
        border: 1px solid #f1f3f5;
        border-radius: 12px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.03);
        transition: transform 0.2s, box-shadow 0.2s;
    }
    .res-item.request-item:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(0,0,0,0.06);
    }
    
    .res-name {
        font-weight: 600;
        color: #343a40;
        font-size: 0.95rem;
    }

    .btn-icon {
        background: transparent;
        border: none;
        cursor: pointer;
        width: 28px; /* Visually smaller */
        height: 28px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        margin-left: 0.3rem;
        color: #adb5bd;
        position: relative; /* For touch target expansion */
    }
    
    /* Invisible touch target expansion (creates ~44px tappable area) */
    .btn-icon::after {
        content: '';
        position: absolute;
        top: -8px;
        bottom: -8px;
        left: -8px;
        right: -8px;
    }
    
    .btn-icon:hover {
        background: #f8f9fa;
        color: #495057;
    }

    .btn-icon svg {
        width: 16px; /* Adjusted icon size */
        height: 16px;
        stroke-width: 2;
    }

    .request-actions {
        display: flex;
        align-items: center;
        gap: 0.1rem;
        padding-left: 0.2rem;
        margin-left: 0.4rem;
        border-left: 1px solid #e9ecef; /* Thin vertical bar */
        height: 24px; /* Height of the bar */
    }

    /* Check Button */
    .btn-icon.check {
        color: #b2b2b2;
    }
    .btn-icon.check:hover {
        background-color: #e6fcf5;
        color: #20c997; 
        transform: translateY(-1px);
    }

    /* Cross Button */
    .btn-icon.cross {
        color: #b2b2b2;
    }
    .btn-icon.cross:hover {
        background-color: #fff5f5;
        color: #ff6b6b;
        transform: translateY(-1px);
    }
    .btn-create {
        background: #4c6ef5;
        color: white;
        border: none;
        padding: 0.4rem 0.8rem;
        border-radius: 6px;
        font-weight: 600;
        cursor: pointer;
        font-size: 0.85rem;
    }
    .btn-create:hover {
        background: #364fc7;
    }
    
    /* Dropdown Styles */
    .dropdown-menu {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        max-height: 200px;
        overflow-y: auto;
        z-index: 10;
        list-style: none;
        padding: 0;
        margin: 0;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    .dropdown-menu li button {
        width: 100%;
        text-align: left;
        padding: 0.75rem;
        background: none;
        border: none;
        border-bottom: 1px solid #f0f0f0;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }
    .dropdown-menu li button:hover {
        background: #f8f9fa;
    }
    .mini-thumb {
        width: 32px;
        height: 32px;
        border-radius: 4px;
        object-fit: cover;
    }
    .game-option-info {
        display: flex;
        flex-direction: column;
    }
    .game-option-info .name {
        font-weight: 600;
        color: #333;
    }
    .game-option-info .meta {
        font-size: 0.75rem;
        color: #888;
    }

    /* End Game Modal Player Score Row */
    .player-select {
        max-height: 300px;
        overflow-y: auto;
        border: 1px solid #eee;
        border-radius: 8px;
        padding: 0.5rem;
        margin-bottom: 1.5rem;
    }
    .player-score-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem;
        border-bottom: 1px solid #f8f9fa;
        gap: 0.5rem;
    }
    .player-score-row:last-child {
        border-bottom: none;
    }
    .checkbox-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
        flex: 1;
        /* Ensure text truncates if too long, though names shouldn't be that long */
        min-width: 0; 
    }
    .score-input {
        width: 70px;
        padding: 0.4rem;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 0.9rem;
        text-align: center;
    }
    .owner-badge {
        font-size: 0.8rem;
    }
    .end-time-label {
        font-size: 0.75rem;
        color: #868e96;
        font-weight: normal;
        white-space: nowrap;
    }

    .show-more-container {
        display: flex;
        justify-content: center;
        margin-top: 1rem;
        padding-bottom: 1rem;
    }

    .btn-show-more {
        background: white;
        border: 1px solid #ddd;
        padding: 0.5rem 1.5rem;
        border-radius: 20px;
        color: #666;
        cursor: pointer;
        font-size: 0.9rem;
        transition: all 0.2s;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }

    .btn-show-more:hover {
        background: #f8f9fa;
        color: #333;
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }

    @media (max-width: 768px) {
        .container {
            padding-bottom: 80px;
        }
    }
    /* User Greeting in Header */
    .user-greeting {
        font-size: 0.9rem;
        color: #555;
        margin-left: 0.8rem;
        display: flex;
        align-items: center;
        gap: 4px;
    }
    .user-greeting .user-title {
        color: #e67700;
        font-weight: 700;
        font-size: 0.85em;
    }
    .user-greeting .user-name {
        font-weight: 600;
    }

    @media (max-width: 480px) {
        .brand-section {
            flex-direction: column;
            align-items: flex-start;
            gap: 2px;
        }
        .user-greeting {
            margin-left: 0;
            font-size: 0.8rem;
        }
    }
    /* Mini Titles */
    .mini-title {
        font-size: 0.75rem;
        color: #e67700;
        font-weight: 700;
        margin-right: 2px;
        display: block; /* Stack on mobile */
    }
    .attendee-info {
        display: flex;
        flex-direction: column; 
        justify-content: center;
        width: 100%; /* Force full width to trigger truncation */
        min-width: 0;
        flex: 1;
    }
    .attendee-info .name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    
    .tag-title {
        font-size: 0.7rem;
        color: #e67700;
        font-weight: 700;
        display: inline-block;
        margin-right: 2px;
    }
    .player-tag {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        background: #f1f3f5;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.85rem;
        margin-right: 4px;
        margin-bottom: 4px;
    }

    .p-name {
        display: inline-flex;
        align-items: center;
        gap: 2px;
    }
    .p-title {
        font-size: 0.75rem;
        color: #e67700;
        font-weight: 700;
    }

    /* Install Guide Button */
    .install-guide-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        width: 100%;
        padding: 0.75rem;
        background: white;
        border: 1px dashed #ccc;
        border-radius: 12px;
        color: #555;
        font-size: 0.9rem;
        font-weight: 600;
        cursor: pointer;
        margin-bottom: 1rem;
        transition: all 0.2s;
    }
    .install-guide-btn:hover {
        background: #f8f9fa;
        border-color: #aaa;
        color: #333;
    }

    /* Install Guide Modal */
    .install-guide-modal {
        max-width: 400px;
    }
    .install-guide-modal h3 {
        margin: 0 0 1.2rem 0;
        text-align: center;
        font-size: 1.2rem;
        color: #333;
    }
    .install-guide-modal .guide-steps {
        padding: 0;
        margin: 0 0 1rem 0;
        list-style: none;
    }
    .install-guide-modal .guide-steps li {
        margin-bottom: 1rem;
        line-height: 1.6;
        color: #555;
        font-size: 0.95rem;
    }
    .install-guide-modal .step-num {
        display: inline-block;
        background: #e7f5ff;
        color: #339af0;
        font-weight: bold;
        padding: 0.1rem 0.5rem;
        border-radius: 6px;
        margin-right: 0.5rem;
    }
    .guide-img-placeholder {
        margin-top: 0.5rem;
        padding: 2rem 1rem;
        background: #f1f3f5;
        border: 2px dashed #dee2e6;
        border-radius: 8px;
        text-align: center;
        color: #adb5bd;
        font-size: 0.85rem;
    }
    .guide-note {
        text-align: center;
        color: #888;
        font-size: 0.85rem;
        margin: 0 0 1rem 0;
    }
    .btn-modal-close {
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
    .btn-modal-close:hover {
        background: #228be6;
    }
</style>
