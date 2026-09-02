<script lang="ts">
    import { enhance } from '$app/forms';
    import type { PageData } from './$types';
    import { trapFocus } from '$lib/actions/modal';
    // 결과 알림은 레이아웃의 <AdminFeedback />가 렌더한다
    import { reportResult } from '$lib/stores/adminFeedback';

    let { data }: { data: PageData } = $props();

    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];



    // 반복 일정 등록 폼
    let newGameName = $state('');
    let newDayOfWeek = $state('');
    let newTime = $state('19:00');
    let newMin = $state(2);
    let newMax = $state(4);
    let newShowOnMain = $state(false);

    function resetRecurringForm() {
        newGameName = '';
        newDayOfWeek = '';
        newTime = '19:00';
        newMin = 2;
        newMax = 4;
        newShowOnMain = false;
    }

    let confirmDelete: { id: number; name: string } | null = $state(null);
</script>

<div class="container">
    <header>
        <h1>설정</h1>
    </header>

    <div class="settings-grid">
        <form method="POST" action="?/updateSettings" use:enhance class="settings-card">
            <h3>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                운영 시간 설정
            </h3>
            <div 
                class="setting-item">
                <label for="openingTime">평일 오픈 시간</label>
                <input type="time" id="openingTime" name="opening_time" value={data.settings.opening_time} />
            </div>
            <div class="setting-item">
                <label for="closingWeekday">평일 마감 시간</label>
                <input type="time" id="closingWeekday" name="closing_time_weekday" value={data.settings.closing_time_weekday} />
            </div>
            <div class="setting-item">
                <label for="closingWeekend">주말 마감 시간</label>
                <input type="time" id="closingWeekend" name="closing_time_weekend" value={data.settings.closing_time_weekend} />
            </div>
            <div class="setting-item">
                <label for="weekendDays">주말 요일 (0:일, 6:토)</label>
                <input type="text" id="weekendDays" name="weekend_days" value={data.settings.weekend_days} placeholder="5,6" />
            </div>
            <button type="submit" class="btn-primary full-width">시간 설정 저장</button>
        </form>

        <form method="POST" action="?/updateSettings" use:enhance class="settings-card">
            <h3>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg>
                예약 및 페널티 정책
            </h3>
            <div class="setting-item">
                <label for="noShowLimit">노쇼 판단 (분)</label>
                <input type="number" id="noShowLimit" name="no_show_limit_minutes" value={data.settings.no_show_limit_minutes} />
                <p class="hint">
                    게임 시작 {data.settings.no_show_limit_minutes}분 후까지 방에 없으면 대시보드의 대기·승인 큐에
                    노쇼 후보로 표시됩니다. 자동 취소되지는 않고, 운영자가 판단합니다.
                </p>
            </div>
            <div class="setting-item">
                <label for="autoDissolve">자동 폭파 (분)</label>
                <input type="number" id="autoDissolve" name="auto_dissolve_limit_minutes" value={data.settings.auto_dissolve_limit_minutes} />
                <p class="hint">
                    시작 {data.settings.auto_dissolve_limit_minutes}분 전 인원 미달 기준값입니다.
                    현재 자동 삭제는 동작하지 않고, 예정 게임 상세의 「게임 폭파」로 직접 처리합니다.
                </p>
            </div>
            <div class="setting-item">
                <label for="penaltyThreshold">페널티 제한 기준 (점)</label>
                <input type="number" id="penaltyThreshold" name="penalty_threshold" value={data.settings.penalty_threshold} />
                <p class="hint">{data.settings.penalty_threshold}점 이상 시 예약 제한</p>
            </div>
            <button type="submit" class="btn-primary full-width">정책 설정 저장</button>
        </form>

        <!-- 공지 — 대시보드에서 옮겨 왔다 -->
        <section class="settings-card">
            <h3>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>
                공지사항
            </h3>
            <p class="hint">메인 화면 상단에 배너로 노출됩니다. 한 번에 하나만 게시됩니다.</p>
            {#if data.notice}
                <div class="current-notice">
                    <span class="notice-badge">게시 중</span>
                    <span class="notice-text">{data.notice}</span>
                    <form
                        method="POST"
                        action="?/clearNotice"
                        use:enhance={() => async ({ result, update }) => {
                            reportResult(result, '공지를 내렸습니다.');
                            await update();
                        }}
                    >
                        <button type="submit" class="btn-quiet">내리기</button>
                    </form>
                </div>
            {:else}
                <p class="empty-note">게시 중인 공지가 없습니다.</p>
            {/if}
            <form
                method="POST"
                action="?/updateNotice"
                class="notice-form"
                use:enhance={() => async ({ result, update }) => {
                    reportResult(result, '공지를 게시했습니다.');
                    await update();
                }}
            >
                <label class="sr-only" for="noticeContent">공지 내용</label>
                <input id="noticeContent" type="text" name="content" placeholder="새 공지 내용" required />
                <button type="submit" class="btn-primary">게시</button>
            </form>
        </section>

        <!-- 반복 게임 일정 — 만드는 곳과 관리하는 곳을 한 화면에 모았다 -->
        <section class="settings-card">
            <h3>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
                반복 게임 일정 ({data.recurringSchedules.length})
            </h3>
            <p class="hint">매주 같은 요일·시간에 자동으로 예정 게임이 만들어집니다.</p>

            <form
                method="POST"
                action="?/createRecurringSchedule"
                class="recurring-form"
                use:enhance={() => async ({ result, update }) => {
                    if (!reportResult(result, `"${newGameName}" 반복 일정을 등록했습니다.`)) resetRecurringForm();
                    await update();
                }}
            >
                <div class="rf-row">
                    <label for="rfGame">게임</label>
                    <input id="rfGame" name="gameName" list="rfGameList" bind:value={newGameName} placeholder="게임 이름" required />
                    <datalist id="rfGameList">
                        {#each data.allGames as g (g.id)}<option value={g.name}></option>{/each}
                    </datalist>
                </div>
                <div class="rf-row rf-split">
                    <div>
                        <label for="rfDay">요일</label>
                        <select id="rfDay" name="dayOfWeek" bind:value={newDayOfWeek} required>
                            <option value="" disabled>선택</option>
                            {#each dayNames as d, i (d)}<option value={i}>{d}요일</option>{/each}
                        </select>
                    </div>
                    <div>
                        <label for="rfTime">시간</label>
                        <input id="rfTime" type="time" name="scheduledTime" bind:value={newTime} required />
                    </div>
                    <div>
                        <label for="rfMin">최소</label>
                        <input id="rfMin" type="number" name="minPlayers" min="1" bind:value={newMin} required />
                    </div>
                    <div>
                        <label for="rfMax">최대</label>
                        <input id="rfMax" type="number" name="maxPlayers" min="1" bind:value={newMax} required />
                    </div>
                </div>
                <label class="rf-check">
                    <input type="checkbox" name="showOnMain" value="true" bind:checked={newShowOnMain} />
                    메인 화면에 표시
                </label>
                <button type="submit" class="btn-primary full-width">반복 일정 등록</button>
            </form>

            {#if data.recurringSchedules.length > 0}
                <ul class="recurring-list">
                    {#each data.recurringSchedules as sch (sch.id)}
                        <li class="recurring-item" class:inactive={!sch.is_active}>
                            <div class="ri-info">
                                <strong>{sch.game_name}</strong>
                                <span class="ri-meta">
                                    매주 {dayNames[sch.day_of_week]}요일 {sch.scheduled_time.slice(0, 5)} ·
                                    {sch.min_players}–{sch.max_players}인
                                    {#if sch.show_on_main} · 메인 표시{/if}
                                </span>
                                <span class="ri-state">
                                    {#if !sch.is_active}중지됨{:else if sch.is_skipped_this_week}이번주 건너뜀{:else}활성{/if}
                                </span>
                            </div>
                            <div class="ri-actions">
                                <form method="POST" action="?/skipRecurringWeek" use:enhance={() => async ({ result, update }) => {
                                    reportResult(result, (result as any).data?.message);
                                    await update();
                                }}>
                                    <input type="hidden" name="scheduleId" value={sch.id} />
                                    <button type="submit" class="btn-role is-secondary">
                                        {sch.is_skipped_this_week ? '건너뛰기 취소' : '이번주 빼기'}
                                    </button>
                                </form>
                                <form method="POST" action="?/toggleRecurringActive" use:enhance={() => async ({ result, update }) => {
                                    reportResult(result, sch.is_active ? '중지했습니다.' : '다시 활성화했습니다.');
                                    await update();
                                }}>
                                    <input type="hidden" name="scheduleId" value={sch.id} />
                                    <button type="submit" class="btn-role is-secondary">
                                        {sch.is_active ? '중지' : '활성화'}
                                    </button>
                                </form>
                                <button type="button" class="btn-role is-destructive" onclick={() => (confirmDelete = { id: sch.id, name: sch.game_name })}>
                                    삭제
                                </button>
                            </div>
                        </li>
                    {/each}
                </ul>
            {:else}
                <p class="empty-note">등록된 반복 일정이 없습니다.</p>
            {/if}
        </section>

        <section class="settings-card">
            <h3>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                관리자 계정
            </h3>
            <p class="hint account-hint">이 기기에서 관리자 세션을 종료합니다.</p>
            <form method="POST" action="/logout">
                <button type="submit" class="btn-logout full-width">로그아웃</button>
            </form>
        </section>
    </div>
</div>

<!-- 결과 알림 — 성공은 지나가고 실패는 남는다 -->
{#if confirmDelete}
    <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 Escape(trapFocus)와 취소 버튼이 담당한다. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal-backdrop" onclick={() => (confirmDelete = null)} role="presentation">
        <div
            class="modal-card"
            use:trapFocus={() => (confirmDelete = null)}
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            tabindex="-1"
        >
            <h3>반복 일정 삭제</h3>
            <p>"{confirmDelete.name}" 매주 반복 일정을 삭제합니다. 이미 만들어진 예정 게임은 남고, 앞으로 자동 생성되지 않습니다.</p>
            <div class="modal-actions">
                <button type="button" class="btn-role is-quiet" data-autofocus onclick={() => (confirmDelete = null)}>돌아가기</button>
                <form method="POST" action="?/deleteRecurringSchedule" use:enhance={() => async ({ result, update }) => {
                    reportResult(result, '반복 일정을 삭제했습니다.');
                    confirmDelete = null;
                    await update();
                }}>
                    <input type="hidden" name="scheduleId" value={confirmDelete.id} />
                    <button type="submit" class="btn-role is-destructive">삭제</button>
                </form>
            </div>
        </div>
    </div>
{/if}

<style>
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
    .hint {
        font-size: var(--text-xs);
        color: var(--text-secondary);
        margin: 0 0 var(--space-3);
    }
    .empty-note {
        font-size: var(--text-sm);
        color: var(--text-secondary);
        margin: 0 0 var(--space-3);
    }
    .current-notice {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--space-2);
        padding: var(--space-3);
        margin-bottom: var(--space-3);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-control);
        background: var(--bg-secondary);
    }
    .notice-badge {
        font-size: var(--text-xs);
        font-weight: var(--weight-bold);
        color: var(--color-green-dark);
        background: var(--color-success-bg);
        padding: 0.1rem 0.45rem;
        border-radius: var(--radius-control);
    }
    .notice-text {
        flex: 1;
        min-width: 0;
        font-size: var(--text-sm);
    }
    .notice-form {
        display: flex;
        gap: var(--space-2);
    }
    .notice-form input {
        flex: 1;
        min-width: 0;
    }
    .recurring-form {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        padding-bottom: var(--space-4);
        margin-bottom: var(--space-4);
        border-bottom: 1px solid var(--border-light);
    }
    .rf-row label,
    .rf-split label {
        display: block;
        font-size: var(--text-xs);
        color: var(--text-secondary);
        margin-bottom: var(--space-1);
    }
    .rf-row input,
    .rf-row select {
        width: 100%;
    }
    .rf-split {
        display: grid;
        grid-template-columns: 1.2fr 1fr 0.7fr 0.7fr;
        gap: var(--space-2);
    }
    .rf-split input,
    .rf-split select {
        width: 100%;
    }
    .rf-check {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: var(--space-2);
        width: 100%;
        font-size: var(--text-sm);
        color: var(--text-primary);
    }
    .rf-check input[type='checkbox'] {
        width: 18px;
        height: 18px;
        min-height: 0;
        margin: 0;
        flex: 0 0 auto;
    }
    .recurring-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
    }
    .recurring-item {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        padding: var(--space-3);
        border: 1px solid var(--border-light);
        border-radius: var(--radius-control);
    }
    .recurring-item.inactive {
        opacity: 0.6;
    }
    .ri-info {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        min-width: 0;
    }
    .ri-meta {
        font-size: var(--text-xs);
        color: var(--text-secondary);
    }
    .ri-state {
        font-size: var(--text-xs);
        font-weight: var(--weight-medium);
        color: var(--text-dark);
    }
    .ri-actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
    }
    .btn-role {
        min-height: 44px;
        padding: 0 var(--space-3);
        border-radius: var(--radius-control);
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
        border: 1px solid transparent;
        cursor: pointer;
    }
    .btn-role.is-secondary {
        background: var(--bg-primary);
        color: var(--text-primary);
        border-color: var(--border-medium);
    }
    .btn-role.is-destructive {
        background: var(--color-red-dark);
        color: #fff;
    }
    .btn-role.is-quiet {
        background: none;
        color: var(--text-secondary);
        text-decoration: underline;
        text-underline-offset: 3px;
    }
    .btn-quiet {
        background: none;
        border: none;
        color: var(--text-secondary);
        text-decoration: underline;
        text-underline-offset: 3px;
        cursor: pointer;
        font-size: var(--text-sm);
    }
    .modal-backdrop {
        position: fixed;
        inset: 0;
        background: var(--overlay-heavy);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1100;
        padding: var(--space-4);
    }
    .modal-card {
        background: var(--bg-primary);
        border-radius: var(--radius-card);
        padding: var(--space-5);
        max-width: 420px;
        width: 100%;
    }
    .modal-card h3 {
        margin: 0 0 var(--space-2);
        font-size: var(--text-lg);
    }
    .modal-card p {
        margin: 0 0 var(--space-4);
        font-size: var(--text-sm);
        color: var(--text-secondary);
    }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: var(--space-2);
    }
    @media (max-width: 768px) {
        .rf-split { grid-template-columns: 1fr 1fr; }
    }

    .container {
        max-width: 900px;
    }
    header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
    }
    h1 {
        margin: 0;
    }
    .settings-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 2rem;
        align-items: start;
    }
    .settings-card {
        background: var(--bg-primary);
        padding: var(--space-5);
        border-radius: var(--radius-card);
        border: 1px solid var(--border-default);
    }
    h3 {
        margin-top: 0;
        margin-bottom: 1.5rem;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid #eee;
        font-size: var(--text-lg);
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .setting-item {
        margin-bottom: 1.5rem;
    }
    label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 500;
        color: #333;
    }
    input {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: var(--radius-control);
        font-size: var(--text-base);
    }
    .hint {
        margin: 0.25rem 0 0;
        font-size: var(--text-sm);
        color: #666;
    }
    .account-hint {
        margin: 0 0 0.75rem;
    }
    .btn-logout {
        background: var(--bg-primary, #fff);
        color: var(--color-red-dark, #d32f2f);
        border: 1px solid var(--color-red-dark, #d32f2f);
        padding: 0.75rem;
        min-height: 44px;
        border-radius: var(--radius-control);
        font-size: var(--text-base);
        font-weight: 600;
        cursor: pointer;
    }
    .btn-logout:hover {
        background: var(--color-error-bg, #ffebee);
    }
    .btn-primary {
        background: var(--color-blue-bright);
        color: white;
        border: none;
        padding: 0.75rem;
        border-radius: var(--radius-control);
        font-size: var(--text-base);
        cursor: pointer;
        transition: background 0.2s;
    }
    .btn-primary:hover {
        background: #0056b3;
    }
    .full-width {
        width: 100%;
    }

    /* 폰은 서서 한 손으로 쓰는 주 사용 장면 — 탭 타깃을 44px 아래로 줄이지 않는다 */
    @media (max-width: 768px) {
        button,
        input:not([type='hidden']):not([type='checkbox']) {
            min-height: 44px;
        }
    }
</style>
