<script lang="ts">
    import ActivityTicker from '$lib/components/games/ActivityTicker.svelte';

    let { data } = $props();

    const games = [
        {
            id: 'sudoku',
            name: '스도쿠',
            tagline: '논리 퍼즐의 정석',
            url: '/games/start/sudoku',
            accentColor: '#60a5fa'
        },
        {
            id: 'killer-sudoku',
            name: '킬러 스도쿠',
            tagline: '스도쿠에 연산 한 스푼',
            url: '/games/start/killer-sudoku',
            accentColor: '#facc15'
        },
        {
            id: 'unblock-me',
            name: '언블록미',
            tagline: '슬라이딩 블록 퍼즐',
            url: '/games/start/unblock-me',
            accentColor: '#f87171'
        },
        {
            id: 'tichu',
            name: '티츄',
            tagline: '2:2 트릭테이킹 카드게임',
            url: '/games/tichu',
            accentColor: '#22c55e'
        }
    ];
</script>

<div class="page-background"></div>

<div class="arcade-container">
    <header class="arcade-header">
        <div class="glass-title-badge">
            <h1>Game Lounge</h1>
        </div>
    </header>

    <div class="ticker-wrapper">
        <ActivityTicker activities={data.activityFeed} />
    </div>

    <section class="games-grid">
        {#each games as game}
            {@const rank = data.userRanks[game.id]}
            <a href={game.url} class="game-card glass-panel" style="--accent: {game.accentColor}">
                <div class="card-content">
                    <div class="card-header">
                        <div class="icon-box">
                            {#if game.id === 'sudoku'}
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" /><path d="M15 3v18" /></svg>
                            {:else if game.id === 'killer-sudoku'}
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3"/>
                                    <path d="M12 4v16M4 12h16" stroke-width="1" stroke-opacity="0.3" stroke-dasharray="2 2"/>
                                    <text x="5.5" y="9" font-size="4.5" font-weight="bold" fill="currentColor" stroke="none">20</text>
                                </svg>
                            {:else if game.id === 'unblock-me'}
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="2" y="2" width="20" height="20" rx="2" stroke-opacity="0.1"/>
                                    <rect x="5" y="9" width="10" height="6" rx="1.5" fill="currentColor" stroke="none"/>
                                    <path d="M16 12h5m-2-2l2 2l-2 2" stroke-width="2.5"/>
                                </svg>
                            {:else if game.id === 'tichu'}
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="3" y="2" width="12" height="17" rx="2"/>
                                    <rect x="9" y="5" width="12" height="17" rx="2" fill="rgba(255,255,255,0.3)"/>
                                    <text x="7" y="13" font-size="7" font-weight="bold" fill="currentColor" stroke="none">T</text>
                                </svg>
                            {/if}
                        </div>
                        {#if rank}
                            <div class="rank-badge">
                                <span class="rank-label">내 순위</span>
                                <span class="rank-number">#{rank}</span>
                            </div>
                        {/if}
                    </div>
                    
                    <div class="text-content">
                        <h3>{game.name}</h3>
                        <p class="tagline">{game.tagline}</p>
                    </div>
                </div>
                <div class="glow-effect"></div>
            </a>
        {/each}

        <div class="game-card glass-panel coming-soon">
            <div class="card-content centered">
                <div class="icon-box disabled">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <h3>Coming Soon</h3>
            </div>
        </div>
    </section>
</div>

<style>
    :global(body) {
        margin: 0;
        background-color: #f0f2f5; /* Fallback */
    }

    .page-background {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: -1;
        background: radial-gradient(circle at 10% 20%, rgba(216, 241, 230, 0.7) 0%, rgba(233, 240, 255, 0.4) 40%, rgba(240, 230, 250, 0.3) 80%);
        background-size: 200% 200%;
        animation: gradientMove 20s ease infinite;
    }

    @keyframes gradientMove {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
    }

    .arcade-container {
        max-width: 600px;
        margin: 0 auto;
        padding: 1.5rem;
        padding-bottom: 6rem;
        min-height: 100vh;
        box-sizing: border-box;
    }

    .arcade-header {
        display: flex;
        justify-content: center;
        margin-bottom: 2rem;
        padding-top: 1.5rem;
        position: relative;
        z-index: 10;
    }

    .glass-title-badge {
        background: rgba(255, 255, 255, 0.2);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.3);
        padding: 0.5rem 1.5rem;
        border-radius: 100px;
        text-align: center;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    .glass-title-badge h1 {
        font-family: 'Outfit', sans-serif;
        font-size: 1.4rem;
        font-weight: 700;
        color: #333;
        margin: 0;
        letter-spacing: -0.02em;
        line-height: 1.1;
    }

    .subtitle {
        margin-top: 0.2rem;
        font-size: 0.8rem;
        color: #666;
        font-weight: 500;
        letter-spacing: -0.01em;
        opacity: 0.8;
    }

    .subtitle {
        color: #666;
        margin-top: 0.5rem;
        font-size: 1rem;
        font-weight: 500;
    }

    .ticker-wrapper {
        margin-bottom: 2rem;
    }

    /* Grid Layout */
    .games-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 1.25rem;
    }

    /* Glass Panel Utility */
    .glass-panel {
        background: rgba(255, 255, 255, 0.65);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.8);
        box-shadow: 
            0 4px 6px -1px rgba(0, 0, 0, 0.05), 
            0 2px 4px -1px rgba(0, 0, 0, 0.03),
            inset 0 0 0 1px rgba(255, 255, 255, 0.5);
        border-radius: 24px;
    }

    /* Game Card Styling */
    .game-card {
        position: relative;
        display: block;
        text-decoration: none;
        padding: 1.75rem;
        transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        overflow: hidden;
        color: #1f2937;
        isolation: isolate; /* Create stacking context */
    }

    .game-card:active {
        transform: scale(0.98);
        background: rgba(255, 255, 255, 0.75);
    }

    .card-content {
        position: relative;
        z-index: 2;
        display: flex;
        flex-direction: column;
        height: 100%;
        gap: 1.25rem;
    }

    .card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
    }

    .icon-box {
        width: 48px;
        height: 48px;
        border-radius: 14px;
        background: var(--accent, #3b82f6);
        background: linear-gradient(135deg, var(--accent) 0%, white 200%);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .icon-box svg {
        width: 32px;
        height: 32px;
    }

    .rank-badge {
        background: rgba(255, 255, 255, 0.9);
        padding: 0.4rem 0.8rem;
        border-radius: 100px;
        font-size: 0.75rem;
        font-weight: 700;
        color: var(--accent);
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        display: flex;
        flex-direction: column;
        align-items: center;
        line-height: 1.1;
        border: 1px solid rgba(255,255,255,1);
    }
    
    .rank-label { 
        font-size: 0.6rem; 
        text-transform: uppercase; 
        opacity: 0.8; 
    }
    
    .rank-number {
        font-size: 0.9rem;
    }

    .text-content h3 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 700;
        letter-spacing: -0.5px;
        color: #111;
    }

    .text-content .tagline {
        margin: 0.25rem 0 0 0;
        font-size: 0.95rem;
        color: #642d2d;
        font-weight: 400;
    }

    /* Glow Effect */
    .glow-effect {
        position: absolute;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
        background: radial-gradient(circle at 50% 50%, var(--accent) 0%, transparent 60%);
        opacity: 0.08;
        transform: translate(-30%, -30%);
        pointer-events: none;
        z-index: 1;
        transition: opacity 0.3s;
    }
    
    .game-card:active .glow-effect {
        opacity: 0.15;
    }

    /* Coming Soon State */
    .game-card.coming-soon {
        background: rgba(255, 255, 255, 0.4);
        border-style: dashed;
        cursor: default;
    }

    .game-card.coming-soon:active {
        transform: none;
    }

    .centered {
        align-items: center;
        text-align: center;
        justify-content: center;
    }

    .icon-box.disabled {
        background: #e5e7eb;
        color: #9ca3af;
        box-shadow: none;
    }

    @media (min-width: 640px) {
        .games-grid {
            grid-template-columns: repeat(2, 1fr);
        }
        
        .arcade-container {
            max-width: 800px;
        }
    }
</style>
