<script lang="ts">
    import type { PageData } from './$types';
    import { enhance } from '$app/forms';
    import { invalidateAll } from '$app/navigation';
    import { onMount, onDestroy } from 'svelte';

    export let data: PageData;
    if (!data) throw new Error('Data is required');

    // SSE 실시간 연결 — 변경 신호 수신 시 서버 데이터 재로드
    // (SSE 데이터는 간소화 구조라 대시보드 전체 필드를 못 채우므로 invalidateAll 사용)
    let eventSource: EventSource | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let sseReconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let sseDestroyed = false;

    function debouncedInvalidate() {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { invalidateAll(); }, 300);
    }

    function connectSSE() {
        if (sseDestroyed) return;
        if (eventSource) eventSource.close();

        eventSource = new EventSource('/api/sse/live');
        eventSource.addEventListener('visitors', debouncedInvalidate);
        eventSource.addEventListener('games', debouncedInvalidate);
        eventSource.onerror = () => {
            if (eventSource) { eventSource.close(); eventSource = null; }
            if (!sseDestroyed) {
                sseReconnectTimer = setTimeout(connectSSE, 3000);
            }
        };
    }

    onMount(() => {
        connectSSE();
    });

    onDestroy(() => {
        sseDestroyed = true;
        if (debounceTimer) clearTimeout(debounceTimer);
        if (sseReconnectTimer) clearTimeout(sseReconnectTimer);
        if (eventSource) { eventSource.close(); eventSource = null; }
    });

    let showModal = false;
    let selectedGameName = '';
    let selectedDuration = '';
    let guestCount = 0;

    let selectedGameId = '';

    // Alert Modal State
    let alertVisible = false;
    let alertMessage = '';

    function showAlert(msg: string) {
        alertMessage = msg;
        alertVisible = true;
    }

    // Remove Confirm Modal State
    let removeModalVisible = false;
    let removeTarget: Attendee | null = null;

    async function handleRemove(attendee: Attendee) {
        if (attendee.is_playing) {
            removeTarget = attendee;
            removeModalVisible = true;
        } else {
            // Instant remove for non-playing users
            const formData = new FormData();
            formData.append('id', String(attendee.id));
            await fetch('?/removeAttendee', { method: 'POST', body: formData });
            await invalidateAll();
        }
    }

    // End Game Modal State
    let endGameModalVisible = false;
    let selectedEndGame: GameSession | null = null;

    function openEndGameModal(game: GameSession) {
        selectedEndGame = game;
        endGameModalVisible = true;
    }

    // Scheduled Game Modal State
    let showScheduledGameModal = false;
    let scheduledGameName = '';
    let scheduledAt = '';
    let minPlayers = 2;
    let maxPlayers = 4;
    let isRecurring = false;

    function openScheduledGameModal() {
        showScheduledGameModal = true;
        scheduledGameName = '';
        guestCount = 0;
        dropdownOpen = false;
        
        // Set default time to 30 minutes from now, rounded to 10 minutes
        const now = new Date();
        now.setMinutes(Math.ceil((now.getMinutes() + 30) / 10) * 10);
        
        // Format to YYYY-MM-DDTHH:mm in local time
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        scheduledAt = `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    $: filteredScheduledGames = (data.allGames as any[])?.filter((g: any) => 
        g.name.toLowerCase().includes(scheduledGameName.toLowerCase())
    ) || [];

    function selectScheduledGame(game: any) {
        scheduledGameName = game.name;
        minPlayers = game.min_players;
        maxPlayers = game.max_players;
        dropdownOpen = false;
    }

    // Custom Dropdown State
    let dropdownOpen = false;
    let searchInput: HTMLInputElement;

    function toggleDropdown() {
        dropdownOpen = !dropdownOpen;
        if (dropdownOpen && searchInput) {
            setTimeout(() => searchInput.focus(), 0);
        }
    }

    function selectGame(game: { name: string, id: number, playtime_min: number }) {
        selectedGameName = game.name;
        selectedGameId = String(game.id);
        selectedDuration = String(game.playtime_min);
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

    $: filteredGames = (data.allGames as any[])?.filter((g: any) => 
        g.name.toLowerCase().includes(selectedGameName.toLowerCase())
    ) || [];

    $: {
        const libraryGame = (data.allGames as any[])?.find((g: any) => g.name === selectedGameName);
        const historyGame = (data.savedGameNames as any[]).find((g: any) => g.game_name === selectedGameName);
        
        if (libraryGame) {
            selectedGameId = String(libraryGame.id);
            selectedDuration = String(libraryGame.playtime_min);
        } else if (historyGame && !libraryGame) { // Only fallback if not in library
            selectedGameId = '';
            selectedDuration = String(historyGame.duration);
        } else if (!libraryGame) {
            selectedGameId = '';
        }
    }

    function getTimeRemaining(endTime: string) {
        const end = new Date(endTime).getTime();
        const now = new Date().getTime();
        const diff = end - now;
        if (diff <= 0) return '종료됨';
        
        const totalMins = Math.floor(diff / 60000);
        if (totalMins < 60) {
            return `${totalMins}분 남음`;
        } else {
            const hours = Math.floor(totalMins / 60);
            const mins = totalMins % 60;
            return `${hours}시간 ${mins}분 남음`;
        }
    }

    function formatTime(dateString: string) {
        return new Date(dateString).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    }

    function formatScheduledTime(dateString: string) {
        const date = new Date(dateString);
        const now = new Date();
        const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        
        const timeStr = date.toLocaleTimeString('ko-KR', {hour: '2-digit', minute:'2-digit'});
        return isToday ? timeStr : `${date.getMonth() + 1}/${date.getDate()} ${timeStr}`;
    }

    interface Attendee {
        id: number;
        name: string;
        arrival_time: string;
        status: string;
        penalty_points: number;
        is_blacklisted: boolean;
        game_id: number | null;
        game_name: string | null;
        is_playing: boolean;
        can_manage_games: boolean;
    }

    interface GameSession {
        id: number;
        game_name: string;
        game_id: number | null;
        start_time: string;
        end_time: string;
        status: string;
        image_url: string | null;
        min_players: number;
        max_players: number;
        participants: { id: number; name: string }[];
        players: { id: number; name: string }[];
        scheduled_at: string;
    }

    interface Reservation {
        id: number;
        attendee_id: number;
        session_id: number;
        status: string;
        created_at: string;
        attendee_name: string;
        game_name: string;
    }

    interface SavedMember {
        id: number;
        name: string;
        penalty_points: number;
        is_blacklisted: boolean;
    }

    interface Table {
        id: number;
        name: string;
    }

    let attendees: Attendee[];
    let games: GameSession[];
    let scheduledGames: GameSession[];
    let reservations: Reservation[];
    let savedMembers: SavedMember[];
    let tables: Table[];

    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    $: attendees = data.attendees as Attendee[];
    $: allUsers = (data as any).allUsers || [];
    $: games = data.games as GameSession[];
    $: scheduledGames = data.scheduledGames as GameSession[];
    $: reservations = data.reservations as Reservation[];
    $: savedMembers = data.savedMembers as SavedMember[];
    $: recurringSchedules = (data as any).recurringSchedules || [];
</script>





<section>
    <h2>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>
        공지사항 관리
    </h2>
    <div class="notice-manager">
        {#if data.notice}
            <div class="current-notice">
                <strong>현재 공지:</strong> {data.notice}
                <form method="POST" action="?/clearNotice" use:enhance style="display:inline; margin-left: 1rem;">
                    <button type="submit" class="btn-delete">숨기기</button>
                </form>
            </div>
        {/if}
        <form method="POST" action="?/updateNotice" use:enhance class="notice-form">
            <input type="text" name="content" placeholder="새 공지사항 입력" required />
            <button type="submit">등록</button>
        </form>
    </div>
</section>

<section>
    <h2>현재 참여 인원</h2>
    <ul class="attendee-list">
        {#each (attendees || []) as attendee (attendee.id)}
            {@const a = attendee as Attendee}
            <li>
                <div class="attendee-info">
                    <div class="name-row">
                        <a href="/admin/attendees/{a.id}" class="attendee-link">{a.name}</a>
                        {#if a.is_blacklisted}
                            <span class="badge blacklist">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align:middle;"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                                블랙
                            </span>
                        {/if}
                        {#if a.penalty_points > 0}
                            <span class="badge penalty">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align:middle;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                {a.penalty_points}
                            </span>
                        {/if}
                    </div>
                    <span class="arrival-time">{formatTime(a.arrival_time)} 입장</span>
                </div>
                <div class="attendee-actions">
                    <div class="penalty-actions">
                        <form method="POST" action="?/applyPenaltyAdmin" use:enhance style="display:inline;">
                            <input type="hidden" name="attendeeId" value={a.id} />
                            <input type="hidden" name="points" value="-1" />
                            <button type="submit" class="btn-penalty remove" title="페널티 -1">-1</button>
                        </form>
                        <form method="POST" action="?/applyPenaltyAdmin" use:enhance style="display:inline;">
                            <input type="hidden" name="attendeeId" value={a.id} />
                            <input type="hidden" name="points" value="1" />
                            <button type="submit" class="btn-penalty add" title="페널티 +1">+1</button>
                        </form>
                    </div>
                    <form method="POST" action="?/toggleBlacklist" use:enhance style="display:inline;">
                        <input type="hidden" name="attendeeId" value={a.id} />
                        <button type="submit" class="btn-blacklist" title="블랙리스트 토글">
                            {a.is_blacklisted ? '해제' : '블랙'}
                        </button>
                    </form>
                    <form method="POST" action="?/toggleManager" use:enhance style="display:inline;">
                        <input type="hidden" name="attendeeId" value={a.id} />
                        <button type="submit" class="btn-manager-toggle {a.can_manage_games ? 'active' : ''}" title="게임 관리 권한 토글">
                            {#if a.can_manage_games}
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; vertical-align:middle;"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg> 매니저
                            {:else}
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; vertical-align:middle;"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> 유저
                            {/if}
                        </button>
                    </form>
                    <form method="POST" action="?/removeAttendee" use:enhance={({ cancel }) => {
                        if (a.is_playing) {
                            cancel(); // Stop default submission
                            handleRemove(a); // Open modal
                        }
                    }} style="display:inline;">
                        <input type="hidden" name="id" value={a.id} />
                        <button type="submit" class="btn-delete">퇴장</button>
                    </form>
                </div>
            </li>
        {/each}
    </ul>

    <form method="POST" action="?/addAttendee" use:enhance class="add-form">
        <input type="text" name="name" placeholder="이름 입력" required />
        <button type="submit">인원 추가</button>
    </form>

    {#if (data.savedMembers || []).length > 0}
        <div class="quick-add">
            <h3>저장된 멤버 (클릭하여 추가)</h3>
            <div class="member-chips">
                {#each (savedMembers || []) as member (member.id)}
                    <div class="chip-container {member.is_blacklisted ? 'blacklisted' : ''}">
                        <a href="/admin/attendees/{member.id}" class="chip-link">
                            {member.name}
                            {#if member.penalty_points > 0}
                                <span class="penalty-dot">({member.penalty_points})</span>
                            {/if}
                        </a>
                        <form method="POST" action="?/addAttendee" use:enhance style="display:inline;">
                            <input type="hidden" name="name" value={member.name} />
                            <button type="submit" class="chip-add" title="입장" disabled={member.is_blacklisted}>+</button>
                        </form>
                    </div>
                {/each}
            </div>
        </div>
    {/if}
</section>

<section>
    <div class="section-header">
        <h2>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            시작 예정 게임 ({(scheduledGames || []).length})
        </h2>
        <button class="btn-primary" on:click={openScheduledGameModal}>+ 게임 일정 등록</button>
    </div>
    <div class="scheduled-grid">
        {#each (scheduledGames || []) as game (game.id)}
            {@const g = game as GameSession}
            <div class="scheduled-card">
                <div class="game-header-row">
                    {#if g.image_url}
                        <img src={g.image_url} alt={g.game_name} class="game-thumb" />
                    {:else}
                        <div class="game-thumb placeholder">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#adb5bd;"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                        </div>
                    {/if}
                    <div class="game-details">
                        <h3>{g.game_name}</h3>
                        <p class="start-time">예정: <strong>{formatScheduledTime(g.scheduled_at)}</strong></p>
                        <p class="participants-list">인원: (최소 {g.min_players} / 최대 {g.max_players})</p>
                        <p class="participants-list">참여자 ({(g.participants || []).length}): {(g.participants || []).map((p: any) => p.is_guest ? `${p.name}(G)` : p.name).join(', ')}</p>
                    </div>
                </div>
                <div class="game-actions-container">
                    <form method="POST" action="?/joinGame" use:enhance={() => {
                        return async ({ result, update }) => {
                            if (result.type === 'failure') {
                                // @ts-ignore
                                showAlert(result.data?.error || '참가 처리 중 오류가 발생했습니다.');
                            }
                            await update();
                        };
                    }} class="inline-add-form">
                        <input type="hidden" name="sessionId" value={g.id} />
                        <select name="attendeeId" required class="attendee-select-mini">
                            <option value="">참여자 추가</option>
                            {#each (allUsers || []) as user}
                                <option value={user.id}>{user.name}</option>
                            {/each}
                        </select>
                        <button type="submit" class="btn-mini">추가</button>
                    </form>
                    <div class="action-group">
                        <form method="POST" action="?/startScheduledGame" use:enhance>
                            <input type="hidden" name="sessionId" value={g.id} />
                            <span class="input-label">예상(분):</span>
                            <input type="number" name="duration" value="60" class="duration-input" title="예상 시간(분)"/>
                            <button type="submit" class="btn-primary">시작</button>
                        </form>
                        <form method="POST" action="?/dissolveScheduledGame" use:enhance>
                            <input type="hidden" name="sessionId" value={g.id} />
                            <button type="submit" class="btn-delete btn-unified">폭파</button>
                        </form>
                    </div>
                </div>
            </div>
        {/each}
        {#if (data.scheduledGames || []).length === 0}
            <p class="empty-state">예정된 게임이 없습니다.</p>
        {/if}
    </div>
</section>

<section>
    <div class="section-header">
        <h2>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
            반복 게임 관리 ({recurringSchedules.length})
        </h2>
    </div>
    {#if recurringSchedules.length > 0}
        <div class="recurring-list">
            {#each recurringSchedules as schedule (schedule.id)}
                <div class="recurring-item" class:inactive={!schedule.is_active}>
                    <div class="recurring-info">
                        <strong>{schedule.game_name}</strong>
                        <span class="recurring-meta">
                            매주 {dayNames[schedule.day_of_week]}요일 {schedule.scheduled_time.slice(0, 5)}
                            | {schedule.min_players}-{schedule.max_players}인
                            {#if schedule.show_on_main}
                                | <span class="badge-main">메인표시</span>
                            {/if}
                        </span>
                        <span class="recurring-status">
                            {schedule.is_active ? '활성' : '비활성'}
                        </span>
                    </div>
                    <div class="recurring-actions">
                        <form method="POST" action="?/skipRecurringWeek" use:enhance={() => {
                            return async ({ result, update }) => {
                                if (result.type === 'failure') {
                                    showAlert((result as any).data?.error || '오류가 발생했습니다.');
                                } else {
                                    const msg = (result as any).data?.message || (schedule.is_skipped_this_week ? '스킵 해제됨' : '스킵 처리됨');
                                    showAlert(msg);
                                }
                                await update();
                            };
                        }} style="display:inline;">
                            <input type="hidden" name="scheduleId" value={schedule.id} />
                            <button type="submit" class="btn-skip" class:skipped={schedule.is_skipped_this_week}>
                                {schedule.is_skipped_this_week ? '이번주 스킵됨' : '이번주 빼기'}
                            </button>
                        </form>
                        <form method="POST" action="?/toggleRecurringActive" use:enhance style="display:inline;">
                            <input type="hidden" name="scheduleId" value={schedule.id} />
                            <button type="submit" class="btn-toggle-active">
                                {schedule.is_active ? '비활성화' : '활성화'}
                            </button>
                        </form>
                        <form method="POST" action="?/deleteRecurringSchedule" use:enhance={() => {
                            return async ({ result, update }) => {
                                if (result.type === 'failure') {
                                    showAlert((result as any).data?.error || '삭제 실패');
                                }
                                await update();
                            };
                        }} style="display:inline;">
                            <input type="hidden" name="scheduleId" value={schedule.id} />
                            <button type="submit" class="btn-delete">삭제</button>
                        </form>
                    </div>
                </div>
            {/each}
        </div>
    {:else}
        <p class="empty-state">등록된 반복 게임이 없습니다.</p>
    {/if}
</section>

<!-- <section>
    <div class="section-header">
        <h2>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:10px; vertical-align:text-bottom;"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>
            예약 및 대기열 ({(reservations || []).length})
        </h2>
        <form method="POST" action="/?/reserveGame" use:enhance class="inline-add-form">
            <select name="attendeeId" required class="attendee-select-mini">
                <option value="">예약자 추가</option>
                {#each (attendees || []) as attendee}
                    <option value={attendee.id}>{attendee.name}</option>
                {/each}
            </select>
            <select name="sessionId" required class="session-select-mini">
                <option value="">게임 선택</option>
                {#each (games || []) as game}
                    <option value={game.id}>{game.game_name}</option>
                {/each}
            </select>
            <button type="submit" class="btn-mini">추가</button>
        </form>
    </div>
    <div class="reservations-list">
        {#each (reservations || []) as res (res.id)}
            <div class="reservation-item {res.status}">
                <div class="res-info">
                    <span class="res-name"><strong>{res.attendee_name}</strong></span>
                    <span class="res-game">{res.game_name}</span>
                    <span class="res-status-badge {res.status}">
                        {res.status === 'pending' ? '대기' : res.status === 'waitlisted' ? '대기열' : '확정'}
                    </span>
                </div>
                <div class="res-actions">
                    {#if res.status === 'pending'}
                        <form method="POST" action="?/confirmReservation" use:enhance>
                            <input type="hidden" name="reservationId" value={res.id} />
                            <button type="submit" class="btn-confirm">확정</button>
                        </form>
                    {/if}
                    <form method="POST" action="?/cancelReservationAdmin" use:enhance>
                        <input type="hidden" name="reservationId" value={res.id} />
                        <button type="submit" class="btn-delete">취소</button>
                    </form>
                </div>
            </div>
        {/each}
        {#if (data.reservations || []).length === 0}
            <p class="empty-state">현재 예약 내역이 없습니다.</p>
        {/if}
    </div>
</section> -->

<section>
    <div class="section-header">
        <h2>진행 중인 게임</h2>
        <button class="btn-primary" on:click={() => {
            showModal = true;
            selectedGameName = '';
            selectedDuration = '';
            selectedGameId = '';
            guestCount = 0;
            dropdownOpen = false;
        }}>+ 새 게임 시작</button>
    </div>
    <div class="games-grid">
        {#each (games || []) as game (game.id)}
            <div class="game-card">
                <div class="game-header-row">
                    {#if game.image_url}
                        <img src={game.image_url} alt={game.game_name} class="game-thumb" />
                    {:else}
                        <div class="game-thumb placeholder">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#adb5bd;"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                        </div>
                    {/if}
                    <div class="game-details">
                        <h3>{game.game_name}</h3>
                        <p class="players-list">참여자: {game.players.map((p: any) => p.is_guest ? `${p.name}(G)` : p.name).join(', ')}</p>
                        <p class="end-time">종료 예정: {new Date(game.end_time).toLocaleTimeString()} <span class="time-remaining">({getTimeRemaining(game.end_time)})</span></p>
                    </div>
                </div>
                <div class="game-actions-container">
                    <form method="POST" action="?/joinGame" use:enhance={() => {
                        return async ({ result, update }) => {
                            if (result.type === 'failure') {
                                // @ts-ignore
                                showAlert(result.data?.error || '참가 처리 중 오류가 발생했습니다.');
                            }
                            await update();
                        };
                    }} class="inline-add-form">
                        <input type="hidden" name="sessionId" value={game.id} />
                        <select name="attendeeId" required class="attendee-select-mini">
                            <option value="">참여자 추가</option>
                            {#each (attendees || []) as attendee}
                                <option value={attendee.id}>{attendee.name}</option>
                            {/each}
                        </select>
                        <button type="submit" class="btn-mini">추가</button>
                    </form>
                    <div class="action-group">
                        <form method="POST" action="?/extendGame" use:enhance>
                            <input type="hidden" name="id" value={game.id} />
                            <input type="hidden" name="minutes" value="10" />
                            <button type="submit" class="btn-extend">+10분</button>
                        </form>
                        <form method="POST" action="?/extendGame" use:enhance>
                            <input type="hidden" name="id" value={game.id} />
                            <input type="hidden" name="minutes" value="30" />
                            <button type="submit" class="btn-extend">+30분</button>
                        </form>
                        <button class="btn-delete btn-unified" on:click={() => openEndGameModal(game)}>종료</button>
                    </div>
                </div>
            </div>
        {/each}
        {#if (data.games || []).length === 0}
            <p class="empty-state">진행 중인 게임이 없습니다.</p>
        {/if}
    </div>
</section>

{#if showModal}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div class="modal-backdrop" on:click={() => showModal = false} role="presentation">
        <div class="modal-content" on:click={handleModalClick} role="dialog">
            <h2>새 게임 시작</h2>
            <form method="POST" action="?/createGame" use:enhance={() => {
                return async ({ result, update }: { result: any, update: (options?: { reset?: boolean }) => Promise<void> }) => {
                    if (result.type === 'failure') {
                        const data = result.data as { error?: string, missing?: boolean };
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
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align:text-top;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                                {game.min_players}-{game.max_players}인 | 
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align:text-top;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                                {game.playtime_min}분
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

                <div class="input-group guest-input-group">
                    <label for="guestCount">게스트 수</label>
                    <input type="number" id="guestCount" name="guestCount" bind:value={guestCount} min="0" max="20" class="number-input" />
                    <p class="hint">* 미등록 참가자 수 (게스트1, 게스트2... 자동 생성)</p>
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
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#fab005;"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
                게임 종료 및 승자 선택
            </h2>
            <p><strong>{selectedEndGame.game_name}</strong> 게임을 종료합니다.</p>
            <p>승리한 플레이어를 선택해주세요 (복수 선택 가능):</p>
            
            <form method="POST" action="?/endGame" use:enhance={() => {
                return async ({ result, update }: { result: any, update: (options?: { reset?: boolean }) => Promise<void> }) => {
                    if (result.type === 'failure') {
                        const data = result.data as { error?: string, missing?: boolean };
                        if (data?.missing) {
                            showAlert('필수 입력 항목을 입력해주세요.');
                        } else {
                            showAlert(data?.error || '오류가 발생했습니다.');
                        }
                    } else {
                        endGameModalVisible = false;

                        showAlert('게임이 종료되고 승자가 기록되었습니다!');
                    }
                    await update();
                };
            }}>
                <input type="hidden" name="id" value={selectedEndGame.id} />
                
                <div class="player-select">
                    {#each (selectedEndGame?.players || []) as player}
                        {@const pl = player as any}
                        <div class="winner-row">
                            <label class="winner-option">
                                <input type="checkbox" name="winnerIds" value={pl.id} />
                                <span class="player-name">
                                    {pl.name}
                                    {#if pl.is_guest}<span class="guest-badge">G</span>{/if}
                                </span>
                                <span class="medal">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>
                                </span>
                            </label>
                            <input type="number" name="score_{pl.id}" placeholder="점수" class="score-input" />
                        </div>
                    {/each}
                </div>

                <div class="modal-actions">
                    <button type="button" on:click={() => endGameModalVisible = false} class="btn-cancel">취소</button>
                    <button type="submit" class="btn-primary">종료 및 저장</button>
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

<!-- Remove Confirm Modal -->
{#if removeModalVisible && removeTarget}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div class="modal-backdrop" on:click={() => removeModalVisible = false} role="presentation">
        <div class="modal-content confirm-modal" on:click|stopPropagation role="dialog">
            <h3>참가자 퇴장 확인</h3>
            <p><strong>{removeTarget.name}</strong>님은 현재 <strong>{removeTarget.game_name}</strong> 게임에 참여 중입니다.</p>
            <p>어떻게 처리하시겠습니까?</p>
            
            <div class="modal-actions column-actions">
                <form method="POST" action="?/removeAttendee" use:enhance={() => {
                    return async ({ update }) => {
                        removeModalVisible = false;
                        await update();
                    };
                }}>
                    <input type="hidden" name="id" value={removeTarget.id} />
                    <input type="hidden" name="endGame" value="true" />
                    <input type="hidden" name="gameId" value={removeTarget.game_id} />
                    <button type="submit" class="btn-delete full-width">게임 종료 및 퇴장</button>
                </form>

                <form method="POST" action="?/removeAttendee" use:enhance={() => {
                    return async ({ update }) => {
                        removeModalVisible = false;
                        await update();
                    };
                }}>
                    <input type="hidden" name="id" value={removeTarget.id} />
                    <button type="submit" class="btn-warning full-width">참가자만 퇴장</button>
                </form>

                <button class="btn-cancel full-width" on:click={() => removeModalVisible = false}>취소</button>
            </div>
        </div>
    </div>
{/if}

{#if showScheduledGameModal}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div class="modal-backdrop" on:click={() => showScheduledGameModal = false} role="presentation">
        <div class="modal-content" on:click={handleModalClick} role="dialog">

            <h2>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                시작 예정 게임 생성
            </h2>
            <form method="POST" action="?/createScheduledGame" use:enhance={() => {
                return async ({ result, update }: { result: any, update: (options?: { reset?: boolean }) => Promise<void> }) => {
                    if (result.type === 'failure') {
                        const data = result.data as { error?: string };
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
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align:text-top;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                                {game.min_players}-{game.max_players}인 | 
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align:text-top;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                                {game.playtime_min}분
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

                <div class="input-group guest-input-group">
                    <label for="scheduledGuestCount">게스트 수</label>
                    <input type="number" id="scheduledGuestCount" name="guestCount" bind:value={guestCount} min="0" max={maxPlayers} class="number-input"
                        on:input={() => { if (guestCount > maxPlayers) guestCount = maxPlayers; }} />
                    <p class="hint">* 미등록 참가자 수 (최대 {maxPlayers}명, 게스트1, 게스트2... 자동 생성)</p>
                </div>

                <div class="admin-options">
                    <h4 class="admin-options-title">관리자 옵션</h4>
                    <label class="checkbox-option">
                        <input type="checkbox" name="showOnMain" value="true" />
                        메인페이지에 보이기
                    </label>
                    <label class="checkbox-option">
                        <input type="checkbox" name="isRecurring" value="true" bind:checked={isRecurring} />
                        매주 반복 (같은 요일에 자동 생성)
                    </label>
                </div>

                <div class="modal-actions">
                    <button type="button" on:click={() => showScheduledGameModal = false} class="btn-cancel">취소</button>
                    <button type="submit" class="btn-primary">예약 생성</button>
                </div>
            </form>
        </div>
    </div>
{/if}

<style>
    section {
        margin-bottom: 3rem;
        padding: 1.5rem;
        border: 1px solid #eee;
        border-radius: 8px;
        background: #f9f9f9;
    }
    section h2 {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }
    .attendee-list {
        list-style: none;
        padding: 0;
    }
    .attendee-list li {
        display: flex;
        justify-content: space-between;
        padding: 0.5rem;
        border-bottom: 1px solid #ddd;
    }
    .attendee-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .attendee-link {
        text-decoration: none;
        color: #333;
        font-weight: 500;
        display: flex;
        align-items: center;
    }
    .attendee-link:hover {
        color: #007bff;
        text-decoration: underline;
    }
    .arrival-time {
        font-size: 0.8rem;
        color: #666;
        background: #eee;
        padding: 0.1rem 0.4rem;
        border-radius: 4px;
    }
    .add-form, .game-form {
        margin-top: 1rem;
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
    }
    .quick-add {
        margin-top: 1.5rem;
        padding-top: 1rem;
        border-top: 1px dashed #ddd;
    }
    .quick-add h3 {
        font-size: 0.9rem;
        color: #666;
        margin-bottom: 0.5rem;
    }
    .member-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    .chip-container {
        display: flex;
        align-items: center;
        background: #e0e0e0;
        border-radius: 16px;
        padding-left: 0.75rem;
        overflow: hidden;
    }
    .chip-link {
        text-decoration: none;
        color: #333;
        font-size: 0.85rem;
        margin-right: 0.5rem;
    }
    .chip-link:hover {
        text-decoration: underline;
        color: #007bff;
    }
    .chip-add {
        background: #bdbdbd;
        color: #333;
        border: none;
        padding: 0.25rem 0.6rem;
        font-size: 0.85rem;
        cursor: pointer;
        transition: background 0.2s;
        border-left: 1px solid #ccc;
    }
    .chip-add:hover {
        background: #a0a0a0;
    }
    .game-card {
        background: white;
        padding: 1rem;
        border-radius: 4px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        margin-bottom: 1rem;
    }
    .btn-delete {
        background: #ff4444;
        color: white;
        border: none;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        cursor: pointer;
    }
    .btn-warning {
        background: #ff9800;
        color: white;
        border: none;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        cursor: pointer;
    }
    button, .btn-secondary {
        padding: 0.5rem 1rem;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        text-decoration: none;
        display: inline-block;
    }
    .btn-secondary {
        background: #6c757d;
    }
    .player-select {
        width: 100%;
        display: flex;
        gap: 1rem;
        flex-wrap: wrap;
        margin: 1rem 0;
    }
    .time-remaining {
        font-weight: bold;
        color: #ef6c00;
        margin-left: 0.5rem;
        white-space: nowrap;
    }
    .player-select label.disabled {
        color: #999;
        cursor: not-allowed;
    }
    .status-text {
        font-size: 0.8rem;
        color: #ff9800;
        margin-left: 0.25rem;
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
        margin: 0;
        border: none;
        padding: 0;
    }
    .btn-primary {
        background: #007bff;
        color: white;
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
    }
    .btn-cancel {
        background: #ccc;
        color: #333;
    }
    .btn-create-game {
        background: #4caf50;
        color: white;
        padding: 0.5rem 1rem;
        border-radius: 8px;
        text-decoration: none;
        font-weight: bold;
        font-size: 0.9rem;
        transition: background 0.2s;
    }
    .btn-create-game:hover {
        background: #43a047;
    }
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
        width: 100%;
        max-width: 500px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    }
    .modal-content h2 {
        margin-top: 0;
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }
    .alert-modal {
        max-width: 400px;
        text-align: center;
    }
    .confirm-modal {
        max-width: 400px;
    }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 1rem;
        margin-top: 1.5rem;
    }
    .column-actions {
        flex-direction: column;
        gap: 0.5rem;
    }
    .full-width {
        width: 100%;
        padding: 0.75rem;
        font-size: 1rem;
    }
    .empty-state {
        color: #999;
        text-align: center;
        padding: 2rem;
        background: rgba(255,255,255,0.5);
        border-radius: 8px;
        grid-column: 1 / -1;
    }
    .notice-manager {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .current-notice {
        background: #fff3e0;
        padding: 1rem;
        border-radius: 4px;
        border-left: 4px solid #ff9800;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .notice-form {
        display: flex;
        gap: 0.5rem;
    }
    .notice-form input {
        flex: 1;
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: 4px;
    }
    .game-actions-container {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 1px dashed #eee;
    }
    .action-group {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        flex-wrap: wrap;
    }
    .action-group form {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    
    @media (max-width: 600px) {
        .attendee-list li {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.5rem;
        }
        .attendee-info {
            width: 100%;
            justify-content: space-between;
        }
        .btn-delete {
            width: 100%; /* Keep specific override or reset if needed */
            margin-top: 0.5rem;
        }
        .game-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.5rem;
        }
        .game-actions-container {
            align-items: stretch;
        }
        .inline-add-form {
            flex-direction: row; 
        }
        .action-group {
            flex-direction: row;
        }
        .action-group button, .action-group form {
            flex: 1; 
        }
        .notice-manager {
            gap: 0.5rem;
        }
        .game-actions form {
            flex: 1;
        }
        .game-actions button {
            width: 100%;
        }
        .notice-manager {
            gap: 0.5rem;
        }
        .notice-form {
            flex-direction: column;
        }
        .notice-form button {
            width: 100%;
        }
    }
    .winner-option {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem;
        border: 1px solid #ddd;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.2s;
    }
    .winner-option:hover {
        background: #f5f5f5;
    }
    .winner-option:has(input:checked) {
        background: #fff8e1;
        border-color: #ffc107;
    }
    .winner-option .player-name {
        flex: 1;
        font-weight: 500;
    }
    .winner-option .medal {
        opacity: 0;
        transition: opacity 0.2s;
    }
    .winner-option:has(input:checked) .medal {
        opacity: 1;
    }

    /* New Game UI Styles */
    .game-header-row {
        display: flex;
        gap: 1rem;
        margin-bottom: 1rem;
    }
    .game-thumb {
        width: 60px;
        height: 60px;
        border-radius: 8px;
        object-fit: cover;
        background: #f0f0f0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5rem;
    }
    .game-details {
        flex: 1;
    }
    .game-details h3 {
        margin: 0 0 0.25rem 0;
    }
    .players-list {
        margin: 0 0 0.25rem 0;
        font-size: 0.9rem;
        color: #555;
    }
    .end-time {
        margin: 0;
        font-size: 0.85rem;
        color: #888;
    }

    /* New Admin UI Styles */
    .name-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .badge {
        font-size: 0.7rem;
        padding: 0.1rem 0.4rem;
        border-radius: 4px;
        font-weight: bold;
    }
    .badge.blacklist {
        background: #ff5252;
        color: white;
    }
    .badge.penalty {
        background: #ffd740;
        color: #333;
    }
    .attendee-actions {
        display: flex;
        gap: 0.25rem;
    }
    .penalty-actions {
        display: flex;
        gap: 0;
        border-radius: 4px;
        overflow: hidden;
    }
    .btn-penalty {
        border: none;
        padding: 0.25rem 0.5rem;
        cursor: pointer;
        font-size: 0.8rem;
        font-weight: bold;
    }
    .btn-penalty.add {
        background: #ffd740;
        color: #333;
        border-radius: 0 4px 4px 0;
    }
    .btn-penalty.remove {
        background: #ff5252;
        color: white;
        border-radius: 4px 0 0 4px;
    }
    .btn-blacklist {
        background: #424242;
        color: white;
        border: none;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.8rem;
    }
    .chip-container.blacklisted {
        opacity: 0.5;
        background: #bdbdbd;
    }
    .penalty-dot {
        font-size: 0.7rem;
        color: #f44336;
        margin-left: 0.2rem;
    }

    .scheduled-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 1rem;
    }
    .scheduled-card {
        background: white;
        padding: 1rem;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        border-left: 6px solid #4caf50;
    }
    .duration-input {
        width: 60px;
        padding: 0.4rem;
        border-radius: 4px;
        border: 1px solid #ddd;
        font-size: 0.9rem;
    }

    .reservations-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .reservation-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem;
        background: white;
        border-radius: 6px;
        border: 1px solid #eee;
    }
    .reservation-item.confirmed { border-left: 4px solid #4caf50; }
    .reservation-item.pending { border-left: 4px solid #ff9800; }
    .reservation-item.waitlisted { border-left: 4px solid #9e9e9e; }
    
    .res-info {
        display: flex;
        align-items: center;
        gap: 1rem;
    }
    .res-status-badge {
        font-size: 0.75rem;
        padding: 0.2rem 0.5rem;
        border-radius: 10px;
        background: #eee;
    }
    .res-status-badge.confirmed { background: #e8f5e9; color: #2e7d32; }
    .res-status-badge.pending { background: #fff3e0; color: #ef6c00; }
    .res-status-badge.waitlisted { background: #f5f5f5; color: #616161; }

    .btn-confirm {
        background: #4caf50;
        color: white;
        border: none;
        padding: 0.25rem 0.75rem;
        border-radius: 4px;
        cursor: pointer;
    }

    .input-group {
        position: relative;
        margin-bottom: 0.5rem;
    }

    /* Custom Dropdown Styles */
    .custom-dropdown {
        position: relative;
    }
    .dropdown-menu {
        position: absolute;
        top: 100%;
        left: 0;
        width: 100%;
        max-height: 300px;
        overflow-y: auto;
        background: white;
        border: 1px solid #ddd;
        border-radius: 4px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        z-index: 1000;
        list-style: none;
        padding: 0;
        margin: 4px 0 0 0;
    }
    .dropdown-menu li {
        border-bottom: 1px solid #eee;
    }
    .dropdown-menu li:last-child {
        border-bottom: none;
    }
    .dropdown-menu button {
        width: 100%;
        text-align: left;
        padding: 0.75rem;
        background: none;
        border: none;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        cursor: pointer;
        transition: background 0.2s;
    }
    .dropdown-menu button:hover {
        background: #f5f5f5;
    }
    .mini-thumb {
        width: 40px;
        height: 40px;
        border-radius: 4px;
        object-fit: cover;
        background: #eee;
    }
    .game-option-info {
        display: flex;
        flex-direction: column;
    }
    .game-option-info .name {
        font-weight: 500;
        color: #333;
    }
    .game-option-info .meta {
        font-size: 0.8rem;
        color: #888;
    }

    .winner-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
        margin-bottom: 0.5rem;
    }
    .winner-row .winner-option {
        flex: 1;
        margin-bottom: 0;
    }
    .score-input {
        width: 80px;
        padding: 0.75rem;
        border: 1px solid #ddd;
        border-radius: 8px;
    }

    /* New Settings & Inline Add Styles */
    .settings-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 1.5rem;
    }
    .settings-card {
        background: white;
        padding: 1.5rem;
        border-radius: 12px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.05);
        border: 1px solid #eee;
    }
    .settings-card h3 {
        margin-top: 0;
        margin-bottom: 1.5rem;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-size: 1.1rem;
        color: #333;
        border-bottom: 2px solid #f0f0f0;
        padding-bottom: 0.5rem;
    }
    .setting-item {
        margin-bottom: 1.25rem;
    }
    .setting-item label {
        display: block;
        font-size: 0.9rem;
        font-weight: 600;
        color: #666;
        margin-bottom: 0.5rem;
    }
    .setting-item input {
        width: 100%;
        padding: 0.6rem;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 1rem;
    }
    .setting-item .hint {
        font-size: 0.8rem;
        color: #888;
        margin-top: 0.25rem;
    }
    .inline-add-form {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }
    .attendee-select-mini, .session-select-mini {
        padding: 0.4rem;
        border-radius: 6px;
        border: 1px solid #ddd;
        font-size: 0.85rem;
    }
    .btn-mini {
        padding: 0.4rem 0.8rem;
        background: #4c6ef5;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.85rem;
        font-weight: 600;
    }
    .btn-mini:hover {
        background: #3b5bdb;
    }
    .btn-manager-toggle {
        background: #e9ecef;
        color: #495057;
        border: 1px solid #ced4da;
        padding: 0.2rem 0.4rem;
        border-radius: 4px;
        font-size: 0.8rem;
        cursor: pointer;
    }
    .btn-manager-toggle.active {
        background: #ffd43b;
        color: #212529;
        border-color: #fcc419;
        font-weight: bold;
    }
    .btn-manager-toggle:hover {
        opacity: 0.9;
    }
    /* Unified Button Styles for Card Actions */
    .action-group button, .btn-extend, .btn-delete.btn-unified {
        padding: 0.4rem 0.8rem;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.85rem;
        font-weight: 600;
        border: none;
        color: white;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 34px; /* Fixed height for alignment */
    }
    
    .btn-primary.btn-unified {
        background: #007bff;
    }
    
    .btn-delete.btn-unified {
        background: #ff4444; 
    }
    
    .btn-extend {
        background: #4caf50;
    }
    .btn-extend:hover {
        background: #43a047;
    }
    
    /* Override existing minimal styles if needed or use new classes */
    .action-group .btn-primary {
       padding: 0.4rem 0.8rem;
       font-size: 0.85rem;
    }
    
    .input-label {
        font-size: 0.85rem;
        font-weight: 600;
        color: #555;
    }
    .guest-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #868e96;
        color: white;
        font-size: 10px;
        font-weight: bold;
        margin-left: 4px;
        vertical-align: middle;
    }
    .guest-input-group {
        margin-top: 0.5rem;
        padding-top: 0.5rem;
        border-top: 1px solid #eee;
    }
    .number-input {
        width: 80px;
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: 4px;
    }
    .hint {
        font-size: 0.8rem;
        color: #888;
        margin-top: 0.25rem;
    }

    /* Recurring Game Management */
    .recurring-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .recurring-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem 1rem;
        background: white;
        border-radius: 8px;
        border: 1px solid #e0e0e0;
        border-left: 4px solid #4caf50;
    }
    .recurring-item.inactive {
        opacity: 0.6;
        border-left-color: #9e9e9e;
    }
    .recurring-info {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    .recurring-meta {
        font-size: 0.85rem;
        color: #666;
    }
    .recurring-status {
        font-size: 0.75rem;
        color: #888;
    }
    .badge-main {
        background: #e3f2fd;
        color: #1565c0;
        padding: 0.1rem 0.4rem;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 600;
    }
    .recurring-actions {
        display: flex;
        gap: 0.25rem;
        align-items: center;
    }
    .btn-skip {
        background: #ff9800;
        color: white;
        border: none;
        padding: 0.3rem 0.6rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.8rem;
    }
    .btn-skip.skipped {
        background: #ef4444;
        opacity: 0.9;
    }
    .btn-toggle-active {
        background: #607d8b;
        color: white;
        border: none;
        padding: 0.3rem 0.6rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.8rem;
    }
    @media (max-width: 600px) {
        .recurring-item {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.5rem;
        }
        .recurring-actions {
            width: 100%;
            justify-content: flex-end;
        }
    }

    .admin-options {
        background: #f0f4ff;
        border: 1px solid #d0d9f0;
        border-radius: 8px;
        padding: 1rem;
        margin-top: 0.5rem;
    }

    .admin-options-title {
        font-size: 0.85rem;
        color: #4a5568;
        margin: 0 0 0.5rem 0;
        font-weight: 600;
    }

    .checkbox-option {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.9rem;
        color: #333;
        cursor: pointer;
        padding: 0.25rem 0;
    }

    .checkbox-option input[type="checkbox"] {
        width: 16px;
        height: 16px;
        accent-color: #4a90d9;
    }

</style>
