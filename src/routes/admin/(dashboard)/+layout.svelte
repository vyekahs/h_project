<script lang="ts">
    import { enhance } from '$app/forms';
    import { page } from '$app/stores';
    import type { LayoutData } from './$types';

    export let data: LayoutData;

    let settingsModalVisible = false;
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
            <a href="/admin" class="nav-item" class:active={$page.url.pathname === '/admin'}>🏠 대시보드</a>
            <a href="/admin/games" class="nav-item" class:active={$page.url.pathname === '/admin/games'}>📚 게임 도감 관리</a>
            <a href="/admin/stats" class="nav-item" class:active={$page.url.pathname === '/admin/stats'}>📊 통계 보기</a>
        </nav>
        <div class="sidebar-footer">
            <button class="btn-sidebar" on:click={() => settingsModalVisible = true}>⚙️ 설정</button>
        </div>
    </aside>

    <main class="main-content">
        <div class="header">
            <div>
                <h1>관리자 대시보드</h1>
                {#if data.settings.is_open === 'false'}
                    <p class="closing-info">⛔️ 현재 <strong>마감</strong> 상태입니다.</p>
                {:else}
                    <p class="closing-info">🌙 오늘의 마감: <strong>{data.closingDisplay}</strong></p>
                {/if}
            </div>
            <div class="header-actions">
                {#if data.settings.is_open === 'false'}
                    <button class="btn-primary" on:click={() => openDayModalVisible = true}>☀️ 오픈 하기</button>
                {:else}
                    <button class="btn-danger" on:click={() => closeDayModalVisible = true}>🌙 마감 하기</button>
                {/if}
            </div>
        </div>

        <slot />
    </main>

    <nav class="mobile-bottom-nav">
        <a href="/admin" class="bottom-nav-item" class:active={$page.url.pathname === '/admin'}>
            <span class="icon">🏠</span>
            <span class="label">대시보드</span>
        </a>
        <a href="/admin/games" class="bottom-nav-item" class:active={$page.url.pathname === '/admin/games'}>
            <span class="icon">📚</span>
            <span class="label">게임 관리</span>
        </a>
        <a href="/admin/stats" class="bottom-nav-item" class:active={$page.url.pathname === '/admin/stats'}>
            <span class="icon">📊</span>
            <span class="label">통계</span>
        </a>
        <button class="bottom-nav-item" on:click={() => settingsModalVisible = true}>
            <span class="icon">⚙️</span>
            <span class="label">설정</span>
        </button>
    </nav>
</div>

{#if settingsModalVisible}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div class="modal-backdrop" on:click={() => settingsModalVisible = false} role="presentation">
        <div class="modal-content" on:click|stopPropagation role="dialog">
            <h2>⚙️ 환경 설정</h2>
            <form method="POST" action="/admin?/updateSettings" id="settings-form" use:enhance={() => {
                return async ({ result, update }) => {
                    if (result.type === 'failure') {
                        showAlert(result.data?.error || '설정 저장 실패');
                    } else {
                        settingsModalVisible = false;
                        showAlert('설정이 저장되었습니다.');
                    }
                    await update();
                };
            }}>
                <div class="form-group">
                    <label for="closing_time_weekday">주중 마감 시간</label>
                    <input type="time" id="closing_time_weekday" name="closing_time_weekday" value={data.settings.closing_time_weekday} required />
                </div>
                <div class="form-group">
                    <label for="closing_time_weekend">주말 마감 시간</label>
                    <input type="time" id="closing_time_weekend" name="closing_time_weekend" value={data.settings.closing_time_weekend} required />
                </div>
                
                <div class="form-group">
                    <label>주말 적용 요일</label>
                    <div class="day-selector">
                        {#each [
                            { val: 1, label: '월' },
                            { val: 2, label: '화' },
                            { val: 3, label: '수' },
                            { val: 4, label: '목' },
                            { val: 5, label: '금' },
                            { val: 6, label: '토' },
                            { val: 0, label: '일' }
                        ] as day}
                            <label class="day-checkbox">
                                <input 
                                    type="checkbox" 
                                    name="weekend_days" 
                                    value={day.val} 
                                    checked={data.settings.weekend_days.split(',').includes(String(day.val))}
                                />
                                {day.label}
                            </label>
                        {/each}
                    </div>
                </div>

                <p class="hint-text">💡 00:00 ~ 08:59 입력 시 <strong>익일</strong>로 설정됩니다.</p>
            </form>
                
            <div class="modal-actions" style="justify-content: space-between;">
                <form method="POST" action="/logout">
                    <button type="submit" class="btn-danger" style="padding: 0.75rem;">로그아웃</button>
                </form>
                <div style="display: flex; gap: 1rem;">
                    <button type="button" class="btn-secondary" on:click={() => settingsModalVisible = false}>취소</button>
                    <button type="submit" form="settings-form" class="btn-primary">저장</button>
                </div>
            </div>
        </div>
    </div>
{/if}

{#if closeDayModalVisible}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div class="modal-backdrop" on:click={() => closeDayModalVisible = false} role="presentation">
        <div class="modal-content confirm-modal" on:click|stopPropagation role="dialog">
            <h3>🌙 마감 하기</h3>
            <p>정말 마감하시겠습니까?</p>
            <p class="warning-text">모든 참가자가 퇴장 처리되고, 진행 중인 게임이 종료됩니다.</p>
            <div class="modal-actions">
                <button class="btn-secondary" on:click={() => closeDayModalVisible = false}>취소</button>
                <form method="POST" action="/admin?/closeDay" use:enhance={() => {
                    return async ({ result, update }) => {
                        if (result.type === 'failure') {
                            showAlert(result.data?.error || '마감 실패');
                        } else {
                            closeDayModalVisible = false;
                            showAlert('오늘 하루가 마감되었습니다. 수고하셨습니다! 🌙');
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
    <div class="modal-backdrop" on:click={() => openDayModalVisible = false} role="presentation">
        <div class="modal-content confirm-modal" on:click|stopPropagation role="dialog">
            <h3>☀️ 오픈 하기</h3>
            <p>새로운 하루를 시작하시겠습니까?</p>
            <div class="modal-actions">
                <button class="btn-secondary" on:click={() => openDayModalVisible = false}>취소</button>
                <form method="POST" action="/admin?/openDay" use:enhance={() => {
                    return async ({ result, update }) => {
                        if (result.type === 'failure') {
                            showAlert(result.data?.error || '오픈 실패');
                        } else {
                            openDayModalVisible = false;
                            showAlert('활기찬 하루 되세요! ☀️');
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
    <div class="modal-backdrop" on:click={() => alertVisible = false} role="presentation">
        <div class="modal-content alert-modal" on:click|stopPropagation role="alertdialog">
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
    .sidebar-header p {
        margin: 0;
        font-size: 0.8rem;
        color: #bdc3c7;
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
        .sidebar-header p {
            display: none;
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
    .hint-text {
        font-size: 0.85rem;
        color: #666;
        margin-top: 1rem;
        background: #f5f5f5;
        padding: 0.5rem;
        border-radius: 4px;
    }
    .day-selector {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
        margin-top: 0.5rem;
    }
    .day-checkbox {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.9rem;
        cursor: pointer;
        background: #f0f0f0;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
    }
    .day-checkbox:has(input:checked) {
        background: #e3f2fd;
        color: #007bff;
        font-weight: bold;
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
        border-radius: 8px;
        width: 90%;
        max-width: 500px;
        max-height: 90vh;
        overflow-y: auto;
    }
    .alert-modal {
        max-width: 400px;
        text-align: center;
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
    .form-group {
        margin-bottom: 1rem;
    }
    .form-group label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: bold;
    }
    .form-group input {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: 4px;
        box-sizing: border-box;
    }
</style>
