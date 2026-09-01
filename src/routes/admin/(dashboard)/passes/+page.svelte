<script lang="ts">
    import { enhance } from '$app/forms';
    import { trapFocus } from '$lib/actions/modal';

    export let data: any;

    let showGrantModal = false;
    let selectedUserId = '';
    let seasonPassStartDate = new Date().toISOString().split('T')[0];

    let alertVisible = false;
    let alertMessage = '';

    function showAlert(msg: string) {
        alertMessage = msg;
        alertVisible = true;
    }

    /**
     * 파괴적 액션 확인. 정기권 해지/삭제는 되돌릴 수 없고
     * 재발급해도 원래 만료일은 복구되지 않으므로 반드시 한 번 묻는다.
     */
    let confirmState: { title: string; message: string; confirmLabel: string } | null = null;
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

    $: activeHolders = (data.passHolders || []).filter((h: any) => !isExpired(h.season_pass_expires_at));
    $: expiredHolders = (data.passHolders || []).filter((h: any) => isExpired(h.season_pass_expires_at));
</script>

<div class="page">
    <div class="page-header">
        <h1>정기권 관리</h1>
        <button class="btn-primary" on:click={() => { showGrantModal = true; selectedUserId = ''; seasonPassStartDate = new Date().toISOString().split('T')[0]; }}>
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
                                on:submit={(e) =>
                                    askConfirm(
                                        e,
                                        '정기권 해지',
                                        `${holder.name}님의 정기권을 해지합니다. 남은 ${getDaysLeft(holder.season_pass_expires_at)}일이 사라지고, 재발급해도 원래 만료일은 복구되지 않습니다.`,
                                        '해지'
                                    )}
                                use:enhance={() => {
                                    return async ({ result, update }) => {
                                        if (result.type === 'failure') showAlert((result.data as any)?.error || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.');
                                        else showAlert(`${holder.name}님의 정기권을 해지했습니다.`);
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
        on:click={() => showGrantModal = false}
        role="button"
        tabindex="-1"
        aria-label="모달 닫기"
    >
        <div class="modal-content" use:trapFocus={() => (showGrantModal = false)} on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true" tabindex="-1">
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
                    <button type="button" class="btn-secondary" on:click={() => showGrantModal = false}>취소</button>
                    <button type="submit" class="btn-primary">발급하기 (30일)</button>
                </div>
            </form>
        </div>
    </div>
{/if}

{#if confirmState}
    <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 모달의 Escape(trapFocus)와 닫기 버튼이 담당한다. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal-backdrop confirm-layer" on:click={closeConfirm} role="presentation">
        <div
            class="modal-content"
            use:trapFocus={closeConfirm}
            on:click|stopPropagation
            on:keydown|stopPropagation
            role="alertdialog"
            aria-modal="true"
            tabindex="-1"
        >
            <h3>{confirmState.title}</h3>
            <p class="modal-desc">{confirmState.message}</p>
            <div class="modal-actions">
                <button type="button" class="btn-secondary" data-autofocus on:click={closeConfirm}>돌아가기</button>
                <button type="button" class="btn-danger" on:click={runConfirm}>{confirmState.confirmLabel}</button>
            </div>
        </div>
    </div>
{/if}

{#if alertVisible}
    <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 모달의 Escape(trapFocus)와 닫기 버튼이 담당한다. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div 
        class="modal-backdrop" 
        on:click={() => alertVisible = false}
        role="button"
        tabindex="-1"
        aria-label="알림 닫기"
    >
        <div class="modal-content alert-modal" use:trapFocus={() => (alertVisible = false)} on:click|stopPropagation on:keydown|stopPropagation role="alertdialog" aria-modal="true" tabindex="-1">
            <p>{alertMessage}</p>
            <div class="modal-actions">
                <button class="btn-primary" data-autofocus on:click={() => alertVisible = false}>확인</button>
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
        margin-bottom: 2rem;
    }
    .page-header h1 { margin: 0; font-size: 1.5rem; }

    .section { margin-bottom: 2rem; }
    .section h2 {
        font-size: 1.1rem;
        color: #555;
        margin-bottom: 0.75rem;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid #eee;
    }
    .empty { color: #999; font-size: 0.95rem; }

    .card-list { display: flex; flex-direction: column; gap: 0.5rem; }

    .pass-card {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: white;
        padding: 0.75rem 1rem;
        border-radius: 8px;
        border-left: 1px solid #ddd;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .pass-card.warning { border-left-color: #ff9800; }
    .pass-card.expired { border-left-color: #ccc; opacity: 0.7; }

    .pass-info { display: flex; flex-direction: column; gap: 0.2rem; }
    .pass-name {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        font-weight: 600;
        color: #333;
        text-decoration: none;
    }
    .pass-name:hover { text-decoration: underline; }
    .pass-expiry { font-size: 0.8rem; color: #888; }

    .pass-actions { display: flex; align-items: center; gap: 0.5rem; }

    .days-badge {
        background: #e8f5e9;
        color: #2e7d32;
        padding: 0.25rem 0.6rem;
        border-radius: 12px;
        font-weight: 700;
        font-size: 0.85rem;
        min-width: 45px;
        text-align: center;
    }
    .days-badge.urgent { background: #fff3e0; color: #e65100; }
    .expired-badge { background: #f5f5f5; color: #999; }

    .btn-sm {
        padding: 0.3rem 0.6rem;
        border: none;
        border-radius: 4px;
        font-size: 0.8rem;
        cursor: pointer;
        font-weight: 600;
    }
    .btn-minus { background: #fce4ec; color: #c62828; }
    .btn-minus:hover { background: #f8bbd0; }
    .btn-plus { background: #e3f2fd; color: #1976d2; }
    .btn-plus:hover { background: #bbdefb; }
    .btn-extend { background: #e3f2fd; color: #1565c0; }
    .btn-extend:hover { background: #bbdefb; }
    /* 대시보드의 .btn-cancel은 "다이얼로그 닫기"라 같은 이름을 쓰지 않는다 */
    .modal-backdrop.confirm-layer { z-index: 1100; }
    .btn-danger {
        background: var(--color-red-dark, #d32f2f);
        color: #fff;
        border: none;
        padding: 0.6rem 1rem;
        min-height: 44px;
        border-radius: 6px;
        font-weight: 600;
        cursor: pointer;
    }
    .btn-revoke { background: #fce4ec; color: #b71c1c; border: 1px solid #b71c1c; }
    .btn-revoke:hover { background: #ffcdd2; }

    .btn-primary {
        background: #007bff;
        color: white;
        border: none;
        padding: 0.6rem 1.2rem;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
    }
    .btn-secondary {
        background: #f5f5f5;
        color: #333;
        border: 1px solid #ddd;
        padding: 0.6rem 1.2rem;
        border-radius: 6px;
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
        padding: 1.5rem;
        border-radius: 12px;
        width: 90%;
        max-width: 400px;
    }
    .modal-content h3 { margin: 0 0 1rem 0; }
    .alert-modal { text-align: center; }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.75rem;
        margin-top: 1.5rem;
    }

    .form-group { margin-bottom: 1rem; }
    .form-group label {
        display: block;
        margin-bottom: 0.4rem;
        font-weight: 600;
        font-size: 0.9rem;
    }
    .form-group select, .form-group input[type="date"] {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 1rem;
        box-sizing: border-box;
    }
    .modal-desc {
        color: #666;
        font-size: 0.9rem;
        margin: 0 0 1rem 0;
    }

    @media (max-width: 600px) {
        .pass-card { flex-direction: column; align-items: flex-start; gap: 0.5rem; }
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
