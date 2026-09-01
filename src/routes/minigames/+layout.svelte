<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import { user } from '$lib/stores/user';

    let { children } = $props();
    let originalBg = '';

    onMount(() => {
        originalBg = document.body.style.backgroundColor;
        // 예전엔 라이트 전용 값(#f0f0f0)을 하드코딩해서 다크 테마에서도
        // 강제로 밝은 배경이 됐다 — 실제 테마 토큰값을 읽어서 적용
        const bgSecondary = getComputedStyle(document.documentElement).getPropertyValue('--bg-secondary').trim();
        document.body.style.backgroundColor = bgSecondary || '#f0f0f0';
        user.refresh();
    });

    onDestroy(() => {
        if (browser) {
            document.body.style.backgroundColor = originalBg;
        }
    });
</script>

{@render children()}
