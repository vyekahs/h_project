<script lang="ts">
    import { enhance } from '$app/forms';
    import { trapFocus } from '$lib/actions/modal';
    // 결과 알림은 레이아웃의 <AdminFeedback />가 렌더한다
    import { showAlert, showToast, toastUndoable, reportResult } from '$lib/stores/adminFeedback';
    import { computePassPeriod, formatKstDate } from '$lib/passPeriod';
    import RecentActions from '$lib/components/admin/RecentActions.svelte';

    let { data }: { data: any } = $props();

    const today = () => new Date().toISOString().split('T')[0];

    /* ── 발급 ── */
    let showGrantModal = $state(false);
    let grantUserId = $state('');
    let grantStart = $state(today());
    let grantNote = $state('');

    /* 사유 마스터는 조정 전용이다. 발급 사유(신규/재발급)는 서버가 붙인다. */
    const adjustReasons = $derived(data.reasons ?? []);

    /*
        발급 전에 만료일을 보여준다. 예전에는 「30일간 유효」라고만 말했는데
        실제로는 월·화 보정으로 최대 32일이 됐고, 누르기 전에는 알 수 없었다.
        서버와 같은 함수를 쓰므로 규칙이 두 벌이 되지 않는다.
    */
    const grantPreview = $derived(computePassPeriod(grantStart));
    const grantTarget = $derived(
        (data.allUsers ?? []).find((u: any) => String(u.id) === grantUserId) ?? null
    );
    /*
        쓰고 있는 정기권이 있으면 그 만료일 다음날부터 시작한다.

        예전에는 오늘부터 다시 계산해 덮어썼고, 남은 일수가 조용히 사라졌다.
        그걸 이력에 적어 두는 것으로는 아무것도 해결되지 않는다 — 사라진 건
        사라진 것이다. 이어 붙이면 잃는 날이 없다. 시작일은 그대로 고칠 수
        있고, 고쳐서 줄어들면 아래에서 그만큼 줄어든다고 말한다.
    */
    const activeUntil = $derived(
        grantTarget?.season_pass_expires_at && !isExpired(grantTarget.season_pass_expires_at)
            ? grantTarget.season_pass_expires_at
            : null
    );
    function nextDayOf(ts: string): string {
        const d = new Date(ts);
        d.setDate(d.getDate() + 1);
        return d.toISOString().split('T')[0];
    }
    /* 이어 붙일 자리를 시작일에 채운다. 회원을 바꾸면 따라온다. */
    $effect(() => {
        grantStart = activeUntil ? nextDayOf(activeUntil) : today();
    });
    /*
        잃는 날의 기준은 「지금 만료일」이 아니라 「이어 붙였을 때의 만료일」이다.

        오늘부터 30일을 새로 끊으면 결과 만료일은 지금 만료일보다 뒤에 있어서
        「짧아지지 않았다」로 보인다. 그런데 남아 있던 13일은 그냥 흡수돼 사라진다.
        그 13일이 여기서 세야 할 손실이다.
    */
    const continuation = $derived(activeUntil ? computePassPeriod(nextDayOf(String(activeUntil))) : null);
    const grantShortens = $derived.by(() => {
        if (!continuation || !grantPreview) return 0;
        const diff = Math.round(
            (continuation.expiresAt.getTime() - grantPreview.expiresAt.getTime()) / 86_400_000
        );
        return diff > 0 ? diff : 0;
    });

    function openGrant(preselectId?: number) {
        grantUserId = preselectId ? String(preselectId) : '';
        grantStart = today();
        grantNote = '';
        showGrantModal = true;
    }

    /* ── 조정 · 해지 시트 ── */
    /*
        조정은 두 번 누르면 끝난다 — 카드에서 일수를 정하는 버튼(−1 · +1 · +30일),
        시트에서 사유. 사유 표가 일수를 들지 않는 이유가 여기 있다. 며칠인지는
        이미 첫 번째 누름이 말했고, 사유는 「왜」만 답한다.
    */
    type Sheet = { holder: any; days: number };
    let sheet: Sheet | null = $state(null);

    function openAdjust(holder: any, days: number) {
        sheet = { holder, days };
    }

    /* ── 조정 사유 관리 (모달) ── */
    let showReasons = $state(false);
    let newReasonLabel = $state('');

    /* ── 이력 ── */
    let openLogFor = $state<number | null>(null);
    const logsByAttendee = $derived.by(() => {
        const m = new Map<number, any[]>();
        for (const l of data.logs ?? []) {
            const k = Number(l.attendee_id);
            if (!m.has(k)) m.set(k, []);
            m.get(k)!.push(l);
        }
        return m;
    });

    function getDaysLeft(expiresAt: string): number {
        return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
    }
    function isExpired(expiresAt: string): boolean {
        return new Date(expiresAt) < new Date();
    }
    const DOW = ['일', '월', '화', '수', '목', '금', '토'];
    /* 결정이 일어나는 날짜라 요일까지 — 「9월 12일(토)」 */
    function formatDate(dateStr: string): string {
        const d = new Date(dateStr);
        return `${d.getMonth() + 1}월 ${d.getDate()}일(${DOW[d.getDay()]})`;
    }
    /* formatKstDate 의 긴 형태 — 결정이 일어나는 모달에서는 카드와 같은 말투로 */
    function formatKstLong(iso: string): string {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
        if (!m) return iso;
        const [, y, mo, d] = m;
        const dow = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).getUTCDay();
        return `${Number(mo)}월 ${Number(d)}일(${DOW[dow]})`;
    }
    /* 지나간 날짜는 촘촘한 목록에 들어가므로 더 짧게 */
    function shortDay(dateStr: string): string {
        const d = new Date(dateStr);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    }
    /* 조정 시트가 「언제까지가 되는지」를 말하려면 결과 날짜가 필요하다 */
    function shiftDays(dateStr: string, days: number): string {
        const d = new Date(dateStr);
        d.setDate(d.getDate() + days);
        return d.toISOString();
    }
    function daysSince(dateStr: string): number {
        return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000));
    }
    function shortDate(dateStr: string | null): string {
        if (!dateStr) return '없음';
        const d = new Date(dateStr);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    }
    const ACTION_LABEL: Record<string, string> = { grant: '발급', adjust: '조정', cancel: '해지' };

    /* 사용 중은 곧 끝나는 순 — 손이 가야 할 것이 위에 온다 */
    const activeHolders = $derived(
        (data.passHolders ?? [])
            .filter((h: any) => !isExpired(h.season_pass_expires_at))
            .sort((a: any, b: any) =>
                new Date(a.season_pass_expires_at).getTime() - new Date(b.season_pass_expires_at).getTime())
    );
    /*
        만료됨은 최근에 끝난 순. 재발급 이야기가 오갈 만한 사람이 위에 온다.

        예전에는 오래된 것부터 쌓여 목록이 길어졌고, 그걸 치우려고 만료일을
        지우는 버튼을 뒀었다. 목록이 긴 것은 목록에서 풀 일이지 데이터를
        지워서 풀 일이 아니다 — 정렬과 접기로 대신한다.
    */
    const expiredHolders = $derived(
        (data.passHolders ?? [])
            .filter((h: any) => isExpired(h.season_pass_expires_at))
            .sort((a: any, b: any) =>
                new Date(b.season_pass_expires_at).getTime() - new Date(a.season_pass_expires_at).getTime())
    );
    /*
        이 페이지는 목록만 있어서, 「누가 곧 끝나나」를 알려면 열 줄을 다 읽어야
        했다. 대시보드가 방 현황에 쓰는 스트립을 그대로 가져와 먼저 답한다.
    */
    const SOON_DAYS = 7;
    const soonCount = $derived(
        activeHolders.filter((h: any) => getDaysLeft(h.season_pass_expires_at) <= SOON_DAYS).length
    );

    const EXPIRED_PAGE = 5;
    let expiredShown = $state(EXPIRED_PAGE);
    const expiredVisible = $derived(expiredHolders.slice(0, expiredShown));

    /** 조치 결과를 되돌리기 토스트로 알리고 시트를 닫는다 */
    function handled(closeSheet: boolean, message: (d: any) => string) {
        return async ({ result, update }: any) => {
            if (!reportResult(result)) {
                const d = (result as any)?.data ?? {};
                toastUndoable(message(d), d.undo);
                if (closeSheet) { sheet = null; showGrantModal = false; }
            }
            await update();
        };
    }
