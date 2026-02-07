<script lang="ts">
    import AdBanner from '$lib/components/ads/AdBanner.svelte';
    import { onMount } from 'svelte';

    const games = [
        {
            id: 'sudoku',
            name: '스도쿠',
            description: '논리적인 숫자 퍼즐',
            url: '/games/sudoku',
            color: '#4fc3f7',
            difficulty: 'Easy ~ Master'
        }
        // Future games to be added
    ];

    let activeTab = 'games'; // 'games' | 'ranking'

    let hofData: any[] = [];
    let hofLoading = true;

    async function loadHallOfFame() {
        hofLoading = true;
        try {
            const res = await fetch('/api/ranking/halloffame/sudoku');
            if (res.ok) {
                const all = await res.json();
                hofData = all.slice(0, 3);
            }
        } catch (e) {
            console.error(e);
        } finally {
            hofLoading = false;
        }
    }

    function formatTime(seconds: number) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    $: if (activeTab === 'ranking') {
        loadHallOfFame();
    }
</script>

<div class="arcade-container">
    <header class="arcade-header">
        <h1>GAME LOUNGE</h1>
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
    <!-- <div class="ad-section">
        <AdBanner adSlot="top-banner" style="display:block; min-height:90px;" />
    </div> -->

    {#if activeTab === 'games'}
        <!-- Games Grid -->
        <section class="games-section">
            <div class="games-grid">
                {#each games as game}
                    <a href={game.url} class="game-card {game.id}">
                        <div class="card-bg">
                            {#if game.id === 'sudoku'}
                                <div class="sudoku-grid-deco">
                                    {#each Array(9) as _, i}
                                        <div class="grid-line"></div>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                        
                        <!-- <div class="card-header">
                            <div class="card-badges">
                                {#each game.tags as tag}
                                    <span class="badge {tag.toLowerCase()}">{tag}</span>
                                {/each}
                            </div>
                            <div class="icon-box">{game.icon}</div>
                        </div> -->
                        
                        <div class="card-body">
                            <h3>{game.name}</h3>
                            <p class="desc">{game.description}</p>
                        </div>
                        
                        <div class="play-btn">
                            <span>PLAY</span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                        </div>
                    </a>
                {/each}
                
                <!-- Coming Soon -->
                <div class="game-card coming-soon">
                    <div class="card-body">
                        <h3>Coming Soon</h3>
                        <p class="desc">새로운 게임이 추가될 예정입니다.</p>
                    </div>
                </div>
            </div>
        </section>
    {:else}
        <!-- Hall of Fame -->
        <section class="ranking-section">
            <div class="ranking-grid">
                {#each games as game}
                    <div class="ranking-card">
                        <div class="ranking-header">
                            <div class="header-left">
                                <span class="game-name">{game.name}</span>
                            </div>
                            <a href={game.url} class="more-link">도전하기 &rarr;</a>
                        </div>
                        {#if hofLoading}
                            <div class="hof-empty">불러오는 중...</div>
                        {:else if hofData.length === 0}
                            <div class="hof-empty">아직 기록이 없습니다.</div>
                        {:else}
                            <div class="hof-list">
                                {#each hofData as record, i}
                                    <div class="hof-row">
                                        <div class="hof-rank" class:hof-rank-1={i === 0} class:hof-rank-2={i === 1} class:hof-rank-3={i === 2}>
                                            {i + 1}
                                        </div>
                                        <div class="hof-info">
                                            <span class="hof-name">{record.nickname || '익명'}</span>
                                        </div>
                                        <div class="hof-score">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                                            {record.score.toLocaleString()}
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        </section>
    {/if}
</div>

<style>
    /* ... (Previous header styles kept) ... */
    .arcade-container {
        padding: 1.5rem;
        max-width: 1200px;
        margin: 0 auto;
        padding-bottom: 6rem;
    }

    .arcade-header {
        text-align: center;
        margin: 2rem 0 2.5rem 0;
    }
    
    .arcade-header h1 {
        font-family: 'Outfit', sans-serif;
        font-size: 2.5rem;
        font-weight: 800;
        background: linear-gradient(135deg, #1a1a1a 0%, #4a4a4a 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin-bottom: 0.5rem;
        letter-spacing: -1.5px;
    }
    
    .arcade-header p {
        color: #666;
        font-size: 1.1rem;
        font-weight: 500;
    }

    /* Tab Bar - refined */
    .tab-bar {
        display: flex;
        justify-content: center;
        background: #f0f2f5;
        padding: 0.4rem;
        border-radius: 100px;
        width: fit-content;
        margin: 0 auto 3rem auto;
    }

    .tab-btn {
        background: transparent;
        border: none;
        padding: 0.6rem 1.8rem;
        font-size: 0.95rem;
        font-weight: 600;
        color: #888;
        cursor: pointer;
        border-radius: 100px;
        transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
    }

    .tab-btn.active {
        background: white;
        color: #1a1a1a;
        box-shadow: 0 4px 15px rgba(0,0,0,0.05);
    }

    .games-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 2rem;
        margin-bottom: 3rem;
    }

    /* Modern Game Card */
    .game-card {
        position: relative;
        background: white;
        border-radius: 32px;
        padding: 2rem;
        text-decoration: none;
        color: #333;
        overflow: hidden;
        transition: all 0.4s cubic-bezier(0.3, 1, 0.3, 1);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        border: 1px solid rgba(0,0,0,0.03); /* Subtle border */
        box-shadow: 0 20px 40px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.02);
    }
    
    .game-card:hover {
        transform: translateY(-10px) scale(1.02);
        box-shadow: 0 30px 60px rgba(0,0,0,0.12), 0 5px 15px rgba(0,0,0,0.05);
    }

    /* Sudoku Specific Theme */
    .game-card.sudoku {
        background: linear-gradient(135deg, #f0f7ff 0%, #ffffff 100%);
    }

    .game-card.sudoku .card-bg {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 0;
        overflow: hidden;
    }
    
    .sudoku-grid-deco {
        position: absolute;
        top: -10%;
        right: -10%;
        width: 150%;
        height: 150%;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        grid-template-rows: repeat(3, 1fr);
        gap: 1px;
        opacity: 0.03;
        transform: rotate(15deg);
        pointer-events: none;
    }

    .grid-line {
        border: 2px solid #000;
        width: 100%;
        height: 100%;
    }

    /* Content Styling */
     .card-body, .play-btn {
        position: relative;
        z-index: 1;
    }

    .icon-box {
        font-size: 3rem;
        filter: drop-shadow(0 4px 8px rgba(0,0,0,0.1));
    }
    
    .icon-box.grayscale {
        filter: grayscale(1);
        opacity: 0.3;
    }

    .card-badges {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .badge {
        font-size: 0.7rem;
        padding: 6px 12px;
        border-radius: 100px;
        font-weight: 800;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        width: fit-content;
    }
    
    .badge.hot {
        background: #ff3b30;
        color: white;
        box-shadow: 0 4px 10px rgba(255, 59, 48, 0.3);
    }
    
    .badge.brain {
        background: #5856d6;
        color: white;
        box-shadow: 0 4px 10px rgba(88, 86, 214, 0.3);
    }

    .card-body h3 {
        font-family: 'Outfit', sans-serif;
        font-size: 2rem;
        font-weight: 800;
        margin: 0 0 0.5rem 0;
        color: #1d1d1f;
        letter-spacing: -1px;
    }

    .desc {
        font-size: 1rem;
        color: #6e6e73;
        margin-bottom: 1.5rem;
        line-height: 1.4;
    }
    .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #4fc3f7;
    }

    .play-btn {
        margin-top: auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #1d1d1f;
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 20px;
        font-weight: 700;
        font-size: 1rem;
        transition: all 0.3s;
        box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    }

    .play-btn svg {
        transition: transform 0.3s;
    }

    .game-card:hover .play-btn {
        background: #000;
        transform: scale(1.02);
    }

    .game-card:hover .play-btn svg {
        transform: translateX(4px);
    }

    /* Ranking Grid Styles */
    .ranking-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 2rem;
    }

    .ranking-card {
        background: white;
        border-radius: 24px;
        padding: 1.5rem;
        box-shadow: 0 10px 30px rgba(0,0,0,0.05);
        border: 1px solid rgba(0,0,0,0.05);
        display: flex;
        flex-direction: column;
    }

    .ranking-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid #eee;
    }
    
    .ranking-header .game-name {
        font-family: 'Outfit', sans-serif;
        font-size: 1.2rem;
        font-weight: 700;
        color: #333;
    }

    .more-link {
        color: #1a1a1a;
        text-decoration: none;
        font-size: 0.9rem;
        font-weight: 600;
        padding: 0.4rem 0.8rem;
        background: #f5f5f7;
        border-radius: 8px;
        transition: all 0.2s;
    }
    .more-link:hover {
        background: #e5e5e7;
    }

    .hof-list {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
    }
    .hof-row {
        display: flex;
        align-items: center;
        gap: 0.8rem;
        padding: 0.5rem 0;
    }
    .hof-rank {
        font-size: 0.8rem;
        font-weight: 800;
        width: 26px;
        height: 26px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: #f0f0f0;
        color: #999;
        flex-shrink: 0;
        font-variant-numeric: tabular-nums;
    }
    .hof-rank-1 { background: #333; color: #fff; }
    .hof-rank-2 { background: #777; color: #fff; }
    .hof-rank-3 { background: #aaa; color: #fff; }
    .hof-info {
        flex: 1;
        min-width: 0;
    }
    .hof-name {
        font-size: 0.95rem;
        font-weight: 700;
        color: #333;
    }
    .hof-score {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        font-size: 0.85rem;
        font-weight: 600;
        color: #888;
    }
    .hof-score svg {
        opacity: 0.5;
    }
    .hof-empty {
        text-align: center;
        padding: 1.5rem;
        color: #999;
        font-size: 0.9rem;
    }

</style>
