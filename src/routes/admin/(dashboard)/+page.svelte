<script lang="ts">
    import type { PageData } from './$types';
    import { enhance, deserialize } from '$app/forms';
    import { invalidateAll } from '$app/navigation';
    import { onMount, onDestroy } from 'svelte';
    import { trapFocus } from '$lib/actions/modal';
    // 결과 알림은 레이아웃의 <AdminFeedback />가 렌더한다 — 화면마다 다시 만들지 않는다
    import { showToast, showAlert, reportResult } from '$lib/stores/adminFeedback';

    let { data }: { data: PageData } = $props();

    // 서버 데이터 파생 — $derived 는 const 라 사용처보다 먼저 선언해야 한다
    const attendees = $derived(data.attendees as Attendee[]);
    const allUsers = $derived((data as any).allUsers || []);
    const games = $derived(data.games as GameSession[]);
    const scheduledGames = $derived(data.scheduledGames as GameSession[]);
    const savedMembers = $derived(data.savedMembers as SavedMember[]);

    // 몇 점부터 예약이 막히는지 — 페널티 숫자는 이 값 없이는 의미를 알 수 없다
    const penaltyThreshold = $derived(parseInt((data as any).settings?.penalty_threshold ?? '3') || 3);
    const noShowLimitMinutes = $derived(parseInt((data as any).settings?.no_show_limit_minutes ?? '10') || 10);

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
        eventSource.onopen = () => { sseConnected = true; };
        eventSource.onerror = () => {
            if (eventSource) { eventSource.close(); eventSource = null; }
            // 이 콘솔의 값은 전부 "지금"이라는 데서 온다. 그 연결이 끊긴 걸
            // 알리지 않으면 운영자는 낡은 숫자를 현재로 읽는다.
            sseConnected = false;
            if (!sseDestroyed) {
                sseReconnectTimer = setTimeout(connectSSE, 3000);
            }
        };
    }

    let sseConnected = $state(true);

    // 라이브 시계 — 카운트다운/요약 스트립이 SSE 이벤트 없이도 갱신되도록 30초마다 틱
    let now = $state(Date.now());
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
     * use:enhance={pending(cb?, success?)} — 실제 요청이 끝날 때까지 제출 버튼을 잠가
     * 더블탭 중복 제출을 막고 진행 중임을 표시한다(고정 타임아웃이 아님).
     *
     * cb를 넘기지 않으면 기본 경로를 탄다: 실패·에러는 알림 모달로 노출하고,
     * success가 있으면 성공 시 토스트로 결과를 알린다. 조용히 끝나는 폼은 없다.
     */
    function pending(cb?: (arg: any) => any, success?: string | ((data: any) => string)) {
        return (arg: any) => {
            const release = lockFormButtons(arg.formElement);
            let inner: any;
            try {
                inner = cb ? cb(arg) : undefined;
            } catch (e) {
                release();
                throw e;
            }
            return async (res: any) => {
                try {
                    if (typeof inner === 'function') await inner(res);
                    else {
                        if (!reportResult(res.result) && success) {
                            const msg = typeof success === 'function' ? success(res.result?.data) : success;
                            if (msg) showToast(msg);
                        }
                        await res.update();
                    }
                } finally {
                    release();
                }
            };
        };
    }

    /**
     * 게임 이름 콤보박스 키보드 조작.
     * 기존엔 옵션이 마우스 전용이라, 타이핑 후 Enter를 치면 옵션 선택이 아니라
     * 폼이 제출됐다. ArrowDown/Up으로 후보를 옮기고 Enter로 확정한다.
     */
    let gameOptionIndex = $state(-1);

    function comboKeydown(e: KeyboardEvent, options: any[], select: (g: any) => void) {
        if (!dropdownOpen || options.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            gameOptionIndex = (gameOptionIndex + 1) % options.length;
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            gameOptionIndex = (gameOptionIndex - 1 + options.length) % options.length;
        } else if (e.key === 'Enter' && gameOptionIndex >= 0) {
            e.preventDefault();
            select(options[gameOptionIndex]);
            gameOptionIndex = -1;
        } else if (e.key === 'Escape') {
            dropdownOpen = false;
            gameOptionIndex = -1;
        }
    }

    /**
     * 파괴적 액션 공통 확인 모달.
     *
     * severity는 확인 버튼이 입을 단을 고른다. 예전에는 danger 하나로
     * 「되돌릴 수 없음」과 「되돌릴 수 있음」이 같은 채움 빨강을 입었고,
     * 그래서 시트에서 테두리 빨강이던 「퇴장 처리」를 누르면 그 60px 위에
     * 더 무거워 보이는 채움 빨강 확인 버튼이 떠 위계가 뒤집혔다.
     */
    type ConfirmSeverity = 'irreversible' | 'destructive' | 'neutral';
    let confirmState:
        | { title: string; message: string; confirmLabel: string; severity: ConfirmSeverity; handle?: (opts: any) => Promise<void> }
        | null = $state(null);
    let pendingForm: HTMLFormElement | null = null;

    function closeConfirm() {
        confirmState = null;
        pendingForm = null;
    }

    function confirmSubmit(opts: {
        title: string;
        message: string | (() => string);
        confirmLabel?: string;
        severity?: ConfirmSeverity;
        handle?: (opts: any) => Promise<void>;
        success?: string | ((data: any) => string);
    }) {
        return (arg: any) => {
            if (arg.formElement.dataset.confirmed === 'true') {
                arg.formElement.dataset.confirmed = '';
                const release = lockFormButtons(arg.formElement);
                const inner = opts.handle;
                return async (res: any) => {
                    try {
                        if (inner) await inner(res);
                        else {
                            if (!reportResult(res.result) && opts.success) {
                                const msg =
                                    typeof opts.success === 'function'
                                        ? opts.success(res.result?.data)
                                        : opts.success;
                                if (msg) showToast(msg);
                            }
                            await res.update();
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
                // 문구는 "지금" 계산한다 — 액션 생성 시점의 값은 오래됐을 수 있다
                message: typeof opts.message === 'function' ? opts.message() : opts.message,
                confirmLabel: opts.confirmLabel ?? '확인',
                severity: opts.severity ?? 'neutral',
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

    let showModal = $state(false);
    let selectedGameName = $state('');
    // 비워두면 placeholder가 채워진 값처럼 읽힌다. 흔한 값으로 시작한다.
    let selectedDuration = $state('60');
    let guestCount = $state(0);

    let selectedGameId = $state('');

    // 새 게임 참여자 선택 (검색형 멀티셀렉트)
    let selectedPlayerIds: number[] = $state([]);
    let playerSearch = $state('');
    let showPlayingInPicker = $state(false);

    // 페널티 부여 사유 (관리 시트) — 시트를 열 때마다 초기화된다
    const PENALTY_REASON_LABELS: Record<string, string> = {
        no_show: '노쇼',
        late: '지각',
        other: '기타'
    };
    let penaltyReason = $state('no_show');

    /** 페널티 결과를 운영자에게 되돌려준다. 임계에 도달한 순간만 모달로 멈춰 세운다. */
    /**
     * 되돌릴 수 있는 결과를 알린다.
     *
     * 되돌리기는 결과를 알리는 그 자리에 둔다 — 토스트를 읽고 "아차" 하는
     * 순간과 무를 수 있는 곳이 같아야 실제로 눌린다. 서버에는 불투명한 id만
     * 보내고, 무엇을 어떻게 되돌릴지는 서버가 남겨둔 원상태에서 읽는다.
     */
    function toastUndoable(message: string, undo: { id: number; label: string } | undefined) {
        if (!undo) {
            showToast(message);
            return;
        }
        showToast(message, {
            label: '되돌리기',
            run: async () => {
                const body = new FormData();
                body.set('undoId', String(undo.id));
                try {
                    const res = await fetch('?/undoAdminAction', { method: 'POST', body });
                    const result: any = deserialize(await res.text());
                    if (!reportResult(result)) showToast(`되돌렸습니다 · ${undo.label}`);
                } catch {
                    showAlert('되돌리지 못했습니다. 네트워크를 확인해주세요.');
                }
                await invalidateAll();
            }
        });
    }

    function announcePenalty(d: any) {
        const p = d?.penalty;
        if (!p) {
            showToast('페널티가 반영되었습니다.');
            return;
        }
        const line = `${p.name} 페널티 ${p.points > 0 ? `+1 · ${p.reason}` : '−1 · 취소'} → ${p.total}/${p.threshold}점`;
        // 한 사건에 한 번만 알린다. 예전에는 임계에 닿으면 알림 모달과 토스트가
        // 동시에 떴는데, 모달이 토스트를 가려서 거기 실린 되돌리기는 보이지도
        // 않는 채 타이머만 흘렀다. 멈춰 세워야 하면 모달이 전부를 말한다.
        if (p.blocked && p.points > 0) {
            showAlert(`${line} — 누적 ${p.total}점이 되어 이제 예약이 제한됩니다.`, 'info');
            return;
        }
        toastUndoable(line, d?.undo);
    }

    // Remove Confirm Modal State
    let removeModalVisible = $state(false);
    let removeTarget: Attendee | null = $state(null);

    // 참여자 관리 시트 (페널티 / 블랙리스트 / 게임 권한 / 퇴장)
    let manageTarget: Attendee | null = $state(null);

    function openManage(a: Attendee) {
        penaltyReason = 'no_show';
        manageTarget = a;
    }

    // 게임 참여 중인 참여자 퇴장 — 게임 처리 방식을 묻는 전용 모달을 연다
    function handleRemove(attendee: Attendee) {
        removeTarget = attendee;
        removeModalVisible = true;
    }

    // End Game Modal State
    let endGameModalVisible = $state(false);
    let selectedEndGame: GameSession | null = $state(null);

    function openEndGameModal(game: GameSession) {
        selectedEndGame = game;
        endGameModalVisible = true;
    }

    // Saved members toggle
    let savedMembersOpen = $state(false);

    // Game list + detail modal state
    let showAllScheduled = $state(false);
    let showAllPlaying = $state(false);
    let selectedScheduledGame: GameSession | null = $state(null);
    let selectedPlayingGame: GameSession | null = $state(null);

    // Participant search state (for game detail modals)
    let participantSearch = $state('');
    let participantSearchOpen = $state(false);
    let selectedParticipantId = $state('');

    const filteredParticipants = $derived((allUsers || []).filter((u: any) =>
        participantSearch.length > 0 && u.name.toLowerCase().includes(participantSearch.toLowerCase())
    ));

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
    let showScheduledGameModal = $state(false);

    // 모달 뒤 배경이 계속 스크롤됐다. 긴 시트 안에서 스크롤하고 닫으면
    // 원래 보던 행에서 수백 px 떨어진 곳에 남는다.
    const anyModalOpen = $derived(
        showModal ||
        endGameModalVisible ||
        showScheduledGameModal ||
        removeModalVisible ||
        confirmState !== null ||
        manageTarget !== null ||
        selectedPlayingGame !== null ||
        selectedScheduledGame !== null
    );
    $effect(() => {
        if (!anyModalOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    });
    let scheduledGameName = $state('');
    let scheduledAt = $state('');
    let minPlayers = $state(2);
    let maxPlayers = $state(4);

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

    const filteredScheduledGames = $derived((data.allGames as any[])?.filter((g: any) => 
        g.name.toLowerCase().includes(scheduledGameName.toLowerCase())
    ) || []);

    function selectScheduledGame(game: any) {
        scheduledGameName = game.name;
        minPlayers = game.min_players;
        maxPlayers = game.max_players;
        dropdownOpen = false;
    }

    // Custom Dropdown State
    let dropdownOpen = $state(false);
    let searchInput: HTMLInputElement | undefined = $state();

    function toggleDropdown() {
        dropdownOpen = !dropdownOpen;
        if (dropdownOpen && searchInput) {
            const el = searchInput;
            setTimeout(() => el.focus(), 0);
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

    /**
     * 폼 모달의 백드롭 처리.
     *
     * 375px에서 화면 아래 64px은 엄지가 놓이는 자리이고, 거기 한 번 닿으면
     * 채워 넣은 새 게임 폼이 경고 없이 사라졌다. 시끄러운 방에서 한 손으로
     * 쓰는 장면 그대로다. 입력이 있으면 백드롭으로는 닫지 않는다 —
     * 「취소」 버튼과 Escape는 의도된 행동이라 그대로 둔다.
     */
    function dismissFormModal(close: () => void, dirty: boolean) {
        if (dirty) {
            showToast('입력한 내용이 있습니다. 닫으려면 「취소」를 눌러주세요.');
            return;
        }
        close();
    }

    const newGameDirty = $derived(
        selectedGameName.trim() !== '' || selectedPlayerIds.length > 0 || guestCount > 0
    );
    const scheduledGameDirty = $derived(scheduledGameName.trim() !== '' || guestCount > 0);

    function handleModalClick(event: MouseEvent) {
        event.stopPropagation();
        const target = event.target as HTMLElement;
        if (!target.closest('.custom-dropdown')) {
            dropdownOpen = false;
        }
    }

    const filteredGames = $derived((data.allGames as any[])?.filter((g: any) => 
        g.name.toLowerCase().includes(selectedGameName.toLowerCase())
    ) || []);

    // 게임 이름을 고르면 id와 기본 진행시간을 따라 채운다 (부수효과)
    $effect(() => {
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
    });

    function getTimeRemaining(endTime: string, nowTs: number = Date.now()) {
        const end = new Date(endTime).getTime();
        const diff = end - nowTs;
        // 「종료됨」만으로는 14분 초과와 2분 초과가 같아 보였다. 어느 테이블을
        // 먼저 치울지 정하는 데 필요한 건 그 차이다.
        if (diff <= 0) {
            const overMins = Math.floor(-diff / 60000);
            return overMins < 1 ? '방금 종료' : `${overMins}분 초과`;
        }
        const totalMins = Math.floor(diff / 60000);
        if (totalMins < 1) return '곧 종료';
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
        game_end_time: string | null;
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


    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];


    /**
     * 대기·승인 큐 — 게임별로 묶는다.
     *
     * 노쇼 판정: 예정 게임은 시각이 되면 autoClose가 자동으로 시작시키므로
     * "예정인데 늦음"이라는 상태는 존재하지 않는다. 실제 노쇼는
     * "게임이 시작됐고 판정 시간이 지났는데 확정 예약자가 방에 없음"이다.
     * 자동 체크인이 방 재실 여부를 채우므로 attendee_status를 신뢰할 수 있다.
     * 시스템은 판정만 하지 않고, 운영자에게 시점을 알린다.
     */
    const queueGroups = $derived((() => {
        const rows = ((data as any).reservations || []) as any[];
        type QueueGroup = {
            sessionId: number;
            gameName: string;
            sessionStatus: string;
            scheduledAt: string | null;
            startTime: string | null;
            maxPlayers: number;
            currentPlayers: number;
            rows: any[];
        };
        const bySession = new Map<number, QueueGroup>();
        for (const r of rows) {
            let g: QueueGroup | undefined = bySession.get(r.session_id);
            if (!g) {
                g = {
                    sessionId: r.session_id,
                    gameName: r.game_name,
                    sessionStatus: r.session_status,
                    scheduledAt: r.scheduled_at,
                    startTime: r.start_time,
                    maxPlayers: Number(r.max_players ?? 0),
                    currentPlayers: Number(r.current_players ?? 0),
                    rows: []
                };
                bySession.set(r.session_id, g);
            }
            const noShowAfter =
                r.status === 'confirmed' &&
                r.session_status === 'playing' &&
                r.attendee_status !== 'present' &&
                r.start_time
                    ? new Date(r.start_time).getTime() + noShowLimitMinutes * 60000
                    : null;
            g.rows.push({ ...r, overdue: noShowAfter !== null && now > noShowAfter });
        }
        return Array.from(bySession.values());
    })());

    // 큐 제목의 숫자는 "당신을 기다리는 것"이어야 한다. 이미 확정돼 아무 조치도
    // 필요 없는 행까지 세면 첫날 들어온 매니저에게 잘못된 멘탈 모델을 가르친다.
    const isQueueActionable = (r: any) =>
        r.status === 'pending_approval' || r.status === 'waitlisted' || r.overdue;
    const queueActionable = $derived(queueGroups.reduce((n, g) => n + g.rows.filter(isQueueActionable).length, 0));
    const queueSettled = $derived(queueGroups.reduce((n, g) => n + g.rows.filter((r: any) => !isQueueActionable(r)).length, 0));
    const approvalCount = $derived(queueGroups.reduce((n, g) => n + g.rows.filter((r: any) => r.status === 'pending_approval').length, 0));
    const overdueCount = $derived(queueGroups.reduce((n, g) => n + g.rows.filter((r: any) => r.overdue).length, 0));
    // 노쇼 후보는 큐 상단으로 — 개입이 필요한 것부터 본다
    const queueGroupsSorted = $derived([...queueGroups].sort(
        (a, b) => Number(b.rows.some((r: any) => r.overdue)) - Number(a.rows.some((r: any) => r.overdue))
    ));

    const QUEUE_STATUS: Record<string, string> = {
        pending_approval: '승인 대기',
        waitlisted: '대기',
        confirmed: '확정',
        pending: '신청'
    };

    // 관리 시트가 열려 있으면 최신 참여자 데이터로 동기화
    const manageView = $derived(manageTarget
        ? ((attendees || []).find((x) => x.id === manageTarget!.id) as Attendee | undefined) ?? manageTarget
        : null);

    // 방 현황 요약 스트립
    const attendeeCount = $derived((attendees || []).length);
    /*
     * 명단은 도착 시각으로 키잉돼 있었다. 방에 서 있는 운영자의 실제 질문은
     * "누가 지금 비어 있어?"이고, is_playing / game_name 은 이미 Attendee 에
     * 있으면서 새 게임 피커에서 행을 비활성화하는 데만 쓰이고 있었다.
     * 콘솔이 알면서 말하지 않던 것을 말하게 한다.
     */
    const freeAttendees = $derived((attendees || []).filter((a: Attendee) => !a.is_playing));
    const busyAttendees = $derived((attendees || []).filter((a: Attendee) => a.is_playing));

    // 종료 임박 순 정렬 — "진행 중인 게임" 목록에서 끝나가는 게임을 위로
    const playingSorted = $derived([...(games || [])].sort(
        (a, b) => new Date(a.end_time).getTime() - new Date(b.end_time).getTime()
    ));
    // playingSorted[0]이 곧 가장 먼저 끝나는 게임이다.
    // "첫 종료까지 임박"은 어느 게임인지 말해주지 않으면 운영자가 목록을 다시 훑어야 했다.
    const nextEndingGame = $derived(playingSorted[0] ?? null);
    // 시간이 지났는데도 playing으로 남은 게임 — 마감 전까지 아무도 닫아주지 않는다
    const expiredGames = $derived(playingSorted.filter((g) => new Date(g.end_time).getTime() <= now));
    const liveGames = $derived(playingSorted.filter((g) => new Date(g.end_time).getTime() > now));
    const nextGameEndTs = $derived(nextEndingGame ? new Date(nextEndingGame.end_time).getTime() : null);
    const nextEndMins = $derived(nextGameEndTs !== null ? Math.round((nextGameEndTs - now) / 60000) : null);

    // 새 게임 참여자 피커
    const availableAttendees = $derived((attendees || []).filter((a: Attendee) => !a.is_playing));
    const pickerResults = $derived((attendees || []).filter((a: Attendee) => {
        if (!showPlayingInPicker && a.is_playing) return false;
        if (playerSearch && !a.name.toLowerCase().includes(playerSearch.toLowerCase())) return false;
        return true;
    }));
    const selectedPlayers = $derived((attendees || []).filter((a: Attendee) => selectedPlayerIds.includes(a.id)));

    // 오늘 갈 예정 merge
    const checkedInIds = $derived(new Set((attendees || []).map((a: Attendee) => a.id)));
    const visitPlanIds = $derived(new Set(((data as any).dailyVisitPlans || []).map((p: any) => p.attendee_id)));
    const scheduledVisitors = $derived(((data as any).todayScheduledParticipants || []).filter((p: any) =>
        !checkedInIds.has(p.attendee_id) && !visitPlanIds.has(p.attendee_id)
    ));
    const mergedVisitPlans = $derived([
        ...((data as any).dailyVisitPlans || []),
        ...scheduledVisitors.map((p: any) => ({
            attendee_id: p.attendee_id, name: p.name,
            planned_time: p.planned_time, title_name: p.title_name,
            is_party: p.is_party
        }))
    ].filter((p: any) => !checkedInIds.has(p.attendee_id)));

    function formatVisitTime(time: string): string {
        if (!time) return '';
        const [h, m] = time.split(':');
        return m === '00' ? `${parseInt(h)}시` : `${parseInt(h)}시${parseInt(m)}분`;
    }
</script>

<!-- 참여자 검색 셀렉트 — 예정/진행 두 게임 상세 모달이 공유한다 -->
{#snippet participantPicker()}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="search-select" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="search">
        <input type="hidden" name="attendeeId" value={selectedParticipantId} />
        <input
            type="text"
            placeholder="이름 검색..."
            aria-label="참여자 이름 검색"
            autocomplete="off"
            bind:value={participantSearch}
            onfocus={() => (participantSearchOpen = true)}
        />
        {#if participantSearchOpen && participantSearch.length > 0 && filteredParticipants.length > 0}
            <div class="search-dropdown">
                {#each filteredParticipants.slice(0, 8) as user (user.id)}
                    <button type="button" class="search-option" onclick={() => selectParticipant(user)}>{user.name}</button>
                {/each}
            </div>
        {/if}
    </div>
{/snippet}

<!--
    제목이 없으면 SvelteKit의 aria-live 안내 영역이 이동할 때마다
    "untitled page"를 읽는다. 방 상태를 제목에 실어 탭만 봐도 알게 한다.
-->
<svelte:head>
    <title>관리자 대시보드 · 방에 {attendeeCount}명{expiredGames.length > 0 ? ` · 정리 대기 ${expiredGames.length}` : ''} — 혼놀 라운지</title>
</svelte:head>

<!--
    연결이 끊기면 아래 숫자는 전부 과거다. 색 점 하나로만 알리면 색을 못 보는
    사람에게는 아무 신호도 아니므로 글로도 말한다.
-->
<div class="live-status" role="status" aria-live="polite">
    {#if !sseConnected}
        <span class="live-offline">실시간 연결이 끊겼습니다 — 아래 숫자는 갱신되지 않습니다. 다시 연결하는 중…</span>
    {/if}
</div>

<!-- 방 현황 — 제품의 존재 이유가 시인성이므로 이 세 숫자가 화면에서 가장 크다 -->
<section class="room-summary" aria-label="방 현황 요약">
    <div class="rs-stat">
        <span class="rs-label">
            <!-- 이 점은 연결 표시등처럼 보인다. 실제로 연결 상태를 말하게 한다. -->
            <span class="rs-dot" class:live={sseConnected} aria-hidden="true"></span>
            지금 방에
        </span>
        <span class="rs-value">{attendeeCount}<span class="rs-unit">명</span></span>
    </div>
    <div class="rs-stat">
        <!-- 판을 짤 수 있는 사람. 모달을 열기 전에 알아야 하는 숫자다. -->
        <span class="rs-label">대기 중</span>
        <span class="rs-value" class:rs-value-none={freeAttendees.length === 0}>{freeAttendees.length}<span class="rs-unit">명</span></span>
    </div>
    <!--
        시간이 지난 게임은 "임박"이 아니라 처리 대기다. 여기는 그 건수를 말하는
        자리이지 처리하는 자리가 아니다 — 종료 버튼을 이 칸에 두었더니 만료가
        0→1이 되는 순간 스트립이 90px 자라 읽던 페이지를 밀어냈고, 좁은 칸에서
        「글룸헤이븐 죽음의 아…」로 잘린 이름 옆이라 무엇이 끝나는지도 흐렸다.
        게임 섹션이 스트립 바로 아래 왼쪽 열에 있고 만료 행마다 자기 이름을
        단 「게임 종료」를 이미 갖고 있다.
    -->
    <div class="rs-stat" class:rs-stat-pending={expiredGames.length > 0}>
        {#if expiredGames.length > 0}
            <span class="rs-label">정리 대기</span>
            <span class="rs-value rs-value-pending">{expiredGames.length}<span class="rs-unit">판</span></span>
        {:else}
            <span class="rs-label">
                첫 종료까지{#if nextEndingGame}<span class="rs-label-name" title={nextEndingGame.game_name}>· {nextEndingGame.game_name}</span>{/if}
            </span>
            {#if nextEndMins === null}
                <span class="rs-value rs-value-none">없음</span>
            {:else}
                <span class="rs-value" class:urgent={nextEndMins <= 5}>{nextEndMins}<span class="rs-unit">분</span></span>
            {/if}
        {/if}
    </div>
    <!--
        큐의 헤드라인 숫자. 예전에는 큐가 접힌 선 204px 아래에 있어서 이 숫자가
        거기로 데려가는 앵커였는데, 이제 큐가 왼쪽 열 게임 아래로 올라와 같은
        화면에 보인다. 보이는 것을 가리키는 링크는 계단을 하나 더 만들 뿐이다.
    -->
    <div class="rs-stat">
        <span class="rs-label">처리 대기</span>
        {#if queueActionable === 0}
            <span class="rs-value rs-value-none">없음</span>
        {:else}
            <span class="rs-value">{queueActionable}<span class="rs-unit">건</span></span>
        {/if}
    </div>
</section>

<!--
    넓은 화면에서 게임·큐·사람이 같은 화면에 들어오도록 2열로 묶는다.
    왼쪽 열에 게임과 큐가 쌓이고 오른쪽 열은 명단이 통째로 쓴다.

    DOM 순서는 게임 → 명단 → 큐다. 데스크톱에서 보이는 순서(왼쪽 위→아래,
    오른쪽)와 어긋나지만, 이 순서가 접히는 폰에서는 명단이 큐보다 먼저 와야
    한다 — 게임 → 큐 → 명단으로 쌓으면 큐가 591px이라 375x812에서 사람이
    한 명도 접힌 선 위에 남지 않는다. 세 섹션 모두 랜드마크라 보조기술은
    순서와 무관하게 건너뛴다.
-->
<div class="room-columns">
<section class="section-primary room-col-games" aria-labelledby="sec-playing">
    <div class="section-header">
        <!-- 「정리 대기 n」은 스트립이 헤드라인으로 든다. 여기서 또 세면 같은 숫자가
             500px 안에 세 번 나오고, 만료 행은 이미 자기 틴트와 「n분 초과」로 말한다. -->
        <h2 id="sec-playing">
            게임
            <span class="count-split">진행 중 {liveGames.length}</span>
        </h2>
        <button class="btn-primary" onclick={() => {
            showModal = true;
            selectedGameName = '';
            selectedDuration = '60';
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
            {@const msLeft = new Date(game.end_time).getTime() - now}
            {@const expired = msLeft <= 0}
            {@const endingSoon = !expired && msLeft < 5 * 60000}
            <li class="game-row" class:is-expired={expired}>
                <button type="button" class="game-list-item" class:ending-soon={endingSoon} class:expired onclick={() => { selectedPlayingGame = game; resetParticipantSearch(); }}>
                    {#if game.image_url}
                        <img src={game.image_url} alt={game.game_name} width="32" height="32" class="list-thumb" />
                    {:else}
                        <div class="list-thumb placeholder" aria-hidden="true">
                            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1"/><circle cx="15.5" cy="15.5" r="1"/><circle cx="15.5" cy="8.5" r="1"/><circle cx="8.5" cy="15.5" r="1"/></svg>
                        </div>
                    {/if}
                    <span class="list-name">{game.game_name}</span>
                    <span class="list-meta">{game.players.length}명</span>
                    <span class="list-meta time-remaining">{getTimeRemaining(game.end_time, now)}</span>
                    <span class="list-arrow" aria-hidden="true">›</span>
                </button>
                {#if expired}
                    <!--
                        시간이 지나도 게임은 playing으로 남는다 — autoClose는 마감 때만 닫는다.
                        승자 기록은 선택이므로 여기서 한 번에 닫을 수 있어야 한다.
                        승자를 남기려면 행을 눌러 종료 모달로 간다.
                    -->
                    <form method="POST" action="?/endGame" class="row-end-form" use:enhance={() => {
                        return async ({ result, update }: { result: any, update: (options?: { reset?: boolean }) => Promise<void> }) => {
                            if (!reportResult(result)) {
                                const d = (result?.data as any) ?? {};
                                toastUndoable(`${d.endedName ?? game.game_name} 종료됨 · 승자는 기록하지 않았습니다`, d.undo);
                            }
                            await update();
                        };
                    }}>
                        <input type="hidden" name="id" value={game.id} />
                        <button type="submit" class="btn-row-end">게임 종료</button>
                    </form>
                {/if}
            </li>
        {/each}
        {#if (games || []).length === 0}
            <p class="empty-state">진행 중인 게임이 없습니다. 「+ 새 게임 시작」으로 시작할 수 있습니다.</p>
        {/if}
    </ul>
    {#if (games || []).length > 5}
        <button class="show-more-btn" onclick={() => showAllPlaying = !showAllPlaying}>
            {showAllPlaying ? '접기' : `+${(games || []).length - 5}개 더보기`}
        </button>
    {/if}
</section>

<section class="section-primary room-col-roster" aria-labelledby="sec-attendees">
    <!-- 「대기 중 n」은 스트립이 헤드라인으로 들고, 이 섹션 안에서는 바로 아래
         그룹 라벨이 같은 말을 한다. 제목에서까지 세면 한 화면에 세 번이 된다. -->
    <h2 id="sec-attendees">현재 참여 인원</h2>
    {#snippet attendeeRow(a: Attendee)}
            <li>
                <div class="attendee-info">
                    <div class="name-row">
                        <a href="/admin/attendees/{a.id}" class="attendee-link">{a.name}</a>
                        {#if a.is_blacklisted}
                            <span class="badge blacklist">
                                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align:middle;"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                                블랙
                            </span>
                        {/if}
                        {#if a.can_manage_games}
                            <!-- 게임을 만들 수 있는 사람인지가 시트를 열어야만 보였다 -->
                            <span class="badge manager">매니저</span>
                        {/if}
                        {#if a.penalty_points > 0}
                            <span class="badge penalty" class:blocked={a.penalty_points >= penaltyThreshold}>
                                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align:middle;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                페널티 {a.penalty_points}/{penaltyThreshold}
                            </span>
                        {/if}
                    </div>
                    <!--
                        좌석을 별도 열로 두면 좁은 열에서 이름·배지·시각과 3단으로
                        겹쳐 뭉개진다. 메타 한 줄로 합쳐 자연스럽게 줄바꿈시킨다.
                        종료 시각은 서버가 같은 행에서 준다 — 이름으로 찾으면 같은
                        이름의 판이 둘일 때 엉뚱한 시간이 붙는다.
                    -->
                    <span class="attendee-meta">
                        <span class="arrival-time">{formatTime(a.arrival_time)} 입장</span>
                        {#if a.is_playing && a.game_name}
                            <span class="seat-game" title={a.game_name}>· {a.game_name}</span>
                            {#if a.game_end_time}<span class="seat-time">{getTimeRemaining(a.game_end_time, now)}</span>{/if}
                        {/if}
                    </span>
                </div>
                <div class="attendee-actions">
                    <button type="button" class="btn-manage" onclick={() => openManage(a)}>
                        관리<span class="sr-only"> — {a.name}</span>
                    </button>
                </div>
            </li>
    {/snippet}

    {#if (attendees || []).length === 0}
        <p class="empty-state">아직 아무도 없습니다. 아래에서 이름을 입력하거나 등록 멤버를 눌러 입장 처리하세요.</p>
    {:else}
        <!-- 판을 짤 수 있는 사람이 먼저 온다 -->
        <p class="roster-group-label">대기 중 {freeAttendees.length}</p>
        <ul class="attendee-list">
            {#each freeAttendees as a (a.id)}{@render attendeeRow(a as Attendee)}{/each}
            {#if freeAttendees.length === 0}
                <li class="roster-empty">방에 있는 {attendeeCount}명이 모두 게임 중입니다.</li>
            {/if}
        </ul>
        {#if busyAttendees.length > 0}
            <p class="roster-group-label">게임 중 {busyAttendees.length}</p>
            <ul class="attendee-list">
                {#each busyAttendees as a (a.id)}{@render attendeeRow(a as Attendee)}{/each}
            </ul>
        {/if}
    {/if}

    <div class="add-row">
        <form method="POST" action="?/addAttendee" use:enhance={pending(undefined, '입장 처리했습니다.')} class="add-form">
            <input type="text" name="name" placeholder="이름 입력" aria-label="추가할 인원 이름" required />
            <button type="submit" class="btn-primary">인원 추가</button>
        </form>
        <!-- 처음 온 사람은 QR로 직접 가입·입장한다. 그 순간이 바로 여기다. -->
        <a href="/admin/qr" class="btn-qr">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
            QR 보여주기
        </a>
    </div>

    {#if (data.savedMembers || []).length > 0}
        <div class="quick-add">
            <button type="button" class="toggle-header" aria-expanded={savedMembersOpen} onclick={() => savedMembersOpen = !savedMembersOpen}>
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
                        <form method="POST" action="?/addAttendee" use:enhance={pending(undefined, `${member.name}님을 입장 처리했습니다.`)} style="display:inline;">
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

<!--
    대기 · 승인 큐.
    한때 이 섹션이 방보다 위에 있어서 1280x900의 접힌 선 위에 게임 한 판도
    사람 한 명도 없었다. 그래서 방 아래로 내렸더니 이번에는 큐가 접힌 선
    204px 아래로 밀려났다 — 명단이 801px인데 그 옆 왼쪽 열은 525px이 빈 땅인
    채로. 두 카드를 나란히 짝지은 게 문제였지 큐의 자리가 문제가 아니었다.
    이제 큐는 그 빈 땅, 즉 왼쪽 열 게임 아래로 들어간다.
-->
<section id="sec-queue" class="section-primary queue-section room-col-queue" aria-label="대기 및 승인 큐">
    <div class="section-header">
        <!-- 총 건수도 스트립의 「처리 대기」가 든다. 제목은 자기 섹션이 무엇으로
             나뉘어 있는지(승인 대기 · 노쇼 판정 초과 · 확정)만 말한다. -->
        <h2>
            대기 · 승인 큐
            {#if queueSettled > 0}<span class="count-aside">확정 {queueSettled}</span>{/if}
            {#if approvalCount > 0}<span class="queue-flag approval">승인 대기 {approvalCount}</span>{/if}
            {#if overdueCount > 0}<span class="queue-flag overdue">노쇼 판정 초과 {overdueCount}</span>{/if}
        </h2>
    </div>

    {#if queueGroups.length === 0}
        <p class="empty-state queue-empty">
            지금 처리할 예약이 없습니다. 회원이 예약하거나 진행 중인 게임에 참여를 신청하면 여기에 뜹니다.
        </p>
    {:else}
        {#each queueGroupsSorted as g (g.sessionId)}
            <div class="queue-group">
                <div class="queue-group-head">
                    <strong>{g.gameName}</strong>
                    <span class="queue-meta">
                        {g.sessionStatus === 'playing'
                            ? g.startTime
                                ? `${formatTime(g.startTime)} 시작`
                                : '진행 중'
                            : g.scheduledAt
                              ? `${formatTime(g.scheduledAt)} 예정`
                              : '예정'}
                        · 참여 {g.currentPlayers}/{g.maxPlayers || '-'}
                    </span>
                </div>
                <ul class="queue-list">
                    {#each g.rows as r (r.id)}
                        <li class="queue-row" class:is-overdue={r.overdue}>
                            <div class="queue-who">
                                <a href="/admin/attendees/{r.attendee_id}" class="attendee-link">{r.attendee_name}</a>
                                <span class="queue-status queue-{r.status}">
                                    {QUEUE_STATUS[r.status] ?? r.status}{#if r.status === 'waitlisted' && r.waitlist_position}&nbsp;{r.waitlist_position}번{/if}
                                </span>
                                {#if r.penalty_points >= penaltyThreshold}
                                    <span class="badge penalty blocked">페널티 {r.penalty_points}/{penaltyThreshold}</span>
                                {:else if r.penalty_points > 0}
                                    <span class="badge penalty">페널티 {r.penalty_points}/{penaltyThreshold}</span>
                                {/if}
                                {#if r.is_blacklisted}<span class="badge blacklist">블랙</span>{/if}
                            </div>
                            <div class="queue-note">
                                {#if r.overdue}
                                    <strong class="overdue-text">시작 후 {noShowLimitMinutes}분 경과 · 방에 없음 — 노쇼 판단 필요</strong>
                                {:else if r.is_blacklisted}
                                    <strong class="overdue-text">블랙리스트 — 확정 불가. 해제 후 처리하세요.</strong>
                                {:else if r.penalty_points >= penaltyThreshold}
                                    <strong class="overdue-text">
                                        페널티 {r.penalty_points}/{penaltyThreshold}점 — 확정 불가. 페널티 조정 후 처리하세요.
                                    </strong>
                                {:else}
                                    {formatTime(r.created_at)} 신청
                                {/if}
                            </div>
                            <div class="queue-actions">
                                {#if r.overdue}
                                    <form
                                        method="POST"
                                        action="?/markNoShow"
                                        use:enhance={confirmSubmit({
                                            title: '노쇼 처리',
                                            message: () =>
                                                `${r.attendee_name}님을 ${g.gameName} 노쇼로 처리합니다. 예약이 취소되고 페널티 1점이 부여됩니다(누적 ${r.penalty_points + 1}/${penaltyThreshold}점).${g.rows.some((x: any) => x.status === 'waitlisted') ? ' 대기 1번이 자동 승계됩니다.' : ''}`,
                                            confirmLabel: '노쇼 처리',
                                            severity: 'destructive',
                                            handle: async (res: any) => {
                                                if (!reportResult(res.result)) announcePenalty(res.result?.data);
                                                await res.update();
                                            }
                                        })}
                                    >
                                        <input type="hidden" name="reservationId" value={r.id} />
                                        <button type="submit" class="btn-queue-noshow">노쇼 처리</button>
                                    </form>
                                {/if}
                                {#if r.status !== 'confirmed'}
                                    <form method="POST" action="?/confirmReservation" use:enhance={pending(undefined, `${r.attendee_name}님을 ${g.gameName}에 확정했습니다.`)}>
                                        <input type="hidden" name="reservationId" value={r.id} />
                                        <button
                                            type="submit"
                                            class="btn-queue-confirm"
                                            disabled={r.is_blacklisted || r.penalty_points >= penaltyThreshold}
                                            title={r.is_blacklisted
                                                ? '블랙리스트라 확정할 수 없습니다'
                                                : r.penalty_points >= penaltyThreshold
                                                  ? `페널티 ${r.penalty_points}/${penaltyThreshold}점이라 확정할 수 없습니다`
                                                  : undefined}
                                        >
                                            {r.status === 'pending_approval' ? '승인' : '확정'}
                                        </button>
                                    </form>
                                {/if}
                                <form
                                    method="POST"
                                    action="?/cancelReservationAdmin"
                                    use:enhance={confirmSubmit({
                                        title: r.status === 'pending_approval' ? '참여 요청 거절' : '예약 취소',
                                        message: () =>
                                            r.status === 'pending_approval'
                                                ? `${r.attendee_name}님의 ${g.gameName} 참여 요청을 거절합니다.`
                                                : `${r.attendee_name}님의 ${g.gameName} 예약을 취소합니다.${g.rows.some((x) => x.status === 'waitlisted') ? ' 대기 1번이 자동으로 승계됩니다.' : ''}`,
                                        // 「취소」와 「예약 취소」가 나란히 서면 한 단어를 공유하며
                                        // 반대를 뜻한다. 무엇이 사라지는지로 이름을 바꾼다.
                                        confirmLabel: r.status === 'pending_approval' ? '요청 거절' : '예약 삭제',
                                        severity: 'destructive',
                                        success: `${r.attendee_name}님의 ${g.gameName} 예약을 처리했습니다.`
                                    })}
                                >
                                    <input type="hidden" name="reservationId" value={r.id} />
                                    <button type="submit" class="btn-queue-cancel">
                                        {r.status === 'pending_approval' ? '거절' : '취소'}
                                    </button>
                                </form>
                            </div>
                        </li>
                    {/each}
                </ul>
            </div>
        {/each}
    {/if}
</section>
</div>

<section class="scheduled-section" aria-labelledby="sec-scheduled">
    <div class="section-header">
        <h2 id="sec-scheduled">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
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
                        <div class="list-thumb placeholder" aria-hidden="true">
                            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1"/><circle cx="15.5" cy="15.5" r="1"/><circle cx="15.5" cy="8.5" r="1"/><circle cx="8.5" cy="15.5" r="1"/></svg>
                        </div>
                    {/if}
                    <span class="list-name">{g.game_name}</span>
                    <span class="list-meta">{formatScheduledTime(g.scheduled_at)}</span>
                    <span class="list-meta">{(g.participants || []).length}/{g.max_players}</span>
                    <span class="list-arrow" aria-hidden="true">›</span>
                </button>
            </li>
        {/each}
        {#if (scheduledGames || []).length === 0}
            <p class="empty-state">예정된 게임이 없습니다. 「+ 게임 일정 등록」으로 만들 수 있습니다.</p>
        {/if}
    </ul>
    {#if (scheduledGames || []).length > 5}
        <button class="show-more-btn" onclick={() => showAllScheduled = !showAllScheduled}>
            {showAllScheduled ? '접기' : `+${(scheduledGames || []).length - 5}개 더보기`}
        </button>
    {/if}
</section>

{#if mergedVisitPlans.length > 0}
<section class="visit-plan-section" aria-labelledby="sec-visitplan">
    <h2 id="sec-visitplan">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
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


{#if showModal}
    <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 모달의 Escape(trapFocus)와 닫기 버튼이 담당한다. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
        class="modal-backdrop"
        onclick={() => dismissFormModal(() => showModal = false, newGameDirty)}
        role="button" 
        tabindex="-1"
        aria-label="Close modal"
    >
        <div class="modal-content" use:trapFocus={() => showModal = false} onclick={handleModalClick} onkeydown={() => {}} role="dialog" aria-labelledby="dlg-new-game" aria-modal="true" tabindex="-1">
            <h2 id="dlg-new-game">새 게임 시작</h2>
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
                    <label for="newGameName">게임 이름</label>
                    <input 
                        type="text" 
                        id="newGameName"
                        name="gameName" 
                        placeholder="게임 이름 (직접 입력 또는 선택)" 
                        bind:value={selectedGameName} 
                        bind:this={searchInput}
                        onclick={handleInputClick}
                        onfocus={handleInputClick}
                        onkeydown={(e) => comboKeydown(e, filteredGames, selectGame)}
                        role="combobox"
                        aria-expanded={dropdownOpen && filteredGames.length > 0}
                        aria-controls="newGameOptions"
                        aria-autocomplete="list"
                        required 
                        autocomplete="off" 
                    />
                    
                    {#if dropdownOpen && filteredGames.length > 0}
                        <ul class="dropdown-menu" id="newGameOptions" role="listbox" aria-label="게임 후보">
                            {#each filteredGames as game, gi}
                                <li role="presentation">
                                    <button type="button" role="option" aria-selected={gi === gameOptionIndex} class:active={gi === gameOptionIndex} onclick={() => selectGame(game)}>
                                        {#if game.image_url}
                                            <img src={game.image_url} alt="" class="mini-thumb" />
                                        {/if}
                                        <div class="game-option-info">
                                            <span class="name">{game.name}</span>
                                            <span class="meta">
                                                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align:text-top;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                                {game.min_players}-{game.max_players}인 | 
                                                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align:text-top;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
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
                        placeholder="예: 90" 
                        required 
                        min="1" 
                        class="duration-input"
                    />
                </div>

                <div class="player-picker">
                    <div class="pp-head">
                        <span class="pp-label">참여자 ({selectedPlayerIds.length})</span>
                        <div class="pp-head-actions">
                            <!-- 조건부로 숨기면 "왜 없지"를 알 수 없다. 못 쓰는 이유를 달고 남긴다. -->
                            <button
                                type="button"
                                class="btn-mini"
                                disabled={availableAttendees.length === 0}
                                title={availableAttendees.length === 0 ? '방에 있는 인원이 모두 게임 중입니다' : undefined}
                                onclick={() => selectedPlayerIds = availableAttendees.map((a) => a.id)}
                            >참석자 전원</button>
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

                    <!--
                        토글이 목록 아래 텍스트 링크로 있어서, 전원이 게임 중일 때는
                        틀린 빈 메시지 밑에 있는 링크가 유일한 탈출구였다. 범위를
                        고르는 장치이므로 목록 위에 둔다.
                    -->
                    {#if (attendees || []).some((a) => a.is_playing)}
                        <div class="pp-scope" role="group" aria-label="참여자 범위">
                            <button type="button" class="pp-scope-btn" class:active={!showPlayingInPicker}
                                aria-pressed={!showPlayingInPicker}
                                onclick={() => showPlayingInPicker = false}>대기 중 {availableAttendees.length}</button>
                            <button type="button" class="pp-scope-btn" class:active={showPlayingInPicker}
                                aria-pressed={showPlayingInPicker}
                                onclick={() => showPlayingInPicker = true}>전체 {(attendees || []).length}</button>
                        </div>
                    {/if}

                    <input type="text" class="pp-search" placeholder="이름 검색..." aria-label="참여자 이름 검색" autocomplete="off" bind:value={playerSearch} />

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
                            <!--
                                검색 전인데 "일치하는 참여자가 없습니다"라고 하면 거짓 빈 화면이다.
                                8명이 3판을 돌리는 저녁에는 그게 기본 상태다.
                            -->
                            {#if playerSearch}
                                <p class="hint">「{playerSearch}」와 일치하는 사람이 없습니다.</p>
                            {:else if !showPlayingInPicker && (attendees || []).some((a) => a.is_playing)}
                                <p class="hint">방에 있는 {(attendees || []).length}명이 모두 게임 중입니다. 「전체」로 바꾸면 함께 고를 수 있습니다.</p>
                            {:else}
                                <p class="hint">방에 있는 인원이 없습니다. 아래 「게스트 수」로 시작할 수 있습니다.</p>
                            {/if}
                        {/if}
                    </div>


                </div>

                <div class="input-group guest-input-group">
                    <label for="guestCount">게스트 수</label>
                    <input type="number" id="guestCount" name="guestCount" bind:value={guestCount} min="0" max="20" class="number-input" />
                    <p class="hint">* 회원이 아닌 사람 수 (게스트1, 게스트2… 자동 생성)</p>
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
    <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 모달의 Escape(trapFocus)와 닫기 버튼이 담당한다. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
        class="modal-backdrop"
        onclick={() => endGameModalVisible = false} 
        role="button" 
        tabindex="-1"
        aria-label="Close modal"
    >
        <div class="modal-content" use:trapFocus={() => endGameModalVisible = false} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-labelledby="dlg-end-game" aria-modal="true" tabindex="-1">

            <h2 id="dlg-end-game">
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#fab005;"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
                게임 종료
            </h2>
            <p><strong>{selectedEndGame.game_name}</strong> 게임을 종료합니다.</p>
            <p>승자와 점수는 선택입니다. 비워두고 종료해도 됩니다.</p>

            <!--
                문구는 서버가 실제로 기록한 것을 따른다. 예전에는 승자를 아무도
                고르지 않아도 "승자가 기록되었습니다"라고 알렸다.
            -->
            <form method="POST" action="?/endGame" use:enhance={() => {
                return async ({ result, update }: { result: any, update: (options?: { reset?: boolean }) => Promise<void> }) => {
                    if (!reportResult(result)) {
                        endGameModalVisible = false;
                        const d = (result?.data as any) ?? {};
                        showToast(d.hadWinners
                            ? `${d.endedName ?? '게임'} 종료됨 · 승자를 기록했습니다`
                            : `${d.endedName ?? '게임'} 종료됨 · 승자는 기록하지 않았습니다`);
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
                                    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>
                                </span>
                            </label>
                            <input type="number" name="score_{pl.id}" placeholder="점수" aria-label="{pl.name} 점수" class="score-input" />
                        </div>
                    {/each}
                </div>

                <div class="modal-actions">
                    <button type="button" onclick={() => endGameModalVisible = false} class="btn-cancel">취소</button>
                    <button type="submit" class="btn-primary">게임 종료</button>
                </div>
            </form>
        </div>
    </div>
{/if}

<!-- 파괴적 액션 확인 모달 -->
{#if confirmState}
    <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 모달의 Escape(trapFocus)와 닫기 버튼이 담당한다. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
        class="modal-backdrop modal-layer-confirm"
        onclick={closeConfirm} role="presentation">
        <div class="modal-content confirm-modal" use:trapFocus={closeConfirm} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="alertdialog" aria-labelledby="dlg-confirm" aria-modal="true" tabindex="-1">
            <h3 id="dlg-confirm">{confirmState.title}</h3>
            <p>{confirmState.message}</p>
            <div class="modal-actions">
                <button class="btn-cancel" data-autofocus onclick={closeConfirm}>취소</button>
                <button class="btn-confirm-action is-{confirmState.severity}" onclick={runConfirm}>{confirmState.confirmLabel}</button>
            </div>
        </div>
    </div>
{/if}

<!-- 참여자 관리 시트 -->
{#if manageView}
    {@const m = manageView}
    <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 모달의 Escape(trapFocus)와 닫기 버튼이 담당한다. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
        class="modal-backdrop"
        onclick={() => (manageTarget = null)}
        role="button"
        tabindex="-1"
        aria-label="관리 닫기"
    >
        <div class="modal-content manage-sheet" use:trapFocus={() => manageTarget = null} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-labelledby="dlg-manage" aria-modal="true" tabindex="-1">
            <h3 id="dlg-manage">{m.name} 관리</h3>

            <div class="manage-row manage-row-stacked">
                <div class="manage-label">
                    <span>페널티</span>
                    <span class="manage-sub">
                        현재 {m.penalty_points}점 · {penaltyThreshold}점부터 예약 제한
                        {#if m.penalty_points >= penaltyThreshold}<strong class="manage-flag">현재 제한 중</strong>{/if}
                    </span>
                </div>
                <div class="penalty-controls">
                    <form
                        method="POST"
                        action="?/applyPenaltyAdmin"
                        class="penalty-grant"
                        use:enhance={confirmSubmit({
                            title: '페널티 부여',
                            message: () =>
                                `${m.name}님에게 ${PENALTY_REASON_LABELS[penaltyReason]} 사유로 페널티 1점을 부여합니다. 누적 ${m.penalty_points + 1}점이 되며, ${
                                    m.penalty_points + 1 >= penaltyThreshold
                                        ? '이 시점부터 예약이 제한됩니다.'
                                        : `${penaltyThreshold}점부터 예약이 제한됩니다.`
                                }`,
                            confirmLabel: '페널티 부여',
                            severity: 'destructive',
                            handle: async (res: any) => {
                                if (!reportResult(res.result)) announcePenalty(res.result?.data);
                                await res.update();
                            }
                        })}
                    >
                        <input type="hidden" name="attendeeId" value={m.id} />
                        <input type="hidden" name="points" value="1" />
                        <label class="sr-only" for="penalty-reason">페널티 사유</label>
                        <select id="penalty-reason" name="reason" bind:value={penaltyReason}>
                            {#each Object.entries(PENALTY_REASON_LABELS) as [key, label] (key)}
                                <option value={key}>{label}</option>
                            {/each}
                        </select>
                        <button type="submit" class="btn-penalty add">페널티 부여</button>
                    </form>
                    <form
                        method="POST"
                        action="?/applyPenaltyAdmin"
                        use:enhance={pending(() => async (res: any) => {
                            if (!reportResult(res.result)) announcePenalty(res.result?.data);
                            await res.update();
                        })}
                    >
                        <input type="hidden" name="attendeeId" value={m.id} />
                        <input type="hidden" name="points" value="-1" />
                        <button type="submit" class="btn-penalty remove" disabled={m.penalty_points === 0}>
                            1점 취소
                        </button>
                    </form>
                </div>
            </div>

            <div class="manage-row">
                <div class="manage-label">
                    <span>블랙리스트</span>
                    <span class="manage-sub">{m.is_blacklisted ? '등록됨 — 입장·참여 제한' : '미등록'}</span>
                </div>
                <form method="POST" action="?/toggleBlacklist" use:enhance={m.is_blacklisted ? pending(undefined, `${m.name}님을 블랙리스트에서 해제했습니다.`) : confirmSubmit({ title: '블랙리스트 등록', message: `${m.name}님을 블랙리스트에 등록합니다. 이후 입장·게임 참여가 제한되고, 진행 중이거나 예정된 참여도 막힙니다.`, confirmLabel: '블랙 등록', severity: 'irreversible', success: `${m.name}님을 블랙리스트에 등록했습니다.` })} style="display:inline;">
                    <input type="hidden" name="attendeeId" value={m.id} />
                    <!--
                        3단 사다리의 1단. 채움 빨강은 「되돌릴 수 없는 것」에만 쓰고,
                        이 콘솔에서 그건 블랙 등록 하나뿐이다. 이 약속이 시트 안에서만
                        지켜지던 동안 마감 하기·게임 폭파·되돌릴 수 있는 1점이 전부
                        같은 빨강이었고, 그래서 그 빨강이 아무것도 말하지 않았다.
                        해제는 파괴적이지 않으므로 2단도 아닌 보조 버튼이다.
                    -->
                    <button type="submit" class="btn-role {m.is_blacklisted ? 'is-secondary' : 'is-irreversible'}">
                        {m.is_blacklisted ? '블랙 해제' : '블랙 등록'}
                    </button>
                </form>
            </div>

            <div class="manage-row">
                <div class="manage-label">
                    <span>게임 관리 권한</span>
                    <span class="manage-sub">{m.can_manage_games ? '매니저' : '일반 유저'}</span>
                </div>
                <!--
                    되돌릴 수 있는 페널티 1점에는 확인창이 있는데, 이 제품의 유일한
                    권한 부여에는 없었다. 위험 보정이 반대였다.
                -->
                <form method="POST" action="?/toggleManager" use:enhance={m.can_manage_games
                    ? pending(undefined, `${m.name}님의 매니저 권한을 해제했습니다.`)
                    : confirmSubmit({
                        title: '매니저 지정',
                        message: `${m.name}님에게 매니저 권한을 줍니다. 매니저는 게임을 만들고 자기가 만든 게임의 인원과 시간을 관리할 수 있습니다.`,
                        confirmLabel: '매니저 지정',
                        severity: 'neutral',
                        success: `${m.name}님을 매니저로 지정했습니다.`
                    })} style="display:inline;">
                    <input type="hidden" name="attendeeId" value={m.id} />
                    <button type="submit" class="btn-role is-secondary">
                        {m.can_manage_games ? '매니저 해제' : '매니저 지정'}
                    </button>
                </form>
            </div>

            <!--
                전폭 버튼으로 시트 맨 아래, 네이티브 시트가 "완료"에 쓰는 자리에
                있었다. 닫으려고 손을 뻗으면 퇴장 처리에 닿았다. 다른 속성 행들과
                같은 줄로 내리고, 그 자리는 닫기가 가져간다.
            -->
            <div class="manage-row">
                <div class="manage-label">
                    <span>입장 상태</span>
                    <!-- 하드코딩이라 게임 중인 사람도 「방에 있음」이라 말했고,
                         그래서 퇴장 처리가 예고 없이 다른 시트로 분기했다. -->
                    <span class="manage-sub">
                        {m.is_playing && m.game_name ? `${m.game_name} 진행 중 — 퇴장 시 게임에서도 빠집니다` : '방에 있음'}
                    </span>
                </div>
            <form method="POST" action="?/removeAttendee" use:enhance={(arg) => {
                if (m.is_playing) {
                    arg.cancel();
                    manageTarget = null;
                    handleRemove(m);
                    return;
                }
                return confirmSubmit({
                    title: '퇴장 처리',
                    message: `${m.name}님을 퇴장 처리합니다. 방에 없음으로 바뀌고, 대기·승인 큐의 확정 예약은 노쇼 후보로 표시됩니다.`,
                    confirmLabel: '퇴장',
                    severity: 'destructive',
                    handle: async ({ result, update }) => {
                        if (!reportResult(result)) manageTarget = null;
                        await update();
                    }
                })(arg);
            }}>
                <input type="hidden" name="id" value={m.id} />
                <button type="submit" class="btn-role is-danger-outline">퇴장 처리</button>
            </form>
            </div>

            <button type="button" class="btn-sheet-close manage-close" onclick={() => (manageTarget = null)}>
                닫기
            </button>
        </div>
    </div>
{/if}

<!-- Remove Confirm Modal -->
{#if removeModalVisible && removeTarget}
    <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 모달의 Escape(trapFocus)와 닫기 버튼이 담당한다. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
        class="modal-backdrop"
        onclick={() => removeModalVisible = false} 
        role="button" 
        tabindex="-1"
        aria-label="Close confirm"
    >
        <div class="modal-content confirm-modal" use:trapFocus={() => removeModalVisible = false} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-labelledby="dlg-remove" aria-modal="true" tabindex="-1">
            <h3 id="dlg-remove">참여자 퇴장 확인</h3>
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
                    <button type="submit" class="btn-warning full-width">이 사람만 퇴장</button>
                </form>

                <button class="btn-cancel full-width" onclick={() => removeModalVisible = false}>취소</button>
            </div>
        </div>
    </div>
{/if}

{#if showScheduledGameModal}
    <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 모달의 Escape(trapFocus)와 닫기 버튼이 담당한다. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
        class="modal-backdrop"
        onclick={() => dismissFormModal(() => showScheduledGameModal = false, scheduledGameDirty)}
        role="button" 
        tabindex="-1"
        aria-label="Close modal"
    >
        <div class="modal-content" use:trapFocus={() => showScheduledGameModal = false} onclick={handleModalClick} onkeydown={() => {}} role="dialog" aria-labelledby="dlg-schedule" aria-modal="true" tabindex="-1">

            <h2 id="dlg-schedule">
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                게임 일정 등록
            </h2>
            <form method="POST" action="?/createScheduledGame" use:enhance={() => {
                return async ({ result, update }: { result: any, update: (options?: { reset?: boolean }) => Promise<void> }) => {
                    if (!reportResult(result)) {
                        showScheduledGameModal = false;
                        showAlert('게임 일정을 등록했습니다.', 'success');
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
                        onkeydown={(e) => comboKeydown(e, filteredScheduledGames, selectScheduledGame)}
                        role="combobox"
                        aria-expanded={dropdownOpen && filteredScheduledGames.length > 0}
                        aria-controls="scheduledGameOptions"
                        aria-autocomplete="list"
                        required 
                        autocomplete="off" 
                    />
                    
                    {#if dropdownOpen && filteredScheduledGames.length > 0}
                        <ul class="dropdown-menu" id="scheduledGameOptions" role="listbox" aria-label="게임 후보">
                            {#each filteredScheduledGames as game, gi}
                                <li role="presentation">
                                    <button type="button" role="option" aria-selected={gi === gameOptionIndex} class:active={gi === gameOptionIndex} onclick={() => selectScheduledGame(game)}>
                                        {#if game.image_url}
                                            <img src={game.image_url} alt="" class="mini-thumb" />
                                        {/if}
                                        <div class="game-option-info">
                                            <span class="name">{game.name}</span>
                                            <span class="meta">
                                                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align:text-top;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                                {game.min_players}-{game.max_players}인 | 
                                                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align:text-top;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
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
                    <p class="hint">* 회원이 아닌 사람 수 (최대 {maxPlayers}명, 게스트1, 게스트2… 자동 생성)</p>
                </div>

                <div class="admin-options">
                    <h4 class="admin-options-title">관리자 옵션</h4>
                    <label class="checkbox-option">
                        <input type="checkbox" name="showOnMain" value="true" />
                        메인페이지에 보이기
                    </label>
                </div>

                <div class="modal-actions">
                    <button type="button" onclick={() => showScheduledGameModal = false} class="btn-cancel">취소</button>
                    <button type="submit" class="btn-primary">일정 등록</button>
                </div>
            </form>
        </div>
    </div>
{/if}

<!-- Scheduled Game Detail Modal -->
{#if selectedScheduledGame}
    {@const g = selectedScheduledGame}
    <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 모달의 Escape(trapFocus)와 닫기 버튼이 담당한다. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal-backdrop" onclick={() => selectedScheduledGame = null} onkeydown={(e) => e.key === 'Escape' && (selectedScheduledGame = null)} role="button" tabindex="-1" aria-label="Close modal">
        <div class="modal-content game-detail-modal" use:trapFocus={() => selectedScheduledGame = null} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-labelledby="dlg-scheduled-detail" aria-modal="true" tabindex="-1">
            <div class="detail-header">
                {#if g.image_url}
                    <img src={g.image_url} alt={g.game_name} width="56" height="56" class="detail-thumb" />
                {/if}
                <div>
                    <h3 id="dlg-scheduled-detail">{g.game_name}</h3>
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
                    {@render participantPicker()}
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
                <hr class="detail-divider" />
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
                    <input type="number" name="duration" value="60" aria-label="예상 진행 시간(분)" class="duration-input" />
                    <button type="submit" class="btn-primary">게임 시작</button>
                </form>
                <form method="POST" action="?/dissolveScheduledGame" use:enhance={confirmSubmit({
                    title: '게임 폭파',
                    message: `"${g.game_name}" 예약 게임을 폭파합니다. 참여자 예약이 모두 취소됩니다.`,
                    confirmLabel: '폭파',
                    severity: 'destructive',
                    handle: async ({ result, update }) => {
                        if (!reportResult(result)) {
                            selectedScheduledGame = null;
                            showAlert('게임이 폭파되었습니다.', 'success');
                        }
                        await update();
                    }
                })} class="detail-form-row destructive-row">
                    <input type="hidden" name="sessionId" value={g.id} />
                    <!--
                        전폭 채움 빨강이 「닫기」 바로 위에, 구분선도 없이 붙어 있었다.
                        폰에서 엄지가 놓이는 자리 8px 위에서 모두의 예약을 취소하는
                        버튼이다. 관리 시트에서 이미 고친 패턴을 여기에도 적용한다.
                    -->
                    <button type="submit" class="btn-delete">게임 폭파</button>
                </form>
            </div>
            <button class="btn-sheet-close" onclick={() => selectedScheduledGame = null}>닫기</button>
        </div>
    </div>
{/if}

<!-- Playing Game Detail Modal -->
{#if selectedPlayingGame}
    {@const g = selectedPlayingGame}
    {@const msLeft = new Date(g.end_time).getTime() - now}
    <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 모달의 Escape(trapFocus)와 닫기 버튼이 담당한다. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal-backdrop" onclick={() => selectedPlayingGame = null} onkeydown={(e) => e.key === 'Escape' && (selectedPlayingGame = null)} role="button" tabindex="-1" aria-label="Close modal">
        <div class="modal-content game-detail-modal" use:trapFocus={() => selectedPlayingGame = null} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-labelledby="dlg-playing" aria-modal="true" tabindex="-1">
            <div class="detail-header">
                {#if g.image_url}
                    <img src={g.image_url} alt={g.game_name} width="56" height="56" class="detail-thumb" />
                {/if}
                <div>
                    <h3 id="dlg-playing">{g.game_name}</h3>
                    <p class="detail-sub">종료 예정: {formatTime(g.end_time)}</p>
                    <!-- 행은 틴트로 긴박함을 말하는데 드릴인하면 그 상태가 버려졌다 -->
                    <p class="detail-sub time-remaining" class:is-expired={msLeft <= 0} class:is-soon={msLeft > 0 && msLeft < 5 * 60000}>
                        {getTimeRemaining(g.end_time, now)}
                    </p>
                </div>
            </div>
            <div class="detail-section">
                <strong>참여자 ({g.players.length})</strong>
                <p class="detail-participants">{g.players.map((p: any) => p.is_guest ? `${p.name}(G)` : p.name).join(', ') || '없음'}</p>
            </div>
            <div class="detail-actions">
                <form method="POST" action="?/joinGame" use:enhance={() => {
                    return async ({ result, update }) => {
                        // 조용히 끝나는 폼이 없어야 한다 — 이 셋만 예외로 남아 있었다
                        const who = participantSearch.trim();
                        if (!reportResult(result)) showToast(`${who || '참여자'}님을 ${g.game_name}에 추가했습니다`);
                        resetParticipantSearch();
                        await update();
                        refreshSelectedPlayingGame();
                    };
                }} class="detail-form-row">
                    <input type="hidden" name="sessionId" value={g.id} />
                    {@render participantPicker()}
                    <button type="submit" class="btn-mini">추가</button>
                </form>
                <form method="POST" action="?/addGuestToGame" use:enhance={() => {
                    return async ({ result, update }) => {
                        if (!reportResult(result)) showToast(`${g.game_name}에 게스트를 추가했습니다`);
                        await update();
                        refreshSelectedPlayingGame();
                    };
                }} class="detail-form-row">
                    <input type="hidden" name="sessionId" value={g.id} />
                    <button type="submit" class="btn-mini btn-guest">게스트 추가</button>
                </form>
                <div class="detail-group">
                    <span class="detail-group-label">시간 조정</span>
                    <!--
                        연장만 있고 줄이는 수단이 없었다. 게다가 눌러도 아무 응답이
                        없어 시끄러운 방에서는 다시 누르게 되고, 그러면 +20분이
                        되는데 교정할 방법이 게임 종료뿐이었다.
                    -->
                    <div class="detail-extend-row">
                        {#each [-10, 10, 30] as delta (delta)}
                            <form method="POST" action="?/extendGame" use:enhance={pending(
                                () => async (res: any) => {
                                    if (!reportResult(res.result)) {
                                        const d = res.result?.data ?? {};
                                        showToast(`${d.gameName ?? g.game_name} ${delta > 0 ? '+' : ''}${delta}분 · 종료 예정 ${formatTime(d.endTime)}`);
                                    }
                                    await res.update();
                                    refreshSelectedPlayingGame();
                                }
                            )} style="flex:1;">
                                <input type="hidden" name="id" value={g.id} />
                                <input type="hidden" name="minutes" value={delta} />
                                <button type="submit" class="btn-extend" class:is-reduce={delta < 0} style="width:100%;">
                                    {delta > 0 ? '+' : '−'}{Math.abs(delta)}분
                                </button>
                            </form>
                        {/each}
                    </div>
                </div>
                <!--
                    「+30분」과 「게임 종료」가 8px 간격 전폭 바로 붙어 있었다.
                    한 손으로 폰을 볼 때 오탭 한 번이면 두 시간짜리 게임이 끝난다.
                    구분선으로 끊고, 되돌릴 수 없는 것만 이 아래에 둔다.
                -->
                <hr class="detail-divider" />
                <div class="destructive-row">
                    <button class="btn-end-session" onclick={() => { openEndGameModal(g); selectedPlayingGame = null; }}>게임 종료</button>
                </div>
            </div>
            <button class="btn-sheet-close" onclick={() => selectedPlayingGame = null}>닫기</button>
        </div>
    </div>
{/if}

<style>
    section {
        margin-bottom: var(--space-6);
        padding: var(--space-5);
        border: 1px solid var(--border-light);
        border-radius: var(--radius-control);
        background: var(--bg-primary);
    }
    /* 라벨이 데이터를 이기지 않도록 — 32px은 숫자 전용으로 비워 둔다 */
    section h2 {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        font-size: var(--text-lg);
        font-weight: var(--weight-bold);
        margin: 0 0 var(--space-3);
    }

    /* 라이브 블록 우위 */
    .section-primary {
        background: var(--bg-primary);
        border-color: var(--border-default);
    }

    /* 저빈도 관리 섹션 — 기본 접힘 */

    /* 방 현황 요약 스트립 */
    .room-summary {
        margin-bottom: var(--space-5);
        padding: var(--space-4) var(--space-5);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-card);
        background: var(--bg-primary);
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: var(--space-4);
    }
    /*
        폰에서 스트립이 238px — iPhone SE 접힌 선의 36% — 을 숫자 넷에 쓰고,
        그 대가로 사람이 한 명도 접힌 선 위에 오지 못했다. 시인성이 존재
        이유인 콘솔에서. 폰에서는 한 줄로 눕히고 값 위에 레이블을 둔다.
    */
    /* 가로로 든 폰은 폭이 844px이라 위 규칙에 안 걸리는데, 거기서 부족한 건
       폭이 아니라 높이다(390px). 제약을 그대로 질의한다. */
    @media (max-width: 720px), (max-height: 480px) {
        .room-summary {
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: var(--space-2);
            padding: var(--space-3);
        }
        .rs-stat {
            gap: 0;
        }
        .room-summary .rs-value {
            font-size: var(--text-lg);
            line-height: 1.15;
        }
        .room-summary .rs-unit {
            font-size: var(--text-sm);
        }
        .rs-value-done,
        .rs-value-pending {
            font-size: var(--text-lg);
        }
        .rs-label {
            font-size: var(--text-xs);
        }
    }
    /*
        게임과 사람이 같은 화면에 들어오게 한다. 전에는 한 열로 쌓여 있어
        1280x900의 접힌 선 위에 둘 다 없었다.
    */
    /*
        게임 목록을 담은 카드는 자기 폭을 질의할 수 있어야 한다 — 아래
        @container room-card 규칙이 좁을 때 이름에 온전한 한 줄을 내준다.
        예정 게임 섹션은 2열 밖에 있어 이 선언이 없었고, 그래서 375px에서
        긴 이름이 형제 메타(시각·정원)에 폭을 뺏겨 홀로 잘렸다.
    */
    .room-columns > section,
    .scheduled-section {
        container: room-card / inline-size;
    }
    .room-columns {
        display: grid;
        /* 그리드 아이템의 기본 min-width는 auto라, 열이 내용의 min-content까지
           늘어나 좁은 화면에서 페이지 전체를 가로로 밀어냈다. */
        grid-template-columns: minmax(0, 1fr);
        gap: var(--space-5);
    }
    /* 두 번째 조건은 가로로 든 폰·짧은 창이다 — 거기서 희소한 자원은 세로이고,
       나란히 놓아야 게임과 사람이 한 화면에 들어온다. */
    @media (min-width: 1100px), (min-width: 820px) and (max-height: 560px) {
        .room-columns {
            /*
                223px짜리 게임 카드와 801px짜리 명단을 1:1로 짝지었더니 왼쪽 열
                아래에 525px이 빈 땅으로 남았고, 그 사이 큐는 접힌 선 204px
                아래에 있었다. 큐(188px)는 그 공백에 두 번 들어간다.
                왼쪽 열은 게임 → 큐 두 칸, 오른쪽 열은 명단 한 칸이 그 둘의
                높이를 함께 쓴다. 명단이 이름·배지·메타를 한 줄에 담아야 하므로
                오른쪽에 1.1을 준다.
            */
            grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
            /* 행을 명시해야 아래 grid-row의 -1이 가리킬 줄이 생긴다.
               암묵 행만 있으면 -1이 첫 줄로 접혀 span이 사라진다. */
            grid-template-rows: auto auto;
            align-items: start;
        }
        .room-columns > section {
            margin-bottom: 0;
        }
        /* DOM 순서(게임 → 명단 → 큐)와 열 배치가 다르므로 셋 다 명시한다 */
        .room-col-games {
            grid-column: 1;
            grid-row: 1;
        }
        .room-col-queue {
            grid-column: 1;
            grid-row: 2;
        }
        .room-col-roster {
            grid-column: 2;
            grid-row: 1 / -1;
        }
    }
    .rs-stat {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        min-width: 0;
    }
    .rs-label {
        display: inline-flex;
        align-items: center;
        gap: var(--space-1);
        min-width: 0;
        font-size: var(--text-xs);
        font-weight: var(--weight-medium);
        color: var(--text-secondary);
    }
    .rs-value {
        font-size: var(--text-stat);
        font-weight: var(--weight-bold);
        line-height: 1;
        color: var(--text-primary);
        font-variant-numeric: var(--numeric);
    }
    .rs-unit {
        font-size: var(--text-lg);
        font-weight: var(--weight-medium);
        margin-left: 0.15em;
        color: var(--text-secondary);
    }
    .rs-value-none {
        color: var(--text-secondary);
    }
    .rs-value-pending {
        color: var(--color-orange-text);
    }
    .rs-stat-pending .rs-unit {
        color: var(--color-orange-text);
    }
    /* 제목 옆 숫자 분해. 제목만큼 크면 제목이 아니게 된다. */
    .count-split {
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
        color: var(--text-secondary);
        margin-left: var(--space-2);
    }
    .count-aside {
        font-size: var(--text-xs);
        font-weight: var(--weight-regular, 400);
        color: var(--text-secondary);
        margin-left: var(--space-2);
    }
    /* 3열 스트립에 게임 이름까지 넣으면 좁은 화면에서 레이블이 두 줄로 깨진다.
       바로 아래 「진행 중인 게임」 목록이 같은 이름을 이미 보여준다. */
    @media (max-width: 560px) {
        .rs-label-name {
            display: none;
        }
    }
    /*
        이름이 붙는 폭에서는 라벨을 한 줄로 못박는다.
        「첫 종료까지」는 flex의 익명 아이템이라 이름이 자리를 요구하면 자기가
        먼저 두 줄로 접혔다. 그래서 만료 게임이 0→1이 되어 라벨이 「정리 대기」로
        바뀌는 순간 스트립이 16~32px 줄어들며(1280 94↔110, 820 94↔126) 읽던
        페이지를 위로 당겼다. 넘치는 폭은 이름이 말줄임으로 흡수한다.
    */
    @media (min-width: 561px) {
        .rs-label {
            white-space: nowrap;
        }
    }
    .rs-label-name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: var(--weight-regular, 400);
    }
    .rs-dot {
        width: 8px;
        height: 8px;
        border-radius: var(--radius-pill);
        background: var(--text-muted);
        flex-shrink: 0;
    }
    .live-offline {
        display: block;
        margin-bottom: var(--space-3);
        padding: var(--space-2) var(--space-3);
        border: 1px solid var(--color-orange-text);
        border-radius: var(--radius-control);
        background: var(--color-warning-bg);
        color: var(--color-orange-text);
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
    }
    .rs-dot.live {
        background: var(--color-green-dark);
    }
    .rs-value.urgent,
    .rs-value.urgent .rs-unit {
        color: var(--color-red-dark);
    }

    .btn-ghost {
        background: none;
        border: 1px solid var(--border-control);
        color: var(--text-secondary);
        padding: var(--space-1) var(--space-2);
        border-radius: var(--radius-control);
        cursor: pointer;
    }
    .btn-ghost:hover {
        background: var(--bg-elevated);
    }

    .btn-confirm-action {
        background: var(--color-blue-bright);
        color: white;
        border: 1px solid transparent;
        padding: var(--space-2) 1.25rem;
        border-radius: var(--radius-control);
        cursor: pointer;
        font-weight: 700;
    }
    /*
        확인 버튼은 자기를 부른 버튼보다 무거워 보이면 안 된다. 시트의 테두리
        빨강 「퇴장 처리」를 누르면 60px 위에 채움 빨강 확인 버튼이 떴고,
        그러면 두 번째 화면이 첫 번째보다 심각하다고 말하는 셈이었다.
        되돌릴 수 없는 것(블랙 등록)만 채움 빨강을 입는다.
    */
    .btn-confirm-action.is-irreversible {
        background: var(--danger-solid-bg);
        color: var(--danger-solid-fg);
    }
    .btn-confirm-action.is-irreversible:hover {
        background: var(--danger-solid-bg-hover);
    }
    .btn-confirm-action.is-destructive {
        background: var(--danger-outline-bg);
        color: var(--danger-outline-fg);
        border-color: var(--danger-outline-fg);
    }
    .btn-confirm-action.is-destructive:hover {
        background: var(--danger-outline-bg-hover);
    }

    .attendee-list {
        list-style: none;
        padding: 0;
    }
    .attendee-list li {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-2);
        border-bottom: 1px solid var(--border-default);
    }
    .attendee-info {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        min-width: 0;
        flex: 1 1 auto;
    }
    .attendee-meta {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: var(--space-1);
        min-width: 0;
        font-size: var(--text-xs);
        color: var(--text-secondary);
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
    .time-remaining,
    .queue-note {
        font-variant-numeric: var(--numeric);
    }
    /* 명단 그룹 — 「대기 중」이 먼저 오고, 그게 판을 짤 수 있는 사람이다 */
    .roster-group-label {
        margin: var(--space-4) 0 var(--space-1);
        font-size: var(--text-xs);
        font-weight: var(--weight-medium);
        color: var(--text-secondary);
    }
    .attendee-list + .roster-group-label {
        margin-top: var(--space-5);
    }
    .roster-empty {
        list-style: none;
        padding: var(--space-3) var(--space-1);
        font-size: var(--text-sm);
        color: var(--text-secondary);
    }
    /* 행마다 가로 66%가 비어 있었다. 그 자리에 그 사람이 앉은 게임이 들어간다. */
    .seat-game {
        max-width: 12rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--text-primary);
    }
    .seat-time {
        white-space: nowrap;
    }
    .count-busy {
        color: var(--text-secondary);
    }
    .arrival-time {
        font-size: var(--text-xs);
        color: var(--text-secondary);
        font-variant-numeric: var(--numeric);
        background: var(--border-light);
        padding: 0.1rem 0.4rem;
        border-radius: var(--radius-control);
    }
    .add-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-2);
    }
    .add-row .add-form {
        flex: 1 1 16rem;
        min-width: 0;
    }
    /* 처음 온 사람 안내용 — 이름을 직접 넣는 것과 나란히 둔다 */
    .btn-qr {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        min-height: 44px;
        padding: 0 var(--space-3);
        border: 1px solid var(--border-control);
        border-radius: var(--radius-control);
        background: var(--bg-primary);
        color: var(--text-primary);
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
        text-decoration: none;
        white-space: nowrap;
    }
    .btn-qr:hover {
        background: var(--bg-hover);
    }
    /* .add-form은 「인원 추가」 같은 한 줄짜리 인라인 폼이고,
       .game-form은 모달 안의 여러 필드를 쌓는 세로 폼이다. 같은 가로 flex
       규칙을 공유하는 바람에 모달 폼의 필드들이 한 줄에 눌려, 게임 이름
       입력이 162x23px까지 찌그러지고 placeholder가 잘렸다. */
    .add-form {
        margin-top: var(--space-4);
        display: flex;
        gap: var(--space-2);
        flex-wrap: wrap;
    }
    /* 테두리가 유일한 경계다. 전역 #ddd로는 흰 배경에서 1.36:1이었다. */
    .add-form input {
        min-height: 44px;
        padding: 0 var(--space-3);
        border: 1px solid var(--border-control);
        border-radius: var(--radius-control);
        background: var(--bg-primary);
        color: var(--text-primary);
    }
    .game-form {
        margin-top: var(--space-4);
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
    }
    .game-form .input-group {
        margin-bottom: 0;
    }
    .game-form label:not(.sr-only):not(.checkbox-option) {
        display: block;
        margin-bottom: var(--space-1);
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
        color: var(--text-primary);
    }
    /* 모달 안 입력 높이는 한 가지다 — 23 / 32 / 35 / 44px가 섞여 있었다. */
    .game-form input[type='text'],
    .game-form input[type='number'],
    .game-form input[type='datetime-local'] {
        width: 100%;
        box-sizing: border-box;
        min-height: 44px;
        padding: 0 var(--space-3);
        border: 1px solid var(--border-control);
        border-radius: var(--radius-control);
        font-size: var(--text-sm);
        font-family: inherit;
        color: var(--text-primary);
        background: var(--bg-primary);
    }
    /* 숫자 몇 자리만 받는 칸은 폭까지 늘릴 이유가 없다 */
    .game-form input.number-input,
    .game-form input.duration-input {
        width: 6.5rem;
    }
    .game-form .pp-search {
        min-height: 44px;
    }
    /* 최소·최대 인원은 한 쌍이다. 규칙이 아예 없어서 세로로 흩어져 있었다. */
    .player-limits {
        display: flex;
        gap: var(--space-4);
    }
    .quick-add {
        margin-top: var(--space-5);
        padding-top: var(--space-4);
        border-top: 1px dashed var(--border-default);
    }

    /* 접기 표시는 details > summary 와 같은 방식으로 한 번만 정의한다 */
    .toggle-header::after {
        content: '▾';
        font-size: var(--text-xs);
        color: var(--text-secondary);
        transition: transform 0.15s ease;
        display: inline-block;
    }
    .toggle-header[aria-expanded='false']::after {
        transform: rotate(-90deg);
    }
    /* 목록을 펼치는 장치이지 무언가를 만드는 버튼이 아니다. 전역 규칙에 기대
       파란 primary로 렌더됐고, hover는 파란 배경 위에 파란 글자를 얹어
       레이블이 사라졌다(1:1). 텍스트 disclosure로 되돌린다. */
    .toggle-header {
        cursor: pointer;
        user-select: none;
        display: flex;
        align-items: center;
        gap: var(--space-1);
        color: var(--text-secondary);
        font-weight: var(--weight-medium);
    }
    .toggle-header:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
    }
    .quick-add .toggle-header {
        font-size: var(--text-sm);
        margin-bottom: var(--space-2);
    }
    .member-chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
    }
    .chip-container {
        display: flex;
        align-items: center;
        background: var(--bg-active);
        border-radius: var(--radius-card);
        padding-left: var(--space-3);
        overflow: hidden;
    }
    .chip-link {
        text-decoration: none;
        color: var(--text-primary);
        font-size: var(--text-sm);
        margin-right: var(--space-2);
    }
    .chip-link:hover {
        text-decoration: underline;
        color: var(--color-blue-bright);
    }
    .chip-add {
        background: var(--color-slate);
        color: var(--text-primary);
        border: none;
        padding: var(--space-1) 0.6rem;
        font-size: var(--text-sm);
        cursor: pointer;
        transition: background 0.2s;
        border-left: 1px solid var(--border-medium);
    }
    .chip-add:hover {
        background: var(--color-slate-dark);
        color: var(--bg-primary);
    }
    /* 예약 게임 폭파·게임 종료 및 퇴장. 파괴적이지만 되돌릴 수 있다 —
       게임은 다시 만들고 사람은 다시 입장시킨다. 2단(테두리 빨강)이다. */
    .btn-delete {
        background: var(--danger-outline-bg);
        color: var(--danger-outline-fg);
        border: 1px solid var(--danger-outline-fg);
        padding: var(--space-1) var(--space-2);
        border-radius: var(--radius-control);
        cursor: pointer;
    }
    .btn-delete:hover {
        background: var(--danger-outline-bg-hover);
    }
    /* 파괴적이지 않은 세션 종료 — 빨강과 구분 */
    /*
        되돌릴 수 없는 동작은 전폭을 벗고 오른쪽에 선다. 전폭이면 그 아래
        「닫기」와 같은 모양·같은 폭으로 8px 간격을 두고 붙어, 폰에서 엄지가
        어느 쪽에 닿았는지 형태로 구분할 수 없었다.
    */
    .destructive-row {
        display: flex;
        justify-content: flex-end;
        padding-top: var(--space-2);
    }
    .destructive-row > button,
    .destructive-row .btn-end-session,
    .destructive-row .btn-delete {
        width: auto;
        min-width: 8rem;
    }

    /* 시트를 닫는 것은 아무 일도 하지 않는다. 전폭 회색 채움은 그보다 무겁게 읽혔다. */
    .btn-sheet-close {
        width: 100%;
        margin-top: var(--space-5);
        padding: var(--space-3);
        background: none;
        border: none;
        border-top: 1px solid var(--border-light);
        color: var(--text-secondary);
        font-weight: var(--weight-medium);
        cursor: pointer;
    }
    .btn-sheet-close:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
    }

    /* 되돌릴 수 없는 유일한 동작. 이 모달에서 강한 색을 쓰는 것은 이것뿐이다. */
    .btn-end-session {
        width: 100%;
        background: var(--bg-primary);
        color: var(--color-red-dark);
        border: 1px solid var(--color-red-dark);
        padding: var(--space-3) var(--space-4);
        border-radius: var(--radius-control);
        cursor: pointer;
        font-weight: 700;
    }
    .btn-end-session:hover {
        background: var(--color-error-bg);
    }
    .btn-warning {
        background: var(--color-warning-bg);
        color: var(--text-darker);
        border: 1px solid var(--border-warning);
        padding: var(--space-1) var(--space-2);
        border-radius: var(--radius-control);
        cursor: pointer;
    }
    /* 모든 <button>이 파란 CTA였다. primary가 기본값이면 아무것도 primary가
       아니다 — 「저장된 멤버」 펼치기 토글까지 「+ 새 게임 시작」과 같은 무게로
       렌더됐다. 여기서는 형태만 맞추고, 색은 역할이 요구할 때만 준다. */
    button {
        padding: var(--space-2) var(--space-4);
        background: none;
        color: inherit;
        border: none;
        border-radius: var(--radius-control);
        cursor: pointer;
        font-family: inherit;
        font-size: var(--text-sm);
        text-decoration: none;
        display: inline-block;
    }
    /* 비활성은 opacity로 흐리지 않는다. 배경과 곱해져 대비를 예측할 수 없게
       떨어뜨리고, 운영자가 "무엇이 막혔는지" 읽지 못한다. 명시적인 무채색 조합으로
       비활성을 알리되 레이블은 계속 읽히게 한다(var(--text-secondary) on var(--bg-hover) = 4.84:1). */
    button:disabled {
        cursor: default;
        background: var(--bg-hover);
        color: var(--text-secondary);
        border-color: var(--border-medium);
    }
    button:global([aria-busy="true"]) {
        cursor: progress;
    }
    .player-select {
        width: 100%;
        display: flex;
        gap: var(--space-4);
        flex-wrap: wrap;
        margin: var(--space-4) 0;
    }
    .time-remaining {
        font-weight: bold;
        color: var(--color-orange-text);
        margin-left: var(--space-2);
        white-space: nowrap;
    }
    .status-text {
        font-size: var(--text-xs);
        color: var(--color-orange);
        margin-left: var(--space-1);
    }

    /* 새 게임 참여자 피커 */
    .player-picker {
        width: 100%;
        margin: var(--space-4) 0;
        border: 1px solid var(--border-default);
        border-radius: var(--radius-control);
        padding: var(--space-3);
    }
    .pp-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--space-2);
        margin-bottom: var(--space-2);
    }
    .pp-label {
        font-weight: 600;
        font-size: var(--text-sm);
    }
    .pp-head-actions {
        display: flex;
        gap: 0.35rem;
    }
    .pp-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin-bottom: var(--space-2);
    }
    .pp-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        background: var(--color-info-bg);
        color: var(--color-blue-bright);
        border-radius: var(--radius-card);
        padding: 0.15rem 0.3rem 0.15rem 0.6rem;
        font-size: var(--text-sm);
    }
    .pp-chip button {
        all: unset;
        cursor: pointer;
        line-height: 1;
        padding: 0 var(--space-1);
        border-radius: 50%;
        font-size: var(--text-sm);
        color: var(--color-blue-bright);
    }
    .pp-chip button:hover {
        background: rgba(11, 94, 215, 0.15);
    }
    .pp-search {
        width: 100%;
        box-sizing: border-box;
        padding: 0.4rem var(--space-2);
        border: 1px solid var(--border-control);
        border-radius: var(--radius-control);
        font-size: var(--text-sm);
    }
    .pp-list {
        margin-top: var(--space-2);
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
        gap: var(--space-2);
        width: 100%;
        padding: 0.4rem var(--space-2);
        cursor: pointer;
        border-radius: var(--radius-control);
        font-size: var(--text-sm);
    }
    .pp-option:hover:not(:disabled),
    .pp-option:focus-visible {
        background: var(--bg-tertiary);
    }
    .pp-option.checked {
        background: var(--color-info-bg);
        color: var(--color-blue-bright);
        font-weight: 600;
    }
    .pp-option:disabled {
        color: var(--text-secondary);
        cursor: not-allowed;
    }
    /* 체크 표시만 있으면 고르지 않은 행은 그냥 텍스트로 보인다.
       빈 상자를 항상 그려 "고를 수 있는 목록"임을 알린다. */
    .pp-check {
        width: 1.1rem;
        height: 1.1rem;
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--border-medium);
        border-radius: 3px;
        background: var(--bg-primary);
        font-size: var(--text-xs);
        line-height: 1;
        color: var(--color-blue-bright);
    }
    .pp-option.checked .pp-check {
        border-color: var(--color-blue-bright);
    }
    .pp-option:disabled .pp-check {
        background: var(--bg-hover);
        border-color: var(--border-medium);
    }
    .pp-name {
        flex: 1;
    }
    /* 범위 세그먼트 — 목록이 무엇을 보여주는지가 목록 위에서 결정된다 */
    .pp-scope {
        display: flex;
        gap: 2px;
        padding: 2px;
        margin-bottom: var(--space-2);
        border: 1px solid var(--border-control);
        border-radius: var(--radius-control);
        background: var(--bg-surface);
    }
    .pp-scope-btn {
        flex: 1;
        min-height: 36px;
        border: none;
        border-radius: 4px;
        background: none;
        color: var(--text-secondary);
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
        cursor: pointer;
    }
    .pp-scope-btn.active {
        background: var(--bg-primary);
        color: var(--text-primary);
    }
    .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-4);
        border-bottom: 2px solid var(--border-default);
        padding-bottom: var(--space-2);
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
        padding: var(--space-3) var(--space-5);
        border-radius: var(--radius-control);
        cursor: pointer;
        font-weight: bold;
    }
    .btn-cancel {
        background: var(--border-medium);
        color: var(--text-primary);
    }
    /* 모달 계층 — 시트 위에 확인, 확인 위에 결과 알림.
       같은 z-index면 DOM 순서가 이기기 때문에 확인 모달이 관리 시트 밑에 깔린다. */
    .modal-backdrop.modal-layer-confirm { z-index: 1100; }
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
        /* 카드 안쪽 여백을 변수로 든다 — 아래 sticky 푸터가 카드 가장자리까지
           번지려면 음수 마진이 이 값을 그대로 되돌려야 한다. */
        --modal-pad: var(--space-6);
        padding: var(--modal-pad);
        border-radius: var(--radius-card);
        width: 100%;
        max-width: 500px;
        /* vh는 주소창이 보일 때도 큰 뷰포트를 가리켜 푸터(취소·시작)가
           화면 밖으로 잘렸다. dvh는 지금 실제로 보이는 높이다. */
        max-height: 90vh;
        max-height: 90dvh;
        overflow-y: auto;
        box-shadow: 0 4px 20px var(--shadow-lg);
    }
    .modal-content h2 {
        margin-top: 0;
        display: flex;
        align-items: center;
        gap: var(--space-3);
    }
    .confirm-modal {
        max-width: 400px;
    }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-4);
        margin-top: var(--space-5);
    }
    /*
        새 게임·일정 등록 폼은 필드가 여섯이라 375x812에서 푸터가 접힌 선
        아래로 잘렸고, 잘렸다는 표시가 없어 폼을 다 채우고도 「게임 시작」이
        어디 있는지 알 수 없었다. 액션 줄을 스크롤 영역 바닥에 붙인다 —
        위쪽 경계선이 "위에 아직 더 있다"까지 함께 말한다.
    */
    .game-form .modal-actions {
        position: sticky;
        bottom: 0;
        margin: var(--space-5) calc(var(--modal-pad) * -1) calc(var(--modal-pad) * -1);
        padding: var(--space-4) var(--modal-pad);
        border-top: 1px solid var(--border-light);
        background: var(--bg-primary);
    }
    .column-actions {
        flex-direction: column;
        gap: var(--space-2);
    }
    .full-width {
        width: 100%;
        padding: var(--space-3);
        font-size: var(--text-base);
    }
    .empty-state {
        color: var(--text-secondary);
        text-align: center;
        padding: var(--space-6);
        background: rgba(255, 255, 255, 0.5);
        border-radius: var(--radius-control);
        list-style: none;
    }
    @media (max-width: 600px) {
        /* 행 액션이 「관리」 하나뿐이라 줄을 따로 쓸 이유가 없다.
           세로로 쌓으면 한 행이 90px까지 커져 목록 스캔이 나빠진다. */
        .attendee-list li {
            gap: var(--space-2);
        }
        .attendee-info {
            min-width: 0;
            flex: 1 1 auto;
        }
        .attendee-actions {
            flex: 0 0 auto;
        }
        .btn-delete {
            width: 100%; /* Keep specific override or reset if needed */
            margin-top: var(--space-2);
        }
    }
    .winner-option {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-3);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-control);
        cursor: pointer;
        transition: background 0.2s;
    }
    .winner-option:hover {
        background: var(--bg-surface);
    }
    .winner-option:has(input:checked) {
        background: var(--color-warning-bg);
        border-color: var(--color-amber-dark);
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
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-1) var(--space-2);
        min-width: 0;
        max-width: 100%;
    }
    .name-row .attendee-link {
        min-width: 0;
    }
    .name-row .badge {
        flex-shrink: 0;
    }
    .badge {
        font-size: var(--text-xs);
        padding: 0.1rem 0.4rem;
        border-radius: var(--radius-control);
        font-weight: bold;
    }
    /* 블랙리스트는 경고가 아니라 하드 블록이다. 페널티 배지와 절대 같은
       공식(연한 배경 + 빨강 아웃라인)을 쓰지 않는다 — 처방이 서로 다르다. */
    /* 매니저는 게임을 만들 수 있는 사람이다. 페널티·블랙과 달리 경고가 아니므로
       중립 톤으로 둔다. */
    .badge.manager {
        background: var(--tint-blue-bg);
        color: var(--color-blue-bright);
    }
    /* 채움 빨강이 뜻하는 하나 — 블랙리스트 — 를 배지도 그대로 입는다.
       버튼(.btn-role.is-irreversible)과 같은 색이라 「이 색이 뜻하는 것」이
       사람 옆의 상태와 그 상태를 만드는 동작에서 한 번에 읽힌다. */
    .badge.blacklist {
        background: var(--danger-solid-bg);
        color: var(--danger-solid-fg);
        border: 1px solid var(--danger-solid-bg);
    }
    .badge.penalty {
        background: var(--color-warning-bg);
        color: var(--text-darker);
        border: 1px solid var(--border-warning);
    }
    .badge.penalty.blocked {
        background: var(--color-error-bg);
        color: var(--color-red-dark);
        border-color: var(--color-red-dark);
    }
    .attendee-actions {
        display: flex;
        gap: 0.4rem;
        align-items: center;
    }
    /* 대기 · 승인 큐 */
    .queue-section .section-header h2 {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--space-2);
    }
    .queue-flag {
        font-size: var(--text-xs);
        font-weight: 700;
        padding: 0.15rem var(--space-2);
        border-radius: var(--radius-pill);
        border: 1px solid transparent;
    }
    .queue-flag.approval {
        background: var(--color-warning-bg);
        color: var(--text-darker);
        border-color: var(--border-warning);
    }
    .queue-flag.overdue {
        background: var(--color-error-bg);
        color: var(--color-red-dark);
        border-color: var(--color-red-dark);
    }
    .queue-empty {
        margin: var(--space-2) 0 0;
    }
    .queue-group + .queue-group {
        margin-top: var(--space-4);
        padding-top: var(--space-4);
        border-top: 1px solid var(--border-light);
    }
    .queue-group-head {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: var(--space-2);
        margin-bottom: 0.4rem;
    }
    .queue-group-head strong {
        font-size: var(--text-sm);
        color: var(--text-primary);
    }
    .queue-meta {
        font-size: var(--text-xs);
        color: var(--text-secondary);
    }
    .queue-list {
        list-style: none;
        margin: 0;
        padding: 0;
    }
    .queue-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        grid-template-areas: 'who actions' 'note actions';
        align-items: center;
        gap: 0.15rem var(--space-3);
        padding: var(--space-2) 0.6rem;
        border-radius: var(--radius-control);
    }
    .queue-row + .queue-row {
        margin-top: var(--space-1);
    }
    .queue-row.is-overdue {
        background: var(--color-error-bg);
    }
    .queue-who {
        grid-area: who;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.35rem;
        min-width: 0;
    }
    .queue-note {
        grid-area: note;
        font-size: var(--text-xs);
        color: var(--text-secondary);
    }
    .overdue-text {
        color: var(--color-red-dark);
        display: block;
    }
    .overdue-hint {
        color: var(--text-secondary);
    }
    .queue-actions {
        grid-area: actions;
        display: flex;
        gap: 0.4rem;
    }
    .queue-status {
        font-size: var(--text-xs);
        font-weight: 700;
        padding: 0.1rem 0.45rem;
        border-radius: var(--radius-control);
        background: var(--bg-hover);
        color: var(--text-dark);
        white-space: nowrap;
    }
    .queue-status.queue-pending_approval {
        background: var(--color-warning-bg);
        color: var(--text-darker);
    }
    .queue-status.queue-confirmed {
        background: var(--color-success-bg);
        color: var(--color-green-dark);
    }
    .btn-queue-confirm,
    .btn-queue-cancel {
        min-height: 44px;
        padding: 0 0.8rem;
        border-radius: var(--radius-control);
        font-size: var(--text-sm);
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
    }
    .btn-queue-confirm {
        background: var(--color-blue-bright);
        color: white;
        border: 1px solid transparent;
    }
    .btn-queue-cancel {
        background: var(--bg-primary);
        color: var(--color-red-dark);
        border: 1px solid var(--color-red-dark);
    }
    /* 노쇼 처리는 예약 취소 + 페널티 1점이고, 둘 다 관리 시트에서 되돌린다.
       2단(테두리 빨강). */
    .btn-queue-noshow {
        min-height: 44px;
        padding: 0 0.8rem;
        border-radius: var(--radius-control);
        font-size: var(--text-sm);
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
        background: var(--danger-outline-bg);
        color: var(--danger-outline-fg);
        border: 1px solid var(--danger-outline-fg);
    }
    .btn-queue-noshow:hover {
        background: var(--danger-outline-bg-hover);
    }
    .btn-queue-confirm:disabled,
    .btn-penalty.remove:disabled {
        background: var(--bg-hover);
        color: var(--text-secondary);
        border-color: var(--border-medium);
        cursor: not-allowed;
    }
    /* 이름 링크도 손가락이 닿는 크기로 (WCAG 2.5.8) */
    /* 탭 타깃 24px은 padding으로 확보한다. inline-flex로 바꾸면
       .attendee-link 의 text-overflow: ellipsis 가 죽는다. */
    .attendee-link,
    .chip-link,
    .list-name {
        padding-block: var(--space-1);
    }
    .queue-who .attendee-link {
        padding-block: var(--space-1);
    }

    /* 결과 토스트 — 흐름을 막지 않는 확인. 실패는 모달이 맡는다 */

    /* 스크린리더 전용 — 시각적으로는 감추되 접근성 트리에는 남긴다 */
    .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
        border: 0;
    }
    /* 비활성 버튼도 --bg-hover를 쓴다. 같은 회색이 한 섹션에서는 "죽음",
       다음 섹션에서는 "누르세요"를 뜻하면 안 된다. 테두리로 세운다. */
    .btn-manage {
        background: var(--bg-primary);
        color: var(--text-primary);
        border: 1px solid var(--border-control);
        padding: 0.3rem 0.7rem;
        border-radius: var(--radius-control);
        font-size: var(--text-xs);
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
        gap: var(--space-4);
        padding: var(--space-3) 0;
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
        font-size: var(--text-sm);
    }
    .manage-sub {
        font-size: var(--text-xs);
        color: var(--text-secondary);
    }
    .manage-close {
        display: block;
        margin: var(--space-3) auto 0;
    }
    .manage-divider {
        border: none;
        border-top: 1px solid var(--border-light);
        margin: var(--space-4) 0 var(--space-3);
    }
    /* 페널티 조작 — 부여(무거움)와 취소(가벼움)를 무게로 구분한다 */
    .manage-row-stacked {
        display: block;
    }
    .manage-flag {
        display: inline-block;
        margin-left: 0.35rem;
        color: var(--color-red-dark);
        font-weight: 700;
    }
    .penalty-controls {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-2);
        margin-top: 0.6rem;
    }
    .penalty-grant {
        display: flex;
        align-items: center;
        gap: 0.4rem;
    }
    .penalty-grant select {
        min-height: 44px;
        padding: 0 var(--space-2);
        border: 1px solid var(--border-medium);
        border-radius: var(--radius-control);
        background: var(--bg-primary);
        color: var(--text-primary);
        font-size: var(--text-sm);
    }
    .btn-penalty {
        border: 1px solid transparent;
        min-height: 44px;
        padding: 0 0.85rem;
        border-radius: var(--radius-control);
        cursor: pointer;
        font-size: var(--text-sm);
        font-weight: 600;
    }
    /* 「페널티 부여」는 바로 옆의 「1점 취소」로 되돌릴 수 있다. 2단이다. */
    .btn-penalty.add {
        background: var(--danger-outline-bg);
        color: var(--danger-outline-fg);
        border-color: var(--danger-outline-fg);
    }
    .btn-penalty.add:hover {
        background: var(--danger-outline-bg-hover);
    }
    /* 시트에서 유일한 채움 버튼이라 관대한 쪽이 주 CTA로 읽혔다. 1단(중립)이다. */
    .btn-penalty.remove {
        background: var(--bg-primary);
        color: var(--text-primary);
        border-color: var(--border-control);
    }
    .btn-penalty.remove:hover:not(:disabled) {
        background: var(--bg-hover);
    }
    /* ── 버튼 역할 4개 ──
       primary(진행) / secondary(대안) / destructive(되돌릴 수 없음) / quiet(무동작).
       한 파일에 .btn-* 21종이 흩어져 있었고 같은 모달 안에서 높이 정책이
       26 / 28 / 44px 세 가지로 갈렸다. 시각적 무게는 결과의 무게를 따라간다. */
    /* 모든 어드민 버튼/입력의 바닥.
       폼 컨트롤은 폰트를 상속하지 않아 UA 기본 13.33px이 스케일 밖으로 새어나온다. */
    button:not(.game-list-item):not(.kpi-card):not(.bottom-nav-item) {
        min-height: 44px;
    }
    button,
    input,
    select {
        font-family: inherit;
        font-size: var(--text-sm);
    }
    .btn-role {
        min-height: 44px;
        padding: 0 var(--space-3);
        border-radius: var(--radius-control);
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
        border: 1px solid transparent;
        cursor: pointer;
        line-height: 1.2;
    }
    /* 1단. 이 콘솔에서 채움 빨강을 입는 유일한 버튼 — 블랙리스트 등록.
       되돌릴 수 없고 제3자에게 파급된다. 해제는 파괴적이지 않으므로
       is-secondary로 내린다. */
    .btn-role.is-irreversible {
        background: var(--danger-solid-bg);
        color: var(--danger-solid-fg);
    }
    .btn-role.is-irreversible:hover {
        background: var(--danger-solid-bg-hover);
    }
    /* 2단. 부정적이지만 되돌릴 수 있는 조치. */
    .btn-role.is-danger-outline {
        background: var(--danger-outline-bg);
        color: var(--danger-outline-fg);
        border-color: var(--danger-outline-fg);
    }
    .btn-role.is-danger-outline:hover {
        background: var(--danger-outline-bg-hover);
    }
    .btn-role.is-secondary {
        background: var(--bg-primary);
        color: var(--text-primary);
        border-color: var(--border-control);
    }
    .btn-role.is-quiet {
        background: none;
        color: var(--text-secondary);
        border-color: transparent;
        text-decoration: underline;
        text-underline-offset: 3px;
    }
    .btn-role.is-quiet:hover {
        color: var(--text-primary);
    }
    .chip-container.blacklisted {
        opacity: 0.5;
        background: var(--color-slate);
    }
    .penalty-dot {
        font-size: var(--text-xs);
        color: var(--color-red);
        margin-left: 0.2rem;
    }

    .duration-input {
        width: 60px;
        padding: 0.4rem;
        border-radius: var(--radius-control);
        border: 1px solid var(--border-control);
        font-size: var(--text-sm);
    }


    .input-group {
        position: relative;
        margin-bottom: var(--space-2);
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
        border-radius: var(--radius-control);
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
        padding: var(--space-3);
        background: none;
        border: none;
        display: flex;
        align-items: center;
        gap: var(--space-3);
        cursor: pointer;
        transition: background 0.2s;
    }
    .dropdown-menu button.active {
        background: var(--bg-hover);
        outline: 2px solid var(--color-blue-bright);
        outline-offset: -2px;
    }
    .dropdown-menu button:hover {
        background: var(--bg-surface);
    }
    .mini-thumb {
        width: 40px;
        height: 40px;
        border-radius: var(--radius-control);
        object-fit: cover;
        background: var(--border-light);
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
        font-size: var(--text-xs);
        color: var(--text-secondary);
    }

    .winner-row {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        width: 100%;
        margin-bottom: var(--space-2);
    }
    .winner-row .winner-option {
        flex: 1;
        margin-bottom: 0;
    }
    .score-input {
        width: 80px;
        padding: var(--space-3);
        border: 1px solid var(--border-control);
        border-radius: var(--radius-control);
    }

    .btn-mini {
        padding: 0.4rem 0.8rem;
        background: var(--color-blue-bright);
        color: white;
        border: none;
        border-radius: var(--radius-control);
        cursor: pointer;
        font-size: var(--text-sm);
    }
    /* --text-dark는 글자색 토큰이다. 배경으로 쓰면 시스템이 어긋난다. */
    .btn-guest {
        background: var(--bg-primary);
        color: var(--text-primary);
        border: 1px solid var(--border-control);
    }
    .btn-guest:hover {
        background: var(--bg-hover);
    }
    .btn-manager-toggle:hover {
        opacity: 0.9;
    }
    /* 연장은 일상적인 조정이지 "실행"이 아니다. 초록은 이 콘솔 어디에도 쓰이지
       않는 색이었고, 채움색이라 「게임 종료」와 같은 무게로 읽혔다. */
    .btn-extend {
        background: var(--tint-blue-bg);
        color: var(--color-blue-bright);
        border: 1px solid transparent;
        font-weight: var(--weight-medium);
    }
    .btn-extend:hover {
        background: var(--tint-blue-bg-hover);
    }
    /* 줄이는 건 늘리는 것과 반대 방향이다. 같은 톤이면 세 버튼이 한 덩어리로 읽힌다. */
    .btn-extend.is-reduce {
        background: var(--bg-primary);
        color: var(--text-primary);
        border-color: var(--border-control);
    }
    .btn-extend.is-reduce:hover {
        background: var(--bg-hover);
    }
    .detail-group {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        margin-top: var(--space-3);
    }
    .detail-group-label {
        font-size: var(--text-xs);
        font-weight: var(--weight-medium);
        color: var(--text-secondary);
    }
    .detail-extend-row {
        display: flex;
        gap: var(--space-2);
    }
    .time-remaining.is-soon {
        color: var(--color-red-dark);
        font-weight: 700;
    }
    .time-remaining.is-expired {
        color: var(--color-orange-text);
        font-weight: 700;
    }
    .input-label {
        font-size: var(--text-sm);
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
        background: var(--text-secondary);
        color: white;
        font-size: var(--text-xs);
        font-weight: bold;
        margin-left: 4px;
        vertical-align: middle;
    }
    .guest-input-group {
        margin-top: var(--space-2);
        padding-top: var(--space-2);
        border-top: 1px solid var(--border-light);
    }
    .number-input {
        width: 80px;
        padding: var(--space-2);
        border: 1px solid var(--border-control);
        border-radius: var(--radius-control);
    }
    .hint {
        font-size: var(--text-xs);
        color: var(--text-secondary);
        margin-top: var(--space-1);
    }

    /* Recurring Game Management */
    .admin-options {
        background: var(--color-info-bg);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-control);
        padding: var(--space-4);
        margin-top: var(--space-2);
    }

    .admin-options-title {
        font-size: var(--text-sm);
        color: var(--text-dark);
        margin: 0 0 var(--space-2) 0;
        font-weight: 600;
    }

    .checkbox-option {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        font-size: var(--text-sm);
        color: var(--text-primary);
        cursor: pointer;
        padding: var(--space-1) 0;
    }

    .checkbox-option input[type="checkbox"] {
        width: 16px;
        height: 16px;
        accent-color: var(--color-blue-bright);
    }

    /* 오늘 갈 예정 */
    .visit-plan-section {
        margin-bottom: var(--space-5);
    }
    .visit-plan-grid {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
    }
    .visit-plan-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        background: var(--bg-primary);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-card);
        padding: 0.35rem var(--space-3);
        font-size: var(--text-sm);
    }
    .vp-name {
        font-weight: 600;
        color: var(--text-primary);
    }
    .vp-party {
        font-size: var(--text-xs);
        background: var(--color-info-bg);
        color: var(--color-blue-bright);
        padding: 0.1rem 0.35rem;
        border-radius: var(--radius-control);
        font-weight: 700;
    }
    .vp-time {
        font-size: var(--text-xs);
        color: var(--color-orange-text);
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
        gap: var(--space-3);
        width: 100%;
        padding: 0.6rem var(--space-2);
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
    /*
        터치 기기에서 :hover 는 탭한 뒤에도 남아 그 행이 선택된 것처럼 보인다.
        포인터가 있는 기기에서만 켠다 — 폰이 이 콘솔의 주 사용 장면이다.
    */
    @media (hover: hover) {
        .game-list-item:hover {
            background: var(--bg-surface);
        }
        .game-row.is-expired:hover {
            background: var(--color-warning-bg-strong);
        }
        .game-row.is-expired .game-list-item:hover {
            background: transparent;
        }
    }
    .game-list-item:last-child {
        border-bottom: none;
    }
    .game-list-item.ending-soon {
        background: var(--color-error-bg);
    }
    .game-list-item.ending-soon:hover {
        background: var(--color-error-bg-strong);
    }
    .game-list-item.ending-soon .time-remaining {
        color: var(--color-red-dark);
        font-weight: 700;
    }
    /* 만료는 "곧 끝남"과 다른 상태다 — 경보가 아니라 처리 대기다.
       빨강을 나눠 쓰면 5분 남은 게임과 이미 끝난 게임이 같아 보인다. */
    .game-row {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        border-bottom: 1px solid var(--border-light);
    }
    .game-row:last-child {
        border-bottom: none;
    }
    .game-row .game-list-item {
        border-bottom: none;
        /* width:100%인 flex 아이템은 기본 min-width:auto 때문에 좁은 폭에서 줄지 않는다 */
        flex: 1 1 auto;
        width: auto;
        min-width: 0;
    }
    /* 만료는 "비활성"이 아니라 "처리 대기"다. 회색으로 죽이면 조명이 나쁜 방에서
       폰으로 볼 때 가장 안 보이는 상태가 되는데, 실은 지금 손이 가야 할 유일한 행이다.
       이름은 본문색을 지키고, 상태는 색이 아니라 왼쪽 레일과 배경 틴트로 말한다. */
    .game-row.is-expired {
        background: var(--color-warning-bg);
        padding-right: var(--space-2);
    }
    .game-list-item.expired .time-remaining {
        color: var(--color-orange-text);
        font-weight: 700;
    }
    .row-end-form {
        flex-shrink: 0;
    }
    .btn-row-end {
        min-height: 36px;
        padding: 0 var(--space-3);
        border: 1px solid var(--border-control);
        border-radius: var(--radius-control);
        background: var(--bg-primary);
        color: var(--text-primary);
        font-size: var(--text-xs);
        font-weight: var(--weight-medium);
        white-space: nowrap;
        cursor: pointer;
    }
    .btn-row-end:hover {
        background: var(--bg-hover);
    }
    .list-thumb {
        width: 32px;
        height: 32px;
        border-radius: var(--radius-control);
        object-fit: cover;
        flex-shrink: 0;
    }
    .list-thumb.placeholder {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--bg-hover);
        color: var(--text-muted);
    }
    .list-name {
        flex: 1;
        min-width: 0;
        font-weight: 600;
        font-size: var(--text-sm);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .list-meta {
        font-size: var(--text-xs);
        color: var(--text-secondary);
        white-space: nowrap;
    }
    /* 20px bold라 큰 글씨 기준 3:1이 적용되고, 방향 지시자라 1.4.11로도 3:1이다.
       --text-muted(#999)로는 흰 배경 2.85 · 만료 행 hover 위 2.46이었다. */
    .list-arrow {
        color: var(--text-tertiary);
        font-size: var(--text-lg);
        font-weight: bold;
    }
    /*
        375~390px에서 이름이 「스플…」로 잘리는데 그 옆이 「게임 종료」다.
        무엇을 끝내는지 못 읽고 누르게 된다. 좁은 화면에서는 한 줄을 포기하고
        이름에 온전한 줄을 준다. 섬네일은 이름의 자리를 뺏으므로 여기서는 뺀다.
    */
    /*
        뷰포트가 아니라 이 카드가 실제로 얼마나 넓은지가 기준이다. 2열 배치에서는
        1280px 화면에서도 열이 471px이고, 만료 행은 「게임 종료」에 87px을 내주므로
        이름에 남는 자리가 폰과 비슷해진다.
    */
    @container room-card (max-width: 560px) {
        /*
            가로로 든 폰은 폭이 844px이라 ≤768px 규칙에 안 걸리는데, 2열이라
            열은 253px뿐이다. 데스크톱 헤더가 그대로 적용돼 「게임」이 「게 / 임」
            으로, 버튼이 「+ 새 게 / 임 시작」으로 글자 단위로 쪼개졌다.
            여기서도 뷰포트가 아니라 카드 폭을 기준으로 접는다.
        */
        .section-header {
            flex-wrap: wrap;
            row-gap: var(--space-2);
        }
        .section-header h2 {
            flex: 1 1 auto;
            min-width: 0;
        }
        /* 버튼은 자기 내용 폭을 지킨다 — 늘리면 전폭 파란 바가 된다 */
        .section-header > button {
            flex: 0 0 auto;
        }
        .game-list-item {
            flex-wrap: wrap;
            row-gap: 2px;
        }
        .game-list-item .list-name {
            flex: 1 0 100%;
            order: -1;
            white-space: normal;
            overflow: visible;
        }
        .game-list-item .list-thumb {
            display: none;
        }
    }

    .show-more-btn {
        display: block;
        width: 100%;
        padding: var(--space-2);
        margin-top: var(--space-2);
        background: none;
        border: 1px dashed var(--border-medium);
        border-radius: var(--radius-control);
        color: var(--text-secondary);
        font-size: var(--text-sm);
        cursor: pointer;
        text-align: center;
    }
    .show-more-btn:hover {
        background: var(--bg-primary);
        border-color: var(--text-muted);
    }

    /* 게임 상세 모달 */
    .game-detail-modal {
        max-width: 500px;
    }
    .detail-header {
        display: flex;
        gap: var(--space-4);
        align-items: flex-start;
        margin-bottom: var(--space-4);
    }
    .detail-header h3 {
        margin: 0 0 var(--space-1) 0;
        font-size: var(--text-lg);
    }
    .detail-thumb {
        width: 56px;
        height: 56px;
        border-radius: var(--radius-control);
        object-fit: cover;
        flex-shrink: 0;
    }
    .detail-sub {
        margin: 0.15rem 0;
        font-size: var(--text-sm);
        color: var(--text-secondary);
    }
    .detail-section {
        margin-bottom: var(--space-4);
        padding: var(--space-3);
        background: var(--bg-primary);
        border-radius: var(--radius-control);
    }
    .detail-section strong {
        font-size: var(--text-sm);
        color: var(--text-darker);
    }
    .detail-participants {
        margin: var(--space-1) 0 0;
        font-size: var(--text-sm);
        color: var(--text-primary);
    }
    .detail-actions {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
    }
    .detail-divider {
        border: none;
        border-top: 1px solid var(--border-light);
        margin: var(--space-2) 0;
    }
    .detail-form-row {
        display: flex;
        align-items: center;
        gap: var(--space-2);
    }
    /* 참여자 검색 셀렉트 */
    .search-select {
        position: relative;
        flex: 1;
    }
    .search-select input[type="text"] {
        width: 100%;
        padding: 0.4rem var(--space-2);
        border: 1px solid var(--border-control);
        border-radius: var(--radius-control);
        font-size: var(--text-sm);
        box-sizing: border-box;
    }
    .search-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: var(--bg-primary);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-control);
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
        padding: var(--space-2) var(--space-3);
        cursor: pointer;
        font: inherit;
        font-size: var(--text-sm);
        color: inherit;
        background: transparent;
        border: none;
        border-bottom: 1px solid var(--bg-elevated);
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
        /* 모바일 하단 탭 위로 띄운다 */
        section {
            margin-bottom: var(--space-5);
            padding: var(--space-4);
        }
        section h2 {
            font-size: var(--text-base);
            gap: var(--space-2);
        }
        /*
            세로로 펴면 「+ 새 게임 시작」이 전폭 파란 바가 되어, 폰 스크롤에서
            가장 큰 소리를 내는 것이 만들기 버튼 둘이 된다. 제목과 같은 줄에
            두면 그 무게가 내용으로 돌아온다.
        */
        .section-header {
            flex-wrap: wrap;
            align-items: center;
            gap: var(--space-2);
        }
        .section-header h2 {
            flex: 1 1 auto;
            min-width: 0;
        }
        /* 폰은 서서 한 손으로 쓰는 주 사용 장면 — 탭 타깃을 44px 아래로 줄이지 않는다 */
        button, .btn-primary, .btn-delete, .btn-mini {
            padding: 0.4rem var(--space-3);
            font-size: var(--text-sm);
            min-height: 44px;
        }
        input:not([type='hidden']):not([type='checkbox']),
        select {
            min-height: 44px;
        }
        .chip-add,
        .toggle-header,
        .btn-manage {
            min-height: 44px;
        }
        .attendee-list li {
            padding: 0.4rem var(--space-1);
            font-size: var(--text-sm);
        }
        .attendee-info { gap: var(--space-1); }
        .attendee-actions { gap: 0.15rem; }
        .badge { font-size: var(--text-xs); padding: 0.05rem 0.3rem; }
        .arrival-time { font-size: var(--text-xs); }
        .duration-input { width: 50px; }
        .input-label { font-size: var(--text-xs); }
        .chip-container { font-size: var(--text-xs); }
        .chip-link { font-size: var(--text-xs); }
        .chip-add { font-size: var(--text-xs); padding: 0.2rem 0.6rem; }
        .modal-content { width: 95%; --modal-pad: var(--space-5); }
        .player-select { gap: var(--space-2); }
        .empty-state { font-size: var(--text-sm); }
        .visit-plan-chip { font-size: var(--text-xs); padding: 0.3rem 0.6rem; }
    }

</style>
