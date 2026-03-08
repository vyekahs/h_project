<script lang="ts">
    import { hapticsEnabled } from '$lib/stores/haptics';
    import { themeStore } from '$lib/stores/theme.svelte';

    let { open = $bindable(false) } = $props();
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
            <div class="setting-card">
                <div class="setting-info">
                    <div class="setting-title">진동 효과 (Haptic Feedback)</div>
                    <div class="setting-desc">
                        {#if typeof window !== 'undefined' && !window.navigator?.vibrate}
                            <span style="color: var(--color-error); font-weight: 600;">현재 기기/브라우저는 진동을 지원하지 않습니다. (예: 아이폰)</span>
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
                    <label class="theme-option" class:active={themeStore.theme === 'light'}>
                        <input
                            type="radio"
                            name="theme"
                            value="light"
                            checked={themeStore.theme === 'light'}
                            onchange={() => themeStore.setTheme('light')}
                        />
                        <span class="theme-emoji">☀️</span>
                        <span class="theme-label">라이트</span>
                    </label>

                    <label class="theme-option" class:active={themeStore.theme === 'dark'}>
                        <input
                            type="radio"
                            name="theme"
                            value="dark"
                            checked={themeStore.theme === 'dark'}
                            onchange={() => themeStore.setTheme('dark')}
                        />
                        <span class="theme-emoji">🌙</span>
                        <span class="theme-label">다크</span>
                    </label>

                    <label class="theme-option" class:active={themeStore.theme === 'system'}>
                        <input
                            type="radio"
                            name="theme"
                            value="system"
                            checked={themeStore.theme === 'system'}
                            onchange={() => themeStore.setTheme('system')}
                        />
                        <span class="theme-emoji">💻</span>
                        <span class="theme-label">기기 설정</span>
                    </label>
                </div>

                {#if themeStore.theme === 'system'}
                    <p class="system-theme-info">
                        현재: {themeStore.resolvedTheme === 'dark' ? '다크 모드' : '라이트 모드'}
                    </p>
                {/if}
            </div>

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
        background: var(--overlay-bg);
        z-index: 1000;
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
        box-shadow: var(--shadow-lg);
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
        box-shadow: var(--shadow-md);
        border: 1px solid var(--border-color);
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

    /* Toggle Switch */
    .toggle-switch {
        position: relative;
        display: inline-block;
        width: 50px;
        height: 28px;
        cursor: pointer;
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
        background-color: var(--border-color-hover);
        transition: .4s;
        border-radius: 34px;
    }

    .slider.active {
        background-color: var(--accent-primary);
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

    .setting-card:first-of-type {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .setting-card:first-of-type .setting-info {
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
        border: 2px solid var(--border-color);
        border-radius: 12px;
        background: var(--bg-primary);
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .theme-option.active {
        border-color: var(--accent-primary);
        background: var(--accent-light);
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
        color: var(--accent-primary);
    }

    .system-theme-info {
        margin-top: 0.75rem;
        margin-bottom: 0;
        font-size: 0.85rem;
        color: var(--text-secondary);
        text-align: center;
    }

    .btn-close-modal {
        width: 100%;
        padding: 0.8rem;
        background: var(--accent-primary);
        color: var(--bg-primary);
        border: none;
        border-radius: 8px;
        font-weight: bold;
        font-size: 1rem;
        cursor: pointer;
        transition: background 0.2s;
    }

    .btn-close-modal:hover {
        background: var(--accent-hover);
    }
</style>
