<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
    import { page } from '$app/stores';
    import { onMount } from 'svelte';

	let { children } = $props();

    // Pull to Refresh Logic
    let startY = 0; 
    let currentY = $state(0);
    let refreshing = $state(false);
    let pullDistance = $state(0);
    const threshold = 70; // px to trigger refresh
    let isTouching = false;

    function handleTouchStart(e: TouchEvent) {
        if (window.scrollY === 0) {
            startY = e.touches[0].clientY;
            isTouching = true;
        }
    }

    function handleTouchMove(e: TouchEvent) {
        if (!isTouching) return;
        
        // Only pull if we started at the top and are pulling down
        if (window.scrollY === 0 && startY > 0 && !refreshing) {
            const y = e.touches[0].clientY;
            const diff = y - startY;
            
            if (diff > 0) {
                // Resistance effect
                pullDistance = Math.min(diff * 0.5, 150); 
                currentY = pullDistance;
            } else {
                // Scrolling up (normal scroll)
                currentY = 0;
                pullDistance = 0;
            }
        }
    }

    function handleTouchEnd() {
        isTouching = false;
        if (window.scrollY === 0 && startY > 0 && !refreshing) {
            if (pullDistance > threshold) {
                // Trigger Refresh
                refreshing = true;
                currentY = threshold; 
                setTimeout(() => {
                    window.location.reload();
                }, 500); 
            } else {
                // Cancel
                resetPull();
            }
        } else {
             resetPull();
        }
        startY = 0;
    }
    
    function resetPull() {
        currentY = 0;
        pullDistance = 0;
    }
    
    let mainStyle = $derived.by(() => {
        if (refreshing) {
             return `transform: translateY(${threshold}px); transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);`;
        }
        if (pullDistance > 0) {
             // Dragging - use simplistic transition to avoid lag but keep it reactive
             return `transform: translateY(${currentY}px); transition: none;`;
        }
        if (currentY > 0) {
            // Released but not refreshing (snapping back)
             return `transform: translateY(0px); transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);`;
        }
        return ''; 
    });

</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="app-layout" 
    ontouchstart={handleTouchStart} 
    ontouchmove={handleTouchMove} 
    ontouchend={handleTouchEnd}
>
    <!-- Refresh Indicator -->
    <div class="refresh-indicator" style="transform: translateY({currentY}px); opacity: {pullDistance > 0 ? 1 : 0};">
        <div class="spinner" class:spinning={refreshing}>
            {#if refreshing}
                ⏳
            {:else}
                ⬇️
            {/if}
        </div>
    </div>

	<main class="content" style={mainStyle}>
		{@render children()}
	</main>

	<nav class="bottom-nav">
		<a href="/" class="nav-item home" class:active={$page.url.pathname === '/'}>
			<span class="icon">🏠</span>
			<span class="label">홈</span>
		</a>
		<a href="/games" class="nav-item games" class:active={$page.url.pathname.startsWith('/games')}>
			<span class="icon">📚</span>
			<span class="label">게임 목록</span>
		</a>
		<a href="/mypage" class="nav-item mypage" class:active={$page.url.pathname.startsWith('/mypage')}>
			<span class="icon">👤</span>
			<span class="label">마이페이지</span>
		</a>
	</nav>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
		background: #f8f9fa;
	}
	.app-layout {
		min-height: 100vh;
		position: relative;
		padding-bottom: 70px; /* Space for bottom nav */
	}
	.bottom-nav {
		position: fixed;
		bottom: 0;
		left: 50%;
        transform: translateX(-50%);
		width: 100%;
        max-width: 600px; /* Constrain width for PC */
		height: 60px;
		background: white;
		border-top: 1px solid #eee;
		display: flex;
		justify-content: space-around;
		align-items: center;
		padding-bottom: env(safe-area-inset-bottom);
		box-shadow: 0 -2px 10px rgba(0,0,0,0.03);
		z-index: 1000;
        border-left: 1px solid #f1f3f5; /* Add side borders for PC view */
        border-right: 1px solid #f1f3f5;
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
    /* Add subtle active indicator */
    .nav-item.active .icon {
        transform: scale(1.1);
        transition: transform 0.2s;
    }

    /* Pull to Refresh Styles */
    .refresh-indicator {
        position: fixed;
        top: -40px; /* Start hidden above */
        left: 0;
        width: 100%;
        height: 40px;
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 900;
        pointer-events: none;
    }
    .spinner {
        width: 30px;
        height: 30px;
        background: white;
        border-radius: 50%;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;
    }
    .spinner.spinning {
        animation: spin 1s linear infinite;
    }
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
</style>
