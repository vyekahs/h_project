<script lang="ts">
    import type { PageData } from './$types';
    import { onMount, onDestroy } from 'svelte';
    import { enhance, applyAction } from '$app/forms';
    import { invalidateAll } from '$app/navigation';
    import NotificationBell from '$lib/components/notifications/NotificationBell.svelte';
    let lastUpdated = new Date();

    // SSE 실시간 카운트
    let liveVisitorCount: number | null = null;
    let liveGameCount: number | null = null;
    let eventSource: EventSource | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let sseReconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let sseDestroyed = false;
    let sseReconnectDelay = 3000;

    interface User {
        id: number;
        name: string;
        can_manage_games: boolean;
        title?: { title_name: string };
    }
    
    interface Party {
        id: number;
        name: string;
        game_id: number | null;
        game_name: string | null;
        resolved_game_name: string | null;
        image_url: string | null;
        duration: number | null;
        guest_count: number;
        members: { id: number; name: string }[];
    }

    export let data: {
        attendees: Attendee[];
        games: GameSession[];
        scheduledGames: GameSession[];
        userReservation: Reservation | null;
        userScheduledGames: GameSession[];
        userPlayingGame: GameSession | null;
        user: User | null;
        isOpen: boolean;
        notice: string | null;
        userPenaltyInfo: { penalty_points: number } | null;
        isAdmin: boolean;
        reservations: Reservation[];
        allGames: any[];
        parties: Party[];
        userPartyIds: number[];
        dailyVisitPlans: { id: number; attendee_id: number; name: string; planned_time?: string | null; title_name?: string }[];
        mainScheduledGames: GameSession[];
        todayScheduledParticipants: { attendee_id: number; name: string; title_name?: string; is_party: boolean; planned_time: string }[];
        userHasVisitPlan: boolean;
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
        party_id: number | null;
        participants: { id: number; name: string; is_guest?: boolean }[];
        players: { id: number; name: string; is_guest?: boolean }[];
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

    // 오늘 갈 예정: 예약 참가자 합치기 (체크인한 사람, 이미 등록된 사람 제외)
    $: checkedInIds = new Set((data.attendees || []).map((a: any) => a.id));
    $: visitPlanIds = new Set((data.dailyVisitPlans || []).map((p: any) => p.attendee_id));
    $: scheduledVisitors = (data.todayScheduledParticipants || []).filter((p: any) => !checkedInIds.has(p.attendee_id) && !visitPlanIds.has(p.attendee_id));
    $: mergedVisitPlans = [...(data.dailyVisitPlans || []), ...scheduledVisitors.map((p: any) => ({ attendee_id: p.attendee_id, name: p.name, planned_time: p.planned_time, title_name: p.title_name, is_party: p.is_party }))];

    function getGameReservations(gameId: number) {
        return (data.reservations || []).filter((r: any) => r.session_id === gameId);
    }

    // --- Tab System ---
    let activeTab: 'home' | 'games' = 'home';
    let isTablet = false;
    let showAllMainGames = false;
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
    let guestCount = 0;
    let selectedPlayerIds: number[] = [];
    let scheduledSelectedPlayerIds: number[] = [];
    let partyMembers: { id: number; name: string }[] = [];
    let scheduledPartyMembers: { id: number; name: string }[] = [];
    let partyDropdownOpen = false;
    let scheduledPartyDropdownOpen = false;
    let showGuestInput = false;
    let showScheduledGuestInput = false;
    let selectedPartyId: number | null = null;
    let scheduledSelectedPartyId: number | null = null;

    $: parties = (data.parties || []) as Party[];
    $: userPartyIds = new Set(data.userPartyIds || []);

    function canJoinGame(game: any): boolean {
        if (!game.party_id) return true;
        return userPartyIds.has(game.party_id);
    }

    // 참석자 + 고정팟 미참석 멤버 병합 (고정팟 멤버 상단 정렬)
    $: mergedAttendees = (() => {
        const attendeeIds = new Set((attendees || []).map(a => a.id));
        const partyMemberIds = new Set(partyMembers.map(m => m.id));
        const extra = partyMembers
            .filter(m => !attendeeIds.has(m.id))
            .map(m => ({ id: m.id, name: m.name, arrival_time: '', is_playing: false, title_name: undefined, isPartyOnly: true, isPartyMember: true }));
        const mapped = (attendees || []).map(a => ({ ...a, isPartyOnly: false, isPartyMember: partyMemberIds.has(a.id) }));
        // 고정팟 멤버를 상단에 정렬
        const sorted = [...mapped, ...extra].sort((a, b) => {
            if (a.isPartyMember && !b.isPartyMember) return -1;
            if (!a.isPartyMember && b.isPartyMember) return 1;
            return 0;
        });
        return sorted;
    })();

    let endGameModalVisible = false;
    let selectedEndGame: GameSession | null = null;

    // Visit Plan Modal
    let showVisitPlanModal = false;
    let selectedVisitTime = '';
    let isTimeDropdownOpen = false;

    function getDefaultVisitTime(): string {
        const now = new Date();
        const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        let h = kst.getUTCHours() + 2;
        let m = kst.getUTCMinutes();
        // 30분 단위 올림
        if (m > 0 && m <= 30) { m = 30; }
        else if (m > 30) { m = 0; h++; }
        if (h > 23) h = 23;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    function getVisitTimeOptions(): string[] {
        const now = new Date();
        const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        const currentH = kst.getUTCHours();
        const currentM = kst.getUTCMinutes();
        const options: string[] = [];
        for (let h = 9; h <= 23; h++) {
            for (const m of [0, 30]) {
                if (h === 23 && m === 30) continue;
                // 현재 시간 이후만
                if (h < currentH || (h === currentH && m <= currentM)) continue;
                options.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
            }
        }
        return options;
    }

    function formatVisitTime(time: string | null | undefined): string {
        if (!time) return '';
        const parts = time.split(':');
        const h = parseInt(parts[0]);
        const m = parts[1] || '00';
        return `${h}시${m !== '00' ? ' ' + m + '분' : ''}`;
    }

    function openVisitPlanModal() {
        selectedVisitTime = getDefaultVisitTime();
        isTimeDropdownOpen = false;
        showVisitPlanModal = true;
    }

    function openEditVisitPlanModal() {
        const myPlan = mergedVisitPlans.find((p: any) => p.attendee_id === data.user?.id);
        if (!myPlan) return;
        selectedVisitTime = myPlan.planned_time ? myPlan.planned_time.substring(0, 5) : getDefaultVisitTime();
        isTimeDropdownOpen = false;
        showVisitPlanModal = true;
    }

    let alertVisible = false;
    let alertMessage = '';

    // Confirm Modal
    let confirmVisible = false;
    let confirmMessage = '';
    let confirmResolve: ((value: boolean) => void) | null = null;

    function showConfirm(msg: string): Promise<boolean> {
        confirmMessage = msg;
        confirmVisible = true;
        return new Promise((resolve) => { confirmResolve = resolve; });
    }

    function handleConfirm(result: boolean) {
        confirmVisible = false;
        if (confirmResolve) { confirmResolve(result); confirmResolve = null; }
    }

    // PWA Install Guide
    let showInstallGuide = false;
    let isIOS = false;
    let isStandalone = false;

    let tabletMq: MediaQueryList;
    onMount(() => {
        isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        isStandalone = window.matchMedia('(display-mode: standalone)').matches
            || (navigator as any).standalone === true;

        tabletMq = window.matchMedia('(min-width: 769px)');
        isTablet = tabletMq.matches;
        tabletMq.addEventListener('change', (e) => { isTablet = e.matches; });

        connectSSE();
    });

    function connectSSE() {
        if (sseDestroyed) return;
        if (eventSource) eventSource.close();

        eventSource = new EventSource('/api/sse/live');
        eventSource.addEventListener('visitors', (e: MessageEvent) => {
            sseReconnectDelay = 3000;
            const d = JSON.parse(e.data);
            liveVisitorCount = d.count;
            scheduleRefresh();
        });
        eventSource.addEventListener('games', (e: MessageEvent) => {
            sseReconnectDelay = 3000;
            const d = JSON.parse(e.data);
            liveGameCount = d.count;
            scheduleRefresh();
        });
        eventSource.onerror = () => {
            if (eventSource) { eventSource.close(); eventSource = null; }
            if (!sseDestroyed) {
                sseReconnectTimer = setTimeout(connectSSE, sseReconnectDelay);
                sseReconnectDelay = Math.min(sseReconnectDelay * 2, 30000);
            }
        };
    }

    function scheduleRefresh() {
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
            invalidateAll();
            lastUpdated = new Date();
        }, 1000);
    }

    onDestroy(() => {
        sseDestroyed = true;
        if (eventSource) { eventSource.close(); eventSource = null; }
        if (refreshTimer) clearTimeout(refreshTimer);
        if (sseReconnectTimer) clearTimeout(sseReconnectTimer);
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

    function applyPartyToModal(party: Party) {
        selectedGameName = party.game_name || party.resolved_game_name || '';
        selectedGameId = party.game_id?.toString() || '';
        selectedDuration = party.duration?.toString() || '';
        guestCount = party.guest_count || 0;
        showGuestInput = guestCount > 0;
        partyMembers = party.members;
        selectedPlayerIds = party.members.map(m => m.id);
        selectedPartyId = party.id;
    }

    function applyPartyToScheduledModal(party: Party) {
        scheduledGameName = party.game_name || party.resolved_game_name || '';
        guestCount = party.guest_count || 0;
        showScheduledGuestInput = guestCount > 0;
        scheduledPartyMembers = party.members;
        scheduledSelectedPlayerIds = party.members.map(m => m.id);
        scheduledSelectedPartyId = party.id;
    }

    function openScheduledGameModal() {
        showScheduledGameModal = true;
        scheduledGameName = '';
        dropdownOpen = false;
        guestCount = 0;
        showScheduledGuestInput = false;
        scheduledSelectedPlayerIds = [];
        scheduledPartyMembers = [];
        scheduledSelectedPartyId = null;

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
        if (!target.closest('.party-dropdown-wrapper')) {
            partyDropdownOpen = false;
            scheduledPartyDropdownOpen = false;
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
                            <span class="user-title">{data.user.title.title_name}</span>
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
                <NotificationBell />
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
        <button class="install-guide-btn" onclick={() => showInstallGuide = true}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            앱 설치 방법
        </button>
    {/if} -->

    {#snippet homeContent()}
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
                                <form method="POST" action="?/leaveScheduledGame"
                                    use:enhance={async ({ cancel }) => {
                                        const scheduledAt = new Date(game.scheduled_at).getTime();
                                        const now = Date.now();
                                        let msg = '정말 참여를 취소하시겠습니까?';
                                        if (scheduledAt - now < 10 * 60 * 1000) {
                                            msg = '시작 10분 전입니다. 지금 취소하면 페널티가 부여됩니다. 정말 취소하시겠습니까?';
                                        }
                                        const ok = await showConfirm(msg);
                                        if (!ok) { cancel(); return; }
                                        return async ({ result }) => {
                                            await applyAction(result);
                                            await invalidateAll();
                                        };
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
                            <form method="POST" action="?/cancelReservation"
                                use:enhance={async ({ cancel }) => {
                                    const ok = await showConfirm('정말 예약을 취소하시겠습니까? (시작 10분 전 이내인 경우 페널티가 부여될 수 있습니다)');
                                    if (!ok) { cancel(); return; }
                                    return async ({ result }) => {
                                        await applyAction(result);
                                        await invalidateAll();
                                    };
                                }}>
                                <input type="hidden" name="reservationId" value={data.userReservation.id}>
                                <button type="submit" class="btn-cancel-small">예약 취소</button>
                            </form>
                        </div>
                    {/if}
                </div>
            </section>
        {/if}

        {#if (data.mainScheduledGames || []).length > 0}
            {@const mainGames = data.mainScheduledGames || []}
            <section class="tables-section">
                <div class="main-games-toggle-header" onclick={() => { if (mainGames.length > 1) showAllMainGames = !showAllMainGames; }} onkeydown={(e) => { if (e.key === 'Enter' && mainGames.length > 1) showAllMainGames = !showAllMainGames; }} role="button" tabindex="0">
                    <h2>이번주 혼놀데이</h2>
                    {#if mainGames.length > 1}
                        <span class="expand-icon" class:rotated={showAllMainGames}>{showAllMainGames ? '접기' : `+${mainGames.length - 1}개 더보기`}</span>
                    {/if}
                </div>
                <div class="tables-grid">
                    {#each showAllMainGames ? mainGames : mainGames.slice(0, 1) as game}
                        {@const isPlaying = game.status === 'playing'}
                        {@const time = isPlaying ? null : formatScheduledTime(game.scheduled_at)}
                        <div class="table-card available">
                            <div class="table-header">
                                <h3>
                                    <span class="game-title-text">{game.game_name}</span>
                                    {#if game.party_id}<span class="party-badge">고정팟</span>{/if}
                                    <span class="sub-text">({(game.participants || game.players || []).length}{#if game.max_players} / {game.max_players}{/if})</span>
                                </h3>
                                <div class="header-meta-row">
                                    {#if !isPlaying && data.user && !(game.participants || []).some((p: any) => p.id === data.user!.id)}
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

                                        {#if !hasConflict && canJoinGame(game)}
                                            <div class="actions">
                                                <form method="POST" action="?/joinScheduledGame"
                                                    use:enhance={() => {
                                                        return async ({ result }) => {
                                                            await applyAction(result);
                                                            await invalidateAll();
                                                        };
                                                    }}>
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
                                            {#if isPlaying}
                                                <span class="highlight-playing">진행중</span>
                                            {:else if time}
                                                <span class="highlight-green">{time.relative}</span>
                                                <span class="sub-text">({time.absolute} 시작)</span>
                                            {/if}
                                        </span>
                                    </div>
                                    <div class="participants">
                                        <div class="participant-list">
                                            {#each (game.participants || game.players || []) as p}
                                                {@const participant = p as any}
                                                <span class="p-name" class:guest-name={participant.is_guest}>
                                                    {#if participant.title_name}
                                                        <span class="p-title">[ {participant.title_name} ]</span>
                                                    {/if}
                                                    {participant.name}
                                                    {#if participant.is_guest}
                                                        <span class="guest-badge">G</span>
                                                    {/if}
                                                </span>
                                            {/each}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
            </section>
        {/if}

        <section class="attendees-section">
            <h2>현재 참여 인원 ({liveVisitorCount ?? (data.attendees || []).length})</h2>
            <div class="attendee-grid">
                {#each (data.attendees || []) as attendee}
                    {@const a = attendee as Attendee}
                    <div class="attendee-card {a.is_playing ? 'playing' : ''}">
                        <div class="attendee-info">
                            {#if a.title_name}
                                <span class="mini-title">{a.title_name}</span>
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

        <section class="visit-plan-section">
            <div class="section-header">
                <h2>오늘 갈 예정 ({mergedVisitPlans.length})</h2>
                {#if data.user && !checkedInIds.has(data.user.id)}
                    {#if data.userHasVisitPlan}
                        <form method="POST" action="?/toggleVisitPlan" use:enhance={() => {
                            return async ({ result, update }) => { await update(); };
                        }}>
                            <input type="hidden" name="cancel" value="true" />
                            <button type="submit" class="btn-visit-plan active">취소하기</button>
                        </form>
                    {:else}
                        <button type="button" class="btn-visit-plan" onclick={openVisitPlanModal}>나도 갈 예정!</button>
                    {/if}
                {/if}
            </div>
            <div class="visit-plan-grid">
                {#each mergedVisitPlans as plan}
                    {@const isMyPlan = data.user && plan.attendee_id === data.user.id && !checkedInIds.has(data.user.id)}
                    <!-- svelte-ignore a11y_no_static_element_interactions a11y_no_noninteractive_tabindex -->
                    <div
                        class="visit-plan-card"
                        class:editable={isMyPlan}
                        onclick={() => isMyPlan && openEditVisitPlanModal()}
                        onkeydown={(e) => isMyPlan && e.key === 'Enter' && openEditVisitPlanModal()}
                        role={isMyPlan ? 'button' : undefined}
                        tabindex={isMyPlan ? 0 : undefined}
                    >
                        {#if plan.title_name}
                            <span class="mini-title">{plan.title_name}</span>
                        {/if}
                        <span class="name">{plan.name}</span>
                        {#if (plan as any).is_party}
                            <span class="party-chip">고정팟</span>
                        {/if}
                        {#if plan.planned_time}
                            <span class="visit-time">{formatVisitTime(plan.planned_time)} ~</span>
                        {:else}
                            <span class="visit-time maybe">상황봐서</span>
                        {/if}
                    </div>
                {/each}
                {#if mergedVisitPlans.length === 0}
                    <p class="empty-state">아직 오늘의 첫 번째 방문자가 없어요. 내가 먼저 등록해볼까요?</p>
                {/if}
            </div>
        </section>
    {/snippet}

    {#snippet gamesContent()}
        <section class="tables-section">
            <div class="section-header">
                <h2>진행 중인 게임 ({liveGameCount ?? games.length})</h2>
                {#if data.user && (data.user.can_manage_games || data.isAdmin)}
                    <button class="btn-create" onclick={() => {
                        showModal = true;
                        selectedGameName = '';
                        selectedDuration = '';
                        selectedGameId = '';
                        dropdownOpen = false;
                        guestCount = 0;
                        showGuestInput = false;
                        selectedPlayerIds = [];
                        partyMembers = [];
                        selectedPartyId = null;
                    }}>+ 게임 시작</button>
                {/if}
            </div>
            <div class="tables-grid">
                {#each games.slice(0, limitGames) as game}
                    {@const gameReservations = getGameReservations(game.id)}
                    {@const isParticipant = data.user && (game.players || []).some(p => p.id === data.user?.id)}
                    {@const myReservation = data.user && gameReservations.find((r: any) => r.attendee_id === data.user?.id)}
                    
                    <div class="table-card playing">
                        <div class="table-header">
                            <h3>{game.game_name}{#if game.party_id}<span class="party-badge">고정팟</span>{/if}</h3>
                            <div class="header-meta-row">
                                {#if isParticipant}
                                    <div class="manage-controls">
                                        <button class="btn-action-text danger" onclick={() => openEndGameModal(game)}>종료</button>
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
                                             <form method="POST" action="?/leavePlayingGame"
                                                use:enhance={async ({ cancel }) => {
                                                    const registeredCount = (game.players || []).filter((p: any) => !p.is_guest).length;
                                                    if (registeredCount <= 2) {
                                                        alertMessage = '게임을 진행하기 위한 최소 인원(2명)이므로 나갈 수 없습니다.';
                                                        alertVisible = true;
                                                        cancel(); return;
                                                    }
                                                    const ok = await showConfirm('정말 게임에서 나가시겠습니까?');
                                                    if (!ok) { cancel(); return; }
                                                    return async ({ result }) => {
                                                        await applyAction(result);
                                                        await invalidateAll();
                                                    };
                                                }}>
                                                <input type="hidden" name="sessionId" value={game.id}>
                                                <button class="btn-cancel-small">나가기</button>
                                            </form>
                                        {:else if myReservation && myReservation.status === 'pending_approval'}
                                            <form method="POST" action="?/cancelReservation" class="cancel-form-inline"
                                                use:enhance={async ({ cancel }) => {
                                                    const ok = await showConfirm('참여 요청을 취소하시겠습니까?');
                                                    if (!ok) { cancel(); return; }
                                                    return async ({ result }) => {
                                                        await applyAction(result);
                                                        await invalidateAll();
                                                    };
                                                }}>
                                                <input type="hidden" name="reservationId" value={myReservation.id}>
                                                <button class="btn-pending-cancel">신청 취소</button>
                                            </form>
                                        {:else if !myReservation && canJoinGame(game)}
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
                                        <div class="player-tag" class:guest-tag={p.is_guest}>
                                            {#if p.title_name}
                                                <span class="tag-title">[ {p.title_name} ]</span>
                                            {/if}
                                            {p.name}
                                            {#if p.is_guest}
                                                <span class="guest-badge">G</span>
                                            {/if}
                                        </div>
                                    {/each}
                                </div>
                                {#if isParticipant && game.game_name.includes('티츄') && (game.players || []).length === 4}
                                    <a href="/tools/tichu-counter?sessionId={game.id}&players={encodeURIComponent(JSON.stringify((game.players || []).map(p => ({ id: p.id, name: p.name }))))}"
                                       class="btn-tichu-counter">점수판 열기</a>
                                {/if}
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
                    <button class="btn-show-more" onclick={toggleLimitGames}>
                        {limitGames === 5 ? '더보기 (+)' : '접기 (-)'}
                    </button>
                </div>
            {/if}
        </section>


        <section class="tables-section">
            <div class="section-header">
                <h2>시작 예정 게임 ({scheduledGames.length})</h2>
                 {#if data.user && (data.user.can_manage_games || data.isAdmin)}
                    <button class="btn-create" onclick={openScheduledGameModal}>+ 예정 생성</button>
                {/if}
            </div>
            <div class="tables-grid">
                {#each scheduledGames.slice(0, limitScheduledGames) as game}
                    {@const time = formatScheduledTime(game.scheduled_at)}
                    <div class="table-card available">
                        <div class="table-header">
                            <h3>
                                <span class="game-title-text">{game.game_name}</span>
                                {#if game.party_id}<span class="party-badge">고정팟</span>{/if}
                                <span class="sub-text">({(game.participants || []).length} / {game.max_players})</span>
                            </h3>
                            <div class="header-meta-row">
                                {#if data.user && (game.participants || []).some((p: any) => p.id === data.user!.id)}
                                    <div class="manage-controls">
                                        <form method="POST" action="?/startScheduledGame" use:enhance style="display:inline;">
                                            <input type="hidden" name="sessionId" value={game.id}>
                                            <button class="btn-action-text primary">시작</button>
                                        </form>
                                        {#if !game.recurring_schedule_id || data.isAdmin}
                                            <form method="POST" action="?/dissolveScheduledGame" use:enhance style="display:inline;">
                                                <input type="hidden" name="sessionId" value={game.id}>
                                                <button class="btn-action-text danger">삭제</button>
                                            </form>
                                        {/if}
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
                                    
                                    {#if !hasConflict && canJoinGame(game)}
                                        <div class="actions">
                                            <form method="POST" action="?/joinScheduledGame"
                                                use:enhance={() => {
                                                    return async ({ result }) => {
                                                        await applyAction(result);
                                                        await invalidateAll();
                                                    };
                                                }}>
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
                                            {@const participant = p as any}
                                            <span class="p-name" class:guest-name={participant.is_guest}>
                                                {#if participant.title_name}
                                                    <span class="p-title">[ {participant.title_name} ]</span>
                                                {/if}
                                                {participant.name}
                                                {#if participant.is_guest}
                                                    <span class="guest-badge">G</span>
                                                {/if}
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
                    <button class="btn-show-more" onclick={toggleLimitScheduledGames}>
                        {limitScheduledGames === 5 ? '더보기 (+)' : '접기 (-)'}
                    </button>
                </div>
            {/if}
        </section>
    {/snippet}

    <main>
        {#if isTablet}
            <div class="main-panels">
                <div class="panel">
                    <h2 class="panel-title">홈</h2>
                    {@render homeContent()}
                </div>
                <div class="panel">
                    <h2 class="panel-title">게임</h2>
                    {@render gamesContent()}
                </div>
            </div>
        {:else}
            <div class="tab-bar">
                <button class="tab-btn" class:active={activeTab === 'home'} onclick={() => activeTab = 'home'}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; vertical-align:text-bottom;"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    홈
                </button>
                <button class="tab-btn" class:active={activeTab === 'games'} onclick={() => activeTab = 'games'}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; vertical-align:text-bottom;"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg>
                    게임
                </button>
            </div>

            {#if activeTab === 'home'}
                {@render homeContent()}
            {:else}
                {@render gamesContent()}
            {/if}
        {/if}
    </main>
</div>

{#if showModal}
    <div 
        class="modal-backdrop" 
        onclick={() => showModal = false} 
        onkeydown={(e) => e.key === 'Escape' && (showModal = false)}
        role="button" 
        tabindex="-1"
        aria-label="Close modal"
    >
        <div class="modal-content" onclick={handleModalClick} onkeydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
            <h2>새 게임 시작</h2>
            {#if parties.length > 0}
                <div class="party-selector">
                    <span class="label-heading">고정팟 불러오기</span>
                    <div class="party-dropdown-wrapper" onclick={(e) => e.stopPropagation()} role="presentation">
                        <button id="partyDropdown" type="button" class="party-dropdown-trigger" onclick={() => partyDropdownOpen = !partyDropdownOpen}>
                            <span>고정팟 선택</span>
                            <span class="party-chevron" class:open={partyDropdownOpen}>&#9662;</span>
                        </button>
                        {#if partyDropdownOpen}
                            <div class="party-dropdown-list">
                                {#each parties as party}
                                    <button type="button" class="party-dropdown-item" onclick={() => {
                                        applyPartyToModal(party);
                                        partyDropdownOpen = false;
                                    }}>
                                        <span class="party-item-name">{party.name}</span>
                                        <span class="party-item-game">{party.game_name || party.resolved_game_name || '게임 미지정'}</span>
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            {/if}
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
                {#if selectedPartyId}
                    <input type="hidden" name="partyId" value={selectedPartyId} />
                {/if}
                <div class="input-group custom-dropdown">
                    <input 
                        type="text" 
                        name="gameName" 
                        placeholder="게임 이름 (직접 입력 또는 선택)" 
                        bind:value={selectedGameName} 
                        bind:this={searchInput}
                        onclick={handleInputClick}
                        onfocus={handleInputClick}
                        required 
                        autocomplete="off" 
                    />
                    
                    {#if dropdownOpen && filteredGames.length > 0}
                        <ul class="dropdown-menu">
                            {#each filteredGames as game}
                                <li>
                                    <button type="button" onclick={() => selectGame(game)}>
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
                    {#each mergedAttendees as attendee (attendee.id)}
                        <label class:disabled={attendee.is_playing} class:party-member={attendee.isPartyMember}>
                            <input
                                type="checkbox"
                                name="players"
                                value={attendee.id}
                                disabled={attendee.is_playing}
                                bind:group={selectedPlayerIds}
                            />
                            {attendee.name}
                            {#if attendee.isPartyOnly}
                                <span class="status-text">(미참석)</span>
                            {:else if attendee.is_playing}
                                <span class="status-text">(게임 중)</span>
                            {/if}
                        </label>
                    {/each}
                </div>

                {#if showGuestInput}
                    <div class="input-group guest-input-group">
                        <label for="guestCount">게스트 수</label>
                        <input
                            type="number"
                            id="guestCount"
                            name="guestCount"
                            bind:value={guestCount}
                            min="0"
                            max="20"
                            class="number-input"
                        />
                        <p class="hint">* 미등록 참가자 수 (게스트1, 게스트2... 자동 생성)</p>
                    </div>
                {:else}
                    <input type="hidden" name="guestCount" value="0" />
                    <button type="button" class="btn-toggle-guest" onclick={() => showGuestInput = true}>+ 게스트 추가</button>
                {/if}

                <div class="modal-actions">
                    <button type="button" onclick={() => showModal = false} class="btn-cancel">취소</button>
                    <button type="submit" class="btn-primary">게임 시작</button>
                </div>
            </form>
        </div>
    </div>
{/if}

<!-- End Game Modal -->
{#if endGameModalVisible && selectedEndGame}
    <div 
        class="modal-backdrop" 
        onclick={() => endGameModalVisible = false} 
        onkeydown={(e) => e.key === 'Escape' && (endGameModalVisible = false)}
        role="button" 
        tabindex="-1"
        aria-label="Close modal"
    >
        <div class="modal-content" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
            <h2>
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:bottom;"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
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
                            {@const pl = player as any}
                            <div class="player-score-row">
                                <label class="checkbox-label">
                                    <input type="checkbox" name="winnerIds" value={pl.id}>
                                    <span class="p-name">{pl.name}</span>
                                    {#if pl.id === selectedEndGame.created_by}
                                        <span class="owner-badge">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>
                                        </span>
                                    {/if}
                                    {#if pl.is_guest}
                                        <span class="guest-badge">G</span>
                                    {/if}
                                </label>
                                <input
                                    type="number"
                                    name="score_{pl.id}"
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
                    <button type="button" class="btn-cancel" onclick={() => endGameModalVisible = false}>취소</button>
                    <button type="submit" class="btn-primary">게임 종료 및 승점 기록</button>
                </div>
            </form>
        </div>
    </div>
{/if}


{#if showScheduledGameModal}
    <div 
        class="modal-backdrop" 
        onclick={() => showScheduledGameModal = false} 
        onkeydown={(e) => e.key === 'Escape' && (showScheduledGameModal = false)}
        role="button" 
        tabindex="-1"
        aria-label="Close modal"
    >
        <div class="modal-content" onclick={handleModalClick} onkeydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
            <h2>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:text-bottom;"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                시작 예정 게임 생성
            </h2>
            {#if parties.length > 0}
                <div class="party-selector">
                    <span class="label-heading">고정팟 불러오기</span>
                    <div class="party-dropdown-wrapper" onclick={(e) => e.stopPropagation()} role="presentation">
                        <button id="scheduledPartyDropdown" type="button" class="party-dropdown-trigger" onclick={() => scheduledPartyDropdownOpen = !scheduledPartyDropdownOpen}>
                            <span>고정팟 선택</span>
                            <span class="party-chevron" class:open={scheduledPartyDropdownOpen}>&#9662;</span>
                        </button>
                        {#if scheduledPartyDropdownOpen}
                            <div class="party-dropdown-list">
                                {#each parties as party}
                                    <button type="button" class="party-dropdown-item" onclick={() => {
                                        applyPartyToScheduledModal(party);
                                        scheduledPartyDropdownOpen = false;
                                    }}>
                                        <span class="party-item-name">{party.name}</span>
                                        <span class="party-item-game">{party.game_name || party.resolved_game_name || '게임 미지정'}</span>
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            {/if}
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
                {#if scheduledSelectedPartyId}
                    <input type="hidden" name="partyId" value={scheduledSelectedPartyId} />
                {/if}

                <div class="input-group custom-dropdown">
                    <label for="scheduledGameName">게임 이름</label>
                    <input 
                        type="text" 
                        id="scheduledGameName"
                        name="gameName" 
                        placeholder="게임 이름 (직접 입력 또는 선택)" 
                        bind:value={scheduledGameName} 
                        bind:this={searchInput}
                        onclick={handleInputClick}
                        onfocus={handleInputClick}
                        required 
                        autocomplete="off" 
                    />
                    
                    {#if dropdownOpen && filteredScheduledGames.length > 0}
                        <ul class="dropdown-menu">
                            {#each filteredScheduledGames as game}
                                <li>
                                    <button type="button" onclick={() => selectScheduledGame(game)}>
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

                {#if scheduledSelectedPlayerIds.length > 0}
                    <div class="input-group">
                        <span class="label-heading">함께할 멤버</span>
                        <div class="selected-members-tags">
                            {#each scheduledSelectedPlayerIds as playerId}
                                {@const memberName = (attendees || []).find(a => a.id === playerId)?.name || scheduledPartyMembers.find(m => m.id === playerId)?.name || `ID:${playerId}`}
                                <span class="member-tag">
                                    {memberName}
                                    <button type="button" class="tag-remove" onclick={() => {
                                        scheduledSelectedPlayerIds = scheduledSelectedPlayerIds.filter(id => id !== playerId);
                                    }}>&times;</button>
                                </span>
                                <input type="hidden" name="players" value={playerId} />
                            {/each}
                        </div>
                    </div>
                {/if}

                {#if showScheduledGuestInput}
                    <div class="input-group guest-input-group">
                        <label for="scheduledGuestCount">게스트 수</label>
                        <input
                            type="number"
                            id="scheduledGuestCount"
                            name="guestCount"
                            bind:value={guestCount}
                            min="0"
                            max={Math.max(0, maxPlayers - 1)}
                            oninput={() => { const limit = Math.max(0, maxPlayers - 1); if (guestCount > limit) guestCount = limit; }}
                            class="number-input"
                        />
                        <p class="hint">* 미등록 참가자 수 (본인 제외 최대 {Math.max(0, maxPlayers - 1)}명, 게스트1, 게스트2... 자동 생성)</p>
                    </div>
                {:else}
                    <input type="hidden" name="guestCount" value="0" />
                    <button type="button" class="btn-toggle-guest" onclick={() => showScheduledGuestInput = true}>+ 게스트 추가</button>
                {/if}

                <div class="modal-actions">
                    <button type="button" onclick={() => showScheduledGameModal = false} class="btn-cancel">취소</button>
                    <button type="submit" class="btn-primary">예약 생성</button>
                </div>
            </form>
        </div>
    </div>
{/if}


<!-- Alert Modal -->
{#if alertVisible}
    <div 
        class="modal-backdrop" 
        onclick={() => alertVisible = false} 
        onkeydown={(e) => e.key === 'Escape' && (alertVisible = false)}
        role="button" 
        tabindex="-1"
        aria-label="Close alert"
    >
        <div class="modal-content alert-modal" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="alertdialog" tabindex="-1">
            <h3>알림</h3>
            <p>{alertMessage}</p>
            <div class="modal-actions">
                <button class="btn-primary" onclick={() => alertVisible = false}>확인</button>
            </div>
        </div>
    </div>
{/if}

<!-- Confirm Modal -->
{#if confirmVisible}
    <div 
        class="modal-backdrop" 
        onclick={() => handleConfirm(false)} 
        onkeydown={(e) => e.key === 'Escape' && (handleConfirm(false))}
        role="button" 
        tabindex="-1"
        aria-label="Close confirm"
    >
        <div class="modal-content alert-modal" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="alertdialog" tabindex="-1">
            <h3>확인</h3>
            <p>{confirmMessage}</p>
            <div class="modal-actions">
                <button class="btn-cancel" onclick={() => handleConfirm(false)}>아니오</button>
                <button class="btn-danger" onclick={() => handleConfirm(true)}>네</button>
            </div>
        </div>
    </div>
{/if}

{#if showInstallGuide}
    <div 
        class="modal-backdrop" 
        onclick={(e) => { if (e.target === e.currentTarget) showInstallGuide = false; }}
        onkeydown={(e) => e.key === 'Escape' && (showInstallGuide = false)}
        role="button"
        tabindex="-1"
        aria-label="Close guide"
    >
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
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-green-dark); vertical-align:text-bottom;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
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
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-green-dark); vertical-align:text-bottom;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    </li>
                </ol>
            {/if}
            <p class="guide-note">설치하면 앱처럼 바로 접속할 수 있어요.</p>
            <button class="btn-modal-close" onclick={() => showInstallGuide = false}>닫기</button>
        </div>
    </div>
{/if}

{#if showVisitPlanModal}
    <div
        class="modal-backdrop"
        onclick={(e) => { if (e.target === e.currentTarget) showVisitPlanModal = false; }}
        onkeydown={(e) => e.key === 'Escape' && (showVisitPlanModal = false)}
        role="button"
        tabindex="-1"
        aria-label="Close modal"
    >
        <div class="modal-content visit-plan-modal">
            <h3>몇 시쯤 올 예정인가요?</h3>
            <div class="visit-time-picker">
                <!-- Custom Dropdown container -->
                <div class="custom-dropdown" tabindex="0" role="listbox" onblur={() => setTimeout(() => isTimeDropdownOpen = false, 150)}>
                    <div class="dropdown-selected" class:open={isTimeDropdownOpen} onclick={() => isTimeDropdownOpen = !isTimeDropdownOpen} onkeydown={(e) => e.key === 'Enter' && (isTimeDropdownOpen = !isTimeDropdownOpen)} role="button" tabindex="0">
                        <span>{selectedVisitTime ? formatVisitTime(selectedVisitTime) : '시간 선택'}</span>
                        <div class="dropdown-arrow"></div>
                    </div>
                    
                    {#if isTimeDropdownOpen}
                        <div class="dropdown-options">
                            {#each getVisitTimeOptions() as option}
                                <div class="dropdown-option" class:active={option === selectedVisitTime} onclick={() => {
                                    selectedVisitTime = option;
                                    isTimeDropdownOpen = false;
                                }} onkeydown={(e) => { if (e.key === 'Enter') { selectedVisitTime = option; isTimeDropdownOpen = false; } }} role="option" aria-selected={option === selectedVisitTime} tabindex="0">
                                    {formatVisitTime(option)}
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
                <span class="time-hint">쯤 갈게요</span>
            </div>
            <div class="visit-modal-actions">
                <form method="POST" action="?/toggleVisitPlan" use:enhance={() => {
                    showVisitPlanModal = false;
                    return async ({ result, update }) => { await update(); };
                }}>
                    <input type="hidden" name="plannedTime" value={selectedVisitTime} />
                    <button type="submit" class="btn-visit-confirm">확인</button>
                </form>
                <form method="POST" action="?/toggleVisitPlan" use:enhance={() => {
                    showVisitPlanModal = false;
                    return async ({ result, update }) => { await update(); };
                }}>
                    <button type="submit" class="btn-visit-maybe">상황 봐서 갈 수도 못갈수도</button>
                </form>
                <button type="button" class="btn-visit-cancel" onclick={() => showVisitPlanModal = false}>취소</button>
            </div>
        </div>
    </div>
{/if}

<style>
    /* Custom Dropdown Styles */
    .custom-dropdown {
        position: relative;
        display: inline-block;
        width: 140px;
        outline: none;
    }
    .dropdown-selected {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.6rem 1rem;
        background: var(--bg-primary);
        border: 1px solid var(--border-default);
        border-radius: 8px;
        font-size: 1rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
    }
    .dropdown-selected:hover {
        border-color: var(--text-hint);
    }
    .dropdown-selected.open {
        border-color: var(--color-blue);
        box-shadow: 0 0 0 2px rgba(76, 110, 245, 0.2);
    }
    .dropdown-arrow {
        width: 0;
        height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-top: 5px solid var(--text-tertiary);
        transition: transform 0.2s;
    }
    .dropdown-selected.open .dropdown-arrow {
        transform: rotate(180deg);
    }
    .dropdown-options {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        background: var(--bg-primary);
        border: 1px solid var(--bg-hover);
        border-radius: 8px;
        max-height: 220px;
        overflow-y: auto;
        z-index: 1000; /* Ensure it stays above everything */
        box-shadow: 0 4px 12px var(--shadow-md);
        padding: 4px 0;
    }
    .dropdown-option {
        padding: 0.6rem 1rem;
        font-size: 0.95rem;
        cursor: pointer;
        transition: background 0.2s;
        text-align: left;
    }
    .dropdown-option:hover {
        background: var(--bg-secondary);
    }
    .dropdown-option.active {
        background: var(--color-info-bg);
        color: var(--color-blue-bright);
        font-weight: 600;
    }

    :global(body) {
        margin: 0;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        background: var(--bg-elevated);
        color: var(--text-primary);
    }
    /* Visit Plan Section */
    .visit-plan-section {
        margin-bottom: 2rem;
    }
    .visit-plan-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
        gap: 0.75rem;
    }
    .visit-plan-card {
        background: var(--bg-primary);
        padding: 0.75rem;
        border-radius: 12px;
        text-align: center;
        box-shadow: 0 2px 8px var(--overlay-light);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        overflow: hidden;
    }
    .btn-visit-plan {
        background: var(--color-warning-bg);
        color: var(--color-orange-dark);
        border: 1px solid var(--border-warning);
        padding: 0.4rem 0.8rem;
        border-radius: 8px;
        font-weight: 600;
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.2s;
    }
    .btn-visit-plan:hover {
        background: var(--border-warning);
    }
    .btn-visit-plan.active {
        background: var(--color-orange-dark);
        color: var(--bg-primary);
        border-color: var(--color-orange-dark);
    }
    .btn-visit-plan.active:hover {
        background: var(--color-amber-darker);
    }
    .visit-plan-card .visit-time {
        font-size: 0.7rem;
        color: var(--color-orange-dark);
        font-weight: 600;
        margin-top: 2px;
    }
    .visit-plan-card .visit-time.maybe {
        color: var(--text-hint);
        font-weight: 500;
        font-style: italic;
    }
    .visit-plan-card .party-chip {
        font-size: 0.6rem;
        background: var(--color-purple-bg);
        color: var(--color-blue);
        padding: 1px 5px;
        border-radius: 4px;
        font-weight: 500;
        margin-top: 2px;
    }
    .visit-plan-card.editable {
        cursor: pointer;
        position: relative;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .visit-plan-card.editable:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(230, 119, 0, 0.2);
        outline: 1px solid var(--border-warning);
    }
    .visit-plan-card.editable:active {
        transform: translateY(0);
    }
    .visit-plan-card.editable::after {
        content: '\270F';
        position: absolute;
        top: 4px;
        right: 6px;
        font-size: 0.55rem;
        opacity: 0.4;
    }
    .visit-plan-card.editable:hover::after {
        opacity: 1;
    }

    /* Visit Plan Modal */
    .visit-plan-modal {
        max-width: 360px;
        text-align: center;
    }
    .visit-plan-modal h3 {
        margin: 0 0 1.2rem;
        font-size: 1.1rem;
        color: var(--text-primary);
    }
    .visit-time-picker {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        margin-bottom: 1.5rem;
    }
    .time-select {
        padding: 0.6rem 1rem;
        border: 2px solid var(--border-warning);
        border-radius: 10px;
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--color-orange-dark);
        background: var(--color-warning-bg);
        cursor: pointer;
        outline: none;
        appearance: auto;
    }
    .time-select:focus {
        border-color: var(--color-orange-dark);
    }
    .time-hint {
        font-size: 0.95rem;
        color: var(--text-secondary);
    }
    .visit-modal-actions {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .btn-visit-confirm {
        width: 100%;
        padding: 0.75rem;
        background: var(--color-orange-dark);
        color: var(--bg-primary);
        border: none;
        border-radius: 10px;
        font-size: 1rem;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.2s;
    }
    .btn-visit-confirm:hover {
        background: var(--color-amber-darker);
    }
    .btn-visit-maybe {
        width: 100%;
        padding: 0.65rem;
        background: var(--bg-secondary);
        color: var(--text-tertiary);
        border: 1px solid var(--border-default);
        border-radius: 10px;
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }
    .btn-visit-maybe:hover {
        background: var(--bg-hover);
        color: var(--text-dark);
    }
    .btn-visit-cancel {
        width: 100%;
        padding: 0.5rem;
        background: none;
        color: var(--text-hint);
        border: none;
        font-size: 0.85rem;
        cursor: pointer;
    }
    .btn-visit-cancel:hover {
        color: var(--text-tertiary);
    }

    /* Tab System */
    .tab-bar {
        display: flex;
        background: var(--bg-primary);
        border-radius: 12px;
        margin-bottom: 1.5rem;
        overflow: hidden;
        box-shadow: 0 2px 8px var(--overlay-light);
        border: 1px solid var(--border-light);
    }
    .tab-btn {
        flex: 1;
        padding: 0.75rem;
        border: none;
        background: var(--bg-primary);
        font-size: 0.95rem;
        font-weight: 600;
        color: var(--text-tertiary);
        cursor: pointer;
        transition: all 0.2s;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .tab-btn:hover {
        background: var(--bg-secondary);
    }
    .tab-btn.active {
        color: var(--color-orange-dark);
        background: var(--color-warning-bg);
    }
    .tab-btn.active::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 20%;
        width: 60%;
        height: 3px;
        background: var(--color-orange-dark);
        border-radius: 3px 3px 0 0;
    }

    /* Main Games Toggle Header */
    .main-games-toggle-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        user-select: none;
        margin-bottom: 0.75rem;
    }
    .main-games-toggle-header h2 {
        margin: 0;
    }
    .expand-icon {
        font-size: 0.8rem;
        color: var(--color-orange-dark);
        font-weight: 600;
    }
    .container {
        max-width: 600px;
        margin: 0 auto;
        padding: 1rem;
    }
    /* App Header Styles */
    header.app-header {
        margin: -1rem -1rem 1.5rem -1rem; /* Negative margin to span full width */
        backdrop-filter: blur(12px); /* Glassmorphism effect */
        -webkit-backdrop-filter: blur(12px);
        box-shadow: 0 4px 20px var(--overlay-light);
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
        color: var(--color-orange-dark);
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
        background: var(--color-success-bg);
        color: var(--color-green);
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
        background-color: var(--color-green);
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
        background: var(--color-error-bg);
        color: var(--color-red);
    }
    .status-pill.admin-panel {
        background: var(--color-info-bg);
        color: var(--color-blue-bright);
        text-decoration: none;
        cursor: pointer;
        transition: background 0.2s;
        border: 1px solid var(--color-info-bg);
    }
    .status-pill.admin-panel:hover {
        background: var(--color-info-bg);
    }
    .live-time {
        font-family: monospace;
        font-size: 0.85rem;
        color: var(--text-secondary);
        background: var(--bg-hover);
        padding: 0.1rem 0.4rem;
        border-radius: 4px;
    } 

    @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
    }
    .notice-banner {
        background: var(--color-warning-bg);
        color: var(--color-orange-dark);
        padding: 1rem;
        border-radius: 8px;
        margin-bottom: 2rem;
        font-weight: bold;
        text-align: center;
        border: 1px solid var(--border-warning);
        box-shadow: 0 2px 4px var(--overlay-light);
    }
    .manager-actions {
        margin-bottom: 2rem;
        text-align: center;
    }
    .btn-manager {
        background: var(--color-green-dark);
        color: var(--bg-primary);
        text-decoration: none;
        padding: 0.75rem 1.5rem;
        border-radius: 8px;
        font-weight: bold;
        display: inline-block;
        box-shadow: 0 2px 4px var(--shadow-md);
        transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn-manager:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px var(--shadow-lg);
    }
    section {
        margin-bottom: 2rem;
    }
    h2 {
        font-size: 1.2rem;
        color: var(--text-darker);
        border-bottom: 2px solid var(--border-default);
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
        background: var(--bg-primary);
        padding: 0.75rem;
        border-radius: 12px;
        text-align: center;
        box-shadow: 0 2px 8px var(--overlay-light);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        overflow: hidden;
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
        color: var(--text-tertiary);
        margin-top: 0.25rem;
    }
    .attendee-card.playing {
        background: var(--bg-surface);
        border: 1px solid var(--border-default);
        opacity: 0.8;
    }
    .playing-text {
        color: var(--color-orange);
        font-weight: bold;
        font-size: 0.7rem;
    }
    .games-grid {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .game-card {
        background: var(--bg-primary);
        padding: 1.25rem;
        border-radius: 12px;
        box-shadow: 0 2px 8px var(--overlay-light);
        border-left: 5px solid var(--color-orange);
    }
    .time-remaining {
        color: var(--color-orange-dark);
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
        background: var(--bg-surface);
        padding: 0.25rem 0.75rem;
        border-radius: 6px;
        font-size: 0.85rem;
        color: var(--text-secondary);
    }
    .player-tag.guest-tag {
        border: 1px dashed var(--text-hint);
        background: var(--bg-secondary);
        opacity: 0.85;
    }
    .guest-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--text-tertiary);
        color: var(--bg-primary);
        font-size: 10px;
        font-weight: bold;
        margin-left: 4px;
        vertical-align: middle;
    }
    .guest-name {
        opacity: 0.85;
    }
    .guest-input-group {
        margin-top: 0.5rem;
        padding-top: 0.5rem;
        border-top: 1px solid var(--border-light);
    }
    .empty-state {
        grid-column: 1 / -1;
        color: var(--text-muted);
        text-align: center;
        padding: 2rem;
        background: var(--bg-secondary);
        border-radius: 8px;
        width: 100%;
        box-sizing: border-box;
    }
    .closed-state {
        background: var(--bg-hover);
        color: var(--color-slate-dark);
        font-weight: bold;
        border: 1px solid var(--border-medium);
    }
    .user-status {
        margin-bottom: 0.5rem;
        font-size: 0.9rem;
    }
    .welcome-msg {
        margin-right: 0.5rem;
        color: var(--text-primary);
    }
    .btn-login {
        text-decoration: none;
        color: var(--color-blue-bright);
        font-weight: bold;
        border: 1px solid var(--color-blue-bright);
        padding: 0.25rem 0.75rem;
        border-radius: 16px;
        transition: all 0.2s;
    }
    .btn-login:hover {
        background: var(--color-blue-bright);
        color: var(--bg-primary);
    }
    .btn-logout {
        background: none;
        border: none;
        color: var(--text-secondary);
        text-decoration: underline;
        cursor: pointer;
        font-size: 0.85rem;
        padding: 0;
    }
    .btn-logout:hover {
        color: var(--text-primary);
    }

    .my-status-section {
        background: var(--bg-primary);
        padding: 1.5rem;
        border-radius: 16px;
        box-shadow: 0 4px 12px var(--shadow-sm);
        margin-bottom: 2rem;
        border: 1px solid var(--border-light);
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
        background: var(--bg-secondary);
        border-radius: 12px;
        border: 1px solid var(--bg-hover);
    }
    .status-card .label {
        font-size: 0.75rem;
        color: var(--text-secondary);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    .status-card .value {
        font-size: 1rem;
        font-weight: 700;
        color: var(--text-primary);
    }
    .status-card .sub-value {
        font-size: 0.8rem;
        color: var(--text-secondary);
    }
    .status-card.penalty-warning {
        background: var(--color-error-bg);
        border-color: var(--color-error-bg);
    }
    .status-card.penalty-warning .value {
        color: var(--color-red);
    }
    .warning-text {
        font-size: 0.7rem;
        color: var(--color-red);
        margin: 0.25rem 0 0 0;
        font-weight: 600;
    }
    .status-card.scheduled {
        background: var(--color-purple-bg);
        border-color: var(--border-light);
    }
    .status-card.reservation {
        background: var(--color-info-bg);
        border-color: var(--color-info-bg);
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
    .status-tag.pending { background: var(--color-warning-bg); color: var(--color-orange-dark); }
    .status-tag.waitlisted { background: var(--bg-hover); color: var(--text-dark); }
    .status-tag.confirmed { background: var(--color-success-bg); color: var(--color-green-dark); }

    .btn-action-text {
        background: none;
        border: none;
        padding: 0.2rem 0.5rem;
        cursor: pointer;
        font-size: 0.85rem;
        color: var(--text-dark);
        border-radius: 4px;
        transition: all 0.2s;
        font-weight: 600;
    }
    .btn-action-text:hover {
        background-color: var(--bg-tertiary);
        color: var(--text-primary);
    }
    .btn-action-text.danger {
        color: var(--color-red);
    }
    .btn-action-text.danger:hover {
        background-color: var(--color-error-bg);
        color: var(--color-red-dark);
    }
    .btn-action-text.primary {
        color: var(--color-blue);
    }
    .btn-action-text.primary:hover {
        background-color: var(--color-info-bg);
        color: var(--color-blue-bright);
    }

    .btn-cancel-small {
        background: none;
        border: none;
        color: var(--text-hint);
        font-size: 0.75rem;
        text-decoration: underline;
        cursor: pointer;
        padding: 0;
        margin-top: 0.5rem;
        text-align: left;
    }
    .btn-cancel-small:hover {
        color: var(--text-dark);
    }

    .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
        border-bottom: 2px solid var(--border-default);
        padding-bottom: 0.5rem;
    }
    .section-header h2 {
        margin-bottom: 0;
        border-bottom: none;
        padding-bottom: 0;
    }
    .btn-create-game {
        text-decoration: none;
        background: var(--color-blue);
        color: var(--bg-primary);
        font-size: 0.85rem;
        font-weight: 600;
        padding: 0.4rem 0.8rem;
        border-radius: 8px;
        transition: background 0.2s;
    }
    .btn-create-game:hover {
        background: var(--color-indigo);
    }

    .tables-grid {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-bottom: 2rem;
    }
    .table-card {
        background: var(--bg-primary);
        padding: 0.5rem 1rem;
        border-radius: 12px;
        box-shadow: 0 2px 4px var(--overlay-light);
        border: 1px solid var(--border-light);
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        transition: transform 0.2s, box-shadow 0.2s;
    }
    .table-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px var(--shadow-sm);
    }
    .table-card.playing {
        border-left: 6px solid var(--color-orange);
    }
    .table-card.available {
        border-left: 6px solid var(--color-green);
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
        color: var(--text-primary);
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
        color: var(--text-tertiary);
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
        background: var(--color-warning-bg);
        color: var(--color-orange-dark);
    }
    .status-badge.available {
        background: var(--color-success-bg);
        color: var(--color-green-dark);
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
        flex-direction: column;
        width: 100%;
        gap: 0.5rem;
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
    .time-remaining {
        font-weight: bold;
        color: var(--color-orange-dark);
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
        color: var(--text-tertiary);
        margin-top: 0;
    }
    .res-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    .res-item {
        background: var(--bg-primary);
        border: 1px solid var(--border-default);
        padding: 0.1rem 0.4rem;
        border-radius: 12px;
        font-size: 0.75rem;
        display: flex;
        align-items: center;
        gap: 0.25rem;
    }
    .res-name {
        font-weight: 500;
        color: var(--text-dark);
    }
    .cancel-form-inline {
        display: inline-flex;
        align-items: center;
    }
    .btn-cancel-x {
        background: none;
        border: none;
        color: var(--text-hint);
        padding: 0;
        width: 14px;
        height: 14px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .btn-cancel-x:hover {
        background: var(--bg-tertiary);
        color: var(--color-red);
        border-radius: 50%;
    }

    .start-time {
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--color-blue);
    }
    .end-time-label {
        font-size: 0.85rem;
        color: var(--text-tertiary);
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
        color: var(--text-tertiary);
        margin-right: 0.5rem;
    }
    .player-tag, .p-name {
        margin-right: 0;
        font-size: 0.75rem;
        padding: 0.1rem 0.4rem;
        background: var(--bg-primary);
        border-radius: 6px;
        color: var(--text-dark);
        border: 1px solid var(--border-default);
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
        background: var(--color-amber);
        color: var(--bg-primary);
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
        background: var(--bg-primary);
        color: var(--text-dark);
        padding: 0.1rem 0.5rem;
        border-radius: 4px;
        border: 1px solid var(--border-default);
    }
    .admin-actions {
        margin-top: 0.75rem;
        padding-top: 0.75rem;
        border-top: 1px dashed var(--border-default);
    }
    .attendee-select-mini {
        flex: 1;
        padding: 0.3rem;
        border-radius: 6px;
        border: 1px solid var(--border-default);
        font-size: 0.8rem;
    }

    .reservations-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 1rem;
        margin-bottom: 2rem;
    }
    .reservation-card {
        background: var(--bg-primary);
        padding: 1rem;
        border-radius: 12px;
        box-shadow: 0 2px 8px var(--overlay-light);
        border: 1px solid var(--border-light);
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
        color: var(--text-darker);
    }
    .reservations-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 1rem;
        margin-bottom: 2rem;
    }
    .reservation-card {
        background: var(--bg-primary);
        padding: 1rem;
        border-radius: 12px;
        box-shadow: 0 2px 8px var(--overlay-light);
        border: 1px solid var(--border-light);
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
        color: var(--text-darker);
    }
    .res-name {
        padding: 0.1rem;
        color: var(--text-primary);
    }

    .btn-reserve {
        width: 100%;
        background: var(--color-amber);
        color: var(--bg-primary);
        border: none;
        border-radius: 8px;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.2s;
    }
    
    .highlight-orange {
        color: var(--color-orange-dark);
        font-weight: 700;
        margin-right: 0.25rem;
    }
    .highlight-green {
        color: var(--color-green);
        font-weight: 700;
        margin-right: 0.25rem;
    }
    .highlight-playing {
        color: var(--color-orange-dark);
        font-weight: 700;
        margin-right: 0.25rem;
    }
    .sub-text {
        font-weight: normal;
        color: var(--text-tertiary);
        font-size: 0.75rem;
    }

    .btn-reserve:hover {
        background: var(--color-orange-dark);
    }
    .btn-pending-cancel {
        padding: 0.3rem 0.8rem;
        font-size: 0.8rem;
        border-radius: 6px;
        color: var(--text-primary);
        border: none;
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
        width: 100%;
        border-radius: 8px;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.2s;
        
    }
    .btn-tichu-counter {
        display: inline-block;
        margin-top: 0.5rem;
        padding: 0.4rem 0.8rem;
        background: var(--color-indigo);
        color: var(--bg-primary);
        border: none;
        border-radius: 8px;
        font-weight: 600;
        font-size: 0.8rem;
        text-decoration: none;
        text-align: center;
        cursor: pointer;
    }
    .btn-tichu-counter:hover {
        background: var(--color-blue);
    }
    .party-badge {
        font-size: 0.65rem;
        background: var(--color-purple-bg);
        color: var(--color-blue);
        padding: 1px 5px;
        border-radius: 4px;
        margin-left: 4px;
        font-weight: 500;
        vertical-align: middle;
    }
    .btn-reserve-mini, .btn-join-mini {
        background: var(--color-amber);
        color: var(--bg-primary);
        border: none;
        padding: 0.3rem 0.6rem;
        border-radius: 6px;
        font-weight: 600;
        font-size: 0.8rem;
        cursor: pointer;
    }
    .btn-join-mini {
        background: var(--color-blue);
    }
    .btn-create-session-small {
        display: block;
        text-align: center;
        text-decoration: none;
        background: var(--bg-tertiary);
        color: var(--text-dark);
        font-size: 0.85rem;
        font-weight: 600;
        padding: 0.75rem;
        border-radius: 12px;
        border: 2px dashed var(--border-default);
        transition: all 0.2s;
    }
    .btn-create-session-small:hover {
        background: var(--bg-hover);
        border-color: var(--text-hint);
        color: var(--text-primary);
    }
    
    /* Modal Styles */
    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: var(--overlay-heavy);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }
    .modal-content {
        background: var(--bg-primary);
        padding: 2rem;
        border-radius: 12px;
        width: 90%;
        max-width: 500px;
        box-shadow: 0 4px 12px var(--shadow-lg);
        max-height: 90vh;
        overflow-y: auto;
    }
    .modal-content h2 {
        margin-top: 0;
        border-bottom: 2px solid var(--bg-elevated);
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
        color: var(--text-darker);
    }
    .input-group input {
        padding: 0.75rem;
        border: 1px solid var(--border-default);
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
        background: var(--color-blue);
        color: var(--bg-primary);
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 8px;
        font-weight: bold;
        cursor: pointer;
    }
    .btn-cancel {
        background: var(--bg-tertiary);
        color: var(--text-dark);
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 8px;
        font-weight: bold;
        cursor: pointer;
    }

    .btn-danger {
        background: var(--color-red-dark);
        color: var(--bg-primary);
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 8px;
        font-weight: bold;
        cursor: pointer;
    }
    .btn-danger:hover {
        background: var(--color-red-dark);
    }

    .player-select {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        max-height: 200px;
        overflow-y: auto;
        border: 1px solid var(--border-light);
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
        background: var(--bg-secondary);
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
        background: var(--bg-primary);
        border: 1px solid var(--bg-tertiary);
        border-radius: 12px;
        box-shadow: 0 1px 2px var(--shadow-sm);
        transition: transform 0.2s, box-shadow 0.2s;
    }
    .res-item.request-item:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(0,0,0,0.06);
    }
    
    .res-name {
        font-weight: 600;
        color: var(--text-dark);
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
        color: var(--text-hint);
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
        background: var(--bg-secondary);
        color: var(--text-dark);
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
        border-left: 1px solid var(--bg-hover); /* Thin vertical bar */
        height: 24px; /* Height of the bar */
    }

    /* Check Button */
    .btn-icon.check {
        color: var(--text-muted);
    }
    .btn-icon.check:hover {
        background-color: var(--color-success-bg);
        color: var(--color-green); 
        transform: translateY(-1px);
    }

    /* Cross Button */
    .btn-icon.cross {
        color: var(--text-muted);
    }
    .btn-icon.cross:hover {
        background-color: var(--color-error-bg);
        color: var(--color-red);
        transform: translateY(-1px);
    }
    .btn-create {
        background: var(--color-blue);
        color: var(--bg-primary);
        border: none;
        padding: 0.4rem 0.8rem;
        border-radius: 6px;
        font-weight: 600;
        cursor: pointer;
        font-size: 0.85rem;
    }
    .btn-create:hover {
        background: var(--color-indigo);
    }
    
    /* Dropdown Styles */
    .dropdown-menu {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: var(--bg-primary);
        border: 1px solid var(--border-default);
        border-radius: 8px;
        max-height: 200px;
        overflow-y: auto;
        z-index: 10;
        list-style: none;
        padding: 0;
        margin: 0;
        box-shadow: 0 4px 12px var(--shadow-md);
    }
    .dropdown-menu li button {
        width: 100%;
        text-align: left;
        padding: 0.75rem;
        background: none;
        border: none;
        border-bottom: 1px solid var(--bg-elevated);
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }
    .dropdown-menu li button:hover {
        background: var(--bg-secondary);
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
        color: var(--text-primary);
    }
    .game-option-info .meta {
        font-size: 0.75rem;
        color: var(--text-tertiary);
    }

    /* End Game Modal Player Score Row */
    .player-select {
        max-height: 300px;
        overflow-y: auto;
        border: 1px solid var(--border-light);
        border-radius: 8px;
        padding: 0.5rem;
        margin-bottom: 1.5rem;
    }
    .player-score-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem;
        border-bottom: 1px solid var(--bg-secondary);
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
        border: 1px solid var(--border-default);
        border-radius: 6px;
        font-size: 0.9rem;
        text-align: center;
    }
    .owner-badge {
        font-size: 0.8rem;
    }
    .end-time-label {
        font-size: 0.75rem;
        color: var(--text-tertiary);
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
        background: var(--bg-primary);
        border: 1px solid var(--border-default);
        padding: 0.5rem 1.5rem;
        border-radius: 20px;
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 0.9rem;
        transition: all 0.2s;
        box-shadow: 0 2px 4px var(--overlay-light);
    }

    .btn-show-more:hover {
        background: var(--bg-secondary);
        color: var(--text-primary);
        box-shadow: 0 4px 8px var(--shadow-md);
    }

    @media (max-width: 768px) {
        .container {
            padding-bottom: 80px;
        }
    }
    /* User Greeting in Header */
    .user-greeting {
        font-size: 0.9rem;
        color: var(--text-darker);
        margin-left: 0.8rem;
        display: flex;
        align-items: center;
        gap: 4px;
    }
    .user-greeting .user-title {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: fit-content;
        padding: 2px 8px;
        border: 1px solid var(--color-amber); /* Amber-400 */
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.5);
        color: var(--color-amber-darker); /* Amber-600 */
        font-size: 0.75rem;
        font-weight: 700;
        margin-right: 4px;
        vertical-align: middle;
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
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: fit-content;
        max-width: 100%;
        padding: 2px 8px;
        border: 1px solid var(--color-amber); /* Amber-400 */
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.5);
        color: var(--color-amber-darker); /* Amber-600 */
        font-size: 0.75rem;
        font-weight: 700;
        margin-bottom: 2px;
        word-break: keep-all;
        text-align: center;
        line-height: 1.3;
    }
    .attendee-info {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        min-width: 0;
        flex: 1;
    }
    .attendee-info .name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    
    .tag-title {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: fit-content;
        /* padding: 2px 8px; */
 
        background: rgba(255, 255, 255, 0.5);
        color: var(--color-amber-darker);
        font-size: 0.75rem;
        font-weight: 700;
        vertical-align: middle;
    }
    .player-tag {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: transparent;
        padding: 0.2rem 0.5rem;
          border-radius: 6px;
        font-size: 0.9rem;
        font-weight: 500;
        color: var(--text-dark);
        margin-right: 8px;
        margin-bottom: 6px;
    }

    .p-name {
        display: inline-flex;
        align-items: center;
        gap: 2px;
    }
    .p-title {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: fit-content;
        /* padding: 2px 8px; */

        background: rgba(255, 255, 255, 0.5);
        color: var(--color-amber-darker);
        font-size: 0.75rem;
        font-weight: 700;
        margin-right: 4px;
        vertical-align: middle;
    }

    /* Install Guide Button */
    .install-guide-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        width: 100%;
        padding: 0.75rem;
        background: var(--bg-primary);
        border: 1px dashed var(--border-medium);
        border-radius: 12px;
        color: var(--text-darker);
        font-size: 0.9rem;
        font-weight: 600;
        cursor: pointer;
        margin-bottom: 1rem;
        transition: all 0.2s;
    }
    .install-guide-btn:hover {
        background: var(--bg-secondary);
        border-color: var(--text-muted);
        color: var(--text-primary);
    }

    /* Install Guide Modal */
    .install-guide-modal {
        max-width: 400px;
    }
    .install-guide-modal h3 {
        margin: 0 0 1.2rem 0;
        text-align: center;
        font-size: 1.2rem;
        color: var(--text-primary);
    }
    .install-guide-modal .guide-steps {
        padding: 0;
        margin: 0 0 1rem 0;
        list-style: none;
    }
    .install-guide-modal .guide-steps li {
        margin-bottom: 1rem;
        line-height: 1.6;
        color: var(--text-darker);
        font-size: 0.95rem;
    }
    .install-guide-modal .step-num {
        display: inline-block;
        background: var(--color-info-bg);
        color: var(--color-blue);
        font-weight: bold;
        padding: 0.1rem 0.5rem;
        border-radius: 6px;
        margin-right: 0.5rem;
    }
    .guide-img-placeholder {
        margin-top: 0.5rem;
        padding: 2rem 1rem;
        background: var(--bg-tertiary);
        border: 2px dashed var(--border-default);
        border-radius: 8px;
        text-align: center;
        color: var(--text-hint);
        font-size: 0.85rem;
    }
    .guide-note {
        text-align: center;
        color: var(--text-tertiary);
        font-size: 0.85rem;
        margin: 0 0 1rem 0;
    }
    .btn-modal-close {
        width: 100%;
        padding: 0.8rem;
        background: var(--color-blue);
        color: var(--bg-primary);
        border: none;
        border-radius: 8px;
        font-weight: bold;
        font-size: 1rem;
        cursor: pointer;
    }
    .btn-modal-close:hover {
        background: var(--color-blue);
    }

    /* Party Selector */
    .party-selector {
        margin-bottom: 1rem;
        padding-bottom: 1rem;
        border-bottom: 1px dashed var(--border-default);
    }
    .party-dropdown-wrapper {
        position: relative;
    }
    .party-dropdown-trigger {
        width: 100%;
        padding: 0.6rem 0.75rem;
        border: 1px solid var(--border-default);
        border-radius: 8px;
        font-size: 0.9rem;
        background: var(--bg-secondary);
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: var(--text-darker);
        text-align: left;
    }
    .party-dropdown-trigger:hover {
        border-color: var(--text-hint);
    }
    .party-chevron {
        font-size: 0.7rem;
        color: var(--text-muted);
        transition: transform 0.2s;
    }
    .party-chevron.open {
        transform: rotate(180deg);
    }
    .party-dropdown-list {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        background: var(--bg-primary);
        border: 1px solid var(--border-light);
        border-radius: 8px;
        box-shadow: 0 4px 12px var(--shadow-md);
        max-height: 200px;
        overflow-y: auto;
        z-index: 100;
    }
    .party-dropdown-item {
        width: 100%;
        padding: 0.6rem 0.75rem;
        border: none;
        background: none;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
        text-align: left;
        font-size: 0.9rem;
    }
    .party-dropdown-item:hover {
        background: var(--bg-secondary);
    }
    .party-dropdown-item:not(:last-child) {
        border-bottom: 1px solid var(--bg-tertiary);
    }
    .party-item-name {
        font-weight: 600;
        color: var(--text-primary);
    }
    .party-item-game {
        font-size: 0.8rem;
        color: var(--text-tertiary);
        flex-shrink: 0;
    }

    /* Selected Members Tags */
    .selected-members-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
    }
    .member-tag {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        background: var(--color-info-bg);
        color: var(--color-blue-bright);
        padding: 0.2rem 0.6rem;
        border-radius: 12px;
        font-size: 0.8rem;
        font-weight: 500;
    }
    .tag-remove {
        background: none;
        border: none;
        color: var(--color-blue);
        cursor: pointer;
        font-size: 1rem;
        padding: 0;
        line-height: 1;
    }
    .tag-remove:hover {
        color: var(--color-blue-bright);
    }
    .party-member {
        color: var(--color-blue);
        font-weight: 500;
    }
    .party-member.disabled {
        color: var(--text-tertiary);
        font-weight: 400;
    }
    .status-text-small {
        font-size: 0.7rem;
        color: var(--text-hint);
        margin-left: 2px;
    }
    .btn-toggle-guest {
        width: 100%;
        padding: 0.5rem;
        background: none;
        border: 1px dashed var(--border-medium);
        border-radius: 8px;
        color: var(--text-tertiary);
        font-size: 0.85rem;
        cursor: pointer;
        margin-bottom: 0.5rem;
        transition: all 0.2s;
    }
    .btn-toggle-guest:hover {
        border-color: var(--text-tertiary);
        color: var(--text-darker);
        background: var(--bg-secondary);
    }

    /* Tablet: side-by-side panels */
    .main-panels {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1.5rem;
        align-items: start;
    }
    .panel-title {
        font-size: 1rem;
        font-weight: 700;
        color: var(--color-orange-dark);
        margin: 0 0 1rem 0;
    }
    @media (min-width: 769px) {
        .container {
            max-width: 1000px;
        }
    }
</style>
