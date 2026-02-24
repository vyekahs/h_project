<script lang="ts">
    import { enhance } from '$app/forms';
    import { page } from '$app/stores';
    import type { LayoutData } from './$types';

    export let data: LayoutData;

    let closeDayModalVisible = false;
    let openDayModalVisible = false;
    
    // Alert Modal State
    let alertVisible = false;
    let alertMessage = '';

    function showAlert(msg: string) {
        alertMessage = msg;
        alertVisible = true;
    }
</script>

<div class="admin-layout">
    <aside class="sidebar">
        <div class="sidebar-header">
            <h2>Admin Console</h2>
        </div>
        <nav class="sidebar-nav">
            <a href="/admin" class="nav-item" class:active={$page.url.pathname === '/admin'}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
                대시보드
            </a>
            <a href="/admin/games" class="nav-item" class:active={$page.url.pathname === '/admin/games'}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
                게임 도감 관리
            </a>
            <a href="/admin/stats" class="nav-item" class:active={$page.url.pathname === '/admin/stats'}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                통계 보기
            </a>
            <a href="/admin/monitor" class="nav-item" class:active={$page.url.pathname === '/admin/monitor'}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                서버 모니터
            </a>
            <a href="/admin/passes" class="nav-item" class:active={$page.url.pathname === '/admin/passes'}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                정기권 관리
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
                    <button class="btn-primary" on:click={() => openDayModalVisible = true}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;"><circle cx="12" cy="12" r="5"/><path d="M12 1v2"/><path d="M12 21v2"/><path d="M4.22 4.22l1.42 1.42"/><path d="M18.36 18.36l1.42 1.42"/><path d="M1 12h2"/><path d="M21 12h2"/><path d="M4.22 19.78l1.42-1.42"/><path d="M18.36 5.64l1.42-1.42"/></svg>
                        오픈 하기
                    </button>
                {:else}
                    <button class="btn-danger" on:click={() => closeDayModalVisible = true}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
                        마감 하기
                    </button>
                {/if}
            </div>
        </div>
        {/if}

        <slot />
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
            <span class="label">게임 관리</span>
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


