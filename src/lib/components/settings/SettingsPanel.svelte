<script lang="ts">
    import { onMount } from 'svelte';
    import { hapticsEnabled } from '$lib/stores/haptics';
    import { themeStore } from '$lib/stores/theme.svelte';
    import { user } from '$lib/stores/user';
    import { isPushSupported, isPushSubscribed, isStandalone, subscribeToPush, unsubscribeFromPush } from '$lib/utils/pushSubscription';

    let { open = $bindable(false) } = $props();

    const NOTIF_TYPES = [
        { key: 'mention', label: '멘션 알림', desc: '댓글에서 @멘션될 때 알림을 받습니다' },
        { key: 'visit_plan', label: '방문 예정 알림', desc: '다른 사람이 오늘 방문 예정에 추가할 때 알림을 받습니다' },
        { key: 'game_join', label: '게임 참가 알림', desc: '내가 참여 중인 게임에 다른 사람이 참가할 때 알림을 받습니다' },
        { key: 'rank_change', label: '랭킹 변동 알림', desc: '미니게임 랭킹이 변동될 때 알림을 받습니다' },
        { key: 'wtp_join', label: '같이하기 참여 알림', desc: '내가 올린 같이하기 글에 다른 사람이 참여할 때 알림을 받습니다' },
        { key: 'wtp_message', label: '같이하기 대화 알림', desc: '같이하기 대화방에 새 메시지가 올 때 알림을 받습니다' },
        { key: 'party_message', label: '고정팟 대화 알림', desc: '고정팟 대화방에 새 메시지가 올 때 알림을 받습니다' },
        { key: 'party_invite', label: '고정팟 초대 알림', desc: '고정팟에 초대될 때 알림을 받습니다' },
    ] as const;

    let notifPrefs = $state<Record<string, boolean>>({
        mention: true,
        visit_plan: false,
        game_join: false,
        rank_change: false,
        wtp_join: false,
        wtp_message: true,
        party_message: true,
        party_invite: true,
    });
    let prefsLoaded = $state(false);

    // Push notification state
    let pushSupported = $state(false);
    let pushSubscribed = $state(false);
    let pushLoading = $state(false);
    let pushIsStandalone = $state(true);
    let isIOS = $state(false);

    onMount(async () => {
        // Push 지원 여부 체크
        pushSupported = isPushSupported();
        pushIsStandalone = isStandalone();
        isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

        if (pushSupported) {
            pushSubscribed = await isPushSubscribed();
        }

        if ($user.id) {
            try {
                const res = await fetch('/api/notifications/preferences');
                if (res.ok) {
                    notifPrefs = await res.json();
                    prefsLoaded = true;
                }
            } catch {}
        }
    });

    async function togglePush() {
        if (pushLoading) return;
        pushLoading = true;
        try {
            if (pushSubscribed) {
                await unsubscribeFromPush();
                pushSubscribed = false;
            } else {
                const success = await subscribeToPush();
                pushSubscribed = success;
            }
        } catch {
            // 권한 거부 등
        } finally {
            pushLoading = false;
        }
    }

    async function toggleNotifPref(type: string) {
        const newValue = !notifPrefs[type];
        notifPrefs[type] = newValue;
        try {
            const res = await fetch('/api/notifications/preferences', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, enabled: newValue }),
            });
            if (!res.ok) {
                notifPrefs[type] = !newValue;
            }
        } catch {
            notifPrefs[type] = !newValue;
        }
    }
</script>