</script>

<div class="page">
    <div class="page-header">
        <h1>정기권 관리</h1>
        <button class="btn-primary" onclick={() => openGrant()}>+ 정기권 발급</button>
    </div>

    <section class="pass-summary" aria-label="정기권 현황 요약">
        <div class="ps-stat">
            <span class="ps-label">사용 중</span>
            <span class="ps-value">{activeHolders.length}<span class="ps-unit">명</span></span>
        </div>
        <!-- 0 은 좋은 소식이다. 주황은 챙길 사람이 있을 때만 켠다. -->
        <div class="ps-stat" class:ps-stat-soon={soonCount > 0}>
            <span class="ps-label">{SOON_DAYS}일 안에 만료</span>
            {#if soonCount === 0}
                <span class="ps-value ps-value-none">없음</span>
            {:else}
                <span class="ps-value">{soonCount}<span class="ps-unit">명</span></span>
            {/if}
        </div>
        <div class="ps-stat">
            <span class="ps-label">만료됨</span>
            <span class="ps-value">{expiredHolders.length}<span class="ps-unit">명</span></span>
        </div>
    </section>

    <!-- 서버 되돌리기 창은 10분인데 토스트는 30초다. 나머지를 이 패널이 든다. -->
    <RecentActions />

    <section class="section">
        <div class="section-head">
            <h2>사용 중 ({activeHolders.length})</h2>
            <button type="button" class="btn-mini" onclick={() => (showReasons = true)}>조정 사유 관리</button>
        </div>
        {#if activeHolders.length === 0}
            <p class="empty">정기권 사용 중인 회원이 없습니다.</p>
        {:else}
            <div class="card-list">
                {#each activeHolders as holder (holder.id)}
                    {@const days = getDaysLeft(holder.season_pass_expires_at)}
                    {@const logs = logsByAttendee.get(Number(holder.id)) ?? []}
                    <div class="pass-card">
                        <div class="pass-row">
                            <div class="pass-info">
                                <a href="/admin/attendees/{holder.id}" class="pass-name">{holder.name}</a>
                                <span class="pass-expiry">
                                    {formatDate(holder.season_pass_expires_at)}까지
                                    <span class="days-badge" class:urgent={days <= 7}>D-{days}</span>
                                </span>
                            </div>
                            <div class="pass-actions">
                                <button type="button" class="btn-sm" onclick={() => openAdjust(holder, -1)}>−1</button>
                                <button type="button" class="btn-sm" onclick={() => openAdjust(holder, 1)}>+1</button>
                                <button type="button" class="btn-sm" onclick={() => openAdjust(holder, 30)}>+30일</button>
                            </div>
                            {@render logToggle(holder, logs)}
                        </div>
                        {#if openLogFor === holder.id}
                            {@render logList(logs)}
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}
    </section>

    {#if expiredHolders.length > 0}
        <section class="section">
            <h2>만료됨 ({expiredHolders.length})</h2>
            <!--
                만료는 참고이지 결정이 아니다. 사용 중과 같은 카드로 세웠더니 7건이
                3건보다 화면을 두 배 넘게 먹었다. 한 줄 행으로 눕힌다 — 「만료」
                배지도 뺐다. 「만료됨」 섹션 안에서 그 말은 이미 나왔다.
            -->
            <ul class="expired-list">
                {#each expiredVisible as holder (holder.id)}
                    {@const logs = logsByAttendee.get(Number(holder.id)) ?? []}
                    <li class="expired-row">
                        <div class="expired-main">
                            <a href="/admin/attendees/{holder.id}" class="pass-name">{holder.name}</a>
                            <span class="expired-when">{shortDay(holder.season_pass_expires_at)} 만료 · {daysSince(holder.season_pass_expires_at)}일 지남</span>
                            <button type="button" class="btn-sm" onclick={() => openGrant(holder.id)}>재발급</button>
                            {@render logToggle(holder, logs)}
                        </div>
                        {#if openLogFor === holder.id}
                            {@render logList(logs)}
                        {/if}
                    </li>
                {/each}
            </ul>
            {#if expiredHolders.length > expiredShown}
                <button type="button" class="show-more" onclick={() => (expiredShown += EXPIRED_PAGE)}>
                    +{expiredHolders.length - expiredShown}건 더 보기
                </button>
            {:else if expiredShown > EXPIRED_PAGE}
                <button type="button" class="show-more" onclick={() => (expiredShown = EXPIRED_PAGE)}>접기</button>
            {/if}
        </section>
    {/if}

</div>

<!--
    이력 토글. 예전에는 53×24px 글자 버튼에 「▼」 글리프였다 — 탭 타깃도 모자라고,
    이 콘솔의 아이콘은 전부 그려진 SVG 다.
-->
{#snippet logToggle(holder: any, logs: any[])}
    {@const open = openLogFor === holder.id}
    <button
        type="button"
        class="log-toggle"
        aria-expanded={open}
        onclick={() => (openLogFor = open ? null : holder.id)}
    >
        <svg class="chev" class:is-open={open} aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        이력{#if logs.length > 0}<span class="log-count">{logs.length}</span>{/if}
        <span class="sr-only"> — {holder.name}</span>
    </button>
{/snippet}

{#snippet logList(logs: any[])}
    {#if logs.length === 0}
        <p class="log-empty">이 정기권에 남은 이력이 없습니다.</p>
    {:else}
        <ul class="log-list">
            {#each logs as l (l.id)}
                <li>
                    <span class="log-head">
                        <b>{ACTION_LABEL[l.action] ?? l.action}</b>
                        {l.reason_label}
                        {#if l.days}<em>{l.days > 0 ? '+' : ''}{l.days}일</em>{/if}
                    </span>
                    <span class="log-meta">
                        {shortDate(l.expires_before)} → {shortDate(l.expires_after)} ·
                        {shortDay(l.created_at)} {l.actor}
                    </span>
                    {#if l.note}<span class="log-note">{l.note}</span>{/if}
                </li>
            {/each}
        </ul>
    {/if}
{/snippet}

{#if showGrantModal}
    <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 Escape(trapFocus)와 취소 버튼이 담당한다. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal-backdrop" onclick={() => (showGrantModal = false)} role="presentation">
        <div class="modal-content" use:trapFocus={() => (showGrantModal = false)} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="dlg-grant" tabindex="-1">
            <h3 id="dlg-grant">정기권 발급</h3>
            <form method="POST" action="?/grantPass" use:enhance={() => handled(true, (d) => `정기권 발급 · ${d.expiresDate ? formatKstDate(d.expiresDate) : ''}까지`)}>
                <div class="form-group">
                    <label for="attendeeId">회원 선택</label>
                    <select name="attendeeId" id="attendeeId" bind:value={grantUserId} required>
                        <option value="">선택하세요</option>
                        {#each (data.allUsers ?? []) as user (user.id)}
                            <option value={String(user.id)}>
                                {user.name}{#if user.season_pass_expires_at && !isExpired(user.season_pass_expires_at)}{' · 사용 중 D-' + getDaysLeft(user.season_pass_expires_at)}{/if}
                            </option>
                        {/each}
                    </select>
                </div>
                <div class="form-group">
                    <label for="startDate">시작일</label>
                    <input type="date" id="startDate" name="startDate" bind:value={grantStart} required />
                </div>
                <div class="form-group">
                    <label for="grantNote">메모 (선택)</label>
                    <input type="text" id="grantNote" name="note" bind:value={grantNote} maxlength="120" placeholder="남길 말이 있으면" />
                </div>

                {#if grantPreview}
                    <p class="preview">
                        <b>{formatKstLong(grantPreview.expiresDate)} 23:59까지 · {grantPreview.totalDays}일</b>
                        {#if activeUntil}
                            <span class="preview-why">
                                쓰고 있는 정기권({formatKstDate(String(activeUntil))} 만료) 다음날부터 이어 붙입니다.
                            </span>
                        {/if}
                        <!-- 밀린 이유는 하나로 뭉치지 않는다. 월요일과 화요일은 다른 이유다. -->
                        {#each grantPreview.shifts as sh (sh.from)}
                            <span class="preview-why">만료일 {formatKstDate(sh.from)}은 {sh.reason} +{sh.days}일</span>
                        {/each}
                    </p>
                {/if}
                {#if grantShortens > 0}
                    <p class="warn">
                        이어 붙였을 때보다 <b>{grantShortens}일 짧습니다</b> — 남아 있던 날이 그만큼 흡수됩니다.
                        그대로 이어 붙이려면 시작일을 {formatKstDate(nextDayOf(String(activeUntil)))}로 두세요.
                    </p>
                {/if}

                <div class="modal-actions">
                    <button type="button" class="btn-secondary" onclick={() => (showGrantModal = false)}>취소</button>
                    <button type="submit" class="btn-primary">발급하기</button>
                </div>
            </form>
        </div>
    </div>
{/if}

{#if showReasons}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal-backdrop" onclick={() => (showReasons = false)} role="presentation">
        <div class="modal-content" use:trapFocus={() => (showReasons = false)} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="dlg-reasons" tabindex="-1">
            <h3 id="dlg-reasons">조정 사유 관리</h3>
            <p class="reason-help">
                한 번 등록해두면 여러 사람에게 같은 사유로 쓸 수 있습니다. 며칠을 조정할지는
                카드의 버튼이 정하므로 여기는 문구만 답니다. 지워도 지난 이력의 문구는 그대로 남습니다.
            </p>
            {#if adjustReasons.length === 0}
                <p class="empty">등록된 사유가 없습니다. 아래에서 추가하세요.</p>
            {:else}
                <ul class="reason-list">
                    {#each adjustReasons as r (r.id)}
                        <li>
                            <span>{r.label}</span>
                            <form method="POST" action="?/deleteReason" use:enhance={() => async ({ result, update }: any) => {
                                if (!reportResult(result)) showToast(`「${r.label}」을(를) 지웠습니다.`);
                                await update();
                            }}>
                                <input type="hidden" name="reasonId" value={r.id} />
                                <button type="submit" class="btn-mini btn-danger">삭제</button>
                            </form>
                        </li>
                    {/each}
                </ul>
            {/if}
            <form method="POST" action="?/addReason" class="reason-add" use:enhance={() => async ({ result, update }: any) => {
                if (!reportResult(result)) { showToast('사유를 추가했습니다.'); newReasonLabel = ''; }
                await update();
            }}>
                <input type="text" name="label" bind:value={newReasonLabel} placeholder="사유 (예: 9/3 정전 휴무 보상)" maxlength="60" required />
                <button type="submit" class="btn-mini">추가</button>
            </form>
            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick={() => (showReasons = false)}>닫기</button>
            </div>
        </div>
    </div>
{/if}

{#if sheet}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal-backdrop" onclick={() => (sheet = null)} role="presentation">
        <div class="modal-content" use:trapFocus={() => (sheet = null)} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="dlg-sheet" tabindex="-1">
            <h3 id="dlg-sheet">
                {sheet.holder.name}님 정기권 <b class="sheet-days">{sheet.days > 0 ? '+' : ''}{sheet.days}일</b>
            </h3>
            <p class="sheet-change">
                {formatDate(sheet.holder.season_pass_expires_at)} → <b>{formatDate(shiftDays(sheet.holder.season_pass_expires_at, sheet.days))}</b>
            </p>
            <p class="sheet-sub">사유를 고르면 바로 적용됩니다. 되돌릴 수 있습니다.</p>

            {#if adjustReasons.length === 0}
                <p class="empty">등록된 조정 사유가 없습니다 — 「조정 사유 관리」에서 먼저 추가하세요.</p>
            {:else}
                <ul class="reason-pick">
                    {#each adjustReasons as r (r.id)}
                        <li>
                            <!-- 사유 하나가 곧 폼 하나다. 고르는 일과 누르는 일을 나누지 않는다. -->
                            <form method="POST" action="?/adjustPass" use:enhance={() => handled(true, () => `정기권 ${sheet!.days > 0 ? '+' : ''}${sheet!.days}일 · ${r.label}`)}>
                                <input type="hidden" name="attendeeId" value={sheet.holder.id} />
                                <input type="hidden" name="days" value={sheet.days} />
                                <input type="hidden" name="reasonId" value={r.id} />
                                <button type="submit" class="reason-pick-btn">{r.label}</button>
                            </form>
                        </li>
                    {/each}
                </ul>
            {/if}

            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick={() => (sheet = null)}>취소</button>
            </div>
        </div>
    </div>
{/if}

<style>
    /*
        800px 에서는 이름과 버튼 사이가 500px 협곡이었다. 이 페이지가 든 것은
        한 줄짜리 목록 하나뿐이라 넓을 이유가 없다 — 폭을 좁혀 양 끝을 당긴다.
    */
    .page { max-width: 44rem; }
    .page-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--space-2);
        margin-bottom: var(--space-6);
    }
    .page-header h1 { margin: 0; font-size: var(--text-xl); }

    /*
        이 콘솔의 섹션은 전부 흰 카드 안에 제목을 넣는다(대시보드·통계).
        이 페이지만 회색 바탕에 맨 h2 와 목록을 얹고 있어서, 같은 콘솔인데
        혼자 초안처럼 보였다. 통계의 .findings 와 같은 틀을 쓴다.
    */
    .section {
        margin-bottom: var(--space-5);
        padding: var(--space-5);
        background: var(--bg-primary);
        /* 경계는 하나로만 — 테두리 아래 그림자를 겹치면 유령 카드가 된다 */
        border: 1px solid var(--border-default);
        border-radius: var(--radius-card);
    }
    .section-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: var(--space-2);
        margin-bottom: var(--space-4);
    }
    .section-head h2 { margin: 0; padding: 0; border: none; }
    .section h2 {
        margin: 0 0 var(--space-4);
        font-size: var(--text-lg);
        color: var(--text-darker);
    }

    /* ── 현황 스트립 (대시보드 .room-summary 와 같은 뼈대) ── */
    .pass-summary {
        margin-bottom: var(--space-5);
        padding: var(--space-4) var(--space-5);
        background: var(--bg-primary);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-card);
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--space-4);
    }
    .ps-stat { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
    .ps-label {
        font-size: var(--text-xs);
        font-weight: var(--weight-medium);
        color: var(--text-secondary);
    }
    .ps-value {
        font-size: var(--text-stat);
        font-weight: var(--weight-bold);
        line-height: 1;
        color: var(--text-primary);
        font-variant-numeric: var(--numeric);
    }
    .ps-unit { margin-left: 0.1em; font-size: var(--text-base); font-weight: var(--weight-medium); }
    .ps-value-none { font-size: var(--text-lg); color: var(--text-secondary); }
    .ps-stat-soon .ps-value { color: var(--color-orange-text); }
    .empty { color: var(--text-secondary); font-size: var(--text-sm); }
    /*
        섹션이 카드가 됐으므로 줄마다 다시 테두리를 두르면 흰 카드 위의 흰 카드가
        된다. 만료 목록이 이미 쓰던 방식(실선 구분)으로 두 섹션을 통일한다.
    */
    .card-list { display: flex; flex-direction: column; }
    .pass-card { padding: var(--space-3) 0; }
    .pass-card + .pass-card { border-top: 1px solid var(--border-light); }
    /*
        임박은 배지가 말한다. 카드 전체를 주황 테두리로 물들이면 「이 회원이
        문제다」로 읽히는데, 실제로는 「곧 끝난다」일 뿐이다.
    */
    .pass-row {
        display: grid;
        /* 이름·만료 · 조정 · 이력 — 만료 행과 같은 뼈대 */
        grid-template-columns: minmax(0, 1fr) auto auto;
        align-items: center;
        gap: var(--space-3);
    }
    .pass-info { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
    .pass-name {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        font-weight: var(--weight-medium);
        color: var(--text-primary);
        text-decoration: none;
    }
    .pass-name:hover { text-decoration: underline; }
    .pass-expiry {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap; font-size: var(--text-xs); color: var(--text-secondary); }
    .pass-actions { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }

    .days-badge {
        font-size: var(--text-xs);
        font-variant-numeric: var(--numeric);
        font-weight: var(--weight-medium);
        padding: 0.15rem var(--space-2);
        border-radius: var(--radius-pill);
        background: var(--bg-hover);
        color: var(--text-primary);
    }
    .days-badge.urgent { background: var(--color-warning-bg); color: var(--color-orange-text); }

    .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
    }

    /* ── 만료 목록 ── */
    .expired-list { list-style: none; margin: 0; padding: 0; }
    .expired-row + .expired-row { border-top: 1px solid var(--border-light); }
    .expired-main {
        display: grid;
        /* 이름 · 만료시점 · 재발급 · 이력 — 이름은 제 폭만 쓰고 날짜가 바로 뒤따른다 */
        grid-template-columns: auto minmax(0, 1fr) auto auto;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-2) 0;
    }
    .expired-when {
        justify-self: start;
        font-size: var(--text-xs);
        color: var(--text-secondary);
        font-variant-numeric: var(--numeric);
        white-space: nowrap;
    }

    .btn-sm {
        min-height: 36px;
        padding: 0 var(--space-3);
        background: var(--bg-primary);
        border: 1px solid var(--border-control);
        border-radius: var(--radius-control);
        color: var(--text-primary);
        font-family: inherit;
        font-size: var(--text-xs);
        cursor: pointer;
    }
    .btn-sm:hover { background: var(--bg-secondary); }

    /* 53x24 였다 — 이 콘솔이 지키는 44px 타깃 아래였다 */
    .log-toggle {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        min-height: 44px;
        padding: 0 var(--space-2);
        /* 펼치기는 조정 버튼과 다른 종류의 동작이다 — 붙여 놓으면 네 번째 버튼으로 읽힌다 */
        margin-left: var(--space-2);
        background: none;
        border: none;
        border-radius: var(--radius-control);
        color: var(--text-secondary);
        font-family: inherit;
        font-size: var(--text-xs);
        white-space: nowrap;
        cursor: pointer;
    }
    .log-toggle:hover { background: var(--bg-secondary); color: var(--text-primary); }
    .chev { transition: transform 0.15s; }
    .chev.is-open { transform: rotate(180deg); }
    .log-count {
        font-variant-numeric: var(--numeric);
        padding: 0 0.35em;
        border-radius: var(--radius-pill);
        background: var(--bg-hover);
        color: var(--text-primary);
    }
    @media (prefers-reduced-motion: reduce) { .chev { transition: none; } }

    .log-list {
        list-style: none;
        margin: 0;
        padding: var(--space-3) 0 var(--space-2);
        border-top: 1px solid var(--border-light);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
    }
    .log-list li { display: flex; flex-direction: column; gap: 0.15rem; }
    .log-head { font-size: var(--text-sm); color: var(--text-primary); word-break: keep-all; }
    .log-head b { font-weight: var(--weight-bold); margin-right: 0.35em; }
    .log-head em { font-style: normal; font-variant-numeric: var(--numeric); color: var(--text-secondary); margin-left: 0.35em; }
    .log-meta { font-size: var(--text-xs); color: var(--text-secondary); font-variant-numeric: var(--numeric); }
    .log-note { font-size: var(--text-xs); color: var(--text-secondary); word-break: keep-all; }
    .log-empty { margin: 0; padding: var(--space-2) 0; font-size: var(--text-xs); color: var(--text-secondary); }

    .reason-help { margin: 0 0 var(--space-4); font-size: var(--text-xs); line-height: 1.5; color: var(--text-secondary); word-break: keep-all; }
    .reason-list { list-style: none; margin: 0 0 var(--space-4); padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
    .reason-list li { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); font-size: var(--text-sm); }
    /* 지워도 이력은 남으므로 채움 빨강이 아니라 테두리 빨강 */
    .btn-danger { background: var(--danger-outline-bg); border-color: var(--danger-outline-fg); color: var(--danger-outline-fg); }
    /*
        여백이 아예 없어서 닫기가 추가 버튼에 붙어 있었다. 이 모달은 삭제·삭제·삭제·
        추가가 모두 오른쪽 한 줄에 서므로, 블록 간격(--space-4)만 주면 닫기가 그
        버튼 기둥의 다섯 번째 칸으로 읽힌다. 기둥에서 떼어내려면 한 단 더 필요하다.
    */
    .reason-add { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-5); }
    .reason-add input[type='text'] { flex: 1 1 12rem; min-width: 0; }
    .btn-mini {
        min-height: 36px;
        padding: 0 var(--space-3);
        background: var(--bg-primary);
        border: 1px solid var(--border-control);
        border-radius: var(--radius-control);
        color: var(--text-primary);
        font-family: inherit;
        font-size: var(--text-xs);
        cursor: pointer;
    }
    .btn-mini:hover { background: var(--bg-secondary); }

    .sheet-days { font-variant-numeric: var(--numeric); }
    /* h3 아래 붙는 첫 줄이 위로 당기는 몫을 가져간다 */
    .sheet-change {
        margin: calc(var(--space-4) * -1 + var(--space-1)) 0 var(--space-1);
        font-size: var(--text-sm);
        color: var(--text-secondary);
        font-variant-numeric: var(--numeric);
    }
    .sheet-change b { color: var(--text-primary); }
    .sheet-change + .sheet-sub { margin-top: 0; }
    .sheet-sub { margin: calc(var(--space-4) * -1 + var(--space-1)) 0 var(--space-4); font-size: var(--text-sm); color: var(--text-secondary); }
    .reason-pick { list-style: none; margin: 0 0 var(--space-4); padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
    .reason-pick-btn {
        width: 100%;
        min-height: 48px;
        padding: 0 var(--space-4);
        background: var(--bg-primary);
        border: 1px solid var(--border-control);
        border-radius: var(--radius-control);
        color: var(--text-primary);
        font-family: inherit;
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
        text-align: left;
        cursor: pointer;
    }
    .reason-pick-btn:hover { background: var(--bg-secondary); }


    .show-more {
        width: 100%;
        margin-top: var(--space-2);
        min-height: 44px;
        background: none;
        border: 1px solid var(--border-default);
        border-radius: var(--radius-control);
        color: var(--text-secondary);
        font-family: inherit;
        font-size: var(--text-sm);
        cursor: pointer;
    }
    .show-more:hover { background: var(--bg-secondary); color: var(--text-primary); }

    .modal-backdrop {
        position: fixed;
        inset: 0;
        background: var(--overlay-heavy);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-4);
        z-index: 1000;
    }
    .modal-content {
        width: 100%;
        max-width: 440px;
        padding: var(--space-5);
        background: var(--bg-primary);
        border-radius: var(--radius-card);
        max-height: 90vh;
        max-height: 90dvh;
        overflow-y: auto;
        box-shadow: 0 4px 20px var(--shadow-lg);
    }
    .modal-content h3 { margin: 0 0 var(--space-4); font-size: var(--text-lg); }
    .form-group { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-4); }
    .form-group label { font-size: var(--text-xs); color: var(--text-secondary); }
    .modal-content select,
    .modal-content input[type='text'],
    .modal-content input[type='date'],
    .reason-add input {
        min-height: 44px;
        padding: 0 var(--space-3);
        border: 1px solid var(--border-control);
        border-radius: var(--radius-control);
        background: var(--bg-primary);
        color: var(--text-primary);
        font-family: inherit;
        font-size: var(--text-sm);
        box-sizing: border-box;
    }
    /* datetime 계열은 네이티브 컨트롤이라 고유 최소 폭 아래로 안 줄어든다 */
    .modal-content input[type='date'] { -webkit-appearance: none; appearance: none; min-width: 0; max-width: 100%; }

    .preview {
        margin: 0 0 var(--space-3);
        padding: var(--space-3);
        border-radius: var(--radius-control);
        background: var(--bg-secondary);
        font-size: var(--text-sm);
        color: var(--text-primary);
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        word-break: keep-all;
    }
    .preview b { font-variant-numeric: var(--numeric); }
    .preview-why { font-size: var(--text-xs); color: var(--text-secondary); }
    .warn {
        margin: 0 0 var(--space-3);
        padding: var(--space-3);
        border: 1px solid var(--color-orange-text);
        border-radius: var(--radius-control);
        background: var(--color-warning-bg);
        color: var(--color-orange-text);
        font-size: var(--text-sm);
        word-break: keep-all;
    }

    .modal-actions { display: flex; justify-content: flex-end; gap: var(--space-3); }
    .btn-primary, .btn-secondary {
        min-height: 44px;
        padding: 0 var(--space-4);
        border-radius: var(--radius-control);
        font-family: inherit;
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
        cursor: pointer;
    }
    .btn-primary { background: var(--color-blue-bright); color: white; border: 1px solid transparent; }
    .btn-secondary { background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-control); }

    @media (max-width: 560px) {
        /* 대시보드 스트립과 같은 단계 낮추기 — 세 자리 수가 칸을 넘지 않게 */
        .pass-summary { padding: var(--space-3); gap: var(--space-2); }
        .pass-summary .ps-value { font-size: var(--text-lg); line-height: 1.15; }
        .pass-summary .ps-unit { font-size: var(--text-sm); }
        .ps-value-none { font-size: var(--text-base); }
        .section { padding: var(--space-4); }

        /* 세 칸이 한 줄에 안 들어간다. 이름 줄과 액션 줄로 나눈다. */
        .pass-row { grid-template-columns: minmax(0, 1fr) auto; row-gap: var(--space-2); }
        .pass-info { grid-column: 1 / -1; }
        .pass-actions { grid-column: 1; }
        .pass-row .log-toggle { grid-column: 2; justify-self: end; }
        /* 모바일: 이름 / 만료시점 + 재발급·이력 */
        .expired-main { grid-template-columns: minmax(0, 1fr) auto auto; row-gap: var(--space-1); }
        .expired-row .expired-when { justify-self: start; }
        .expired-row .pass-name { grid-column: 1 / -1; }
        .expired-when { grid-column: 1; }
    }
</style>
