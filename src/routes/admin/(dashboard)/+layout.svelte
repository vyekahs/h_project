<script lang="ts">
    import { enhance } from '$app/forms';
    import { page } from '$app/stores';
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import type { LayoutData } from './$types';
    import { trapFocus } from '$lib/actions/modal';
    import AdminFeedback from '$lib/components/admin/AdminFeedback.svelte';

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

    function showAlert(msg: string) {
        alertMessage = msg;
        alertVisible = true;
    }
</script>

<div data-theme="light" class="force-light">
<div class="admin-layout">
    <aside class="sidebar">
        <div class="sidebar-header">
            <h2>관리자 콘솔</h2>
        </div>
        <nav class="sidebar-nav">
            <a href="/admin" class="nav-item" class:active={$page.url.pathname === '/admin'}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
                대시보드
            </a>
            <a href="/admin/games" class="nav-item" class:active={$page.url.pathname === '/admin/games'}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
                게임 도감
            </a>
            <a href="/admin/stats" class="nav-item" class:active={$page.url.pathname === '/admin/stats'}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                통계
            </a>
            <a href="/admin/monitor" class="nav-item" class:active={$page.url.pathname === '/admin/monitor'}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                모니터
            </a>
            <a href="/admin/passes" class="nav-item" class:active={$page.url.pathname === '/admin/passes'}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                정기권
            </a>
        </nav>
        <div class="sidebar-footer">
            <form method="POST" action="/logout">
                <button type="submit" class="btn-sidebar">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    로그아웃
                </button>
            </form>
            <a href="/admin/settings" class="btn-sidebar">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                설정
            </a>
        </div>
    </aside>

    <main class="main-content">
        {#if $page.url.pathname === '/admin'}
        <div class="header">
            <div>
                <h1>관리자 대시보드</h1>
                {#if data.settings.is_open === 'false'}
                    <p class="closing-info">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; vertical-align:middle; color:#fa5252;"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                        현재 <strong>마감</strong> 상태입니다.
                    </p>
                {:else}
                    <p class="closing-info">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; vertical-align:middle; color:#4c6ef5;"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
                        오늘의 마감: <strong>{data.closingDisplay}</strong>
                    </p>
                {/if}
            </div>
            <div class="header-actions">
                <a href="/" class="btn-secondary">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    메인으로
                </a>
                {#if data.settings.is_open === 'false'}
                    <button class="btn-primary" onclick={() => openDayModalVisible = true}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;"><circle cx="12" cy="12" r="5"/><path d="M12 1v2"/><path d="M12 21v2"/><path d="M4.22 4.22l1.42 1.42"/><path d="M18.36 18.36l1.42 1.42"/><path d="M1 12h2"/><path d="M21 12h2"/><path d="M4.22 19.78l1.42-1.42"/><path d="M18.36 5.64l1.42-1.42"/></svg>
                        오픈 하기
                    </button>
                {:else}
                    <button class="btn-danger" onclick={() => closeDayModalVisible = true}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
                        마감 하기
                    </button>
                {/if}
            </div>
        </div>
        {/if}

        {@render children()}
    </main>

    <nav class="mobile-bottom-nav">
        <a href="/admin" class="bottom-nav-item" class:active={$page.url.pathname === '/admin'}>
            <span class="icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
            </span>
            <span class="label">대시보드</span>
        </a>
        <a href="/admin/games" class="bottom-nav-item" class:active={$page.url.pathname === '/admin/games'}>
            <span class="icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
            </span>
            <span class="label">게임 도감</span>
        </a>
        <a href="/admin/stats" class="bottom-nav-item" class:active={$page.url.pathname === '/admin/stats'}>
            <span class="icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            </span>
            <span class="label">통계</span>
        </a>
        <a href="/admin/monitor" class="bottom-nav-item" class:active={$page.url.pathname === '/admin/monitor'}>
            <span class="icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            </span>
            <span class="label">모니터</span>
        </a>
        <a href="/admin/passes" class="bottom-nav-item" class:active={$page.url.pathname === '/admin/passes'}>
            <span class="icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            </span>
            <span class="label">정기권</span>
        </a>
        <a href="/admin/settings" class="bottom-nav-item" class:active={$page.url.pathname === '/admin/settings'}>
            <span class="icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            </span>
            <span class="label">설정</span>
        </a>
    </nav>
</div>
</div>

<AdminFeedback />

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
        <div class="modal-content confirm-modal" use:trapFocus={() => closeDayModalVisible = false} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
            <h3>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:text-bottom;"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
                마감 하기
            </h3>
            <p>정말 마감하시겠습니까?</p>
            <p class="warning-text">모든 참가자가 퇴장 처리되고, 진행 중인 게임이 종료됩니다.</p>
            <div class="modal-actions">
                <button class="btn-secondary" data-autofocus onclick={() => closeDayModalVisible = false}>취소</button>
                <form method="POST" action="/admin?/closeDay" use:enhance={() => {
                    return async ({ result, update }) => {
                        if (result.type === 'failure') {
                            const data = result.data as { error?: string };
                            showAlert(data?.error || '마감 실패');
                        } else {
                            closeDayModalVisible = false;
                            showAlert('오늘 하루가 마감되었습니다. 수고하셨습니다!');
                        }
                        await update();
                    };
                }}>
                    <button type="submit" class="btn-danger">마감 확정</button>
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
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:text-bottom;"><circle cx="12" cy="12" r="5"/><path d="M12 1v2"/><path d="M12 21v2"/><path d="M4.22 4.22l1.42 1.42"/><path d="M18.36 18.36l1.42 1.42"/><path d="M1 12h2"/><path d="M21 12h2"/><path d="M4.22 19.78l1.42-1.42"/><path d="M18.36 5.64l1.42-1.42"/></svg>
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
    /*
     * 어드민 팔레트 — 라이트 전용으로 확정된 값이다.
     * 사이트 전역 토큰은 <html>의 data-theme='dark'로 뒤집히는데, 어드민은
     * 이 블록에서 토큰을 다시 선언해 그 영향을 차단한다. 즉 이 재선언이
     * "어드민은 다크모드를 따르지 않는다"를 실제로 강제하는 장치이므로 지우면 안 된다.
     * 어드민 안에서 색이 필요하면 하드코딩하지 말고 여기의 토큰을 쓸 것.
     */
    .force-light {
        /* Text */
        --text-primary: #333;
        --text-secondary: #666;
        --text-tertiary: #888;
        --text-muted: #999;
        --text-hint: #adb5bd;
        --text-dark: #495057;
        --text-darker: #555;

        /* Backgrounds */
        --bg-primary: #ffffff;
        --bg-secondary: #f8f9fa;
        --bg-tertiary: #f1f3f5;
        --bg-elevated: #f0f0f0;
        --bg-hover: #e9ecef;
        --bg-active: #dee2e6;
        --bg-surface: #f5f5f5;
        --bg-dark: #333;

        /* Borders */
        --border-default: #ddd;
        --border-light: #eee;
        --border-medium: #ccc;

        /* Shadows */
        --shadow-sm: rgba(0,0,0,0.03);
        --shadow-md: rgba(0,0,0,0.1);
        --shadow-lg: rgba(0,0,0,0.15);
        --shadow-heavy: rgba(0,0,0,0.3);
        --shadow-deep: rgba(0,0,0,0.6);

        /* Overlays */
        --overlay-light: rgba(0,0,0,0.05);
        --overlay-medium: rgba(0,0,0,0.2);
        --overlay-heavy: rgba(0,0,0,0.5);

        /* Slate */
        --color-slate: #94a3b8;
        --color-slate-dark: #64748b;

        /* Brand colors */
        --color-blue: #339af0;
        /* 흰 글자를 얹는 기본 파랑. #007bff는 3.98:1로 AA 미달이라 5.1:1인 값으로 내렸다.
           밝은 파랑이 필요한 곳(배경/테두리)은 --color-blue를 쓸 것. */
        --color-blue-bright: #0b5ed7;
        /* 포커스 링은 브랜드 색과 달라야 한다. --color-blue-bright와 같은 값이면
           파란 버튼 위에서 링과 버튼이 한 덩어리로 보여 포커스가 사라진다.
           빨강(마감 하기)·초록 위에서도 통하도록 중립 먹색을 쓴다. */
        --focus-ring: #111827;
        --focus-ring-on-dark: #9ec5fe;
        --color-amber: #fbbf24;
        --color-amber-dark: #f59e0b;
        --color-amber-darker: #d97706;
        --color-green: #22c55e;
        --color-green-dark: #1b6b2c;
        --color-red: #ef4444;
        --color-red-dark: #d32f2f;
        --color-red-darker: #b71c1c;      /* 파괴적 동작의 hover */
        --color-green-darker: #14532d;    /* 초록 버튼의 hover */
        /* 흰 배경에서 AA를 통과하는 주황 텍스트.
           --color-orange-dark(#e67700)는 3.00:1이라 텍스트로 쓸 수 없다. */
        --color-orange-text: #c2410c;
        --color-error-bg-strong: #ffecec;   /* 오류 틴트의 hover */
        --color-warning-bg-strong: #ffeccc; /* 경고 틴트의 hover */
        --color-orange: #ff9800;
        --color-orange-dark: #e67700;

        /* State backgrounds */
        --color-success-bg: #e8f5e9;
        --color-error-bg: #fff5f5;
        --color-warning-bg: #fff3e0;
        --color-info-bg: #e7f5ff;

        /* Additional Colors */
        --border-warning: #ffe0b2;
        --color-purple-bg: #e8d5f5;

        /* 연한 배경 + 진한 글자 톤 버튼. +/- 조정, 연장/해지처럼 짝을 이루는
           동작에 쓴다. 세 화면에 같은 값이 흩어져 있던 것을 모았다.
           hover 틴트는 글자가 4.5:1을 지키는 선까지만 진해진다
           (예전 #bbdefb / #f8bbd0 은 4.16 / 4.07 로 미달이었다). */
        --tint-blue-bg: #e3f2fd;
        --tint-blue-bg-hover: #d4e6fc;
        --tint-red-bg: #fce4ec;
        --tint-red-bg-hover: #fbd0de;
        --color-blue-darker: #0a4bad;   /* 파랑 버튼의 hover */

        /* 순위 메달. 동메달은 흰 글자에서 3.14:1이던 #cd7f32를 내렸다. */
        --medal-gold: #ffd700;
        --medal-silver: #c0c0c0;
        --medal-bronze: #9c6320;
        --color-indigo: #364fc7;

        color-scheme: light;
        color: #333;

        /* ── Type scale ──
           6단계. 이전에는 0.65–1.2rem 사이 14개 값이 있었고 0.78/0.8/0.82rem처럼
           0.3px 차이로 갈라진 것들이 있었다. 11px과 12px도 결국 한 결정이라 12px으로 합쳤다.
           데이터가 자기 라벨보다 커야 하므로
           가장 큰 단계(--text-stat)는 숫자 전용이다. */
        --text-xs: 0.75rem;     /* 12px — 배지, 메타 */
        --text-sm: 0.875rem;    /* 14px — 컨트롤, 목록 */
        --text-base: 1rem;      /* 16px — 본문 */
        --text-lg: 1.25rem;     /* 20px — 섹션 제목 */
        --text-xl: 1.5rem;      /* 24px — 페이지 제목 */
        --text-stat: 2.5rem;    /* 40px — 라이브 수치 전용 */

        /* 굵기는 400 / 600 / 700 세 단계만 쓴다 */
        --weight-normal: 400;
        --weight-medium: 600;
        --weight-bold: 700;

        /* ── Spacing ── 0.25rem 스케일 6단 */
        --space-1: 0.25rem;
        --space-2: 0.5rem;
        --space-3: 0.75rem;
        --space-4: 1rem;
        --space-5: 1.5rem;
        --space-6: 2rem;

        /* ── Radius ── 컨트롤과 카드 두 종류 + 알약 */
        --radius-control: 6px;
        --radius-card: 12px;
        --radius-pill: 999px;

        /* ── Font ── 한 벌만 쓴다 (이전에는 sans-serif / Arial / -apple-system 혼재) */
        --font-sans: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic',
            system-ui, 'Segoe UI', Roboto, sans-serif;

        /* 표 형태 숫자 — 30초마다 갱신되는 카운트다운이 가로로 흔들리지 않게 */
        --numeric: tabular-nums;
    }

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
    .nav-item:hover, .nav-item.active {
        background: #34495e;
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
    .header-actions {
        display: flex;
        gap: var(--space-4);
    }
    
    .mobile-bottom-nav {
        display: none;
    }

    /* Mobile Responsive Styles */
    @media (max-width: 768px) {
        .admin-layout {
            flex-direction: column;
            /* 데스크톱의 align-items:flex-start는 sticky 사이드바를 위한 것이다.
               세로 배치에서는 그것이 교차축(가로) 사이징이 되어 main-content가
               max-content로 부풀고, 넓은 행 하나가 콘솔 전체를 가로로 밀어냈다. */
            align-items: stretch;
        }
        .sidebar {
            position: static;
            height: auto;
            width: 100%;
            padding: var(--space-4);
            box-sizing: border-box;
            flex-direction: row;
            align-items: center;
            justify-content: center;
            background: #2c3e50;
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
            background: white;
            border-top: 1px solid #ddd;
            padding: var(--space-2) 0;
            justify-content: space-around;
            z-index: 100;
            box-shadow: 0 -2px 10px rgba(0,0,0,0.05);
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
    .btn-secondary {
        background: white;
        color: #333;
        border: 1px solid #ddd;
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
    .btn-danger {
        background: #d32f2f;
        color: white;
        border: none;
        padding: var(--space-3) var(--space-5);
        border-radius: var(--radius-control);
        cursor: pointer;
        font-weight: bold;
            font-size: var(--text-sm);
    }
    .btn-danger:hover {
        background: #b71c1c;
    }
    .closing-info {
        margin: var(--space-2) 0 0 0;
        color: #666;
        font-size: var(--text-sm);
    }
    .warning-text {
        color: #d32f2f;
        font-size: var(--text-sm);
        margin-top: var(--space-2);
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
