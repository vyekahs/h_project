<script lang="ts">
    import AdBanner from '$lib/components/ads/AdBanner.svelte';
    import RankingBoard from '$lib/components/gamification/RankingBoard.svelte';

    const games = [
        {
            id: 'sudoku',
            name: '스도쿠',
            description: '논리적인 숫자 퍼즐',
            icon: '🧩',
            url: '/games/sudoku',
            color: '#4fc3f7',
            tags: ['HOT', 'Brain'],
            difficulty: 'Easy ~ Master'
        }
        // Future games to be added
    ];

    let activeTab = 'games'; // 'games' | 'ranking'
</script>

<div class="arcade-container">
    <header class="arcade-header">
        <h1>🎮 GAME LOUNGE</h1>
        <p>미니게임으로 잠시 쉬어가세요!</p>
    </header>

    <!-- Tab Navigation -->
    <div class="tab-bar">
        <button 
            class="tab-btn" 
            class:active={activeTab === 'games'} 
            onclick={() => activeTab = 'games'}
        >
            게임 목록
        </button>
        <button 
            class="tab-btn" 
            class:active={activeTab === 'ranking'} 
            onclick={() => activeTab = 'ranking'}
        >
            명예의 전당
        </button>
    </div>

    <!-- Top Ad Banner -->
    <div class="ad-section">
        <AdBanner adSlot="top-banner" style="display:block; min-height:90px;" />
    </div>

    {#if activeTab === 'games'}
        <!-- Games Grid -->
        <section class="games-section">
            <h2 class="section-title">오늘의 게임</h2>
            <div class="games-grid">
                {#each games as game}
                    <a href={game.url} class="game-card" style="--card-accent: {game.color}">
                        <div class="card-badges">
                            {#each game.tags as tag}
                                <span class="badge {tag.toLowerCase()}">{tag}</span>
                            {/each}
                        </div>
                        
                        <div class="card-content">
                            <div class="icon-circle">{game.icon}</div>
                            <div class="info">
                                <h3>{game.name}</h3>
                                <p class="desc">{game.description}</p>
                                <p class="meta">{game.difficulty}</p>
                            </div>
                        </div>
                        
                        <div class="play-action">
                            <span>PLAY NOW</span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                        </div>
                    </a>
                {/each}
                
                <!-- Coming Soon -->
                <div class="game-card coming-soon">
                    <div class="card-content">
                        <div class="icon-circle grayscale">🚧</div>
                        <div class="info">
                            <h3>준비 중</h3>
                            <p class="desc">새로운 게임이 추가될 예정입니다.</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    {:else}
        <!-- Hall of Fame -->
        <section class="ranking-section">
            <h2 class="section-title">🏆 명예의 전당</h2>
            <div class="ranking-grid">
                {#each games as game}
                    <div class="ranking-card">
                        <div class="ranking-header">
                            <span class="game-name">{game.name} top 3</span>
                            <a href={game.url} class="more-link">도전하기 &rarr;</a>
                        </div>
                         <RankingBoard gameId={game.id} preview={true} />
                    </div>
                {/each}
            </div>
        </section>
    {/if}
</div>

<style>
    .arcade-container {
        padding: 1rem;
        max-width: 1000px;
        margin: 0 auto;
        padding-bottom: 5rem;
    }

    .arcade-header {
        text-align: center;
        margin: 2rem 0 1.5rem 0;
    }
    
    .arcade-header h1 {
        font-family: 'Outfit', sans-serif;
        font-size: 2.2rem;
        font-weight: 800;
        background: linear-gradient(135deg, #333 0%, #666 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin-bottom: 0.5rem;
        letter-spacing: -1px;
    }
    
    .arcade-header p {
        color: #888;
        font-size: 1rem;
    }

    /* Tab Bar */
    .tab-bar {
        display: flex;
        justify-content: center;
        gap: 1rem;
        margin-bottom: 2rem;
        padding: 0 1rem;
    }

    .tab-btn {
        background: transparent;
        border: none;
        padding: 0.8rem 1.5rem;
        font-size: 1rem;
        font-weight: 600;
        color: #888;
        cursor: pointer;
        border-radius: 50px;
        transition: all 0.2s;
    }

    .tab-btn.active {
        background: #333;
        color: white;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    
    .tab-btn:hover:not(.active) {
        background: #f5f5f5;
        color: #333;
    }

    .ad-section {
        margin-bottom: 2rem;
    }

    .section-title {
        font-size: 1.2rem;
        font-weight: 700;
        margin-bottom: 1rem;
        color: #333;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    
    .games-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 1.5rem;
        margin-bottom: 3rem;
    }

    .game-card {
        background: white;
        border-radius: 24px;
        padding: 1.5rem;
        text-decoration: none;
        color: inherit;
        position: relative;
        overflow: hidden;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 10px 30px rgba(0,0,0,0.05);
        border: 1px solid rgba(0,0,0,0.05);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        min-height: 200px;
    }
    
    .game-card:hover {
        transform: translateY(-8px);
        box-shadow: 0 20px 40px rgba(0,0,0,0.12);
        border-color: var(--card-accent);
    }
    
    .card-badges {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1rem;
    }
    
    .badge {
        font-size: 0.7rem;
        padding: 4px 8px;
        border-radius: 12px;
        font-weight: 700;
        text-transform: uppercase;
    }
    
    .badge.hot {
        background: #ff3b30;
        color: white;
    }
    
    .badge.brain {
        background: #5856d6;
        color: white;
    }

    .card-content {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1.5rem;
    }
    
    .icon-circle {
        width: 60px;
        height: 60px;
        background: #f0f0f0;
        border-radius: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2.5rem;
    }
    
    .icon-circle.grayscale {
        filter: grayscale(1);
        opacity: 0.5;
    }

    .info h3 {
        margin: 0 0 4px 0;
        font-size: 1.3rem;
        font-weight: 700;
    }
    
    .info .desc {
        margin: 0;
        font-size: 0.9rem;
        color: #666;
    }
    
    .info .meta {
        font-size: 0.8rem;
        color: #999;
        margin-top: 4px;
    }
    
    .play-action {
        background: var(--card-accent);
        color: white;
        padding: 0.8rem;
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        font-weight: 700;
        font-size: 0.95rem;
        transition: opacity 0.2s;
    }
    
    .coming-soon {
        opacity: 0.7;
        pointer-events: none;
        background: #f9f9f9;
        box-shadow: none;
    }

    /* Ranking Section */
    .ranking-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 1.5rem;
    }
    
    .ranking-card {
        background: white;
        border-radius: 20px;
        padding: 1.5rem;
        box-shadow: 0 4px 20px rgba(0,0,0,0.03);
        border: 1px solid #eee;
    }
    
    .ranking-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
        padding-bottom: 0.8rem;
        border-bottom: 1px solid #f5f5f5;
    }
    
    .ranking-header .game-name {
        font-weight: 700;
        font-size: 1.1rem;
    }
    
    .more-link {
        font-size: 0.85rem;
        color: #007aff;
        text-decoration: none;
        font-weight: 500;
    }
    
    @media (max-width: 600px) {
        .arcade-container {
            padding: 1rem;
        }
        
        .games-grid, .ranking-grid {
            grid-template-columns: 1fr;
        }
    }
</style>