{#if open}
    <div
        class="modal-backdrop"
        onclick={() => open = false}
        onkeydown={(e) => e.key === 'Escape' && (open = false)}
        role="button"
        tabindex="-1"
        aria-label="Close settings"
    >
        <div class="modal-content" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
            <div class="modal-header">
                <h3>설정</h3>
                <button class="btn-close" onclick={() => open = false} aria-label="Close">✕</button>
            </div>

            <!-- Haptics Toggle -->
            <div class="setting-card haptics-card">
                <div class="setting-info">
                    <div class="setting-title">진동 효과 (Haptic Feedback)</div>
                    <div class="setting-desc">
                        {#if typeof window !== 'undefined' && !window.navigator?.vibrate}
                            <span class="no-support">현재 기기/브라우저는 진동을 지원하지 않습니다. (예: 아이폰)</span>
                        {:else}
                            오락실 게임 진행 중 중요한 순간에 진동으로 알려줍니다.
                        {/if}
                    </div>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" bind:checked={$hapticsEnabled}>
                    <span class="slider" class:active={$hapticsEnabled}>
                        <span class="slider-button"></span>
                    </span>
                </label>
            </div>

            <!-- Theme Settings -->
            <div class="setting-card">
                <div class="setting-info">
                    <div class="setting-title">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                        </svg>
                        테마 설정
                    </div>
                    <div class="setting-desc">
                        앱의 외관을 변경할 수 있습니다.
                    </div>
                </div>

                <div class="theme-options">
                    <label class="theme-option" class:active={themeStore.mode === 'light'}>
                        <input
                            type="radio"
                            name="theme"
                            value="light"
                            checked={themeStore.mode === 'light'}
                            onchange={() => themeStore.setMode('light')}
                        />
                        <span class="theme-emoji">☀️</span>
                        <span class="theme-label">라이트</span>
                    </label>

                    <label class="theme-option" class:active={themeStore.mode === 'dark'}>
                        <input
                            type="radio"
                            name="theme"
                            value="dark"
                            checked={themeStore.mode === 'dark'}
                            onchange={() => themeStore.setMode('dark')}
                        />
                        <span class="theme-emoji">🌙</span>
                        <span class="theme-label">다크</span>
                    </label>

                    <label class="theme-option" class:active={themeStore.mode === 'system'}>
                        <input
                            type="radio"
                            name="theme"
                            value="system"
                            checked={themeStore.mode === 'system'}
                            onchange={() => themeStore.setMode('system')}
                        />
                        <span class="theme-emoji">💻</span>
                        <span class="theme-label">기기 설정</span>
                    </label>
                </div>

                {#if themeStore.mode === 'system'}
                    <p class="system-theme-info">
                        현재: {themeStore.effectiveTheme === 'dark' ? '다크 모드' : '라이트 모드'}
                    </p>
                {/if}
            </div>

            <!-- Push Notification Toggle -->
            {#if $user.id}
            <div class="setting-card push-card">
                <div class="setting-info">
                    <div class="setting-title">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                        </svg>
                        푸시 알림
                    </div>
                    <div class="setting-desc">
                        {#if !pushSupported}
                            <span class="no-support">이 브라우저에서는 푸시 알림을 지원하지 않습니다.</span>
                        {:else if isIOS && !pushIsStandalone}
                            <span class="no-support">홈 화면에 추가한 후 푸시 알림을 사용할 수 있습니다.</span>
                        {:else}
                            앱을 닫아도 새 알림을 받을 수 있습니다.
                        {/if}
                    </div>
                </div>
                {#if pushSupported && (!isIOS || pushIsStandalone)}
                    <button class="toggle-switch" onclick={togglePush} disabled={pushLoading} aria-pressed={pushSubscribed}>
                        <span class="slider" class:active={pushSubscribed}>
                            <span class="slider-button"></span>
                        </span>
                    </button>
                {/if}
            </div>
            {/if}

            <!-- Notification Settings -->
            {#if $user.id}
            <div class="setting-card">
                <div class="setting-info">
                    <div class="setting-title">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/>
                            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
                        </svg>
                        알림 설정
                    </div>
                    <div class="setting-desc">
                        받고 싶은 알림을 선택할 수 있습니다.
                    </div>
                </div>

                <div class="notif-toggles">
                    {#each NOTIF_TYPES as nt (nt.key)}
                        <div class="notif-toggle-row">
                            <div class="notif-toggle-info">
                                <span class="notif-toggle-label">{nt.label}</span>
                                <span class="notif-toggle-desc">{nt.desc}</span>
                            </div>
                            <label class="toggle-switch">
                                <input type="checkbox" checked={notifPrefs[nt.key]} onchange={() => toggleNotifPref(nt.key)}>
                                <span class="slider" class:active={notifPrefs[nt.key]}>
                                    <span class="slider-button"></span>
                                </span>
                            </label>
                        </div>
                    {/each}
                </div>
            </div>
            {/if}

            <button class="btn-close-modal" onclick={() => open = false}>닫기</button>
        </div>
    </div>
{/if}

<style>
    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: var(--overlay-heavy);
        z-index: 1100;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        box-sizing: border-box;
    }

    .modal-content {
        background: var(--bg-primary);
        padding: 1.5rem;
        border-radius: 16px;
        max-width: 450px;
        width: 100%;
        box-shadow: 0 4px 20px var(--shadow-lg);
        max-height: 90vh;
        overflow-y: auto;
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
    }

    .modal-header h3 {
        margin: 0;
        font-size: 1.3rem;
        color: var(--text-primary);
    }

    .btn-close {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0;
        color: var(--text-secondary);
        line-height: 1;
    }

    .btn-close:hover {
        color: var(--text-primary);
    }

    .setting-card {
        background: var(--bg-primary);
        padding: 1.5rem;
        border-radius: 16px;
        margin-bottom: 1rem;
        box-shadow: 0 2px 10px var(--shadow-sm);
        border: 1px solid var(--border-light);
    }

    .setting-card:last-of-type {
        margin-bottom: 1.5rem;
    }

    .setting-info {
        margin-bottom: 1rem;
    }

    .setting-title {
        font-weight: 700;
        font-size: 1.05rem;
        margin-bottom: 0.3rem;
        color: var(--text-primary);
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .setting-desc {
        font-size: 0.85rem;
        color: var(--text-secondary);
        line-height: 1.4;
    }

    .no-support {
        color: var(--color-red);
        font-weight: 600;
    }

    /* Toggle Switch */
    .toggle-switch {
        position: relative;
        display: inline-block;
        width: 50px;
        height: 28px;
        cursor: pointer;
        background: none;
        border: none;
        padding: 0;
    }

    .toggle-switch input {
        opacity: 0;
        width: 0;
        height: 0;
    }

    .slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: var(--border-medium);
        transition: .4s;
        border-radius: 34px;
    }

    .slider.active {
        background-color: var(--color-amber);
    }

    .slider-button {
        position: absolute;
        content: '';
        height: 20px;
        width: 20px;
        left: 4px;
        bottom: 4px;
        background-color: var(--bg-primary);
        transition: .4s;
        border-radius: 50%;
    }

    .slider.active .slider-button {
        transform: translateX(22px);
    }

    .haptics-card,
    .push-card {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .haptics-card .setting-info,
    .push-card .setting-info {
        margin-bottom: 0;
        flex: 1;
    }

    /* Theme Options */
    .theme-options {
        display: flex;
        gap: 0.75rem;
    }

    .theme-option {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        padding: 1rem;
        border: 2px solid var(--border-light);
        border-radius: 12px;
        background: var(--bg-primary);
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .theme-option.active {
        border-color: var(--color-blue);
        background: var(--color-info-bg);
    }

    .theme-option input {
        display: none;
    }

    .theme-emoji {
        font-size: 1.75rem;
    }

    .theme-label {
        font-size: 0.9rem;
        font-weight: 500;
        color: var(--text-secondary);
    }

    .theme-option.active .theme-label {
        font-weight: 600;
        color: var(--color-blue);
    }

    .system-theme-info {
        margin-top: 0.75rem;
        margin-bottom: 0;
        font-size: 0.85rem;
        color: var(--text-secondary);
        text-align: center;
    }

    /* Notification Toggles */
    .notif-toggles {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .notif-toggle-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem 0;
        border-bottom: 1px solid var(--border-light);
    }

    .notif-toggle-row:last-child {
        border-bottom: none;
        padding-bottom: 0;
    }

    .notif-toggle-info {
        flex: 1;
        margin-right: 0.75rem;
    }

    .notif-toggle-label {
        display: block;
        font-size: 0.9rem;
        font-weight: 600;
        color: var(--text-primary);
        margin-bottom: 0.15rem;
    }

    .notif-toggle-desc {
        display: block;
        font-size: 0.75rem;
        color: var(--text-muted);
        line-height: 1.3;
    }

    .btn-close-modal {
        width: 100%;
        padding: 0.8rem;
        background: var(--color-blue);
        color: var(--bg-primary);
        border: none;
        border-radius: 8px;
        font-weight: bold;
        font-size: 1rem;
        cursor: pointer;
        transition: background 0.2s;
    }

    .btn-close-modal:hover {
        opacity: 0.9;
    }

    /* Mobile Responsive - Fullscreen Modal */
    @media (max-width: 480px) {
        .modal-backdrop {
            padding: 0;
        }

        .modal-content {
            max-width: 100%;
            max-height: 100%;
            height: 100%;
            border-radius: 0;
            padding: 1.25rem 1rem;
            padding-top: calc(1.25rem + env(safe-area-inset-top, 0px));
            padding-bottom: calc(1rem + 60px + env(safe-area-inset-bottom, 0px));
        }

        .modal-header {
            margin-bottom: 1rem;
        }

        .btn-close {
            padding: 8px;
            margin: -8px;
            min-width: 44px;
            min-height: 44px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .setting-card {
            padding: 1rem;
            border-radius: 12px;
            margin-bottom: 0.75rem;
        }

        .setting-card:last-of-type {
            margin-bottom: 1rem;
        }

        .setting-info {
            margin-bottom: 0.75rem;
        }

        .setting-title {
            font-size: 1rem;
        }

        .setting-desc {
            font-size: 0.8rem;
        }

        .theme-options {
            gap: 0.5rem;
        }

        .theme-option {
            padding: 0.75rem 0.5rem;
            border-radius: 10px;
            min-height: 44px;
        }

        .theme-emoji {
            font-size: 1.5rem;
        }

        .theme-label {
            font-size: 0.8rem;
        }

        .toggle-switch {
            flex-shrink: 0;
            padding: 8px 0;
        }

        .haptics-card .setting-info {
            margin-right: 0.75rem;
        }

        .notif-toggle-row {
            padding: 0.625rem 0;
        }

        .notif-toggle-info {
            margin-right: 0.5rem;
        }

        .notif-toggle-label {
            font-size: 0.85rem;
        }

        .notif-toggle-desc {
            font-size: 0.7rem;
            line-height: 1.25;
        }

        .btn-close-modal {
            padding: 0.875rem;
            font-size: 0.95rem;
            min-height: 48px;
        }
    }
</style>
