<script lang="ts">
    import type { PageData } from './$types';
    
    import { enhance } from '$app/forms';
    import { trapFocus } from '$lib/actions/modal';
    // 결과 알림은 레이아웃의 <AdminFeedback />가 렌더한다
    import { showToast, reportResult } from '$lib/stores/adminFeedback';

    let { data, form }: { data: PageData; form: any } = $props();

    let activeTab = $state('history'); // 'history' | 'record' | 'visits' | 'account' | 'season_pass'

    const PENALTY_REASON: Record<string, string> = { no_show: '노쇼', late: '지각', other: '기타', revoke: '취소' };
    const RES_STATUS: Record<string, string> = { pending_approval: '승인 대기', waitlisted: '대기', confirmed: '확정', pending: '신청' };
    let viewMode = $state('list'); // 'list' | 'calendar'
    
    // Season Pass Logic
    let showSeasonPassModal = $state(false);
    /** 정기권 취소는 남은 기간이 사라지고 재발급해도 복구되지 않는다 — 반드시 한 번 묻는다 */
    let confirmCancelPass = $state(false);
    let seasonPassStartDate = $state(new Date().toISOString().split('T')[0]);

    const activeSeasonPass = $derived(
        data.attendee.season_pass_expires_at ? new Date(data.attendee.season_pass_expires_at) > new Date() : false
    );
    const seasonPassDaysLeft = $derived(
        data.attendee.season_pass_expires_at
            ? Math.ceil(
                  (new Date(data.attendee.season_pass_expires_at).getTime() - new Date().getTime()) /
                      (1000 * 60 * 60 * 24)
              )
            : 0
    );

    // Calendar Logic
    const today = new Date();
    let currentYear = $state(today.getFullYear());
    let currentMonth = $state(today.getMonth()); // 0-indexed

    const daysInMonth = $derived(new Date(currentYear, currentMonth + 1, 0).getDate());
    const firstDayOfMonth = $derived(new Date(currentYear, currentMonth, 1).getDay()); // 0 (Sun) - 6 (Sat)
    
    const calendarDays = $derived(Array.from({ length: daysInMonth }, (_, i) => {
        const date = new Date(currentYear, currentMonth, i + 1);
        const dateString = date.toISOString().split('T')[0];
        const games = data.history.filter((h: any) => {
            const gameDate = new Date(h.start_time).toISOString().split('T')[0];
            return gameDate === dateString;
        });
        return { day: i + 1, games, dateString };
    }));

    function prevMonth() {
        if (currentMonth === 0) {
            currentMonth = 11;
            currentYear--;
        } else {
            currentMonth--;
        }
    }

    function nextMonth() {
        if (currentMonth === 11) {
            currentMonth = 0;
            currentYear++;
        } else {
            currentMonth++;
        }
    }

    const monthNames = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
</script>

