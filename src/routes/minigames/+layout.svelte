<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import { page } from '$app/stores';
    import { user } from '$lib/stores/user';
    import NotificationBell from '$lib/components/notifications/NotificationBell.svelte';

    let { children } = $props();
    let originalBg = '';

    const GAME_PLAY_PATHS = ['/minigames/tichu', '/minigames/sudoku', '/minigames/killer-sudoku', '/minigames/unblock-me', '/minigames/energy', '/minigames/water-sort', '/minigames/flow-free'];
    const isPlaying = $derived(GAME_PLAY_PATHS.some(p => $page.url.pathname.startsWith(p)));

    onMount(() => {
        originalBg = document.body.style.backgroundColor;
        document.body.style.backgroundColor = '#f0f0f0';
        user.refresh();
    });

    onDestroy(() => {
        if (browser) {
            document.body.style.backgroundColor = originalBg;
        }
    });
</script>

<div data-theme="light" class="force-light">
    {#if !isPlaying}
        <div class="notification-area">
            <NotificationBell />
        </div>
    {/if}
    {@render children()}
</div>

<style>
    .notification-area {
        position: fixed;
        top: 12px;
        right: 12px;
        z-index: 100;
    }

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
        --color-blue-bright: #007bff;
        --color-amber: #fbbf24;
        --color-amber-dark: #f59e0b;
        --color-amber-darker: #d97706;
        --color-green: #22c55e;
        --color-green-dark: #2b8a3e;
        --color-red: #ef4444;
        --color-red-dark: #d32f2f;
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
        --color-indigo: #364fc7;

        color-scheme: light;
    }

</style>
