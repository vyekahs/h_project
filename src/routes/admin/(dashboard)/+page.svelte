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

    // 라이브 시계 — 카운트다운/요약 스트립이 SSE 이벤트 없이도 갱신되도록 30초마다 틱
    let now = Date.now();
    let clockTimer: ReturnType<typeof setInterval> | null = null;

    onMount(() => {
        connectSSE();
        clockTimer = setInterval(() => { now = Date.now(); }, 30000);
    });

    onDestroy(() => {
        sseDestroyed = true;
        if (debounceTimer) clearTimeout(debounceTimer);
        if (sseReconnectTimer) clearTimeout(sseReconnectTimer);
        if (clockTimer) clearInterval(clockTimer);
        if (eventSource) { eventSource.close(); eventSource = null; }
    });

    /** 폼의 제출 버튼을 잠그고, 잠금 해제 함수를 돌려준다 */
    function lockFormButtons(form: HTMLFormElement) {
        const btns = Array.from(form.querySelectorAll<HTMLButtonElement>('button')).filter((b) => {
            const t = b.getAttribute('type');
            return !t || t === 'submit';
        });
        btns.forEach((b) => {
            b.disabled = true;
            b.setAttribute('aria-busy', 'true');
        });
        return () =>
            btns.forEach((b) => {
                b.disabled = false;
                b.removeAttribute('aria-busy');
            });
    }

    /**
     * use:enhance={pending(cb?)} — 실제 요청이 끝날 때까지 제출 버튼을 잠가
     * 더블탭 중복 제출을 막고 진행 중임을 표시한다(고정 타임아웃이 아님).
     */
    function pending(cb?: (arg: any) => any) {
        return (arg: any) => {
            const release = lockFormButtons(arg.formElement);
            let inner: any;
            try {
                inner = cb ? cb(arg) : undefined;
            } catch (e) {
                release();
                throw e;
            }
            return async (result: any) => {
                try {
                    if (typeof inner === 'function') await inner(result);
                    else await result.update();
                } finally {
                    release();
                }
            };
        };
    }

    /**
     * use:trapFocus={onClose} — 모달 컨텐츠에 적용.
     * 열릴 때 포커스를 안으로(우선 [data-autofocus], 없으면 첫 포커스 대상),
     * Tab을 컨텐츠 안에 가두고, Escape로 onClose 호출, 닫힐 때 이전 포커스 복원.
     */
    function trapFocus(node: HTMLElement, onClose?: () => void) {
        const returnTo = document.activeElement as HTMLElement | null;
        const SEL =
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

        const focusable = () =>
            Array.from(node.querySelectorAll<HTMLElement>(SEL)).filter(
                (el) => el.offsetParent !== null || el === document.activeElement
            );

        queueMicrotask(() => {
            const initial =
                node.querySelector<HTMLElement>('[data-autofocus]') ?? focusable()[0] ?? node;
            initial.focus();
        });

        function onKeydown(e: KeyboardEvent) {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose?.();
                return;
            }
            if (e.key !== 'Tab') return;
            const items = focusable();
            if (items.length === 0) {
                e.preventDefault();
                return;
            }
            const first = items[0];
            const last = items[items.length - 1];
            const active = document.activeElement as HTMLElement;
            if (e.shiftKey && (active === first || !node.contains(active))) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && (active === last || !node.contains(active))) {
                e.preventDefault();
                first.focus();
            }
        }

        node.addEventListener('keydown', onKeydown);
        return {
            destroy() {
                node.removeEventListener('keydown', onKeydown);
                returnTo?.focus?.();
            }
        };
    }

    /** enhance 결과에서 실패(failure)와 전송/HTTP 에러(error)를 모두 사용자에게 노출 */
    function reportResult(result: any, fallback = '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.'): boolean {
        if (result.type === 'failure') {
            showAlert(result.data?.error || fallback, 'error');
            return true;
        }
        if (result.type === 'error') {
            showAlert(result.error?.message || fallback, 'error');
            return true;
        }
        return false;
    }

    // 파괴적 액션 공통 확인 모달
    let confirmState:
        | { title: string; message: string; confirmLabel: string; danger: boolean; handle?: (opts: any) => Promise<void> }
        | null = null;
    let pendingForm: HTMLFormElement | null = null;

    function closeConfirm() {
        confirmState = null;
        pendingForm = null;
    }

    function confirmSubmit(opts: {
        title: string;
        message: string;
        confirmLabel?: string;
        danger?: boolean;
        handle?: (opts: any) => Promise<void>;
    }) {
        return (arg: any) => {
            if (arg.formElement.dataset.confirmed === 'true') {
                arg.formElement.dataset.confirmed = '';
                const release = lockFormButtons(arg.formElement);
                const inner = opts.handle;
                return async (result: any) => {
                    try {
                        if (inner) await inner(result);
                        else {
                            reportResult(result);
                            await result.update();
                        }
                    } finally {
                        release();
                    }
                };
            }
            arg.cancel();
            pendingForm = arg.formElement;
            confirmState = {
                title: opts.title,
                message: opts.message,
                confirmLabel: opts.confirmLabel ?? '확인',
                danger: opts.danger ?? false,
                handle: opts.handle
            };
            return undefined;
        };
    }

    function runConfirm() {
        if (!pendingForm) return;
        pendingForm.dataset.confirmed = 'true';
        pendingForm.requestSubmit();
        closeConfirm();
    }

    let showModal = false;
    let selectedGameName = '';
    let selectedDuration = '';
    let guestCount = 0;

    let selectedGameId = '';

    // 새 게임 참여자 선택 (검색형 멀티셀렉트)
    let selectedPlayerIds: number[] = [];
    let playerSearch = '';
    let showPlayingInPicker = false;

    // Alert Modal State
    type AlertKind = 'success' | 'error' | 'info';
    let alertVisible = false;
    let alertMessage = '';
    let alertKind: AlertKind = 'info';

    function showAlert(msg: string, kind: AlertKind = 'info') {
        alertMessage = msg;
        alertKind = kind;
        alertVisible = true;
    }

    // Remove Confirm Modal State
    let removeModalVisible = false;
    let removeTarget: Attendee | null = null;

    // 참여자 관리 시트 (블랙리스트 / 게임 권한 / 퇴장)
    let manageTarget: Attendee | null = null;

    // 게임 참여 중인 참가자 퇴장 — 게임 처리 방식을 묻는 전용 모달을 연다
    function handleRemove(attendee: Attendee) {
        removeTarget = attendee;
        removeModalVisible = true;
    }

    // End Game Modal State
    let endGameModalVisible = false;
    let selectedEndGame: GameSession | null = null;

    function openEndGameModal(game: GameSession) {
        selectedEndGame = game;
        endGameModalVisible = true;
    }

    // Saved members toggle
    let savedMembersOpen = false;

    // Game list + detail modal state
    let showAllScheduled = false;
    let showAllPlaying = false;
    let selectedScheduledGame: GameSession | null = null;
    let selectedPlayingGame: GameSession | null = null;

    // Participant search state (for game detail modals)
    let participantSearch = '';
    let participantSearchOpen = false;
    let selectedParticipantId = '';

    $: filteredParticipants = (allUsers || []).filter((u: any) =>
        participantSearch.length > 0 && u.name.toLowerCase().includes(participantSearch.toLowerCase())
    );

    function resetParticipantSearch() {
        participantSearch = '';
        participantSearchOpen = false;
        selectedParticipantId = '';
    }

    function refreshSelectedScheduledGame() {
        if (!selectedScheduledGame) return;
        const updated = (data.scheduledGames as GameSession[])?.find(g => g.id === selectedScheduledGame!.id);
        selectedScheduledGame = updated ?? null;
    }

    function refreshSelectedPlayingGame() {
        if (!selectedPlayingGame) return;
        const updated = (data.games as GameSession[])?.find(g => g.id === selectedPlayingGame!.id);
        selectedPlayingGame = updated ?? null;
    }

    function selectParticipant(user: any) {
        selectedParticipantId = String(user.id);
        participantSearch = user.name;
        participantSearchOpen = false;
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

    function getTimeRemaining(endTime: string, nowTs: number = Date.now()) {
        const end = new Date(endTime).getTime();
        const diff = end - nowTs;
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
        return new Date(dateString).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    }

    function formatScheduledTime(dateString: string) {
        const date = new Date(dateString);
        const now = new Date();
        const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        
        const timeStr = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
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

    interface SavedMember {
        id: number;
        name: string;
        penalty_points: number;
        is_blacklisted: boolean;
    }

    let attendees: Attendee[];
    let games: GameSession[];
    let scheduledGames: GameSession[];
    let savedMembers: SavedMember[];

    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    $: attendees = data.attendees as Attendee[];
    $: allUsers = (data as any).allUsers || [];
    $: games = data.games as GameSession[];
    $: scheduledGames = data.scheduledGames as GameSession[];
    $: savedMembers = data.savedMembers as SavedMember[];
    $: recurringSchedules = (data as any).recurringSchedules || [];

    // 관리 시트가 열려 있으면 최신 참여자 데이터로 동기화
    $: manageView = manageTarget
        ? ((attendees || []).find((x) => x.id === manageTarget!.id) as Attendee | undefined) ?? manageTarget
        : null;

    // 방 현황 요약 스트립
    $: playingCount = (games || []).length;
    $: attendeeCount = (attendees || []).length;
    // 종료 임박 순 정렬 — "진행 중인 게임" 목록에서 끝나가는 게임을 위로
    $: playingSorted = [...(games || [])].sort(
        (a, b) => new Date(a.end_time).getTime() - new Date(b.end_time).getTime()
    );
    $: nextGameEndTs = (games || []).length
        ? Math.min(...(games as GameSession[]).map((g) => new Date(g.end_time).getTime()))
        : null;
    $: nextEndMins = nextGameEndTs !== null ? Math.round((nextGameEndTs - now) / 60000) : null;

    // 새 게임 참여자 피커
    $: availableAttendees = (attendees || []).filter((a: Attendee) => !a.is_playing);
    $: pickerResults = (attendees || []).filter((a: Attendee) => {
        if (!showPlayingInPicker && a.is_playing) return false;
        if (playerSearch && !a.name.toLowerCase().includes(playerSearch.toLowerCase())) return false;
        return true;
    });
    $: selectedPlayers = (attendees || []).filter((a: Attendee) => selectedPlayerIds.includes(a.id));

    // 오늘 갈 예정 merge
    $: checkedInIds = new Set((attendees || []).map((a: Attendee) => a.id));
    $: visitPlanIds = new Set(((data as any).dailyVisitPlans || []).map((p: any) => p.attendee_id));
    $: scheduledVisitors = ((data as any).todayScheduledParticipants || []).filter((p: any) =>
        !checkedInIds.has(p.attendee_id) && !visitPlanIds.has(p.attendee_id)
    );
    $: mergedVisitPlans = [
        ...((data as any).dailyVisitPlans || []),
        ...scheduledVisitors.map((p: any) => ({
            attendee_id: p.attendee_id, name: p.name,
            planned_time: p.planned_time, title_name: p.title_name,
            is_party: p.is_party
        }))
    ].filter((p: any) => !checkedInIds.has(p.attendee_id));

    function formatVisitTime(time: string): string {
        if (!time) return '';
        const [h, m] = time.split(':');
        return m === '00' ? `${parseInt(h)}시` : `${parseInt(h)}시${parseInt(m)}분`;
    }
</script>

<section class="room-summary" aria-label="방 현황 요약">
    <span class="rs-item">
        <span class="rs-dot" class:live={attendeeCount > 0} aria-hidden="true"></span>
        <strong>{attendeeCount}명</strong> 현재
    </span>
    <span class="rs-sep" aria-hidden="true">·</span>
    <span class="rs-item"><strong>게임 {playingCount}개</strong> 진행 중</span>
    <span class="rs-sep" aria-hidden="true">·</span>
    <span class="rs-item">
        {#if nextEndMins === null}
            종료 예정 <strong>없음</strong>
        {:else if nextEndMins <= 0}
            <strong class="urgent">종료 임박</strong>
        {:else}
            <strong class:urgent={nextEndMins <= 5}>{nextEndMins}분</strong> 후 첫 종료
        {/if}
    </span>
</section>

<section class="section-primary">
    <div class="section-header">
        <h2>진행 중인 게임 ({(games || []).length})</h2>
        <button class="btn-primary" onclick={() => {
            showModal = true;
            selectedGameName = '';
            selectedDuration = '';
            selectedGameId = '';
            guestCount = 0;
            dropdownOpen = false;
            selectedPlayerIds = [];
            playerSearch = '';
            showPlayingInPicker = false;
        }}>+ 새 게임 시작</button>
    </div>
    <ul class="game-list">
        {#each (showAllPlaying ? playingSorted : playingSorted.slice(0, 5)) as game (game.id)}
            {@const endingSoon = new Date(game.end_time).getTime() - now < 5 * 60000}
            <li>
                <button type="button" class="game-list-item" class:ending-soon={endingSoon} onclick={() => { selectedPlayingGame = game; resetParticipantSearch(); }}>
                    {#if game.image_url}
                        <img src={game.image_url} alt={game.game_name} width="32" height="32" class="list-thumb" />
                    {:else}
                        <div class="list-thumb placeholder">🎲</div>
                    {/if}
                    <span class="list-name">{game.game_name}</span>
                    <span class="list-meta">{game.players.length}명</span>
                    <span class="list-meta time-remaining">{getTimeRemaining(game.end_time, now)}</span>
                    <span class="list-arrow" aria-hidden="true">›</span>
                </button>
            </li>
        {/each}
        {#if (games || []).length === 0}
            <p class="empty-state">진행 중인 게임이 없습니다.</p>
        {/if}
    </ul>
    {#if (games || []).length > 5}
        <button class="show-more-btn" onclick={() => showAllPlaying = !showAllPlaying}>
            {showAllPlaying ? '접기' : `+${(games || []).length - 5}개 더보기`}
        </button>
    {/if}
</section>

<section class="section-primary">
    <h2>현재 참여 인원 ({(attendees || []).length})</h2>
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
                        <form method="POST" action="?/applyPenaltyAdmin" use:enhance={pending()} style="display:inline;">
                            <input type="hidden" name="attendeeId" value={a.id} />
                            <input type="hidden" name="points" value="-1" />
                            <button type="submit" class="btn-penalty remove" title="페널티 -1">-1</button>
                        </form>
                        <form method="POST" action="?/applyPenaltyAdmin" use:enhance={pending()} style="display:inline;">
                            <input type="hidden" name="attendeeId" value={a.id} />
                            <input type="hidden" name="points" value="1" />
                            <button type="submit" class="btn-penalty add" title="페널티 +1">+1</button>
                        </form>
                    </div>
                    <button type="button" class="btn-manage" onclick={() => (manageTarget = a)}>관리</button>
                </div>
            </li>
        {/each}
        {#if (attendees || []).length === 0}
            <li class="empty-state">현재 참여 중인 인원이 없습니다.</li>
        {/if}
    </ul>

    <form method="POST" action="?/addAttendee" use:enhance={pending()} class="add-form">
        <input type="text" name="name" placeholder="이름 입력" required />
        <button type="submit">인원 추가</button>
    </form>

    {#if (data.savedMembers || []).length > 0}
        <div class="quick-add">
            <button type="button" class="toggle-header" onclick={() => savedMembersOpen = !savedMembersOpen}>
                <span class="toggle-icon">{savedMembersOpen ? '▾' : '▸'}</span>
                저장된 멤버 ({(savedMembers || []).length})
            </button>
            {#if savedMembersOpen}
            <div class="member-chips">
                {#each (savedMembers || []) as member (member.id)}
                    <div class="chip-container {member.is_blacklisted ? 'blacklisted' : ''}">
                        <a href="/admin/attendees/{member.id}" class="chip-link">
                            {member.name}
                            {#if member.penalty_points > 0}
                                <span class="penalty-dot">({member.penalty_points})</span>
                            {/if}
                        </a>
                        <form method="POST" action="?/addAttendee" use:enhance={pending()} style="display:inline;">
                            <input type="hidden" name="name" value={member.name} />
                            <button type="submit" class="chip-add" title="입장" disabled={member.is_blacklisted}>+</button>
                        </form>
                    </div>
                {/each}
            </div>
            {/if}
        </div>
    {/if}
</section>

<section>
    <div class="section-header">
        <h2>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            시작 예정 게임 ({(scheduledGames || []).length})
        </h2>
        <button class="btn-primary" onclick={openScheduledGameModal}>+ 게임 일정 등록</button>
    </div>
    <ul class="game-list">
        {#each (showAllScheduled ? (scheduledGames || []) : (scheduledGames || []).slice(0, 5)) as game (game.id)}
            {@const g = game as GameSession}
            <li>
                <button type="button" class="game-list-item" onclick={() => { selectedScheduledGame = g; resetParticipantSearch(); }}>
                    {#if g.image_url}
                        <img src={g.image_url} alt={g.game_name} width="32" height="32" class="list-thumb" />
                    {:else}
                        <div class="list-thumb placeholder">🎲</div>
                    {/if}
                    <span class="list-name">{g.game_name}</span>
                    <span class="list-meta">{formatScheduledTime(g.scheduled_at)}</span>
                    <span class="list-meta">{(g.participants || []).length}/{g.max_players}</span>
                    <span class="list-arrow" aria-hidden="true">›</span>
                </button>
            </li>
        {/each}
        {#if (scheduledGames || []).length === 0}
            <p class="empty-state">예정된 게임이 없습니다.</p>
        {/if}
    </ul>
    {#if (scheduledGames || []).length > 5}
        <button class="show-more-btn" onclick={() => showAllScheduled = !showAllScheduled}>
            {showAllScheduled ? '접기' : `+${(scheduledGames || []).length - 5}개 더보기`}
        </button>
    {/if}
</section>

{#if mergedVisitPlans.length > 0}
<section class="visit-plan-section">
    <h2>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        오늘 갈 예정 ({mergedVisitPlans.length})
    </h2>
    <div class="visit-plan-grid">
        {#each mergedVisitPlans as plan}
            <div class="visit-plan-chip">
                <span class="vp-name">{plan.name}</span>
                {#if (plan as any).is_party}
                    <span class="vp-party">팟</span>
                {/if}
                <span class="vp-time">
                    {#if plan.planned_time}
                        {formatVisitTime(plan.planned_time)}~
                    {:else}
                        상황봐서
                    {/if}
                </span>
            </div>
        {/each}
    </div>
</section>
{/if}

<details class="section section-collapsible">
    <summary>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>
        공지사항 관리
        {#if data.notice}<span class="summary-tag">게시 중</span>{/if}
    </summary>
    <div class="notice-manager">
        {#if data.notice}
            <div class="current-notice">
                <strong>현재 공지:</strong> {data.notice}
                <form method="POST" action="?/clearNotice" use:enhance={pending()} style="display:inline; margin-left: 1rem;">
                    <button type="submit" class="btn-ghost">숨기기</button>
                </form>
            </div>
        {/if}
        <form method="POST" action="?/updateNotice" use:enhance={pending()} class="notice-form">
            <input type="text" name="content" placeholder="새 공지사항 입력" required />
            <button type="submit">등록</button>
        </form>
    </div>
</details>

<details class="section section-collapsible">
    <summary>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
        반복 게임 관리 ({recurringSchedules.length})
    </summary>
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
                        <span class="recurring-status" class:active={schedule.is_active}>
                            {schedule.is_active ? '활성' : '비활성'}
                        </span>
                    </div>
                    <div class="recurring-actions">
                        <form method="POST" action="?/skipRecurringWeek" use:enhance={() => {
                            return async ({ result, update }) => {
                                if (!reportResult(result)) {
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
                        <form method="POST" action="?/toggleRecurringActive" use:enhance={pending()} style="display:inline;">
                            <input type="hidden" name="scheduleId" value={schedule.id} />
                            <button type="submit" class="btn-toggle-active">
                                {schedule.is_active ? '비활성화' : '활성화'}
                            </button>
                        </form>
                        <form method="POST" action="?/deleteRecurringSchedule" use:enhance={confirmSubmit({
                            title: '반복 게임 삭제',
                            message: `"${schedule.game_name}" 매주 반복 일정을 삭제합니다. 되돌릴 수 없습니다.`,
                            confirmLabel: '삭제',
                            danger: true,
                            handle: async ({ result, update }) => {
                                reportResult(result, '삭제에 실패했습니다.');
                                await update();
                            }
                        })} style="display:inline;">
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
</details>

{#if showModal}
    <div
        class="modal-backdrop"
        onclick={() => showModal = false} 
        onkeydown={(e) => e.key === 'Escape' && (showModal = false)}
        role="button" 
        tabindex="-1"
        aria-label="Close modal"
    >
        <div class="modal-content" use:trapFocus={() => showModal = false} onclick={handleModalClick} onkeydown={() => {}} role="dialog" aria-modal="true" tabindex="-1">
            <h2>새 게임 시작</h2>
            <form method="POST" action="?/createGame" use:enhance={() => {
                return async ({ result, update }: { result: any, update: (options?: { reset?: boolean }) => Promise<void> }) => {
                    if (result.type === 'failure' && (result.data as any)?.missing) {
                        showAlert('필수 입력 항목을 모두 채워주세요.', 'error');
                    } else if (!reportResult(result)) {
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

                <div class="player-picker">
                    <div class="pp-head">
                        <span class="pp-label">참여자 ({selectedPlayerIds.length})</span>
                        <div class="pp-head-actions">
                            {#if availableAttendees.length > 0}
                                <button type="button" class="btn-mini" onclick={() => selectedPlayerIds = availableAttendees.map((a) => a.id)}>참석자 전원</button>
                            {/if}
                            {#if selectedPlayerIds.length > 0}
                                <button type="button" class="btn-ghost" onclick={() => selectedPlayerIds = []}>비우기</button>
                            {/if}
                        </div>
                    </div>

                    {#each selectedPlayerIds as id (id)}
                        <input type="hidden" name="players" value={id} />
                    {/each}

                    {#if selectedPlayers.length > 0}
                        <div class="pp-chips">
                            {#each selectedPlayers as p (p.id)}
                                <span class="pp-chip">
                                    {p.name}
                                    <button type="button" aria-label="{p.name} 제외" onclick={() => selectedPlayerIds = selectedPlayerIds.filter((x) => x !== p.id)}>×</button>
                                </span>
                            {/each}
                        </div>
                    {/if}

                    <input type="text" class="pp-search" placeholder="이름 검색..." autocomplete="off" bind:value={playerSearch} />

                    <div class="pp-list">
                        {#each pickerResults as a (a.id)}
                            {@const checked = selectedPlayerIds.includes(a.id)}
                            <button type="button" class="pp-option" class:checked={checked} disabled={a.is_playing}
                                onclick={() => selectedPlayerIds = checked ? selectedPlayerIds.filter((x) => x !== a.id) : [...selectedPlayerIds, a.id]}>
                                <span class="pp-check" aria-hidden="true">{checked ? '✓' : ''}</span>
                                <span class="pp-name">{a.name}</span>
                                {#if a.is_playing}<span class="status-text">게임 중</span>{/if}
                            </button>
                        {/each}
                        {#if pickerResults.length === 0}
                            <p class="hint">일치하는 참여자가 없습니다.</p>
                        {/if}
                    </div>

                    {#if !showPlayingInPicker && (attendees || []).some((a) => a.is_playing)}
                        <button type="button" class="pp-toggle" onclick={() => showPlayingInPicker = true}>게임 중인 인원도 보기</button>
                    {/if}
                </div>

                <div class="input-group guest-input-group">
                    <label for="guestCount">게스트 수</label>
                    <input type="number" id="guestCount" name="guestCount" bind:value={guestCount} min="0" max="20" class="number-input" />
                    <p class="hint">* 미등록 참가자 수 (게스트1, 게스트2... 자동 생성)</p>
                </div>

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
        <div class="modal-content" use:trapFocus={() => endGameModalVisible = false} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">

            <h2>
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#fab005;"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
                게임 종료 및 승자 선택
            </h2>
            <p><strong>{selectedEndGame.game_name}</strong> 게임을 종료합니다.</p>
            <p>승리한 플레이어를 선택해주세요 (복수 선택 가능):</p>
            
            <form method="POST" action="?/endGame" use:enhance={() => {
                return async ({ result, update }: { result: any, update: (options?: { reset?: boolean }) => Promise<void> }) => {
                    if (result.type === 'failure' && (result.data as any)?.missing) {
                        showAlert('승리한 플레이어를 한 명 이상 선택해주세요.', 'error');
                    } else if (!reportResult(result)) {
                        endGameModalVisible = false;
                        showAlert('게임이 종료되고 승자가 기록되었습니다.', 'success');
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
                    <button type="button" onclick={() => endGameModalVisible = false} class="btn-cancel">취소</button>
                    <button type="submit" class="btn-primary">종료 및 저장</button>
                </div>
            </form>
        </div>
    </div>
{/if}

<!-- 파괴적 액션 확인 모달 -->
{#if confirmState}
    <div
        class="modal-backdrop"
        onclick={closeConfirm}
        onkeydown={(e) => e.key === 'Escape' && closeConfirm()}
        role="button"
        tabindex="-1"
        aria-label="확인 닫기"
    >
        <div class="modal-content confirm-modal" use:trapFocus={closeConfirm} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" tabindex="-1">
            <h3>{confirmState.title}</h3>
            <p>{confirmState.message}</p>
            <div class="modal-actions">
                <button class="btn-cancel" onclick={closeConfirm}>취소</button>
                <button class="btn-confirm-action" class:danger={confirmState.danger} data-autofocus onclick={runConfirm}>{confirmState.confirmLabel}</button>
            </div>
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
        <div class="modal-content alert-modal alert-{alertKind}" use:trapFocus={() => alertVisible = false} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" tabindex="-1">
            <h3>{alertKind === 'success' ? '완료' : alertKind === 'error' ? '문제가 발생했어요' : '알림'}</h3>
            <p>{alertMessage}</p>
            <div class="modal-actions">
                <button class="btn-primary" data-autofocus onclick={() => alertVisible = false}>확인</button>
            </div>
        </div>
    </div>
{/if}

<!-- 참여자 관리 시트 -->
{#if manageView}
    {@const m = manageView}
    <div
        class="modal-backdrop"
        onclick={() => (manageTarget = null)}
        onkeydown={(e) => e.key === 'Escape' && (manageTarget = null)}
        role="button"
        tabindex="-1"
        aria-label="관리 닫기"
    >
        <div class="modal-content manage-sheet" use:trapFocus={() => manageTarget = null} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
            <h3>{m.name} 관리</h3>

            <div class="manage-row">
                <div class="manage-label">
                    <span>페널티</span>
                    <span class="manage-sub">현재 {m.penalty_points}점</span>
                </div>
                <div class="penalty-actions">
                    <form method="POST" action="?/applyPenaltyAdmin" use:enhance={pending()} style="display:inline;">
                        <input type="hidden" name="attendeeId" value={m.id} />
                        <input type="hidden" name="points" value="-1" />
                        <button type="submit" class="btn-penalty remove">-1</button>
                    </form>
                    <form method="POST" action="?/applyPenaltyAdmin" use:enhance={pending()} style="display:inline;">
                        <input type="hidden" name="attendeeId" value={m.id} />
                        <input type="hidden" name="points" value="1" />
                        <button type="submit" class="btn-penalty add">+1</button>
                    </form>
                </div>
            </div>

            <div class="manage-row">
                <div class="manage-label">
                    <span>블랙리스트</span>
                    <span class="manage-sub">{m.is_blacklisted ? '등록됨 — 입장·참여 제한' : '미등록'}</span>
                </div>
                <form method="POST" action="?/toggleBlacklist" use:enhance={m.is_blacklisted ? pending() : confirmSubmit({ title: '블랙리스트 등록', message: `${m.name}님을 블랙리스트에 등록합니다. 이후 입장·게임 참여가 제한됩니다.`, confirmLabel: '블랙 등록', danger: true })} style="display:inline;">
                    <input type="hidden" name="attendeeId" value={m.id} />
                    <button type="submit" class="btn-blacklist">{m.is_blacklisted ? '해제' : '등록'}</button>
                </form>
            </div>

            <div class="manage-row">
                <div class="manage-label">
                    <span>게임 관리 권한</span>
                    <span class="manage-sub">{m.can_manage_games ? '매니저' : '일반 유저'}</span>
                </div>
                <form method="POST" action="?/toggleManager" use:enhance={pending()} style="display:inline;">
                    <input type="hidden" name="attendeeId" value={m.id} />
                    <button type="submit" class="btn-manager-toggle {m.can_manage_games ? 'active' : ''}">
                        {m.can_manage_games ? '매니저 해제' : '매니저 지정'}
                    </button>
                </form>
            </div>

            <hr class="manage-divider" />

            <form method="POST" action="?/removeAttendee" use:enhance={(arg) => {
                if (m.is_playing) {
                    arg.cancel();
                    manageTarget = null;
                    handleRemove(m);
                    return;
                }
                return confirmSubmit({
                    title: '퇴장 처리',
                    message: `${m.name}님을 퇴장 처리합니다.`,
                    confirmLabel: '퇴장',
                    danger: true,
                    handle: async ({ result, update }) => {
                        if (!reportResult(result)) manageTarget = null;
                        await update();
                    }
                })(arg);
            }}>
                <input type="hidden" name="id" value={m.id} />
                <button type="submit" class="btn-delete full-width">퇴장</button>
            </form>

            <button class="btn-cancel full-width" onclick={() => (manageTarget = null)}>닫기</button>
        </div>
    </div>
{/if}

<!-- Remove Confirm Modal -->
{#if removeModalVisible && removeTarget}
    <div
        class="modal-backdrop"
        onclick={() => removeModalVisible = false} 
        onkeydown={(e) => e.key === 'Escape' && (removeModalVisible = false)}
        role="button" 
        tabindex="-1"
        aria-label="Close confirm"
    >
        <div class="modal-content confirm-modal" use:trapFocus={() => removeModalVisible = false} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
            <h3>참가자 퇴장 확인</h3>
            <p><strong>{removeTarget.name}</strong>님은 현재 <strong>{removeTarget.game_name}</strong> 게임에 참여 중입니다.</p>
            <p>어떻게 처리하시겠습니까?</p>
            
            <div class="modal-actions column-actions">
                <form method="POST" action="?/removeAttendee" use:enhance={() => {
                    return async ({ result, update }) => {
                        if (!reportResult(result)) removeModalVisible = false;
                        await update();
                    };
                }}>
                    <input type="hidden" name="id" value={removeTarget.id} />
                    <input type="hidden" name="endGame" value="true" />
                    <input type="hidden" name="gameId" value={removeTarget.game_id} />
                    <button type="submit" class="btn-delete full-width">게임 종료 및 퇴장</button>
                </form>

                <form method="POST" action="?/removeAttendee" use:enhance={() => {
                    return async ({ result, update }) => {
                        if (!reportResult(result)) removeModalVisible = false;
                        await update();
                    };
                }}>
                    <input type="hidden" name="id" value={removeTarget.id} />
                    <button type="submit" class="btn-warning full-width">참가자만 퇴장</button>
                </form>

                <button class="btn-cancel full-width" onclick={() => removeModalVisible = false}>취소</button>
            </div>
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
        <div class="modal-content" use:trapFocus={() => showScheduledGameModal = false} onclick={handleModalClick} onkeydown={() => {}} role="dialog" aria-modal="true" tabindex="-1">

            <h2>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                시작 예정 게임 생성
            </h2>
            <form method="POST" action="?/createScheduledGame" use:enhance={() => {
                return async ({ result, update }: { result: any, update: (options?: { reset?: boolean }) => Promise<void> }) => {
                    if (!reportResult(result)) {
                        showScheduledGameModal = false;
                        showAlert('예약 게임이 생성되었습니다.', 'success');
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
                        oninput={() => { if (guestCount > maxPlayers) guestCount = maxPlayers; }} />
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
                    <button type="button" onclick={() => showScheduledGameModal = false} class="btn-cancel">취소</button>
                    <button type="submit" class="btn-primary">예약 생성</button>
                </div>
            </form>
        </div>
    </div>
{/if}

<!-- Scheduled Game Detail Modal -->
{#if selectedScheduledGame}
    {@const g = selectedScheduledGame}
    <div class="modal-backdrop" onclick={() => selectedScheduledGame = null} onkeydown={(e) => e.key === 'Escape' && (selectedScheduledGame = null)} role="button" tabindex="-1" aria-label="Close modal">
        <div class="modal-content game-detail-modal" use:trapFocus={() => selectedScheduledGame = null} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
            <div class="detail-header">
                {#if g.image_url}
                    <img src={g.image_url} alt={g.game_name} width="56" height="56" class="detail-thumb" />
                {/if}
                <div>
                    <h3>{g.game_name}</h3>
                    <p class="detail-sub">예정: <strong>{formatScheduledTime(g.scheduled_at)}</strong></p>
                    <p class="detail-sub">인원: 최소 {g.min_players} / 최대 {g.max_players}</p>
                </div>
            </div>
            <div class="detail-section">
                <strong>참여자 ({(g.participants || []).length})</strong>
                <p class="detail-participants">{(g.participants || []).map((p: any) => p.is_guest ? `${p.name}(G)` : p.name).join(', ') || '없음'}</p>
            </div>
            <div class="detail-actions">
                <form method="POST" action="?/joinGame" use:enhance={() => {
                    return async ({ result, update }) => {
                        reportResult(result);
                        resetParticipantSearch();
                        await update();
                        refreshSelectedScheduledGame();
                    };
                }} class="detail-form-row">
                    <input type="hidden" name="sessionId" value={g.id} />
                    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                    <div class="search-select" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="search">
                        <input type="hidden" name="attendeeId" value={selectedParticipantId} />
                        <input type="text" placeholder="이름 검색..." autocomplete="off"
                               bind:value={participantSearch}
                               onfocus={() => participantSearchOpen = true} />
                        {#if participantSearchOpen && participantSearch.length > 0 && filteredParticipants.length > 0}
                            <div class="search-dropdown">
                                {#each filteredParticipants.slice(0, 8) as user}
                                    <button type="button" class="search-option" onclick={() => selectParticipant(user)}>{user.name}</button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                    <button type="submit" class="btn-mini">추가</button>
                </form>
                <form method="POST" action="?/addGuestToGame" use:enhance={() => {
                    return async ({ result, update }) => {
                        reportResult(result);
                        await update();
                        refreshSelectedScheduledGame();
                    };
                }} class="detail-form-row">
                    <input type="hidden" name="sessionId" value={g.id} />
                    <button type="submit" class="btn-mini btn-guest" style="width:100%;">게스트 추가</button>
                </form>
                <hr style="border:none; border-top:1px solid #eee; margin:0.5rem 0;" />
                <form method="POST" action="?/startScheduledGame" use:enhance={() => {
                    return async ({ result, update }) => {
                        if (!reportResult(result)) {
                            selectedScheduledGame = null;
                            showAlert('게임이 시작되었습니다.', 'success');
                        }
                        await update();
                    };
                }} class="detail-form-row">
                    <input type="hidden" name="sessionId" value={g.id} />
                    <span class="input-label">예상(분):</span>
                    <input type="number" name="duration" value="60" class="duration-input" />
                    <button type="submit" class="btn-primary">게임 시작</button>
                </form>
                <form method="POST" action="?/dissolveScheduledGame" use:enhance={confirmSubmit({
                    title: '게임 폭파',
                    message: `"${g.game_name}" 예약 게임을 폭파합니다. 참여자 예약이 모두 취소됩니다.`,
                    confirmLabel: '폭파',
                    danger: true,
                    handle: async ({ result, update }) => {
                        if (!reportResult(result)) {
                            selectedScheduledGame = null;
                            showAlert('게임이 폭파되었습니다.', 'success');
                        }
                        await update();
                    }
                })} class="detail-form-row">
                    <input type="hidden" name="sessionId" value={g.id} />
                    <button type="submit" class="btn-delete" style="width:100%;">게임 폭파</button>
                </form>
            </div>
            <button class="btn-cancel" style="width:100%; margin-top:0.75rem;" onclick={() => selectedScheduledGame = null}>닫기</button>
        </div>
    </div>
{/if}

<!-- Playing Game Detail Modal -->
{#if selectedPlayingGame}
    {@const g = selectedPlayingGame}
    <div class="modal-backdrop" onclick={() => selectedPlayingGame = null} onkeydown={(e) => e.key === 'Escape' && (selectedPlayingGame = null)} role="button" tabindex="-1" aria-label="Close modal">
        <div class="modal-content game-detail-modal" use:trapFocus={() => selectedPlayingGame = null} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
            <div class="detail-header">
                {#if g.image_url}
                    <img src={g.image_url} alt={g.game_name} width="56" height="56" class="detail-thumb" />
                {/if}
                <div>
                    <h3>{g.game_name}</h3>
                    <p class="detail-sub">종료 예정: {formatTime(g.end_time)}</p>
                    <p class="detail-sub time-remaining">{getTimeRemaining(g.end_time, now)}</p>
                </div>
            </div>
            <div class="detail-section">
                <strong>참여자 ({g.players.length})</strong>
                <p class="detail-participants">{g.players.map((p: any) => p.is_guest ? `${p.name}(G)` : p.name).join(', ') || '없음'}</p>
            </div>
            <div class="detail-actions">
                <form method="POST" action="?/joinGame" use:enhance={() => {
                    return async ({ result, update }) => {
                        reportResult(result);
                        resetParticipantSearch();
                        await update();
                        refreshSelectedPlayingGame();
                    };
                }} class="detail-form-row">
                    <input type="hidden" name="sessionId" value={g.id} />
                    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                    <div class="search-select" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="search">
                        <input type="hidden" name="attendeeId" value={selectedParticipantId} />
                        <input type="text" placeholder="이름 검색..." autocomplete="off"
                               bind:value={participantSearch}
                               onfocus={() => participantSearchOpen = true} />
                        {#if participantSearchOpen && participantSearch.length > 0 && filteredParticipants.length > 0}
                            <div class="search-dropdown">
                                {#each filteredParticipants.slice(0, 8) as user}
                                    <button type="button" class="search-option" onclick={() => selectParticipant(user)}>{user.name}</button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                    <button type="submit" class="btn-mini">추가</button>
                </form>
                <form method="POST" action="?/addGuestToGame" use:enhance={() => {
                    return async ({ result, update }) => {
                        reportResult(result);
                        await update();
                        refreshSelectedPlayingGame();
                    };
                }} class="detail-form-row">
                    <input type="hidden" name="sessionId" value={g.id} />
                    <button type="submit" class="btn-mini btn-guest" style="width:100%;">게스트 추가</button>
                </form>
                <hr style="border:none; border-top:1px solid #eee; margin:0.5rem 0;" />
                <div class="detail-form-row" style="gap:0.5rem;">
                    <form method="POST" action="?/extendGame" use:enhance={pending(() => {
                        return async ({ result, update }: any) => {
                            reportResult(result);
                            await update();
                            refreshSelectedPlayingGame();
                        };
                    })} style="flex:1;">
                        <input type="hidden" name="id" value={g.id} />
                        <input type="hidden" name="minutes" value="10" />
                        <button type="submit" class="btn-extend" style="width:100%;">+10분</button>
                    </form>
                    <form method="POST" action="?/extendGame" use:enhance={pending(() => {
                        return async ({ result, update }: any) => {
                            reportResult(result);
                            await update();
                            refreshSelectedPlayingGame();
                        };
                    })} style="flex:1;">
                        <input type="hidden" name="id" value={g.id} />
                        <input type="hidden" name="minutes" value="30" />
                        <button type="submit" class="btn-extend" style="width:100%;">+30분</button>
                    </form>
                </div>
                <button class="btn-end-session" style="width:100%;" onclick={() => { openEndGameModal(g); selectedPlayingGame = null; }}>게임 종료</button>
            </div>
            <button class="btn-cancel" style="width:100%; margin-top:0.75rem;" onclick={() => selectedPlayingGame = null}>닫기</button>
        </div>
    </div>
{/if}

<style>
    section {
        margin-bottom: 2rem;
        padding: 1.5rem;
        border: 1px solid var(--border-light);
        border-radius: 8px;
        background: #f9f9f9;
    }
    section h2, details.section > summary {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    /* 라이브 블록 우위 */
    .section-primary {
        background: var(--bg-primary);
        border-color: #e0e0e0;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
    }

    /* 저빈도 관리 섹션 — 기본 접힘 */
    details.section {
        padding: 0;
        background: #f4f4f5;
        border-color: #e6e6e8;
    }
    details.section > summary {
        list-style: none;
        cursor: pointer;
        padding: 0.9rem 1.25rem;
        font-size: 1rem;
        font-weight: 700;
        color: var(--text-darker);
        user-select: none;
    }
    details.section > summary::-webkit-details-marker {
        display: none;
    }
    details.section > summary::after {
        content: '▾';
        margin-left: auto;
        font-size: 0.8rem;
        color: var(--text-muted);
        transition: transform 0.15s;
    }
    details.section[open] > summary::after {
        transform: rotate(180deg);
    }
    details.section[open] > summary {
        border-bottom: 1px solid #e6e6e8;
    }
    details.section > :not(summary) {
        margin: 1rem 1.25rem 1.25rem;
    }
    .summary-tag {
        font-size: 0.72rem;
        font-weight: 700;
        color: #b45309;
        background: var(--color-warning-bg);
        border-radius: 4px;
        padding: 0.1rem 0.4rem;
    }

    /* 방 현황 요약 스트립 */
    .room-summary {
        margin-bottom: 1.5rem;
        padding: 0.9rem 1.25rem;
        border: 1px solid #d0d7de;
        border-radius: 8px;
        background: var(--bg-primary);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.4rem 0.9rem;
        font-size: 1rem;
        color: var(--text-primary);
    }
    .room-summary strong {
        font-weight: 700;
        color: #1a1a1a;
    }
    .room-summary .rs-item {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
    }
    .room-summary .rs-sep {
        color: #bbb;
    }
    .room-summary .rs-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #bbb;
        flex-shrink: 0;
    }
    .room-summary .rs-dot.live {
        background: var(--color-green-dark);
        box-shadow: 0 0 0 3px rgba(43, 138, 62, 0.15);
    }
    .room-summary .urgent {
        color: var(--color-red-dark);
    }

    .btn-ghost {
        background: none;
        border: 1px solid var(--border-medium);
        color: var(--text-secondary);
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        cursor: pointer;
    }
    .btn-ghost:hover {
        background: var(--bg-elevated);
    }

    .btn-confirm-action {
        background: var(--color-blue-bright);
        color: white;
        border: none;
        padding: 0.5rem 1.25rem;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 700;
    }
    .btn-confirm-action.danger {
        background: var(--color-red-dark);
    }
    .btn-confirm-action.danger:hover {
        background: #b71c1c;
    }

    .attendee-list {
        list-style: none;
        padding: 0;
    }
    .attendee-list li {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.75rem;
        padding: 0.5rem;
        border-bottom: 1px solid var(--border-default);
    }
    .attendee-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-width: 0;
    }
    .attendee-link {
        text-decoration: none;
        color: var(--text-primary);
        font-weight: 500;
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .attendee-link:hover {
        color: var(--color-blue-bright);
        text-decoration: underline;
    }
    .arrival-time {
        font-size: 0.8rem;
        color: var(--text-secondary);
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
        border-top: 1px dashed var(--border-default);
    }
    .toggle-header {
        cursor: pointer;
        user-select: none;
        display: flex;
        align-items: center;
        gap: 0.25rem;
    }
    .toggle-header:hover {
        color: var(--color-blue-bright);
    }
    .toggle-icon {
        font-size: 0.85rem;
        width: 1rem;
        display: inline-block;
    }
    .quick-add .toggle-header {
        font-size: 0.9rem;
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
        color: var(--text-primary);
        font-size: 0.85rem;
        margin-right: 0.5rem;
    }
    .chip-link:hover {
        text-decoration: underline;
        color: var(--color-blue-bright);
    }
    .chip-add {
        background: #bdbdbd;
        color: var(--text-primary);
        border: none;
        padding: 0.25rem 0.6rem;
        font-size: 0.85rem;
        cursor: pointer;
        transition: background 0.2s;
        border-left: 1px solid var(--border-medium);
    }
    .chip-add:hover {
        background: #a0a0a0;
    }
    .btn-delete {
        background: #ff4444;
        color: white;
        border: none;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        cursor: pointer;
    }
    /* 파괴적이지 않은 세션 종료 — 빨강과 구분 */
    .btn-end-session {
        background: #495057;
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 700;
    }
    .btn-end-session:hover {
        background: #343a40;
    }
    .btn-warning {
        background: var(--color-orange);
        color: white;
        border: none;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        cursor: pointer;
    }
    button {
        padding: 0.5rem 1rem;
        background: var(--color-blue-bright);
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        text-decoration: none;
        display: inline-block;
    }
    button:disabled {
        cursor: default;
        opacity: 0.55;
    }
    button:global([aria-busy="true"]) {
        cursor: progress;
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
        color: #c2410c;
        margin-left: 0.5rem;
        white-space: nowrap;
    }
    .status-text {
        font-size: 0.8rem;
        color: var(--color-orange);
        margin-left: 0.25rem;
    }

    /* 새 게임 참여자 피커 */
    .player-picker {
        width: 100%;
        margin: 1rem 0;
        border: 1px solid var(--border-default);
        border-radius: 8px;
        padding: 0.75rem;
    }
    .pp-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
    }
    .pp-label {
        font-weight: 600;
        font-size: 0.9rem;
    }
    .pp-head-actions {
        display: flex;
        gap: 0.35rem;
    }
    .pp-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin-bottom: 0.5rem;
    }
    .pp-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        background: #e7f1ff;
        color: #0b5ed7;
        border-radius: 14px;
        padding: 0.15rem 0.3rem 0.15rem 0.6rem;
        font-size: 0.82rem;
    }
    .pp-chip button {
        all: unset;
        cursor: pointer;
        line-height: 1;
        padding: 0 0.25rem;
        border-radius: 50%;
        font-size: 0.95rem;
        color: #0b5ed7;
    }
    .pp-chip button:hover {
        background: rgba(11, 94, 215, 0.15);
    }
    .pp-search {
        width: 100%;
        box-sizing: border-box;
        padding: 0.4rem 0.5rem;
        border: 1px solid var(--border-default);
        border-radius: 4px;
        font-size: 0.9rem;
    }
    .pp-list {
        margin-top: 0.5rem;
        max-height: 180px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
    }
    .pp-option {
        all: unset;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
        padding: 0.4rem 0.5rem;
        cursor: pointer;
        border-radius: 4px;
        font-size: 0.9rem;
    }
    .pp-option:hover:not(:disabled),
    .pp-option:focus-visible {
        background: #f1f3f5;
    }
    .pp-option.checked {
        background: #e7f1ff;
        color: #0b5ed7;
        font-weight: 600;
    }
    .pp-option:disabled {
        color: var(--text-muted);
        cursor: not-allowed;
    }
    .pp-check {
        width: 1rem;
        text-align: center;
        color: #0b5ed7;
    }
    .pp-name {
        flex: 1;
    }
    .pp-toggle {
        all: unset;
        cursor: pointer;
        display: block;
        margin-top: 0.5rem;
        font-size: 0.82rem;
        color: #0b5ed7;
    }
    .pp-toggle:hover {
        text-decoration: underline;
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
        background: var(--color-blue-bright);
        color: white;
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
    }
    .btn-cancel {
        background: #ccc;
        color: var(--text-primary);
    }
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
        width: 100%;
        max-width: 500px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 4px 20px var(--shadow-lg);
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
    .alert-modal h3 {
        margin-top: 0;
    }
    .alert-modal.alert-success h3 {
        color: var(--color-green-dark);
    }
    .alert-modal.alert-error h3 {
        color: var(--color-red-dark);
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
        color: #6b7280;
        text-align: center;
        padding: 2rem;
        background: rgba(255, 255, 255, 0.5);
        border-radius: 8px;
        list-style: none;
    }
    .notice-manager {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .current-notice {
        background: var(--color-warning-bg);
        border: 1px solid var(--border-warning);
        padding: 1rem;
        border-radius: 6px;
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
        border: 1px solid var(--border-default);
        border-radius: 4px;
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
        .notice-manager {
            gap: 0.5rem;
        }
        .notice-form {
            flex-direction: column;
        }
        .notice-form button {
            width: 100%;
        }
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
    .winner-option {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem;
        border: 1px solid var(--border-default);
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.2s;
    }
    .winner-option:hover {
        background: var(--bg-surface);
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

    /* New Admin UI Styles */
    .name-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-width: 0;
    }
    .name-row .attendee-link {
        min-width: 0;
    }
    .name-row .badge {
        flex-shrink: 0;
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
        color: var(--text-primary);
    }
    .attendee-actions {
        display: flex;
        gap: 0.4rem;
        align-items: center;
    }
    .penalty-actions {
        display: flex;
        gap: 0;
        border-radius: 4px;
        overflow: hidden;
    }
    .btn-manage {
        background: var(--bg-hover);
        color: var(--text-primary);
        border: 1px solid #ced4da;
        padding: 0.3rem 0.7rem;
        border-radius: 4px;
        font-size: 0.8rem;
        cursor: pointer;
    }
    .btn-manage:hover {
        background: var(--bg-active);
    }

    /* 참여자 관리 시트 */
    .manage-sheet {
        max-width: 380px;
    }
    .manage-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.75rem 0;
        border-bottom: 1px solid var(--border-light);
    }
    .manage-label {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
    }
    .manage-label > span:first-child {
        font-weight: 600;
        color: var(--text-primary);
        font-size: 0.9rem;
    }
    .manage-sub {
        font-size: 0.78rem;
        color: var(--text-secondary);
    }
    .manage-divider {
        border: none;
        border-top: 1px solid var(--border-light);
        margin: 1rem 0 0.75rem;
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
        color: var(--text-primary);
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

    .duration-input {
        width: 60px;
        padding: 0.4rem;
        border-radius: 4px;
        border: 1px solid var(--border-default);
        font-size: 0.9rem;
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
        background: var(--bg-primary);
        border: 1px solid var(--border-default);
        border-radius: 4px;
        box-shadow: 0 4px 12px var(--shadow-md);
        z-index: 1000;
        list-style: none;
        padding: 0;
        margin: 4px 0 0 0;
    }
    .dropdown-menu li {
        border-bottom: 1px solid var(--border-light);
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
        background: var(--bg-surface);
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
        color: var(--text-primary);
    }
    .game-option-info .meta {
        font-size: 0.8rem;
        color: var(--text-secondary);
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
        border: 1px solid var(--border-default);
        border-radius: 8px;
    }

    .btn-mini {
        padding: 0.4rem 0.8rem;
        background: #4c6ef5;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.85rem;
    }
    .btn-guest {
        background: #868e96;
    }
    .btn-guest:hover {
        background: #495057;
    }
    .btn-manager-toggle {
        background: var(--bg-hover);
        color: var(--text-dark);
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
    .btn-extend {
        background: #4caf50;
    }
    .btn-extend:hover {
        background: #43a047;
    }
    .input-label {
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--text-darker);
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
        border-top: 1px solid var(--border-light);
    }
    .number-input {
        width: 80px;
        padding: 0.5rem;
        border: 1px solid var(--border-default);
        border-radius: 4px;
    }
    .hint {
        font-size: 0.8rem;
        color: var(--text-secondary);
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
        background: var(--bg-primary);
        border-radius: 8px;
        border: 1px solid #e0e0e0;
    }
    .recurring-item.inactive {
        opacity: 0.6;
    }
    .recurring-info {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    .recurring-meta {
        font-size: 0.85rem;
        color: var(--text-secondary);
    }
    .recurring-status {
        align-self: flex-start;
        font-size: 0.72rem;
        font-weight: 700;
        padding: 0.1rem 0.45rem;
        border-radius: 4px;
        background: var(--bg-hover);
        color: var(--text-darker);
    }
    .recurring-status.active {
        background: var(--color-success-bg);
        color: var(--color-green-dark);
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
        background: var(--color-orange);
        color: white;
        border: none;
        padding: 0.3rem 0.6rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.8rem;
    }
    .btn-skip.skipped {
        background: var(--color-red);
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
        color: var(--text-primary);
        cursor: pointer;
        padding: 0.25rem 0;
    }

    .checkbox-option input[type="checkbox"] {
        width: 16px;
        height: 16px;
        accent-color: #4a90d9;
    }

    /* 오늘 갈 예정 */
    .visit-plan-section {
        margin-bottom: 1.5rem;
    }
    .visit-plan-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    .visit-plan-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        background: var(--bg-primary);
        border: 1px solid #e0e0e0;
        border-radius: 20px;
        padding: 0.35rem 0.75rem;
        font-size: 0.85rem;
    }
    .vp-name {
        font-weight: 600;
        color: var(--text-primary);
    }
    .vp-party {
        font-size: 0.65rem;
        background: #e3f2fd;
        color: #1565c0;
        padding: 0.1rem 0.35rem;
        border-radius: 4px;
        font-weight: 700;
    }
    .vp-time {
        font-size: 0.75rem;
        color: #c2410c;
        font-weight: 500;
    }

    /* 게임 리스트 */
    .game-list {
        list-style: none;
        padding: 0;
        margin: 0;
    }
    .game-list li {
        list-style: none;
    }
    .game-list-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        width: 100%;
        padding: 0.6rem 0.5rem;
        border: none;
        border-bottom: 1px solid var(--border-light);
        border-radius: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
        transition: background 0.15s;
    }
    .game-list-item:hover {
        background: var(--bg-surface);
    }
    .game-list-item:last-child {
        border-bottom: none;
    }
    .game-list-item.ending-soon {
        background: var(--color-error-bg);
    }
    .game-list-item.ending-soon:hover {
        background: #ffecec;
    }
    .game-list-item.ending-soon .time-remaining {
        color: var(--color-red-dark);
        font-weight: 700;
    }
    .list-thumb {
        width: 32px;
        height: 32px;
        border-radius: 6px;
        object-fit: cover;
        flex-shrink: 0;
    }
    .list-thumb.placeholder {
        background: var(--bg-elevated);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1rem;
    }
    .list-name {
        flex: 1;
        font-weight: 600;
        font-size: 0.9rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .list-meta {
        font-size: 0.8rem;
        color: var(--text-secondary);
        white-space: nowrap;
    }
    .list-arrow {
        color: var(--text-muted);
        font-size: 1.2rem;
        font-weight: bold;
    }
    .show-more-btn {
        display: block;
        width: 100%;
        padding: 0.5rem;
        margin-top: 0.5rem;
        background: none;
        border: 1px dashed var(--border-medium);
        border-radius: 6px;
        color: var(--text-secondary);
        font-size: 0.85rem;
        cursor: pointer;
        text-align: center;
    }
    .show-more-btn:hover {
        background: #f9f9f9;
        border-color: #999;
    }

    /* 게임 상세 모달 */
    .game-detail-modal {
        max-width: 500px;
    }
    .detail-header {
        display: flex;
        gap: 1rem;
        align-items: flex-start;
        margin-bottom: 1rem;
    }
    .detail-header h3 {
        margin: 0 0 0.25rem 0;
        font-size: 1.1rem;
    }
    .detail-thumb {
        width: 56px;
        height: 56px;
        border-radius: 8px;
        object-fit: cover;
        flex-shrink: 0;
    }
    .detail-sub {
        margin: 0.15rem 0;
        font-size: 0.85rem;
        color: var(--text-secondary);
    }
    .detail-section {
        margin-bottom: 1rem;
        padding: 0.75rem;
        background: #f9f9f9;
        border-radius: 8px;
    }
    .detail-section strong {
        font-size: 0.85rem;
        color: var(--text-darker);
    }
    .detail-participants {
        margin: 0.25rem 0 0;
        font-size: 0.9rem;
        color: var(--text-primary);
    }
    .detail-actions {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .detail-form-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    /* 참여자 검색 셀렉트 */
    .search-select {
        position: relative;
        flex: 1;
    }
    .search-select input[type="text"] {
        width: 100%;
        padding: 0.4rem 0.5rem;
        border: 1px solid var(--border-default);
        border-radius: 4px;
        font-size: 0.9rem;
        box-sizing: border-box;
    }
    .search-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: var(--bg-primary);
        border: 1px solid var(--border-default);
        border-radius: 4px;
        max-height: 200px;
        overflow-y: auto;
        z-index: 100;
        list-style: none;
        padding: 0;
        margin: 2px 0 0;
        box-shadow: 0 4px 12px var(--shadow-md);
    }
    .search-option {
        display: block;
        width: 100%;
        text-align: left;
        padding: 0.5rem 0.75rem;
        cursor: pointer;
        font: inherit;
        font-size: 0.9rem;
        color: inherit;
        background: transparent;
        border: none;
        border-bottom: 1px solid #f0f0f0;
        border-radius: 0;
    }
    .search-option:last-child {
        border-bottom: none;
    }
    .search-option:hover,
    .search-option:focus-visible {
        background: var(--bg-surface);
    }

    /* 모바일 최적화 */
    @media (max-width: 768px) {
        section {
            margin-bottom: 1.5rem;
            padding: 1rem;
        }
        section h2 {
            font-size: 1rem;
            gap: 0.5rem;
        }
        .section-header {
            flex-direction: column;
            align-items: stretch;
            gap: 0.5rem;
        }
        button, .btn-primary, .btn-delete, .btn-mini {
            padding: 0.4rem 0.75rem;
            font-size: 0.85rem;
        }
        .attendee-list li {
            padding: 0.4rem 0.25rem;
            font-size: 0.85rem;
        }
        .attendee-info { gap: 0.25rem; }
        .attendee-actions { gap: 0.15rem; }
        .btn-penalty { padding: 0.2rem 0.4rem; font-size: 0.75rem; }
        .badge { font-size: 0.65rem; padding: 0.05rem 0.3rem; }
        .arrival-time { font-size: 0.7rem; }
        .duration-input { width: 50px; }
        .input-label { font-size: 0.8rem; }
        .chip-container { font-size: 0.8rem; }
        .chip-link { font-size: 0.8rem; }
        .chip-add { font-size: 0.8rem; padding: 0.2rem 0.5rem; }
        .recurring-item { font-size: 0.85rem; }
        .modal-content { width: 95%; padding: 1.25rem; }
        .player-select { gap: 0.5rem; }
        .empty-state { font-size: 0.85rem; }
        .visit-plan-chip { font-size: 0.8rem; padding: 0.3rem 0.6rem; }
    }

</style>