<div class="attendee-detail">
    <div class="header">
        <a href="/admin" class="back-link">← 관리자 대시보드</a>
        <h1>{data.attendee.name}님의 활동 기록</h1>
        <div class="stats">
            <div class="stat-card">
                <span class="label">총 게임 수</span>
                <span class="value">{data.history.length}</span>
            </div>
            <div class="stat-card">
                <span class="label">최다 파트너</span>
                <span class="value">{data.partners[0]?.name || '-'}</span>
            </div>
        </div>
    </div>

    <div class="tabs">
        <button class:active={activeTab === 'history'} onclick={() => activeTab = 'history'}>게임 이력</button>
        <button class:active={activeTab === 'record'} onclick={() => activeTab = 'record'}>
            예약 · 페널티
            {#if data.attendee.penalty_points > 0}<span class="tab-count">{data.attendee.penalty_points}</span>{/if}
        </button>
        <button class:active={activeTab === 'visits'} onclick={() => activeTab = 'visits'}>방문 기록</button>
        <button class:active={activeTab === 'season_pass'} onclick={() => activeTab = 'season_pass'}>정기권 관리</button>
        <button class:active={activeTab === 'account'} onclick={() => activeTab = 'account'}>계정 관리</button>
    </div>

    <div class="content">
        {#if activeTab === 'history'}
            <div class="view-controls">
                <button class:active={viewMode === 'list'} onclick={() => viewMode = 'list'}>목록 보기</button>
                <button class:active={viewMode === 'calendar'} onclick={() => viewMode = 'calendar'}>달력 보기</button>
            </div>

            {#if viewMode === 'list'}
                <table class="history-table">
                    <thead>
                        <tr>
                            <th>날짜</th>
                            <th>시간</th>
                            <th>게임명</th>
                            <th>소요 시간</th>
                            <th>상태</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each data.history as game}
                            <tr>
                                <td>{new Date(game.start_time).toLocaleDateString()}</td>
                                <td>{new Date(game.start_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</td>
                                <td>{game.game_name}</td>
                                <td>{game.duration_minutes}분</td>
                                <td>
                                    <span class="status-badge {game.status}">
                                        {game.status === 'playing' ? '진행 중' : '종료'}
                                    </span>
                                </td>
                            </tr>
                        {/each}
                        {#if data.history.length === 0}
                            <tr>
                                <td colspan="5" class="empty">기록이 없습니다.</td>
                            </tr>
                        {/if}
                    </tbody>
                </table>
            {:else}
                <div class="calendar-view">
                    <div class="calendar-header">
                        <button onclick={prevMonth}>&lt;</button>
                        <h3>{currentYear}년 {monthNames[currentMonth]}</h3>
                        <button onclick={nextMonth}>&gt;</button>
                    </div>
                    <div class="calendar-grid">
                        <div class="weekday">일</div>
                        <div class="weekday">월</div>
                        <div class="weekday">화</div>
                        <div class="weekday">수</div>
                        <div class="weekday">목</div>
                        <div class="weekday">금</div>
                        <div class="weekday">토</div>
                        
                        {#each Array(firstDayOfMonth) as _}
                            <div class="day empty"></div>
                        {/each}
                        
                        {#each calendarDays as day}
                            <div class="day {day.games.length > 0 ? 'has-games' : ''}">
                                <span class="day-number">{day.day}</span>
                                {#if day.games.length > 0}
                                    <div class="game-dots">
                                        {#each day.games as game}
                                            <div class="dot" title="{game.game_name}"></div>
                                        {/each}
                                    </div>
                                    <div class="game-count">{day.games.length}게임</div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}

            <section class="record-block">
                <h3>함께한 파트너</h3>
                {#if data.partners.length > 0}
                    <div class="partners-list">
                        {#each data.partners as partner, i (partner.name)}
                            <div class="partner-card">
                                <div class="rank">{i + 1}</div>
                                <div class="info">
                                    <div class="name">{partner.name}</div>
                                    <div class="count">{partner.game_count}게임 함께함</div>
                                </div>
                            </div>
                        {/each}
                    </div>
                {:else}
                    <p class="empty">함께한 파트너 기록이 없습니다.</p>
                {/if}
            </section>

        {:else if activeTab === 'record'}
            <section class="record-block">
                <h3>진행 중 · 예정된 예약</h3>
                {#if data.reservations.length > 0}
                    <ul class="record-list">
                        {#each data.reservations as r (r.id)}
                            <li class="record-row">
                                <span class="record-main">{r.game_name}</span>
                                <span class="record-tag">{RES_STATUS[r.status] ?? r.status}</span>
                                <span class="record-meta">
                                    {r.session_status === 'playing' ? '진행 중' : '예정'} ·
                                    {new Date(r.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 신청
                                </span>
                            </li>
                        {/each}
                    </ul>
                {:else}
                    <p class="empty">지금 걸려 있는 예약이 없습니다.</p>
                {/if}
            </section>

            <section class="record-block">
                <h3>페널티 이력 (현재 {data.attendee.penalty_points}점)</h3>
                {#if data.penaltyLogs.length > 0}
                    <ul class="record-list">
                        {#each data.penaltyLogs as log, i (i)}
                            <li class="record-row">
                                <span class="record-main" class:is-add={log.points > 0}>
                                    {log.points > 0 ? '+1' : '−1'}
                                </span>
                                <span class="record-tag">{PENALTY_REASON[log.reason] ?? log.reason}</span>
                                <span class="record-meta">
                                    적용 후 {log.total_after}점 ·
                                    {new Date(log.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </li>
                        {/each}
                    </ul>
                {:else}
                    <p class="empty">페널티가 적용된 적이 없습니다.</p>
                {/if}
            </section>

        {:else if activeTab === 'visits'}
            <table class="history-table">
                <thead>
                    <tr>
                        <th>날짜</th>
                        <th>입장 시간</th>
                        <th>퇴장 시간</th>
                        <th>체류 시간</th>
                    </tr>
                </thead>
                <tbody>
                    {#each data.visits as visit}
                        <tr>
                            <td>{new Date(visit.arrival_time).toLocaleDateString()}</td>
                            <td>{new Date(visit.arrival_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</td>
                            <td>
                                {#if visit.departure_time}
                                    {new Date(visit.departure_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                                {:else}
                                    <span class="status-badge playing">현재 방문 중</span>
                                {/if}
                            </td>
                            <td>
                                {#if visit.departure_time}
                                    {visit.duration_minutes}분
                                {:else}
                                    -
                                {/if}
                            </td>
                        </tr>
                    {/each}
                    {#if data.visits.length === 0}
                        <tr>
                            <td colspan="4" class="empty">방문 기록이 없습니다.</td>
                        </tr>
                    {/if}
                </tbody>
            </table>

        {:else if activeTab === 'account'}
            <div class="account-section">
                <h3>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:text-bottom;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    비밀번호 변경
                </h3>
                <p class="description">사용자의 비밀번호를 강제로 재설정합니다.</p>
                
                <form method="POST" action="?/resetPassword" use:enhance>
                    <div class="form-group">
                        <label for="newPassword">새 비밀번호</label>
                        <input type="password" id="newPassword" name="newPassword" placeholder="새 비밀번호 입력" required minlength="4" />
                    </div>
                    <button type="submit" class="btn-primary">비밀번호 변경</button>
                </form>
                
                {#if form?.success && !form?.message} <!-- Check message to avoid conflict with season pass success -->
                    <p class="success-msg">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; vertical-align:text-bottom; color:green;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                        비밀번호가 성공적으로 변경되었습니다.
                    </p>
                {:else if form?.error}
                    <p class="error-msg">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; vertical-align:text-bottom; color:red;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                        {form.error}
                    </p>
                {/if}
            </div>

        {:else if activeTab === 'season_pass'}
            <div class="season-pass-section">
                <div class="status-card {activeSeasonPass ? 'active' : 'inactive'}">
                    <h3>정기권 상태</h3>
                    {#if activeSeasonPass}
                        <div class="status-badge active">사용 중</div>
                        <p class="days-left">D-{seasonPassDaysLeft}</p>
                        <p class="date">만료일: {new Date(data.attendee.season_pass_expires_at).toLocaleDateString()}</p>
                    {:else}
                        <div class="status-badge inactive">미보유</div>
                        <p class="description">현재 유효한 정기권이 없습니다.</p>
                    {/if}
                </div>

                <div class="actions-row">
                    {#if activeSeasonPass}
                        <button type="button" class="btn-cancel-pass" onclick={() => (confirmCancelPass = true)}>
                            정기권 취소
                        </button>
                    {/if}

                    <button class="btn-grant" onclick={() => showSeasonPassModal = true}>
                        {activeSeasonPass ? '정기권 연장/재발급' : '정기권 시작'}
                    </button>
                </div>

                {#if activeSeasonPass}
                    <div class="adjust-row">
                        <form method="POST" action="?/adjustSeasonPass" use:enhance={() => {
                            return async ({ result, update }) => {
                                if (result.type === 'success') await update();
                            };
                        }}>
                            <input type="hidden" name="days" value="-1" />
                            <button type="submit" class="btn-adjust minus">-1일</button>
                        </form>
                        <span class="adjust-label">만료일 조정</span>
                        <form method="POST" action="?/adjustSeasonPass" use:enhance={() => {
                            return async ({ result, update }) => {
                                if (result.type === 'success') await update();
                            };
                        }}>
                            <input type="hidden" name="days" value="1" />
                            <button type="submit" class="btn-adjust plus">+1일</button>
                        </form>
                    </div>
                {/if}

                {#if form?.success && form?.message}
                    <p class="success-msg">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; vertical-align:text-bottom; color:green;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                        {form.message}
                    </p>
                {/if}
            </div>
        {/if}
    </div>

    {#if confirmCancelPass}
        <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 Escape(trapFocus)와 돌아가기 버튼이 담당한다. -->
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div class="modal-overlay" onclick={() => (confirmCancelPass = false)} role="presentation">
            <div
                class="modal"
                use:trapFocus={() => (confirmCancelPass = false)}
                onclick={(e) => e.stopPropagation()}
                onkeydown={(e) => e.stopPropagation()}
                role="alertdialog"
                aria-modal="true"
                tabindex="-1"
            >
                <h3>정기권 취소</h3>
                <p>
                    {data.attendee.name}님의 정기권을 취소합니다.
                    남은 {seasonPassDaysLeft}일이 사라지고, 재발급해도 원래 만료일은 돌아오지 않습니다.
                </p>
                <div class="modal-actions">
                    <button type="button" class="btn-cancel" data-autofocus onclick={() => (confirmCancelPass = false)}>
                        돌아가기
                    </button>
                    <form method="POST" action="?/cancelSeasonPass" use:enhance={() => async ({ result, update }) => {
                        if (!reportResult(result)) showToast(`${data.attendee.name}님의 정기권을 취소했습니다.`);
                        confirmCancelPass = false;
                        await update();
                    }}>
                        <button type="submit" class="btn-cancel-pass">정기권 취소</button>
                    </form>
                </div>
            </div>
        </div>
    {/if}

    {#if showSeasonPassModal}
        <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 모달의 Escape(trapFocus)와 닫기 버튼이 담당한다. -->
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div 
            class="modal-overlay" 
            onclick={(e) => { if (e.target === e.currentTarget) showSeasonPassModal = false; }}
            role="button"
            tabindex="-1"
            aria-label="모달 닫기"
        >
            <div class="modal">
                <h3>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:text-bottom;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    정기권 발급
                </h3>
                <p>시작일을 선택하면 30일간 유효한 정기권이 발급됩니다.</p>
                
                <form method="POST" action="?/updateSeasonPass" use:enhance={() => async ({ result, update }) => {
                    if (!reportResult(result)) {
                        showSeasonPassModal = false;
                        showToast(`${data.attendee.name}님의 정기권을 ${seasonPassStartDate}부터 30일간 발급했습니다.`);
                    }
                    await update();
                }}>
                    <div class="form-group">
                        <label for="startDate">시작일 선택</label>
                        <input type="date" id="startDate" name="startDate" bind:value={seasonPassStartDate} required />
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn-cancel" onclick={() => showSeasonPassModal = false}>취소</button>
                        <button type="submit" class="btn-primary">발급하기 (30일)</button>
                    </div>
                </form>
            </div>
        </div>
    {/if}
</div>

<style>
    .tab-count {
        display: inline-block;
        margin-left: 0.3rem;
        padding: 0 0.35rem;
        border-radius: var(--radius-pill, 999px);
        background: var(--color-red-dark, var(--color-red-dark));
        color: var(--bg-primary);
        font-size: var(--text-xs, 0.75rem);
        font-weight: 700;
    }
    .record-block {
        margin-top: var(--space-5, var(--space-5));
    }
    .record-block:first-child {
        margin-top: 0;
    }
    .record-block h3 {
        font-size: var(--text-base, 1rem);
        margin: 0 0 var(--space-3, var(--space-3));
    }
    .record-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-2, var(--space-2));
    }
    .record-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--space-2, var(--space-2));
        padding: var(--space-3, var(--space-3));
        border: 1px solid var(--border-light, var(--border-light));
        border-radius: var(--radius-control, 6px);
    }
    .record-main {
        font-weight: 600;
        font-variant-numeric: tabular-nums;
    }
    .record-main.is-add {
        color: var(--color-red-dark, var(--color-red-dark));
    }
    .record-tag {
        font-size: var(--text-xs, 0.75rem);
        font-weight: 600;
        padding: 0.1rem 0.45rem;
        border-radius: var(--radius-control, 6px);
        background: var(--bg-hover, var(--bg-hover));
        color: var(--text-dark, var(--text-dark));
    }
    .record-meta {
        font-size: var(--text-xs, 0.75rem);
        color: var(--text-secondary, var(--text-secondary));
        font-variant-numeric: tabular-nums;
    }

    /* ... existing styles ... */
    
    /* Season Pass Styles */
    .season-pass-section {
        max-width: 500px;
        margin: 0 auto;
        text-align: center;
    }
    .status-card {
        padding: var(--space-6);
        border-radius: var(--radius-card);
        background: white;
        border: 1px solid var(--border-light);
        margin-bottom: var(--space-6);
        box-shadow: 0 4px 6px rgba(0,0,0,0.05);
    }
    .status-card.active {
        border-color: #2196f3;
        background: #e3f2fd;
    }
    .status-badge {
        display: inline-block;
        padding: var(--space-2) var(--space-4);
        border-radius: var(--radius-card);
        font-weight: bold;
        margin-bottom: var(--space-4);
    }
    .status-badge.active {
        background: #2196f3;
        color: white;
    }
    .status-badge.inactive {
        background: #9e9e9e;
        color: white;
    }
    .days-left {
        font-size: 2.5rem;
        font-weight: bold;
        color: #1976d2;
        margin: var(--space-2) 0;
    }
    .date {
        color: var(--text-secondary);
    }
    
    .actions-row {
        display: flex;
        gap: var(--space-4);
        justify-content: center;
    }

    .btn-grant {
        padding: var(--space-4) var(--space-6);
        font-size: var(--text-lg);
        font-weight: bold;
        color: white;
        background: #4caf50;
        border: none;
        border-radius: var(--radius-control);
        cursor: pointer;
        flex: 1; /* Equal width */
        transition: background 0.2s;
    }
    .btn-grant:hover {
        background: #388e3c;
    }

    .btn-cancel-pass {
        padding: var(--space-4) var(--space-6);
        font-size: var(--text-lg);
        font-weight: bold;
        color: white;
        background: #f44336;
        border: none;
        border-radius: var(--radius-control);
        cursor: pointer;
        flex: 1; /* Equal width */
        transition: background 0.2s;
    }
    .btn-cancel-pass:hover {
        background: var(--color-red-dark);
    }

    .adjust-row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-4);
        margin-top: var(--space-4);
    }
    .adjust-label {
        font-size: var(--text-sm);
        color: var(--text-secondary);
    }
    .btn-adjust {
        width: 60px;
        height: 40px;
        font-size: var(--text-base);
        font-weight: bold;
        border: 1px solid var(--border-default);
        border-radius: var(--radius-control);
        cursor: pointer;
        transition: all 0.2s;
    }
    .btn-adjust.plus {
        background: #e3f2fd;
        color: #1976d2;
    }
    .btn-adjust.plus:hover {
        background: #bbdefb;
    }
    .btn-adjust.minus {
        background: #fce4ec;
        color: #c62828;
    }
    .btn-adjust.minus:hover {
        background: #f8bbd0;
    }

    /* Modal Styles */
    .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }
    .modal {
        background: white;
        padding: var(--space-6);
        border-radius: var(--radius-card);
        width: 90%;
        max-width: 400px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .modal h3 {
        margin-top: 0;
    }
    .modal-actions {
        display: flex;
        gap: var(--space-4);
        margin-top: var(--space-6);
    }
    .btn-cancel {
        flex: 1;
        padding: var(--space-3);
        border: 1px solid var(--border-default);
        background: white;
        border-radius: var(--radius-control);
        cursor: pointer;
    }
    .btn-cancel:hover {
        background: var(--bg-surface);
    }

    .header {
        margin-bottom: var(--space-6);
    }
    .back-link {
        text-decoration: none;
        color: var(--text-secondary);
        font-size: var(--text-sm);
        display: inline-block;
        margin-bottom: var(--space-4);
    }
    .stats {
        display: flex;
        gap: var(--space-4);
        margin-top: var(--space-4);
    }
    .stat-card {
        background: var(--bg-surface);
        padding: var(--space-4);
        border-radius: var(--radius-control);
        flex: 1;
        text-align: center;
    }
    .stat-card .label {
        display: block;
        font-size: var(--text-xs);
        color: var(--text-secondary);
        margin-bottom: var(--space-1);
    }
    .stat-card .value {
        font-size: var(--text-xl);
        font-weight: bold;
        color: var(--text-primary);
    }
    .tabs {
        display: flex;
        border-bottom: 1px solid var(--border-default);
        margin-bottom: var(--space-5);
    }
    .tabs button {
        padding: var(--space-3) var(--space-5);
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        cursor: pointer;
        font-size: var(--text-base);
        color: var(--text-secondary);
    }
    .tabs button.active {
        color: var(--color-blue-bright);
        border-bottom-color: var(--color-blue-bright);
        font-weight: bold;
    }
    .view-controls {
        display: flex;
        gap: var(--space-2);
        margin-bottom: var(--space-4);
        justify-content: flex-end;
    }
    .view-controls button {
        padding: var(--space-1) var(--space-3);
        background: var(--border-light);
        border: none;
        border-radius: var(--radius-control);
        cursor: pointer;
        font-size: var(--text-sm);
    }
    .view-controls button.active {
        background: var(--color-blue-bright);
        color: white;
    }
    .history-table {
        width: 100%;
        border-collapse: collapse;
    }
    .history-table th, .history-table td {
        padding: var(--space-3);
        text-align: left;
        border-bottom: 1px solid var(--border-light);
    }
    .history-table th {
        background: #f9f9f9;
        font-weight: 600;
    }
    .status-badge {
        padding: var(--space-1) var(--space-2);
        border-radius: var(--radius-card);
        font-size: var(--text-xs);
    }
    .status-badge.playing {
        background: #e3f2fd;
        color: #1976d2;
    }
    .status-badge.finished {
        background: var(--border-light);
        color: var(--text-secondary);
    }
    
    /* Calendar Styles */
    .calendar-view {
        border: 1px solid var(--border-light);
        border-radius: var(--radius-control);
        padding: var(--space-4);
    }
    .calendar-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-4);
    }
    .calendar-header button {
        background: none;
        border: 1px solid var(--border-default);
        border-radius: var(--radius-control);
        padding: var(--space-1) var(--space-3);
        cursor: pointer;
    }
    .calendar-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: var(--space-2);
    }
    .weekday {
        text-align: center;
        font-weight: bold;
        color: var(--text-secondary);
        padding-bottom: var(--space-2);
    }
    .day {
        border: 1px solid var(--border-light);
        border-radius: var(--radius-control);
        min-height: 80px;
        padding: var(--space-1);
        position: relative;
    }
    .day.empty {
        background: #fafafa;
        border: none;
    }
    .day.has-games {
        background: #e3f2fd;
        border-color: #90caf9;
    }
    .day-number {
        font-size: var(--text-xs);
        color: var(--text-secondary);
        position: absolute;
        top: 4px;
        left: 4px;
    }
    .game-dots {
        display: flex;
        gap: 2px;
        margin-top: 1.2rem;
        flex-wrap: wrap;
    }
    .dot {
        width: 6px;
        height: 6px;
        background: #1976d2;
        border-radius: 50%;
    }
    .game-count {
        font-size: var(--text-xs);
        color: #1976d2;
        margin-top: var(--space-1);
        text-align: center;
    }

    /* Partners Styles */
    .partners-list {
        display: grid;
        gap: var(--space-4);
    }
    .partner-card {
        display: flex;
        align-items: center;
        padding: var(--space-4);
        background: white;
        border: 1px solid var(--border-light);
        border-radius: var(--radius-control);
    }
    .rank {
        width: 30px;
        height: 30px;
        background: var(--text-primary);
        color: white;
        border-radius: 50%;
        display: flex;
        justify-content: center;
        align-items: center;
        font-weight: bold;
        margin-right: var(--space-4);
    }
    .partner-card:nth-child(1) .rank { background: #ffd700; color: var(--text-primary); }
    .partner-card:nth-child(2) .rank { background: #c0c0c0; color: var(--text-primary); }
    .partner-card:nth-child(3) .rank { background: #cd7f32; color: white; }
    
    .info .name {
        font-weight: bold;
        font-size: var(--text-lg);
    }
    .info .count {
        color: var(--text-secondary);
        font-size: var(--text-sm);
    }
    .empty {
        text-align: center;
        color: var(--text-muted);
        padding: var(--space-6);
    }

    /* Account Section */
    .account-section {
        max-width: 400px;
        margin: 0 auto;
        padding: var(--space-6);
        background: white;
        border-radius: var(--radius-control);
        border: 1px solid var(--border-light);
        text-align: center;
    }
    .account-section h3 {
        margin-bottom: var(--space-2);
    }
    .account-section .description {
        color: var(--text-secondary);
        margin-bottom: var(--space-6);
        font-size: var(--text-sm);
    }
    .form-group {
        text-align: left;
        margin-bottom: var(--space-5);
    }
    .form-group label {
        display: block;
        margin-bottom: var(--space-2);
        font-weight: bold;
        color: var(--text-darker);
    }
    .form-group input {
        width: 100%;
        padding: var(--space-3);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-control);
        font-size: var(--text-base);
        box-sizing: border-box;
    }
    .btn-primary {
        width: 100%;
        padding: var(--space-3);
        background: var(--color-blue-bright);
        color: white;
        border: none;
        border-radius: var(--radius-control);
        font-weight: bold;
        cursor: pointer;
        font-size: var(--text-base);
    }
    .btn-primary:hover {
        background: #0056b3;
    }
    .success-msg {
        color: #2e7d32;
        margin-top: var(--space-4);
        font-weight: bold;
    }
    .error-msg {
        color: var(--color-red-dark);
        margin-top: var(--space-4);
        font-weight: bold;
    }
</style>
