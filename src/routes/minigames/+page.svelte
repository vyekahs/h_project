<script lang="ts">
    import ActivityTicker from '$lib/components/games/ActivityTicker.svelte';

    let { data } = $props();

    const games = [
        {
            id: 'sudoku',
            name: '스도쿠',
            tagline: '복잡한 머릿속을 비우는 논리의 미학',
            url: '/games/start/sudoku',
            gradient: 'linear-gradient(135deg, #ffffff 0%, #edf6ff 100%)',
            accentColor: '#4a90d9',
        },
        {
            id: 'killer-sudoku',
            name: '킬러 스도쿠',
            tagline: '연산과 논리의 완벽한 조화',
            url: '/games/start/killer-sudoku',
            gradient: 'linear-gradient(135deg, #ffffff 0%, #fffbe6 100%)',
            accentColor: '#d4a017',
        },
        {
            id: 'unblock-me',
            name: '언블록미',
            tagline: '꽉 막힌 상황을 시원하게 뚫어내는 쾌감',
            url: '/games/start/unblock-me',
            gradient: 'linear-gradient(135deg, #ffffff 0%, #fce4ec 100%)',
            accentColor: '#d4526e',
        }
    ];
</script>

<div class="arcade-container">
    <header class="arcade-header">
        <h1>GAME LOUNGE</h1>
    </header>

    <ActivityTicker activities={data.activityFeed} />

    <section class="games-section">
        <div class="games-list">
            {#each games as game}
                {@const rank = data.userRanks[game.id]}
                <a href={game.url} class="game-card">
                    <div class="card-bg" style="background: {game.gradient}"></div>

                    <!-- Game illustration -->
                    <div class="card-illustration" style="color: {game.accentColor}">
                        {#if game.id === 'sudoku'}
                            <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect x="4" y="4" width="72" height="72" rx="6" stroke="currentColor" stroke-width="2"/>
                                <line x1="28" y1="4" x2="28" y2="76" stroke="currentColor" stroke-width="2"/>
                                <line x1="52" y1="4" x2="52" y2="76" stroke="currentColor" stroke-width="2"/>
                                <line x1="4" y1="28" x2="76" y2="28" stroke="currentColor" stroke-width="2"/>
                                <line x1="4" y1="52" x2="76" y2="52" stroke="currentColor" stroke-width="2"/>
                                <text x="16" y="21" font-size="14" font-weight="700" fill="currentColor" text-anchor="middle">5</text>
                                <text x="40" y="21" font-size="14" font-weight="700" fill="currentColor" text-anchor="middle">3</text>
                                <text x="64" y="45" font-size="14" font-weight="700" fill="currentColor" text-anchor="middle">8</text>
                                <text x="16" y="69" font-size="14" font-weight="700" fill="currentColor" text-anchor="middle">1</text>
                                <text x="40" y="69" font-size="14" font-weight="700" fill="currentColor" text-anchor="middle">9</text>
                                <text x="64" y="69" font-size="14" font-weight="700" fill="currentColor" text-anchor="middle">7</text>
                            </svg>
                        {:else if game.id === 'killer-sudoku'}
                            <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect x="4" y="4" width="72" height="72" rx="6" stroke="currentColor" stroke-width="2"/>
                                <line x1="28" y1="4" x2="28" y2="76" stroke="currentColor" stroke-width="1.5"/>
                                <line x1="52" y1="4" x2="52" y2="76" stroke="currentColor" stroke-width="1.5"/>
                                <line x1="4" y1="28" x2="76" y2="28" stroke="currentColor" stroke-width="1.5"/>
                                <line x1="4" y1="52" x2="76" y2="52" stroke="currentColor" stroke-width="1.5"/>
                                <!-- Cage outlines (dashed) -->
                                <rect x="6" y="6" width="44" height="20" rx="3" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/>
                                <rect x="6" y="30" width="20" height="44" rx="3" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/>
                                <rect x="54" y="30" width="20" height="20" rx="3" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/>
                                <!-- Cage sums -->
                                <text x="10" y="13" font-size="8" font-weight="600" fill="currentColor">15</text>
                                <text x="10" y="37" font-size="8" font-weight="600" fill="currentColor">22</text>
                                <text x="58" y="37" font-size="8" font-weight="600" fill="currentColor">9</text>
                            </svg>
                        {:else if game.id === 'unblock-me'}
                            <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect x="4" y="4" width="72" height="72" rx="6" stroke="currentColor" stroke-width="2"/>
                                <!-- Blocks -->
                                <rect x="10" y="10" width="28" height="12" rx="3" fill="currentColor" opacity="0.3"/>
                                <rect x="44" y="10" width="12" height="28" rx="3" fill="currentColor" opacity="0.3"/>
                                <rect x="10" y="32" width="28" height="12" rx="3" fill="#ef5350" opacity="0.6"/>
                                <rect x="10" y="54" width="12" height="20" rx="3" fill="currentColor" opacity="0.3"/>
                                <rect x="30" y="54" width="26" height="12" rx="3" fill="currentColor" opacity="0.3"/>
                                <!-- Exit arrow -->
                                <path d="M68 38 L76 38" stroke="#ef5350" stroke-width="2.5" stroke-linecap="round"/>
                                <path d="M73 34 L77 38 L73 42" stroke="#ef5350" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        {/if}
                    </div>

                    <div class="card-content">
                        <div class="card-text">
                            <h3 class="card-title">{game.name}</h3>
                            <p class="card-tagline">{game.tagline}</p>
                        </div>
                        <div class="card-footer">
                            {#if rank}
                                <span class="rank-badge" style="color: {game.accentColor}; border-color: {game.accentColor}">
                                    My Rank #{rank}
                                </span>
                            {:else}
                                <span></span>
                            {/if}
                            <div class="play-arrow">
                                <span>PLAY</span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                            </div>
                        </div>
                    </div>
                </a>
            {/each}

            <div class="game-card coming-soon">
                <div class="card-content">
                    <div class="card-text">
                        <h3 class="card-title">Coming Soon</h3>
                        <p class="card-tagline">새로운 게임 준비 중</p>
                    </div>
                </div>
            </div>
        </div>
    </section>
</div>

<style>
    .arcade-container {
        padding: 1.5rem;
        max-width: 600px;
        margin: 0 auto;
        padding-bottom: 6rem;
    }

    .arcade-header {
        text-align: center;
        margin: 2rem 0 2rem 0;
    }

    .arcade-header h1 {
        font-family: 'Outfit', sans-serif;
        font-size: 2.2rem;
        font-weight: 800;
        color: #333;
        margin-bottom: 0.5rem;
        letter-spacing: -1px;
    }

    /* Games List */
    .games-list {
        display: flex;
        flex-direction: column;
        gap: 1.2rem;
    }

    .game-card {
        position: relative;
        display: block;
        padding: 1.8rem 2rem;
        border-radius: 20px;
        text-decoration: none;
        box-shadow: 0 8px 20px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.02);
        transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.25s;
        overflow: hidden;
        color: #111;
        min-height: 160px;
    }

    .card-bg {
        position: absolute;
        top: 0; left: 0; width: 100%; height: 100%;
        z-index: 1;
        transition: transform 0.5s;
    }

    .game-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 15px 30px rgba(0,0,0,0.08), 0 5px 10px rgba(0,0,0,0.03);
    }

    .game-card:hover .card-bg {
        transform: scale(1.02);
    }

    /* Game illustration */
    .card-illustration {
        position: absolute;
        right: 1.5rem;
        top: 50%;
        transform: translateY(-50%);
        width: 70px;
        height: 70px;
        opacity: 0.12;
        z-index: 2;
        pointer-events: none;
    }

    .card-illustration svg {
        width: 100%;
        height: 100%;
    }

    .game-card:hover .card-illustration {
        opacity: 0.2;
        transition: opacity 0.3s;
    }

    /* Card content */
    .card-content {
        position: relative;
        z-index: 3;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        height: 100%;
        min-height: 90px;
    }

    .card-text {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
    }

    .card-title {
        margin: 0;
        font-size: 1.6rem;
        font-weight: 700;
        color: #111;
        letter-spacing: -0.5px;
    }

    .card-tagline {
        margin: 0;
        font-size: 0.9rem;
        font-style: italic;
        color: #666;
        font-weight: 400;
        line-height: 1.4;
    }

    .card-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 1.2rem;
    }

    .rank-badge {
        font-size: 0.75rem;
        font-weight: 700;
        padding: 0.3rem 0.7rem;
        border-radius: 100px;
        border: 1.5px solid;
        background: rgba(255,255,255,0.8);
    }

    .play-arrow {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background: #4a4a4a;
        padding: 0.6rem 1.4rem;
        border-radius: 100px;
        font-size: 0.85rem;
        font-weight: 600;
        color: white;
        transition: background 0.2s, transform 0.2s;
        border: none;
        margin-left: auto;
    }

    .game-card:hover .play-arrow {
        background: black;
        transform: scale(1.02);
    }

    /* Coming Soon */
    .game-card.coming-soon {
        background: #f8f9fa;
        color: #adb5bd;
        box-shadow: none;
        border: 2px dashed #dee2e6;
        pointer-events: none;
        min-height: auto;
        padding: 1.5rem 2rem;
    }

    .game-card.coming-soon .card-bg { display: none; }

    .game-card.coming-soon .card-title {
        font-size: 1.2rem;
        font-weight: 500;
        color: #adb5bd;
    }

    .game-card.coming-soon .card-tagline {
        font-style: normal;
        color: #ced4da;
        font-size: 0.85rem;
    }
</style>
