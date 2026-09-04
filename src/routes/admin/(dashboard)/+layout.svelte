<script lang="ts">
    import { enhance } from '$app/forms';
    import { page } from '$app/stores';
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import type { LayoutData } from './$types';
    import { trapFocus } from '$lib/actions/modal';
    import AdminFeedback from '$lib/components/admin/AdminFeedback.svelte';
    import { showToast, showAlert as showToastAlert, rememberAction, forgetAction } from '$lib/stores/adminFeedback';
    import { deserialize } from '$app/forms';
    import { invalidateAll } from '$app/navigation';

    let { data, children }: { data: LayoutData; children: any } = $props();

    let closeDayModalVisible = $state(false);
    let openDayModalVisible = $state(false);

    // Alert Modal State
    let alertVisible = $state(false);
    let alertMessage = $state('');

    let originalBg = '';

    onMount(() => {
        originalBg = document.body.style.backgroundColor;
        document.body.style.backgroundColor = '#f5f5f5';
    });

    onDestroy(() => {
        if (browser) {
            document.body.style.backgroundColor = originalBg;
        }
    });

    /*
        마감은 콘솔에서 가장 큰 상태 변화이고, 유일하게 되돌릴 수 없던 것이었다.
        되돌리기는 실릴 자리가 있어야 눌린다 — 성공을 막는 모달로 알리면 그 자리가
        없다. 따뜻한 마무리 문구는 모달이 아니라 말에 있으므로 토스트로 옮긴다.
        대시보드에 있을 때는 「최근 조치」 패널이 나머지 10분을 마저 든다.
    */
    function closeDayUndoable(message: string, undo: { id: number; label: string } | undefined) {
        if (!undo) {
            showToast(message);
            return;
        }
        let recentId = 0;
        const run = async () => {
            forgetAction(recentId);
            const body = new FormData();
            body.set('undoId', String(undo.id));
            try {
                const res = await fetch('/admin?/undoAdminAction', { method: 'POST', body });
                const result: any = deserialize(await res.text());
                if (result?.type === 'failure' || result?.type === 'error') {
                    showToastAlert(result?.data?.error || result?.error?.message || '되돌리지 못했습니다.');
                } else {
                    showToast(`되돌렸습니다 · ${undo.label}`);
                }
            } catch {
                showToastAlert('되돌리지 못했습니다. 네트워크를 확인해주세요.');
            }
            await invalidateAll();
        };
        recentId = rememberAction({ label: undo.label, run });
        showToast(message, { label: '되돌리기', run });
    }

    /*
        페이지가 소유한 모달들은 열릴 때 배경 스크롤을 잠근다. 레이아웃이
        소유한 셋(마감·오픈·알림)은 그러지 않아서, 확인창이 떠 있는데 뒤가
        스크롤됐다 — 무엇을 확인하는 중인지 화면이 흘러가 버린다.
    */
    $effect(() => {
        if (!browser) return;
        const open = closeDayModalVisible || openDayModalVisible || alertVisible;
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    });

    function showAlert(msg: string) {
        alertMessage = msg;
        alertVisible = true;
    }
</script>

<div data-theme="light" class="force-light">
<a class="skip-link" href="#admin-main">본문으로 건너뛰기</a>
<!--
    래퍼 안이어야 한다. 밖에 두면 :global(.force-light :focus-visible) 규칙이
    닿지 않아 되돌리기 버튼의 포커스 링이 브라우저 기본값으로 떨어진다.
    그리고 문서 맨 끝이면 안 된다 — 되돌리기가 포커스 순서 41개 중 41번째라
    30초 안에 키보드로 도달할 수 없었다. position:fixed 라 화면 위치는
    그대로이고 순서만 앞으로 온다.
-->
<AdminFeedback />

