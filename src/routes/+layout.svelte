<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
    import { page } from '$app/stores';
    import { onMount, onDestroy } from 'svelte';
    import { afterNavigate } from '$app/navigation';
    import { version } from '$app/environment';
    import PointDisplay from '$lib/components/gamification/PointDisplay.svelte';
    import AdBanner from '$lib/components/ads/AdBanner.svelte';
    import RankUpModal from '$lib/components/gamification/RankUpModal.svelte';

	let { children } = $props();

    const GAME_PATHS = ['/games/tichu', '/games/sudoku', '/games/killer-sudoku', '/games/unblock-me', '/games/energy', '/games/water-sort'];
    let versionCheckTimer: ReturnType<typeof setInterval> | null = null;

    function isInGame(pathname: string): boolean {
        return GAME_PATHS.some(p => pathname.startsWith(p));
    }

    // iOS PWA 페이지 전환 시 하단 네비게이션 터치 버그 수정
    afterNavigate(() => {
        const nav = document.querySelector('.bottom-nav');
        if (nav instanceof HTMLElement) {
            nav.style.display = 'none';
            nav.offsetHeight; // 강제 리플로우로 env(safe-area-inset-bottom) 재계산
            nav.style.display = '';
        }
    });

    onMount(() => {
        versionCheckTimer = setInterval(async () => {
            try {
                const res = await fetch(`/_app/version.json`, { cache: 'no-store' });
                if (!res.ok) return;
                const data = await res.json();
                if (data.version && data.version !== version) {
                    if (!isInGame($page.url.pathname)) {
                        location.reload();
                    }
                }
            } catch {}
        }, 60_000);
    });

    onDestroy(() => {
        if (versionCheckTimer) clearInterval(versionCheckTimer);
    });
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="app-layout">
    <!-- Top Bar for Points (Shop Button) - Temporarily hidden for initial release -->
    <!-- {#if $page.url.pathname === '/minigames'}
        <div class="top-bar">
            <div class="spacer"></div>
            <PointDisplay />
        </div>
    {/if} -->

	<main class="content">
		{@render children()}
        {#if !$page.url.pathname.startsWith('/admin') && !$page.url.pathname.includes('/games/') && !$page.url.pathname.startsWith('/tools/')}
             <AdBanner adSlot="footer-banner" />
        {/if}
	</main>

	{#if !$page.url.pathname.startsWith('/admin') && !$page.url.pathname.startsWith('/games/') && !$page.url.pathname.startsWith('/tools/')}
	<footer class="site-footer">
		<a href="/about">소개</a>
		<span class="divider">|</span>
		<a href="/privacy">개인정보처리방침</a>
	</footer>
	<nav class="bottom-nav">
		<a href="/" class="nav-item home" class:active={$page.url.pathname === '/'}>
			<span class="icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </span>
			<span class="label">홈</span>
		</a>
		<a href="/games" class="nav-item games" class:active={$page.url.pathname.startsWith('/games') && !$page.url.pathname.startsWith('/games/sudoku')}>
			<span class="icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
            </span>
			<span class="label">보드게임</span>
		</a>
		<a href="/minigames" class="nav-item ranking" class:active={$page.url.pathname.startsWith('/minigames') || $page.url.pathname.startsWith('/games/sudoku')}>
			<span class="icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg>
            </span>
			<span class="label">오락실</span>
		</a>
		<a href="/mypage" class="nav-item mypage" class:active={$page.url.pathname.startsWith('/mypage')}>
			<span class="icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </span>
			<span class="label">마이페이지</span>
		</a>
	</nav>
	{/if}

	<RankUpModal />
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
		background: #f8f9fa;
        overscroll-behavior-y: none;
        touch-action: manipulation;
	}
    :global(*), :global(*::before), :global(*::after) {
        box-sizing: border-box;
    }
	.app-layout {
		min-height: 100vh;
		position: relative;
		padding-bottom: calc(70px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
	}
	.content {
		flex: 1;
	}


	.bottom-nav {
		position: fixed;
		bottom: 0;
		left: 50%;
        transform: translateX(-50%);
		width: 100%;
        max-width: 600px;
		height: 60px;
        box-sizing: content-box;
		background: white;
		border-top: 1px solid #eee;
		display: flex;
		justify-content: space-around;
		align-items: center;
		padding-bottom: env(safe-area-inset-bottom);
		box-shadow: 0 -2px 10px rgba(0,0,0,0.03);
		z-index: 1000;
        border-left: 1px solid #f1f3f5;
        border-right: 1px solid #f1f3f5;
		isolation: isolate;
	}
	.nav-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-decoration: none;
		color: #999;
		font-size: 0.7rem;
		padding: 0.5rem;
		flex: 1;
		transition: color 0.2s;
	}
	.nav-item .icon {
		font-size: 1.4rem;
		margin-bottom: 3px;
	}
	.nav-item.active {
		color: #333;
	}
    .nav-item.active .icon {
        transform: scale(1.1);
        transition: transform 0.2s;
    }

	.site-footer {
		text-align: center;
		padding: 16px 0 8px;
		font-size: 0.8rem;
	}
	.site-footer a {
		color: #999;
		text-decoration: none;
	}
	.site-footer a:hover {
		color: #666;
		text-decoration: underline;
	}
	.site-footer .divider {
		color: #ddd;
		margin: 0 8px;
	}
</style>
