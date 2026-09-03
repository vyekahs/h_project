<script lang="ts">
    import { enhance } from '$app/forms';
    import { trapFocus } from '$lib/actions/modal';
    // 결과 알림은 레이아웃의 <AdminFeedback />가 렌더한다
    import { showAlert, showToast } from '$lib/stores/adminFeedback';

    let { data }: { data: any } = $props();

    let showGrantModal = $state(false);
    let selectedUserId = $state('');
    let seasonPassStartDate = $state(new Date().toISOString().split('T')[0]);

    /**
     * 파괴적 액션 확인. 정기권 해지/삭제는 되돌릴 수 없고
     * 재발급해도 원래 만료일은 복구되지 않으므로 반드시 한 번 묻는다.
     */
    let confirmState: { title: string; message: string; confirmLabel: string } | null = $state(null);
    let pendingForm: HTMLFormElement | null = null;

    function askConfirm(e: Event, title: string, message: string, confirmLabel: string) {
        const form = e.currentTarget as HTMLFormElement;
        if (form.dataset.confirmed === 'true') {
            form.dataset.confirmed = '';
            return true;
        }
        e.preventDefault();
        pendingForm = form;
        confirmState = { title, message, confirmLabel };
        return false;
    }

    function runConfirm() {
        if (!pendingForm) return;
        pendingForm.dataset.confirmed = 'true';
        pendingForm.requestSubmit();
        confirmState = null;
        pendingForm = null;
    }

    function closeConfirm() {
        confirmState = null;
        pendingForm = null;
    }

    function getDaysLeft(expiresAt: string): number {
        return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    }

    function isExpired(expiresAt: string): boolean {
        return new Date(expiresAt) < new Date();
    }

    function formatDate(dateStr: string): string {
        return new Date(dateStr).toLocaleDateString('ko-KR', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
    }

    const activeHolders = $derived((data.passHolders || []).filter((h: any) => !isExpired(h.season_pass_expires_at)));
    const expiredHolders = $derived((data.passHolders || []).filter((h: any) => isExpired(h.season_pass_expires_at)));
</script>

<div class="page">
    <div class="page-header">
        <h1>정기권 관리</h1>
        <button class="btn-primary" onclick={() => { showGrantModal = true; selectedUserId = ''; seasonPassStartDate = new Date().toISOString().split('T')[0]; }}>
            + 정기권 발급
        </button>
    </div>

    <section class="section">
        <h2>사용 중 ({activeHolders.length})</h2>
        {#if activeHolders.length === 0}
            <p class="empty">정기권 사용 중인 회원이 없습니다.</p>
        {:else}
            <div class="card-list">
                {#each activeHolders as holder}
                    {@const days = getDaysLeft(holder.season_pass_expires_at)}
                    <div class="pass-card" class:warning={days <= 7}>
                        <div class="pass-info">
                            <a href="/admin/attendees/{holder.id}" class="pass-name">{holder.name}</a>
                            <span class="pass-expiry">~ {formatDate(holder.season_pass_expires_at)}</span>
                        </div>
                        <div class="pass-actions">
                            <span class="days-badge" class:urgent={days <= 3}>
                                D-{days}
                            </span>
                            <form method="POST" action="?/adjustPass" use:enhance={() => {
                                return async ({ result, update }) => {
                                    if (result.type === 'failure') showAlert((result.data as any)?.error || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.');
                                    await update();
                                };
                            }}>
                                <input type="hidden" name="attendeeId" value={holder.id} />
                                <input type="hidden" name="days" value="-1" />
                                <button type="submit" class="btn-sm btn-minus">-1</button>
                            </form>
                            <form method="POST" action="?/adjustPass" use:enhance={() => {
                                return async ({ result, update }) => {
                                    if (result.type === 'failure') showAlert((result.data as any)?.error || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.');
                                    await update();
                                };
                            }}>
                                <input type="hidden" name="attendeeId" value={holder.id} />
                                <input type="hidden" name="days" value="1" />
                                <button type="submit" class="btn-sm btn-plus">+1</button>
                            </form>
                            <form method="POST" action="?/adjustPass" use:enhance={() => {
                                return async ({ result, update }) => {
                                    if (result.type === 'failure') showAlert((result.data as any)?.error || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.');
                                    await update();
                                };
                            }}>
                                <input type="hidden" name="attendeeId" value={holder.id} />
                                <input type="hidden" name="days" value="30" />
                                <button type="submit" class="btn-sm btn-extend">+30일</button>
                            </form>
                            <form
                                method="POST"
                                action="?/cancelPass"
                                onsubmit={(e) =>
                                    askConfirm(
                                        e,
                                        '정기권 해지',
                                        `${holder.name}님의 정기권을 해지합니다. 남은 ${getDaysLeft(holder.season_pass_expires_at)}일이 사라지고, 재발급해도 원래 만료일은 복구되지 않습니다.`,
                                        '해지'
                                    )}
                                use:enhance={() => {
                                    return async ({ result, update }) => {
                                        if (result.type === 'failure') showAlert((result.data as any)?.error || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.');
                                        else showToast(`${holder.name}님의 정기권을 해지했습니다.`);
                                        await update();
                                    };
                                }}
                            >
                                <input type="hidden" name="attendeeId" value={holder.id} />
                                <button type="submit" class="btn-sm btn-revoke">정기권 해지</button>
                            </form>
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </section>

    {#if expiredHolders.length > 0}
        <section class="section">
            <h2>만료됨 ({expiredHolders.length})</h2>
            <div class="card-list">
                {#each expiredHolders as holder}
                    <div class="pass-card expired">
                        <div class="pass-info">
                            <a href="/admin/attendees/{holder.id}" class="pass-name">{holder.name}</a>
                            <span class="pass-expiry">만료: {formatDate(holder.season_pass_expires_at)}</span>
                        </div>
                        <div class="pass-actions">
                            <span class="days-badge expired-badge">만료</span>
                            <form method="POST" action="?/grantPass" use:enhance={() => {
                                return async ({ result, update }) => {
                                    if (result.type === 'failure') showAlert((result.data as any)?.error || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.');
                                    await update();
                                };
                            }}>
                                <input type="hidden" name="attendeeId" value={holder.id} />
                                <input type="hidden" name="startDate" value={new Date().toISOString().split('T')[0]} />
                                <button type="submit" class="btn-sm btn-extend">재발급</button>
                            </form>
                            <form method="POST" action="?/cancelPass" use:enhance={() => {
                                return async ({ result, update }) => {
                                    if (result.type === 'failure') showAlert((result.data as any)?.error || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.');
                                    await update();
                                };
                            }}>
                                <input type="hidden" name="attendeeId" value={holder.id} />
                                <button type="submit" class="btn-sm btn-revoke">기록 삭제</button>
                            </form>
                        </div>
                    </div>
                {/each}
            </div>
        </section>
    {/if}
</div>

{#if showGrantModal}
    <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 모달의 Escape(trapFocus)와 닫기 버튼이 담당한다. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div 
        class="modal-backdrop" 
        onclick={() => showGrantModal = false}
        role="button"
        tabindex="-1"
        aria-label="모달 닫기"
    >
        <div class="modal-content" use:trapFocus={() => (showGrantModal = false)} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
            <h3>정기권 발급</h3>
            <p class="modal-desc">시작일을 선택하면 30일간 유효한 정기권이 발급됩니다.</p>
            <form method="POST" action="?/grantPass" use:enhance={() => {
                return async ({ result, update }) => {
                    if (result.type === 'failure') {
                        showAlert((result.data as any)?.error || '발급 실패');
                    } else {
                        showGrantModal = false;
                    }
                    await update();
                };
            }}>
                <div class="form-group">
                    <label for="attendeeId">회원 선택</label>
                    <select name="attendeeId" id="attendeeId" bind:value={selectedUserId} required>
                        <option value="">선택하세요</option>
                        {#each (data.allUsers || []) as user}
                            <option value={user.id}>{user.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="form-group">
                    <label for="startDate">시작일 선택</label>
                    <input type="date" id="startDate" name="startDate" bind:value={seasonPassStartDate} required />
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn-secondary" onclick={() => showGrantModal = false}>취소</button>
                    <button type="submit" class="btn-primary">발급하기 (30일)</button>
                </div>
            </form>
        </div>
    </div>
{/if}

{#if confirmState}
    <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 모달의 Escape(trapFocus)와 닫기 버튼이 담당한다. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal-backdrop confirm-layer" onclick={closeConfirm} role="presentation">
        <div
            class="modal-content"
            use:trapFocus={closeConfirm}
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            tabindex="-1"
        >
            <h3>{confirmState.title}</h3>
            <p class="modal-desc">{confirmState.message}</p>
            <div class="modal-actions">
                <button type="button" class="btn-secondary" data-autofocus onclick={closeConfirm}>돌아가기</button>
                <button type="button" class="btn-destructive" onclick={runConfirm}>{confirmState.confirmLabel}</button>
            </div>
        </div>
    </div>
{/if}


<style>
    .page { max-width: 800px; }
    .page-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-6);
    }
    .page-header h1 { margin: 0; font-size: var(--text-xl); }

    .section { margin-bottom: var(--space-6); }
    .section h2 {
        font-size: var(--text-lg);
        color: var(--text-darker);
        margin-bottom: var(--space-3);
        padding-bottom: var(--space-2);
        border-bottom: 1px solid var(--border-light);
    }
    .empty { color: var(--text-muted); font-size: var(--text-sm); }

    .card-list { display: flex; flex-direction: column; gap: var(--space-2); }

    .pass-card {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: white;
        padding: var(--space-3) var(--space-4);
        border-radius: var(--radius-control);
        border-left: 1px solid var(--border-default);
    }
    .pass-card.warning { border-left-color: var(--color-orange); }
    .pass-card.expired { border-left-color: var(--border-medium); opacity: 0.7; }

    .pass-info { display: flex; flex-direction: column; gap: 0.2rem; }
    .pass-name {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        font-weight: 600;
        color: var(--text-primary);
        text-decoration: none;
    }
    .pass-name:hover { text-decoration: underline; }
    .pass-expiry { font-size: var(--text-xs); color: var(--text-tertiary); }

    .pass-actions { display: flex; align-items: center; gap: var(--space-2); }

    .days-badge {
        background: var(--color-success-bg);
        color: var(--color-green-dark);
        padding: var(--space-1) 0.6rem;
        border-radius: var(--radius-card);
        font-weight: 700;
        font-size: var(--text-sm);
        min-width: 45px;
        text-align: center;
    }
    .days-badge.urgent { background: var(--color-warning-bg); color: var(--color-orange-text); }
    /* --text-muted(var(--text-muted))는 이 회색 위에서 2.61:1이라 읽히지 않았다 */
    .expired-badge { background: var(--bg-surface); color: var(--text-secondary); }

    .btn-sm {
        padding: 0.3rem 0.6rem;
        border: none;
        border-radius: var(--radius-control);
        font-size: var(--text-xs);
        cursor: pointer;
        font-weight: 600;
    }
    .btn-minus { background: var(--tint-red-bg); color: var(--color-red-darker); }
    .btn-minus:hover { background: var(--tint-red-bg-hover); }
    .btn-plus { background: var(--tint-blue-bg); color: var(--color-blue-bright); }
    .btn-plus:hover { background: var(--tint-blue-bg-hover); }
    .btn-extend { background: var(--tint-blue-bg); color: var(--color-blue-bright); }
    .btn-extend:hover { background: var(--tint-blue-bg-hover); }
    /* 대시보드의 .btn-cancel은 "다이얼로그 닫기"라 같은 이름을 쓰지 않는다 */
    .modal-backdrop.confirm-layer { z-index: 1100; }
    /* 해지는 파괴적이지만 재발급으로 되돌린다 — 2단(테두리 빨강)이다.
       채움 빨강이었을 때는 이 버튼을 부른 .btn-revoke(연한 빨강 테두리)보다
       무거워 보여, 두 번째 화면이 첫 번째보다 심각하다고 말했다. */
    .btn-destructive {
        background: var(--danger-outline-bg);
        color: var(--danger-outline-fg);
        border: 1px solid var(--danger-outline-fg);
        padding: 0.6rem var(--space-4);
        min-height: 44px;
        border-radius: var(--radius-control);
        font-weight: 600;
        cursor: pointer;
    }
    .btn-destructive:hover {
        background: var(--danger-outline-bg-hover);
    }
    .btn-revoke { background: var(--tint-red-bg); color: var(--color-red-darker); border: 1px solid var(--color-red-darker); }
    .btn-revoke:hover { background: var(--tint-red-bg-hover); }

    .btn-primary {
        background: var(--color-blue-bright);
        color: white;
        border: none;
        padding: 0.6rem 1.2rem;
        border-radius: var(--radius-control);
        cursor: pointer;
        font-weight: 600;
    }
    .btn-secondary {
        background: var(--bg-surface);
        color: var(--text-primary);
        border: 1px solid var(--border-default);
        padding: 0.6rem 1.2rem;
        border-radius: var(--radius-control);
        cursor: pointer;
    }

    .modal-backdrop {
        position: fixed; top: 0; left: 0;
        width: 100%; height: 100%;
        background: rgba(0,0,0,0.4);
        display: flex; justify-content: center; align-items: center;
        z-index: 1000;
    }
    .modal-content {
        background: white;
        padding: var(--space-5);
        border-radius: var(--radius-card);
        width: 90%;
        max-width: 400px;
    }
    .modal-content h3 { margin: 0 0 var(--space-4) 0; }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-3);
        margin-top: var(--space-5);
    }

    .form-group { margin-bottom: var(--space-4); }
    .form-group label {
        display: block;
        margin-bottom: 0.4rem;
        font-weight: 600;
        font-size: var(--text-sm);
    }
    .form-group select, .form-group input[type="date"] {
        width: 100%;
        padding: var(--space-2);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-control);
        font-size: var(--text-base);
        box-sizing: border-box;
    }
    .modal-desc {
        color: var(--text-secondary);
        font-size: var(--text-sm);
        margin: 0 0 var(--space-4) 0;
    }

    @media (max-width: 600px) {
        .pass-card { flex-direction: column; align-items: flex-start; gap: var(--space-2); }
        .pass-actions { width: 100%; justify-content: flex-end; }
    }

    /* 폰은 서서 한 손으로 쓰는 주 사용 장면 — 탭 타깃을 44px 아래로 줄이지 않는다 */
    @media (max-width: 768px) {
        button,
        input:not([type='hidden']):not([type='checkbox']),
        select {
            min-height: 44px;
        }
    }
</style>