{#if closeDayModalVisible}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div 
        class="modal-backdrop" 
        on:click={() => closeDayModalVisible = false}
        on:keydown={(e) => e.key === 'Escape' && (closeDayModalVisible = false)}
        role="button"
        tabindex="-1"
        aria-label="Close modal"
    >
        <div class="modal-content confirm-modal" on:click|stopPropagation role="dialog" tabindex="-1">
            <h3>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:text-bottom;"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
                마감 하기
            </h3>
            <p>정말 마감하시겠습니까?</p>
            <p class="warning-text">모든 참가자가 퇴장 처리되고, 진행 중인 게임이 종료됩니다.</p>
            <div class="modal-actions">
                <button class="btn-secondary" on:click={() => closeDayModalVisible = false}>취소</button>
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
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div 
        class="modal-backdrop" 
        on:click={() => openDayModalVisible = false}
        on:keydown={(e) => e.key === 'Escape' && (openDayModalVisible = false)}
        role="button"
        tabindex="-1"
        aria-label="Close modal"
    >
        <div class="modal-content confirm-modal" on:click|stopPropagation role="dialog" tabindex="-1">
            <h3>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:text-bottom;"><circle cx="12" cy="12" r="5"/><path d="M12 1v2"/><path d="M12 21v2"/><path d="M4.22 4.22l1.42 1.42"/><path d="M18.36 18.36l1.42 1.42"/><path d="M1 12h2"/><path d="M21 12h2"/><path d="M4.22 19.78l1.42-1.42"/><path d="M18.36 5.64l1.42-1.42"/></svg>
                오픈 하기
            </h3>
            <p>새로운 하루를 시작하시겠습니까?</p>
            <div class="modal-actions">
                <button class="btn-secondary" on:click={() => openDayModalVisible = false}>취소</button>
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
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div 
        class="modal-backdrop" 
        on:click={() => alertVisible = false}
        on:keydown={(e) => e.key === 'Escape' && (alertVisible = false)}
        role="button"
        tabindex="-1"
        aria-label="Close alert"
    >
        <div class="modal-content alert-modal" on:click|stopPropagation role="alertdialog" tabindex="-1">
            <h3>알림</h3>
            <p>{alertMessage}</p>
            <div class="modal-actions">
                <button class="btn-primary" on:click={() => alertVisible = false}>확인</button>
            </div>
        </div>
    </div>
{/if}

<style>
    .admin-layout {
        display: flex;
        min-height: 100vh;
        font-family: sans-serif;
    }
    .sidebar {
        width: 250px;
        background: #2c3e50;
        color: white;
        display: flex;
        flex-direction: column;
        padding: 1.5rem;
        flex-shrink: 0;
    }
    .sidebar-header {
        margin-bottom: 2rem;
        text-align: center;
    }
    .sidebar-header h2 {
        margin: 0;
        font-size: 1.5rem;
        color: #ecf0f1;
    }
    .sidebar-nav {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        flex: 1;
    }
    .nav-item {
        color: #ecf0f1;
        text-decoration: none;
        padding: 0.75rem 1rem;
        border-radius: 4px;
        transition: background 0.2s;
    }
    .nav-item:hover, .nav-item.active {
        background: #34495e;
    }
    .sidebar-footer {
        margin-top: auto;
        padding-top: 1rem;
        border-top: 1px solid #34495e;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .btn-sidebar {
        width: 100%;
        background: #34495e;
        color: #ecf0f1;
        border: none;
        padding: 0.75rem;
        border-radius: 4px;
        cursor: pointer;
        text-align: left;
        text-decoration: none;
        display: block;
    }
    .btn-sidebar:hover {
        background: #2c3e50;
    }
    .main-content {
        flex: 1;
        padding: 2rem;
        background: #f5f5f5;
        overflow-y: auto;
    }
    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
    }
    .header-actions {
        display: flex;
        gap: 1rem;
    }
    
    .mobile-bottom-nav {
        display: none;
    }

    /* Mobile Responsive Styles */
    @media (max-width: 768px) {
        .admin-layout {
            flex-direction: column;
        }
        .sidebar {
            width: 100%;
            padding: 1rem;
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
            font-size: 1.2rem;
        }
        
        /* Hide Desktop Nav & Footer on Mobile */
        .sidebar-nav, .sidebar-footer {
            display: none;
        }
        
        .main-content {
            padding: 1rem;
            padding-bottom: 80px; /* Space for bottom nav */
        }
        .header {
            flex-direction: column;
            align-items: flex-start;
            gap: 1rem;
        }
        .header-actions {
            width: 100%;
            justify-content: stretch;
        }
        .header-actions button {
            flex: 1;
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
            padding: 0.5rem 0;
            justify-content: space-around;
            z-index: 100;
            box-shadow: 0 -2px 10px rgba(0,0,0,0.05);
        }
        .bottom-nav-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-decoration: none;
            color: #888;
            background: none;
            border: none;
            font-size: 0.75rem;
            gap: 0.25rem;
            padding: 0.5rem;
            flex: 1;
        }
        .bottom-nav-item .icon {
            font-size: 1.5rem;
        }
        .bottom-nav-item.active, .bottom-nav-item:active {
            color: #007bff;
        }
    }
    .btn-secondary {
        background: white;
        color: #333;
        border: 1px solid #ddd;
        padding: 0.75rem 1.5rem;
        border-radius: 4px;
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
        background: #007bff;
        color: white;
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
    }
    .btn-danger {
        background: #d32f2f;
        color: white;
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
    }
    .btn-danger:hover {
        background: #b71c1c;
    }
    .closing-info {
        margin: 0.5rem 0 0 0;
        color: #666;
        font-size: 0.95rem;
    }
    .warning-text {
        color: #d32f2f;
        font-size: 0.9rem;
        margin-top: 0.5rem;
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
        width: 90%;
        max-width: 420px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    }
    .modal-content h3 {
        margin: 0 0 1rem;
        font-size: 1.2rem;
    }
    .modal-content p {
        margin: 0.5rem 0;
        color: #555;
    }
    .modal-actions {
        display: flex;
        gap: 0.75rem;
        margin-top: 1.5rem;
        justify-content: flex-end;
    }
    .modal-actions form {
        margin: 0;
    }
</style>