<div class="admin-layout">
    <aside class="sidebar">
        <div class="sidebar-header">
            <h2>관리자 콘솔</h2>
        </div>
        <nav class="sidebar-nav" aria-label="관리자 메뉴">
            <a href="/admin" class="nav-item" class:active={$page.url.pathname === '/admin'} aria-current={$page.url.pathname === '/admin' ? "page" : undefined}>
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
                대시보드
            </a>
            <a href="/admin/games" class="nav-item" class:active={$page.url.pathname === '/admin/games'} aria-current={$page.url.pathname === '/admin/games' ? "page" : undefined}>
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
                게임 도감
            </a>
            <a href="/admin/stats" class="nav-item" class:active={$page.url.pathname === '/admin/stats'} aria-current={$page.url.pathname === '/admin/stats' ? "page" : undefined}>
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                통계
            </a>
            <a href="/admin/monitor" class="nav-item" class:active={$page.url.pathname === '/admin/monitor'} aria-current={$page.url.pathname === '/admin/monitor' ? "page" : undefined}>
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                모니터
            </a>
            <a href="/admin/passes" class="nav-item" class:active={$page.url.pathname === '/admin/passes'} aria-current={$page.url.pathname === '/admin/passes' ? "page" : undefined}>
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                정기권
            </a>
        </nav>
        <div class="sidebar-footer">
            <form method="POST" action="/logout">
                <button type="submit" class="btn-sidebar">
                    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    로그아웃
                </button>
            </form>
            <a href="/admin/settings" class="btn-sidebar">
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                설정
            </a>
        </div>
    </aside>

    <main class="main-content" id="admin-main">
        {#if $page.url.pathname === '/admin'}
        <div class="header">
            <div>
                <h1>관리자 대시보드</h1>
                {#if data.settings.is_open === 'false'}
                    <p class="closing-info">
                        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; vertical-align:middle; color:#fa5252;"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                        현재 <strong>마감</strong> 상태입니다.
                    </p>
                {:else}
                    <p class="closing-info">
                        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; vertical-align:middle; color:#4c6ef5;"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
                        오늘의 마감: <strong>{data.closingDisplay}</strong>
                    </p>
                {/if}
            </div>
            <div class="header-actions">
                <a href="/" class="btn-secondary">
                    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    메인으로
                </a>
                {#if data.settings.is_open === 'false'}
                    <button class="btn-primary" onclick={() => openDayModalVisible = true}>
                        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;"><circle cx="12" cy="12" r="5"/><path d="M12 1v2"/><path d="M12 21v2"/><path d="M4.22 4.22l1.42 1.42"/><path d="M18.36 18.36l1.42 1.42"/><path d="M1 12h2"/><path d="M21 12h2"/><path d="M4.22 19.78l1.42-1.42"/><path d="M18.36 5.64l1.42-1.42"/></svg>
                        오픈 하기
                    </button>
                {:else}
                    <button class="btn-close-day" onclick={() => closeDayModalVisible = true}>
                        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
                        마감 하기
                    </button>
                {/if}
            </div>
        </div>
        {/if}

        {@render children()}
    </main>

    <nav class="mobile-bottom-nav" aria-label="관리자 메뉴">
        <a href="/admin" class="bottom-nav-item" class:active={$page.url.pathname === '/admin'} aria-current={$page.url.pathname === '/admin' ? "page" : undefined}>
            <span class="icon">
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
            </span>
            <span class="label">대시보드</span>
        </a>
        <a href="/admin/games" class="bottom-nav-item" class:active={$page.url.pathname === '/admin/games'} aria-current={$page.url.pathname === '/admin/games' ? "page" : undefined}>
            <span class="icon">
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
            </span>
            <span class="label">게임 도감</span>
        </a>
        <a href="/admin/stats" class="bottom-nav-item" class:active={$page.url.pathname === '/admin/stats'} aria-current={$page.url.pathname === '/admin/stats' ? "page" : undefined}>
            <span class="icon">
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            </span>
            <span class="label">통계</span>
        </a>
        <a href="/admin/monitor" class="bottom-nav-item" class:active={$page.url.pathname === '/admin/monitor'} aria-current={$page.url.pathname === '/admin/monitor' ? "page" : undefined}>
            <span class="icon">
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            </span>
            <span class="label">모니터</span>
        </a>
        <a href="/admin/passes" class="bottom-nav-item" class:active={$page.url.pathname === '/admin/passes'} aria-current={$page.url.pathname === '/admin/passes' ? "page" : undefined}>
            <span class="icon">
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            </span>
            <span class="label">정기권</span>
        </a>
        <a href="/admin/settings" class="bottom-nav-item" class:active={$page.url.pathname === '/admin/settings'} aria-current={$page.url.pathname === '/admin/settings' ? "page" : undefined}>
            <span class="icon">
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            </span>
            <span class="label">설정</span>
        </a>
    </nav>
</div>

</div>

{#if closeDayModalVisible}
    <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 모달의 Escape(trapFocus)와 닫기 버튼이 담당한다. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
        class="modal-backdrop"
        onclick={() => closeDayModalVisible = false}
        role="button"
        tabindex="-1"
        aria-label="Close modal"
    >
        <div class="modal-content confirm-modal" use:trapFocus={() => closeDayModalVisible = false} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-labelledby="dlg-close-day" tabindex="-1">
            <h3 id="dlg-close-day">
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:text-bottom;"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
                마감 하기
            </h3>
            <!-- 페이지의 다른 확인창들처럼 결과를 계산해서 말한다. 이 숫자는
                 레이아웃이 세므로 대시보드가 아닌 화면에서도 정확하다. -->
            <p class="warning-text">
                {#if data.closeDaySummary.present === 0 && data.closeDaySummary.playing === 0}
                    지금 방에 아무도 없고 진행 중인 판도 없습니다. 하루를 닫습니다.
                {:else}
                    지금 방에 있는 {data.closeDaySummary.present}명이 퇴장 처리되고, 진행 중인 {data.closeDaySummary.playing}판이 종료됩니다.
                {/if}
            </p>
            <div class="modal-actions">
                <button class="btn-quiet" data-autofocus onclick={() => closeDayModalVisible = false}>취소</button>
                <form method="POST" action="/admin?/closeDay" use:enhance={() => {
                    return async ({ result, update }) => {
                        if (result.type === 'failure') {
                            const data = result.data as { error?: string };
                            showAlert(data?.error || '마감 실패');
                        } else {
                            closeDayModalVisible = false;
                            const d = (result as any)?.data ?? {};
                            closeDayUndoable('오늘 하루가 마감되었습니다. 수고하셨습니다!', d.undo);
                        }
                        await update();
                    };
                }}>
                    <button type="submit" class="btn-close-day is-confirm">마감 확정</button>
                </form>
            </div>
        </div>
    </div>
{/if}

{#if openDayModalVisible}
    <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 모달의 Escape(trapFocus)와 닫기 버튼이 담당한다. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
        class="modal-backdrop"
        onclick={() => openDayModalVisible = false}
        role="button"
        tabindex="-1"
        aria-label="Close modal"
    >
        <div class="modal-content confirm-modal" use:trapFocus={() => openDayModalVisible = false} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
            <h3>
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:text-bottom;"><circle cx="12" cy="12" r="5"/><path d="M12 1v2"/><path d="M12 21v2"/><path d="M4.22 4.22l1.42 1.42"/><path d="M18.36 18.36l1.42 1.42"/><path d="M1 12h2"/><path d="M21 12h2"/><path d="M4.22 19.78l1.42-1.42"/><path d="M18.36 5.64l1.42-1.42"/></svg>
                오픈 하기
            </h3>
            <p>새로운 하루를 시작하시겠습니까?</p>
            <div class="modal-actions">
                <button class="btn-secondary" onclick={() => openDayModalVisible = false}>취소</button>
                <form method="POST" action="/admin?/openDay" use:enhance={() => {
                    return async ({ result, update }) => {
                        if (result.type === 'failure') {
                            const data = result.data as { error?: string };
                            showAlert(data?.error || '오픈 실패');
                        } else {
                            openDayModalVisible = false;
                            showAlert('활기찬 하루 되세요!');
                        }
                        await update();
                    };
                }}>
                    <button type="submit" class="btn-primary">오픈 확정</button>
                </form>
            </div>
        </div>
    </div>
{/if}

<!-- Alert Modal -->
{#if alertVisible}
    <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 모달의 Escape(trapFocus)와 닫기 버튼이 담당한다. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
        class="modal-backdrop"
        onclick={() => alertVisible = false}
        role="button"
        tabindex="-1"
        aria-label="Close alert"
    >
        <div class="modal-content alert-modal" use:trapFocus={() => alertVisible = false} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" tabindex="-1">
            <h3>알림</h3>
            <p>{alertMessage}</p>
            <div class="modal-actions">
                <button class="btn-primary" data-autofocus onclick={() => alertVisible = false}>확인</button>
            </div>
        </div>
    </div>
{/if}

<style>
    /* 어드민 팔레트·타이포·간격 토큰은 src/lib/styles/admin-tokens.css 한 곳에 있다.
       /admin 전체를 감싸는 src/routes/admin/+layout.svelte 가 불러오므로
       (dashboard) 밖의 /admin/login·/admin/qr 도 같은 토큰을 받는다. */

    /* 포커스 링 — 이전에는 UA 기본 링에 의존했고, 네이비 사이드바 위에서
       1.55:1까지 떨어져 키보드 사용자가 자기 위치를 볼 수 없었다. */
    :global(.force-light :focus-visible) {
        outline: 2px solid var(--focus-ring);
        outline-offset: 2px;
        border-radius: 2px;
    }
    .sidebar :global(:focus-visible),
    .mobile-bottom-nav :global(:focus-visible) {
        outline-color: var(--focus-ring-on-dark);
    }

    .admin-layout {
        display: flex;
        align-items: flex-start;
        min-height: 100vh;
        font-family: var(--font-sans);
    }
    /* 대시보드가 2000px를 넘으므로 사이드바를 붙여 둔다.
       이전에는 문서 끝에서 96px 모자라 네이비가 끊기고 맨 body가 드러났다. */
    .sidebar {
        width: 250px;
        background: #2c3e50;
        color: white;
        display: flex;
        flex-direction: column;
        padding: var(--space-5);
        flex-shrink: 0;
        position: sticky;
        top: 0;
        height: 100vh;
        overflow-y: auto;
    }
    .sidebar-header {
        margin-bottom: var(--space-6);
        text-align: center;
    }
    .sidebar-header h2 {
        margin: 0;
        font-size: var(--text-xl);
        color: #ecf0f1;
    }
    .sidebar-nav {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        flex: 1;
    }
    .nav-item {
        color: #ecf0f1;
        text-decoration: none;
        padding: var(--space-3) var(--space-4);
        border-radius: var(--radius-control);
        transition: background 0.2s;
    }
    .nav-item:hover {
        background: #34495e;
    }
    /* 현재 페이지가 hover 와 완전히 같은 선언이라(1.18:1) 구별되지 않았다.
       aria-current 와 함께 형태로도 말한다. */
    .nav-item.active {
        background: #34495e;
        box-shadow: inset 3px 0 0 var(--focus-ring-on-dark);
        font-weight: var(--weight-bold);
    }
    .sidebar-footer {
        margin-top: auto;
        padding-top: var(--space-4);
        border-top: 1px solid #34495e;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
    }
    .btn-sidebar {
        width: 100%;
        background: #34495e;
        color: #ecf0f1;
        border: none;
        padding: var(--space-3);
        border-radius: var(--radius-control);
        cursor: pointer;
        text-align: left;
        text-decoration: none;
        display: block;
            font-size: var(--text-sm);
    }
    .btn-sidebar:hover {
        background: #2c3e50;
    }
    /* 페이지 제목은 24px. 32px 이상은 데이터 전용으로 비워 둔다. */
    .main-content :global(h1) {
        font-size: var(--text-xl);
        font-weight: var(--weight-bold);
        margin: 0 0 var(--space-4);
    }
    .main-content {
        flex: 1;
        min-width: 0;
        padding: var(--space-6);
        background: var(--bg-surface);
    }
    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-6);
    }
    @media (max-width: 768px) {
        .header {
            margin-bottom: var(--space-4);
        }
    }
    .header-actions {
        display: flex;
        gap: var(--space-4);
    }
    
    .mobile-bottom-nav {
        display: none;
    }

    /* 모션을 줄이도록 설정한 사용자에게는 전환을 끈다.
       여기 남은 것은 배경색 페이드뿐이지만, 설정을 존중하지 않는 것 자체가
       사용자에게 이 화면이 자기 설정 밖에 있다고 말한다. */
    @media (prefers-reduced-motion: reduce) {
        :global(.force-light *),
        :global(.force-light *::before),
        :global(.force-light *::after) {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
        }
    }

    /* Mobile Responsive Styles */
    @media (max-width: 768px) {
        /* :global(.force-light)로 쓰면 안 된다. 기본값 0px은 admin-tokens.css의
           .force-light(특이도 0,1,0)에서 오는데, :global()도 같은 0,1,0이라
           순서에 기대게 된다. 스코프된 .force-light는 .force-light.s-xxx(0,2,0)로
           컴파일돼 확실히 이긴다. 이 규칙이 지면 폰에서 inset이 0px으로 남고
           30초짜리 되돌리기 토스트가 탭 바를 덮는다.
           (바깥 /admin/+layout.svelte의 .force-light는 이 컴포넌트 소유가 아니라
            0px 그대로지만, 토스트는 안쪽 래퍼에 있으므로 상관없다.) */
        .force-light {
            --admin-bottom-inset: calc(var(--admin-nav-height) + env(safe-area-inset-bottom, 0px));
        }
        .admin-layout {
            flex-direction: column;
            /* 데스크톱의 align-items:flex-start는 sticky 사이드바를 위한 것이다.
               세로 배치에서는 그것이 교차축(가로) 사이징이 되어 main-content가
               max-content로 부풀고, 넓은 행 하나가 콘솔 전체를 가로로 밀어냈다. */
            align-items: stretch;
        }
        /*
            폰에서 이 사이드바는 nav 와 footer 가 숨겨져 브랜드 한 줄만 남는다.
            57px 을 「관리자 콘솔」에 쓰고, 바로 아래 h1 이 「관리자 대시보드」로
            같은 말을 반복한다. 이동은 하단 탭 바가 한다. 그 57px 이 있어야
            iPhone SE(667) 접힌 선 위에 사람이 들어온다.
            (부수: h1 보다 앞서던 h2 가 폰에서는 접근성 트리에서도 빠진다.)
        */
        .sidebar {
            display: none;
        }
        .sidebar-header {
            margin-bottom: 0;
            text-align: center;
        }
        .sidebar-header h2 {
            font-size: var(--text-lg);
        }
        
        /* Hide Desktop Nav & Footer on Mobile */
        .sidebar-nav, .sidebar-footer {
            display: none;
        }
        
        .main-content {
            padding: var(--space-4);
            padding-bottom: 80px; /* Space for bottom nav */
        }
        .header {
            flex-direction: column;
            align-items: flex-start;
            gap: var(--space-4);
        }
        /* stretch + flex:1 은 되돌릴 수 없는 「마감 하기」를 화면에서 가장 큰
           탭 타깃(200px)으로 만들었다 — 옆의 「메인으로」(127px)보다 크다.
           하루 한 번 쓰는 파괴적 동작이 헤더에서 가장 누르기 쉬우면 안 된다.
           내용 크기로 두면 높이는 46px 그대로라 손가락에는 충분하다. */
        .header-actions {
            width: 100%;
            flex-wrap: wrap;
        }

        /* Show Bottom Nav */
        .mobile-bottom-nav {
            display: flex;
            position: fixed;
            bottom: 0;
            left: 0;
            width: 100%;
            /* 토스트가 비켜서는 높이(--admin-nav-height)와 실제 바 높이가
               어긋나면 30초 동안 내비가 가려진다. 같은 토큰으로 묶는다. */
            min-height: var(--admin-nav-height);
            box-sizing: border-box;
            background: white;
            border-top: 1px solid #ddd;
            padding: var(--space-2) 0;
            justify-content: space-around;
            z-index: 100;
            box-shadow: 0 -2px 10px rgba(0,0,0,0.05);
            transition: opacity 0.15s;
        }
        /* 백드롭(z-index 1000)이 이 바를 덮어 기능은 죽는데 모습은 선명해서,
           엄지가 닿는 자리에서 누를 수 있는 것처럼 보였다. 실제로 누르면
           이동이 아니라 작성 중이던 시트가 닫혔다. */
        :global(body:has(.modal-backdrop)) .mobile-bottom-nav {
            opacity: 0.35;
        }
        .bottom-nav-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-decoration: none;
            /* #888은 흰 배경에서 3.54:1로 AA 미달 */
            color: var(--text-secondary);
            background: none;
            border: none;
            font-size: var(--text-xs);
            gap: var(--space-1);
            padding: var(--space-2);
            flex: 1;
        }
        .bottom-nav-item .icon {
            font-size: var(--text-xl);
        }
        .bottom-nav-item.active, .bottom-nav-item:active {
            color: var(--color-blue-bright);
        }
    }
    /* 키보드로 들어오면 사이드바 링크 7개를 지나야 주 액션에 닿았다 */
    .skip-link {
        position: absolute;
        left: var(--space-2);
        top: -100%;
        z-index: 1300;
        padding: var(--space-2) var(--space-4);
        border-radius: var(--radius-control);
        background: var(--bg-primary);
        color: var(--text-primary);
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
        box-shadow: var(--shadow-lg);
    }
    .skip-link:focus {
        top: var(--space-2);
    }
    .btn-secondary {
        background: var(--bg-primary);
        color: var(--text-primary);
        border: 1px solid var(--border-control);
        padding: var(--space-3) var(--space-5);
        border-radius: var(--radius-control);
        text-decoration: none;
        font-weight: bold;
        display: flex;
        align-items: center;
        cursor: pointer;
    }
    .btn-secondary:hover {
        background: #f5f5f5;
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
    /*
        마감은 파괴가 아니라 하루의 상태 전이다 — 바로 옆 「오픈 하기」와
        짝을 이루고, 다시 열 수 있다. 채움 빨강이었을 때는 회원 영구 배제와
        같은 색이었고, 매일 누르는 버튼이 그 색을 소모해 정작 되돌릴 수 없는
        것에서 빨강이 아무 경고도 되지 못했다. 중립 테두리 버튼으로 내린다.
    */
    .btn-close-day {
        background: var(--bg-primary);
        color: var(--text-primary);
        border: 1px solid var(--border-control);
        padding: var(--space-3) var(--space-5);
        border-radius: var(--radius-control);
        cursor: pointer;
        font-weight: bold;
        font-size: var(--text-sm);
    }
    .btn-close-day:hover {
        background: var(--bg-hover);
    }
    .closing-info {
        margin: var(--space-2) 0 0 0;
        color: #666;
        font-size: var(--text-sm);
    }
    /*
        `.modal-content p`(0,2,0)가 `.warning-text`(0,1,0)를 이겨서, 마감이
        무엇을 지우는지 말하는 유일한 문장이 본문 회색(#555)으로 렌더됐다.
        경고로 보이지 않는 경고는 경고가 아니다.
    */
    .modal-content p.warning-text {
        color: #d32f2f;
        font-size: var(--text-sm);
        margin-top: var(--space-2);
    }
    /*
        「취소」와 「마감 확정」이 픽셀 단위로 같았다 — .btn-secondary와
        .btn-close-day의 선언이 font-size 하나만 빼고 동일했다. 되돌리기가
        없던 유일한 파괴적 동작이, 중단 버튼과 구별되지 않는 확인 버튼을
        갖고 있었던 셈이다. 3등급은 「취소와 같음」을 뜻하지 않는다.

        마감은 파괴가 아니라 상태 전이이므로 빨강으로 되돌리지 않는다.
        중립 채움으로 "이쪽이 답이다"만 말하고, 중단은 테두리를 버린다.
    */
    .btn-close-day.is-confirm {
        background: var(--text-primary);
        color: var(--bg-primary);
        border-color: var(--text-primary);
    }
    .btn-close-day.is-confirm:hover {
        background: var(--text-darker, #111);
    }
    .btn-quiet {
        background: none;
        border: 1px solid transparent;
        color: var(--text-secondary);
        padding: var(--space-3) var(--space-5);
        border-radius: var(--radius-control);
        font-weight: bold;
        font-size: var(--text-sm);
        cursor: pointer;
    }
    .btn-quiet:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
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
        padding: var(--space-6);
        border-radius: var(--radius-card);
        width: 90%;
        max-width: 420px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    }
    .modal-content h3 {
        margin: 0 0 var(--space-4);
        font-size: var(--text-lg);
    }
    .modal-content p {
        margin: var(--space-2) 0;
        color: #555;
    }
    .modal-actions {
        display: flex;
        gap: var(--space-3);
        margin-top: var(--space-5);
        justify-content: flex-end;
    }
    .modal-actions form {
        margin: 0;
    }
</style>
