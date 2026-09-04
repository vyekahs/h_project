<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
    import { page } from '$app/stores';
    import { onMount, onDestroy } from 'svelte';
    import { afterNavigate } from '$app/navigation';
    import { version, dev } from '$app/environment';
    import PointDisplay from '$lib/components/gamification/PointDisplay.svelte';
    import AdBanner from '$lib/components/ads/AdBanner.svelte';
    import RankUpModal from '$lib/components/gamification/RankUpModal.svelte';
    import NotificationToast from '$lib/components/notifications/NotificationToast.svelte';
    import NotificationBell from '$lib/components/notifications/NotificationBell.svelte';
    import NetworkStatusBanner from '$lib/components/NetworkStatusBanner.svelte';
    import { themeStore } from '$lib/stores/theme.svelte';
    import { user } from '$lib/stores/user';
    import { initNotificationsSSE } from '$lib/stores/notifications.svelte';
    import { initNetworkHealthCheck } from '$lib/stores/networkHealth.svelte';
    import { isInGame } from '$lib/games/isInGame';

	let { children } = $props();

    let versionCheckTimer: ReturnType<typeof setInterval> | null = null;

    // 하단 네비게이션 물방울 인디케이터
    const navActiveIndex = $derived.by(() => {
        const path = $page.url.pathname;
        if (path.startsWith('/collection') || path.startsWith('/games')) return 1;
        if (path.startsWith('/minigames')) return 2;
        if (path.startsWith('/mypage')) return 3;
        return 0;
    });
    let navSquash = $state(false);
    let navMounted = false;
    let navPrevIndex = 0;
    let navSquashTimer: ReturnType<typeof setTimeout> | null = null;
    $effect(() => {
        const idx = navActiveIndex;
        if (!navMounted) {
            navMounted = true;
            navPrevIndex = idx;
            return;
        }
        if (idx === navPrevIndex) return;
        navPrevIndex = idx;
        navSquash = false;
        requestAnimationFrame(() => {
            navSquash = true;
            if (navSquashTimer) clearTimeout(navSquashTimer);
            navSquashTimer = setTimeout(() => { navSquash = false; }, 500);
        });
    });

    // iOS PWA 페이지 전환 시 하단 네비게이션 터치 버그 수정
    // (주의: display:none 토글은 인디케이터 트랜지션을 매번 끊어버리므로 사용하지 않는다 —
    //  bottom 값만 잠깐 흔들어서 env(safe-area-inset-bottom) 재계산을 강제한다)
    afterNavigate(() => {
        const nav = document.querySelector('.bottom-nav');
        if (nav instanceof HTMLElement) {
            const prevBottom = nav.style.bottom;
            nav.style.bottom = '0px';
            void nav.offsetHeight; // 강제 리플로우
            nav.style.bottom = prevBottom;
        }
    });

    // 알림 SSE는 로그인 확인 후 레이아웃에서 세션당 한 번만 연결한다.
    // (NotificationBell이 레이아웃/홈/마이페이지에 각각 따로 마운트되기 때문에,
    //  컴포넌트 마운트에 연결을 묶으면 페이지 이동마다 재연결됨)
    // $user.id는 세션이 없어도 dev/test용 폴백(1번 Guest)으로 채워지므로,
    // 실제 세션 검증을 통과했는지는 authenticated 플래그로 따로 확인한다.
    $effect(() => {
        if ($user.authenticated) {
            initNotificationsSSE();
        }
    });

    onMount(() => {
        themeStore.init();
        /*
            어드민 콘솔은 회원 세션이 아니라 admin_session으로 인증한다.
            그런데도 이 호출이 나가서 모든 어드민 로드마다 401이 콘솔에 빨간
            에러로 찍혔다 — 네트워크 계층이 내는 것이라 코드로 삼킬 수 없다.
            어드민 화면은 이 스토어를 읽는 곳이 하나도 없다.
        */
        if (!$page.url.pathname.startsWith('/admin')) user.refresh();
        initNetworkHealthCheck();

        // /_app/version.json은 프로덕션 빌드에만 생성됨 (vite dev에선 없어서 항상 404) — dev 모드에선 폴링 생략
        if (dev) return;

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
        if (navSquashTimer) clearTimeout(navSquashTimer);
    });
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="app-layout" class:is-admin={$page.url.pathname.startsWith('/admin')}>
    <!-- Top Bar for Points (Shop Button) - Temporarily hidden for initial release -->
    <!-- {#if $page.url.pathname === '/minigames'}
        <div class="top-bar">
            <div class="spacer"></div>
            <PointDisplay />
        </div>
    {/if} -->

	<!--
		어드민 콘솔은 자기 <main>(사이드바를 뺀 오른쪽 열)을 따로 가진다.
		여기까지 <main>이면 랜드마크가 둘이 되고 유효하지 않은 HTML이 된다.
	-->
	<svelte:element this={$page.url.pathname.startsWith('/admin') ? 'div' : 'main'} class="content">
		{@render children()}
        {#if !$page.url.pathname.startsWith('/admin') && !$page.url.pathname.includes('/minigames/') && !$page.url.pathname.startsWith('/tools/') && !$page.url.pathname.startsWith('/party/')}
             <AdBanner adSlot="footer-banner" />
        {/if}
	</svelte:element>

	{#if !$page.url.pathname.startsWith('/admin') && !$page.url.pathname.startsWith('/minigames/') && !$page.url.pathname.startsWith('/tools/') && !$page.url.pathname.startsWith('/party/')}
	<footer class="site-footer">
		<a href="/about">소개</a>
		<span class="divider">|</span>
		<a href="/guides">게임 가이드</a>
		<span class="divider">|</span>
		<a href="/faq">FAQ</a>
		<span class="divider">|</span>
		<a href="/privacy">개인정보처리방침</a>
	</footer>
	<nav class="bottom-nav">
		<div class="nav-indicator" style={`--active-index: ${navActiveIndex}`}>
			<div class="nav-indicator-blob" class:squash={navSquash}></div>
		</div>
		<a href="/" class="nav-item home" class:active={$page.url.pathname === '/'}>
			<span class="icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </span>
			<span class="label">홈</span>
		</a>
		<a href="/collection" class="nav-item games" class:active={$page.url.pathname.startsWith('/collection') || $page.url.pathname.startsWith('/games')}>
			<span class="icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
            </span>
			<span class="label">보드게임</span>
		</a>
		<a href="/minigames" class="nav-item ranking" class:active={$page.url.pathname.startsWith('/minigames')}>
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

	{#if !$page.url.pathname.startsWith('/admin') && !isInGame($page.url.pathname) && !$page.url.pathname.startsWith('/minigames/') && $page.url.pathname !== '/' && !$page.url.pathname.startsWith('/mypage')}
		<div class="global-notification-bell">
			<NotificationBell />
		</div>
	{/if}

	<RankUpModal />
	<NotificationToast />
	<NetworkStatusBanner />
</div>

<style>
    /* ===== CSS Variables (Light Mode - Default) ===== */
    :global(:root) {
        /* Text */
        --text-primary: #333;
        --text-secondary: #666;
        --text-tertiary: #4b5563;
        --text-muted: #5f6b7a;
        --text-hint: #5b6472;
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

        /* Brand Colors */
        --color-blue: #1864ab;
        --color-blue-bright: #0056b3;
        --color-amber: #fbbf24;
        --color-amber-dark: #f59e0b;
        --color-amber-darker: #d97706;
        --color-green: #22c55e;
        --color-green-dark: #1b6b2c;
        --color-red: #ef4444;
        --color-red-dark: #d32f2f;
        --color-orange: #ff9800;
        --color-orange-dark: #c2410c;
        /* 흰 텍스트를 얹는 배경 전용 — --color-red-dark는 다크 테마에서 --color-red와
           같은 값(밝은 레드)으로 앨리어싱되어 배경으로 쓰면 흰 텍스트 대비가 깨진다 */
        --status-danger-bg: #d32f2f;
        /* 밝은 amber 틴트 배경 위에 얹는 텍스트 전용 — --color-amber-darker는
           흰/크림 배경에서 ~3:1이라 일반 크기 텍스트로 쓰면 AA(4.5:1) 미달 */
        --color-achievement-text: #92400e;

        /* State Backgrounds */
        --color-success-bg: #e8f5e9;
        --color-error-bg: #fff5f5;
        --color-warning-bg: #fff3e0;
        --color-info-bg: #e7f5ff;

        /* Glass surfaces (오락실 등 glassmorphism 카드용) — 흰색 반투명을
           하드코딩하면 다크 테마에서 뿌연 얼룩이 되어 테마별로 분리 */
        --glass-surface-strong: rgba(255, 255, 255, 0.7);
        --glass-surface-medium: rgba(255, 255, 255, 0.65);
        --glass-surface-soft: rgba(255, 255, 255, 0.2);
        --glass-surface-faint: rgba(255, 255, 255, 0.4);
        --glass-border-soft: rgba(255, 255, 255, 0.3);
        --glass-border-strong: rgba(255, 255, 255, 0.8);
        --glass-inset-highlight: rgba(255, 255, 255, 0.5);

        /* 오락실 배경 그라디언트 — 라이트는 파스텔, 다크는 은은한 색 글로우.
           하드코딩된 파스텔을 그대로 두면 다크에서 화면 전체가 회백색으로 떠버린다 */
        --arcade-bg-gradient: radial-gradient(circle at 10% 20%, rgba(216, 241, 230, 0.7) 0%, rgba(233, 240, 255, 0.4) 40%, rgba(240, 230, 250, 0.3) 80%);

        /* --bg-dark와 짝을 이루는 더 깊은 톤 (반전 버튼의 그라디언트 끝점).
           #111을 하드코딩하면 다크에서 밝은색 → 검정 그라디언트가 되어 글자가 묻힌다 */
        --bg-dark-deep: #111;

        /* Additional Colors */
        --border-warning: #ffe0b2;
        --color-purple-bg: #e8d5f5;
        --color-indigo: #364fc7;

        /* Bottom nav glass */
        --nav-glass-bg: rgba(255, 255, 255, 0.6);
        --nav-glass-border: rgba(255, 255, 255, 0.7);

        /* Status pill text (AA-contrast pairing for pale status backgrounds) */
        --status-success-text: #1b5e20;

        color-scheme: light;
    }

    /* ===== Dark Mode ===== */
    :global([data-theme='dark']) {
        /* Text */
        --text-primary: #e5e7eb;
        --text-secondary: #9ca3af;
        --text-tertiary: #8a94a3; /* #6b7280은 --bg-primary(#1a1b1e) 위에서 3.56:1로 AA(4.5:1) 미달이었음 */
        --text-muted: #8a94a3;
        --text-hint: #4b5563;
        --text-dark: #d1d5db;
        --text-darker: #d1d5db;

        /* Backgrounds */
        --bg-primary: #1a1b1e;
        --bg-secondary: #25262b;
        --bg-tertiary: #2c2e33;
        --bg-elevated: #2c2e33;
        --bg-hover: #343539;
        --bg-active: #3e4044;
        --bg-surface: #25262b;
        --bg-dark: #e5e7eb;

        /* Borders */
        --border-default: #3e4044;
        --border-light: #2c2e33;
        --border-medium: #4b5563;

        /* Shadows */
        --shadow-sm: rgba(0,0,0,0.2);
        --shadow-md: rgba(0,0,0,0.3);
        --shadow-lg: rgba(0,0,0,0.4);
        --shadow-heavy: rgba(0,0,0,0.5);
        --shadow-deep: rgba(0,0,0,0.7);

        /* Overlays */
        --overlay-light: rgba(255,255,255,0.05);
        --overlay-medium: rgba(0,0,0,0.4);
        --overlay-heavy: rgba(0,0,0,0.6);

        /* Slate */
        --color-slate: #94a3b8;
        --color-slate-dark: #94a3b8;

        /* Brand Colors (slightly brighter for dark bg) */
        --color-blue: #4dabf7;
        --color-blue-bright: #4dabf7;
        --color-amber: #fbbf24;
        --color-amber-dark: #f59e0b;
        --color-amber-darker: #f59e0b;
        --color-green: #34d399;
        --color-green-dark: #34d399;
        --color-red: #f87171;
        --color-red-dark: #f87171;
        /* --color-red-dark와 달리 다크 테마에서도 실제로 어둡게 유지 — 흰 텍스트 대비 확보용 */
        --status-danger-bg: #c62828;
        /* 다크 테마의 어두운 배경 위에서는 밝은 amber가 이미 대비를 확보하므로
           --color-amber-darker를 그대로 재사용 */
        --color-achievement-text: #f59e0b;
        --color-orange: #ffb74d;
        --color-orange-dark: #ff9800;

        /* State Backgrounds */
        --color-success-bg: rgba(34,197,94,0.12);
        --color-error-bg: rgba(239,68,68,0.12);
        --color-warning-bg: rgba(251,191,36,0.12);
        --color-info-bg: rgba(59,130,246,0.12);

        /* 다크 테마의 글래스 표면 — 흰색을 아주 낮은 불투명도로 유지해
           "서리 낀 유리" 느낌은 살리되 하얗게 뜨지 않게 함 */
        --glass-surface-strong: rgba(255, 255, 255, 0.08);
        --glass-surface-medium: rgba(255, 255, 255, 0.06);
        --glass-surface-soft: rgba(255, 255, 255, 0.05);
        --glass-surface-faint: rgba(255, 255, 255, 0.04);
        --glass-border-soft: rgba(255, 255, 255, 0.1);
        --glass-border-strong: rgba(255, 255, 255, 0.14);
        --glass-inset-highlight: rgba(255, 255, 255, 0.08);

        --arcade-bg-gradient: radial-gradient(circle at 10% 20%, rgba(52, 211, 153, 0.07) 0%, rgba(96, 165, 250, 0.06) 40%, rgba(167, 139, 250, 0.05) 80%);

        --bg-dark-deep: #f3f4f6;

        /* Additional Colors */
        --border-warning: rgba(251,191,36,0.25);
        --color-purple-bg: rgba(147,51,234,0.12);
        --color-indigo: #5c7cfa;

        /* Bottom nav glass */
        --nav-glass-bg: rgba(37, 38, 43, 0.6);
        --nav-glass-border: rgba(255, 255, 255, 0.1);

        /* Status pill text (AA-contrast pairing for pale status backgrounds) */
        --status-success-text: #34d399;

        color-scheme: dark;
    }

	:global(body) {
		margin: 0;
		padding: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
		background: var(--bg-secondary);
        color: var(--text-primary);
        overscroll-behavior-y: none;
        touch-action: manipulation;
        transition: background-color 0.2s, color 0.2s;
	}
    /*
        어드민의 킬 스위치는 `.force-light *` — 후손만 잡는다. 이 transition은
        body, 즉 그 조상에 있어서 유일하게 설정을 빠져나갔다. 선언한 자리에서 끈다.
    */
    @media (prefers-reduced-motion: reduce) {
        :global(body) {
            transition: none;
        }
    }
    :global(input), :global(textarea), :global(select) {
        background-color: var(--bg-primary);
        color: var(--text-primary);
        border-color: var(--border-default);
    }
    :global(input::placeholder), :global(textarea::placeholder) {
        color: var(--text-hint);
    }
    :global(*), :global(*::before), :global(*::after) {
        box-sizing: border-box;
    }
	.app-layout {
		min-height: 100vh;
		position: relative;
		padding-bottom: calc(96px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
	}
	/* 어드민은 사이트 하단 네비를 쓰지 않으므로 그 자리를 비워둘 이유가 없다 */
	.app-layout.is-admin {
		padding-bottom: 0;
	}
	.content {
		flex: 1;
	}


	.bottom-nav {
		position: fixed;
		bottom: calc(16px + env(safe-area-inset-bottom));
		left: 50%;
        transform: translateX(-50%);
		width: calc(100% - 32px);
        max-width: 420px;
		height: 64px;
        box-sizing: border-box;
		background: var(--nav-glass-bg);
		backdrop-filter: blur(20px) saturate(180%);
		-webkit-backdrop-filter: blur(20px) saturate(180%);
		border-radius: 32px;
		border: 1px solid var(--nav-glass-border);
		display: flex;
		justify-content: space-around;
		align-items: center;
		padding: 0 6px;
		box-shadow: 0 12px 32px var(--shadow-lg), 0 1px 0 rgba(255,255,255,0.4) inset;
		z-index: 1000;
		isolation: isolate;
	}
	.nav-indicator {
		position: absolute;
		top: 6px;
		bottom: 6px;
		left: 6px;
		width: calc((100% - 12px) / 4);
		transform: translateX(calc(var(--active-index) * 100%));
		transition: transform 0.45s cubic-bezier(0.16, 1, 0.3, 1);
		z-index: 0;
		pointer-events: none;
	}
	.nav-indicator-blob {
		width: 100%;
		height: 100%;
		border-radius: 24px;
		background: var(--color-blue-bright);
		opacity: 0.16;
	}
	.nav-indicator-blob.squash {
		animation: nav-blob-squash 0.45s cubic-bezier(0.16, 1, 0.3, 1);
	}
	@keyframes nav-blob-squash {
		0% { transform: scale(1, 1); }
		45% { transform: scale(1.16, 0.9); }
		100% { transform: scale(1, 1); }
	}
	@media (prefers-reduced-motion: reduce) {
		.nav-indicator { transition: none; }
		.nav-indicator-blob.squash { animation: none; }
	}
	.nav-item {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-decoration: none;
		color: var(--text-muted);
		font-size: 0.7rem;
		padding: 0.5rem;
		flex: 1;
		transition: color 0.2s;
		-webkit-tap-highlight-color: transparent;
	}
	.nav-item:focus {
		outline: none;
	}
	.nav-item:focus-visible {
		outline: 2px solid var(--color-blue-bright);
		outline-offset: -2px;
		border-radius: 12px;
	}
	.nav-item .icon {
		font-size: 1.4rem;
		margin-bottom: 3px;
	}
	.nav-item .icon svg {
		width: 20px;
		height: 20px;
	}
	.nav-item.active {
		color: var(--color-blue-bright);
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
		color: var(--text-muted);
		text-decoration: none;
	}
	.site-footer a:hover {
		color: var(--text-secondary);
		text-decoration: underline;
	}
	.site-footer .divider {
		color: var(--border-default);
		margin: 0 8px;
	}

	.global-notification-bell {
		position: fixed;
		top: 12px;
		right: 12px;
		z-index: 1050;
		background: var(--bg-primary);
		border-radius: 50%;
		box-shadow: 0 2px 8px var(--shadow-md);
	}
</style>
