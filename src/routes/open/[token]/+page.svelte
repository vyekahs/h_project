<script lang="ts">
    import { page } from '$app/stores';
    import { onMount } from 'svelte';

    const token = $page.params.token;
    const checkinPath = `/checkin/${token}`;

    let status = $state('loading');

    onMount(() => {
        const ua = navigator.userAgent;
        const fullUrl = window.location.origin + checkinPath;

        if (/android/i.test(ua)) {
            // Android: intent scheme → Chrome
            const intentUrl = `intent://${window.location.host}${checkinPath}#Intent;scheme=https;package=com.android.chrome;end`;
            window.location.href = intentUrl;
            setTimeout(() => { status = 'fallback'; }, 2000);
        } else if (/iphone|ipad|ipod/i.test(ua)) {
            // iOS: googlechromes:// scheme
            const chromeUrl = fullUrl.replace('https://', 'googlechromes://').replace('http://', 'googlechrome://');
            window.location.href = chromeUrl;
            setTimeout(() => { status = 'fallback'; }, 2000);
        } else {
            // PC/기타: 바로 체크인 페이지로 이동
            window.location.href = checkinPath;
        }
    });

    function openInChrome() {
        const ua = navigator.userAgent;
        const fullUrl = window.location.origin + checkinPath;

        if (/android/i.test(ua)) {
            window.location.href = `intent://${window.location.host}${checkinPath}#Intent;scheme=https;package=com.android.chrome;end`;
        } else if (/iphone|ipad|ipod/i.test(ua)) {
            window.location.href = fullUrl.replace('https://', 'googlechromes://').replace('http://', 'googlechrome://');
        }
    }
</script>

<div class="container">
    <div class="card">
        {#if status === 'loading'}
            <div class="spinner"></div>
            <h2>Chrome으로 여는 중...</h2>
            <p class="sub">잠시만 기다려주세요</p>
        {:else}
            <div class="icon">🌐</div>
            <h2>Chrome으로 열기</h2>
            <p class="sub">자동으로 열리지 않았다면 아래 버튼을 눌러주세요</p>
            <button class="btn-chrome" onclick={openInChrome}>
                Chrome으로 열기
            </button>
        {/if}

        <a href={checkinPath} class="btn-fallback">
            이 브라우저에서 계속
        </a>
    </div>
</div>

<style>
    .container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background: var(--bg-elevated);
        padding: 1rem;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .card {
        background: var(--bg-primary);
        padding: 3rem 2rem;
        border-radius: 20px;
        box-shadow: 0 10px 25px var(--shadow-md);
        text-align: center;
        width: 100%;
        max-width: 360px;
    }
    .icon {
        font-size: 3rem;
        margin-bottom: 1rem;
    }
    h2 {
        margin: 0 0 0.5rem 0;
        color: var(--text-primary);
        font-size: 1.3rem;
    }
    .sub {
        color: var(--text-tertiary);
        font-size: 0.95rem;
        margin-bottom: 1.5rem;
    }
    .btn-chrome {
        display: block;
        width: 100%;
        padding: 0.85rem;
        background: var(--color-blue);
        color: var(--bg-primary);
        border: none;
        border-radius: 12px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        margin-bottom: 1rem;
        transition: background 0.2s;
    }
    .btn-chrome:hover {
        background: var(--color-indigo);
    }
    .btn-fallback {
        display: block;
        color: var(--text-tertiary);
        text-decoration: none;
        font-size: 0.9rem;
        padding: 0.5rem;
    }
    .btn-fallback:hover {
        color: var(--text-primary);
    }
    .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid var(--bg-hover);
        border-top-color: var(--color-blue);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin: 0 auto 1.5rem;
    }
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
</style>
