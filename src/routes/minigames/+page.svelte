<script lang="ts">
    import AdBanner from '$lib/components/ads/AdBanner.svelte';

    const games = [
        {
            id: 'sudoku',
            name: '스도쿠',
            description: '논리적인 숫자 퍼즐',
            url: '/games/start/sudoku',
            gradient: 'linear-gradient(135deg, #ffffff 0%, #edf6ff 100%)', // Very Subtle Blue
        },
        {
            id: 'killer-sudoku',
            name: '킬러 스도쿠',
            description: '케이지의 합을 맞춰라',
            url: '/games/start/killer-sudoku',
            gradient: 'linear-gradient(135deg, #ffffff 0%, #fffbe6 100%)', // Very Subtle Amber
        },
        {
            id: 'unblock-me',
            name: '언블록미',
            description: '블록을 밀어 탈출하라',
            url: '/games/start/unblock-me',
            gradient: 'linear-gradient(135deg, #ffffff 0%, #fce4ec 100%)', // Very Subtle Rose
        }
    ];

    let activeTab = 'games'; // 'games' | 'ranking'

    let hofDataMap: Record<string, any[]> = {};
    let hofLoading = true;

    async function loadHallOfFame() {
        hofLoading = true;
        try {
            const results = await Promise.all(
                games.map(async (game) => {
                    const res = await fetch(`/api/ranking/halloffame/${game.id}?preview=true`);
                    if (res.ok) {
                        const data = await res.json();
                        return { id: game.id, data };
                    }
                    return { id: game.id, data: [] };
                })
            );
            const map: Record<string, any[]> = {};
            for (const r of results) {
                map[r.id] = r.data;
            }
            hofDataMap = map;
        } catch (e) {
            console.error(e);
        } finally {
            hofLoading = false;
        }
    }

    const difficultyLabels: Record<string, string> = {
        easy: '쉬움', medium: '보통', hard: '어려움', expert: '전문가', master: '마스터'
    };

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

    {#if activeTab === 'games'}
        <section class="games-section">
            <div class="games-list">
                {#each games as game}
                    <a href={game.url} class="game-item {game.id}">
                        <!-- Consistent Light Gradient Background -->
                        <div class="item-bg" style="background: {game.gradient}"></div>
                        
                        <div class="game-content">
                            <div class="game-info">
                                <h3>{game.name}</h3>
                            </div>
                            
                            <div class="play-arrow">
                                <span>PLAY</span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                            </div>
                        </div>
                    </a>
                {/each}
                
                <div class="game-item coming-soon">
                    <div class="game-content">
                        <div class="game-info">
                            <h3>Coming Soon</h3>
                            <span class="desc">새로운 게임 준비 중</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    {:else}
        <!-- Hall of Fame -->
        <section class="ranking-section">
            <div class="ranking-list">
                {#each games as game}
                    {@const hofData = hofDataMap[game.id] || []}
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
                                            <span class="hof-detail">
                                                <span class="hof-diff">{difficultyLabels[record.difficulty] || record.difficulty}</span>
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                                {formatTime(record.clear_time)}
                                            </span>
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
    .arcade-container {
        padding: 1.5rem;
        max-width: 600px;
        margin: 0 auto;
        padding-bottom: 6rem;
    }

    .arcade-header {
        text-align: center;
        margin: 2rem 0 2.5rem 0;
    }
    
    .arcade-header h1 {
        font-family: 'Outfit', sans-serif;
        font-size: 2.2rem;
        font-weight: 800;
        color: #333;
        margin-bottom: 0.5rem;
        letter-spacing: -1px;
    }

    .tab-bar {
        display: flex;
        justify-content: center;
        background: #f1f3f5;
        padding: 0.25rem;
        border-radius: 12px;
        width: fit-content;
        margin: 0 auto 2.5rem auto;
    }

    .tab-btn {
        background: transparent;
        border: none;
        padding: 0.6rem 1.5rem;
        font-size: 0.95rem;
        font-weight: 600;
        color: #868e96;
        cursor: pointer;
        border-radius: 10px;
        transition: all 0.2s ease;
    }

    .tab-btn.active {
        background: white;
        color: #333;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }

    /* Games List Style - Light Pastel Gradients */
    .games-list {
        display: flex;
        flex-direction: column;
        gap: 1.2rem;
    }

    .game-item {
        position: relative;
        display: block;
        padding: 1.8rem 2.2rem; /* Even more padding */
        border-radius: 20px;
        text-decoration: none;
        box-shadow: 0 8px 20px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.02); /* Soft layered shadow */
        transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.25s;
        overflow: hidden;
        color: #111; /* Dark Text */
        min-height: 70px; /* Minimal height */
        /* border: none; - implicit */
    }

    .item-bg {
        position: absolute;
        top: 0; left: 0; width: 100%; height: 100%;
        z-index: 1;
        transition: transform 0.5s;
    }

    .game-item:hover {
        transform: translateY(-4px);
        box-shadow: 0 15px 30px rgba(0,0,0,0.08), 0 5px 10px rgba(0,0,0,0.03); 
    }
    
    .game-item:hover .item-bg {
        transform: scale(1.02);
    }

    .game-content {
        position: relative;
        z-index: 2; /* Above bg */
        display: flex;
        align-items: center;
        justify-content: space-between; /* Space out title and button */
        gap: 1rem;
        height: 100%;
    }

    /* No Icon styles */

    .game-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
    }

    .game-info h3 {
        margin: 0;
        font-size: 1.5rem; /* Large */
        font-weight: 500; /* Medium Weight */
        color: #111;
        letter-spacing: -0.5px;
    }

    /* Play Button - Minimal Dark */
    .play-arrow {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background: #4a4a4a;
        padding: 0.6rem 1.4rem;
        border-radius: 100px;
        font-size: 0.85rem;
        font-weight: 600; /* Lighter weight */
        color: white;
        transition: background 0.2s, transform 0.2s;
        border: none;
        margin-left: auto;
    }
    
    .game-item:hover .play-arrow {
        background: black;
        transform: scale(1.02);
    }

    /* Coming Soon */
    .game-item.coming-soon {
        background: #f8f9fa;
        color: #adb5bd;
        box-shadow: none;
        border: 2px dashed #dee2e6;
        pointer-events: none;
        display: flex; 
        align-items: center;
    }
    .game-item.coming-soon .item-bg { display: none; }
    
    .game-item.coming-soon h3 {
        font-weight: 400;
        color: #adb5bd;
    }
    .game-item.coming-soon .desc {
        font-size: 0.85rem;
        opacity: 0.7;
    }
    .game-item.coming-soon .play-arrow {
        display: none;
    }

    /* Ranking Section - Consistent */
    .ranking-list {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }

    .ranking-card {
        background: white;
        border-radius: 20px;
        padding: 1.5rem;
        box-shadow: 0 4px 20px rgba(0,0,0,0.05);
        border: 1px solid #f8f9fa;
    }
    
    /* ... Ranking card inner styles same as before ... */
    .ranking-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
        padding-bottom: 0.8rem;
        border-bottom: 1px solid #f1f3f5;
    }
    .game-name { font-weight: 700; font-size: 1.1rem; color: #333; }
    .more-link { font-size: 0.85rem; color: #339af0; text-decoration: none; font-weight: 600; }
    
    .hof-list { display: flex; flex-direction: column; gap: 0.8rem; }
    .hof-row { display: flex; align-items: center; padding: 0.5rem 0; }
    .hof-rank { width: 28px; height: 28px; border-radius: 50%; background: #f1f3f5; color: #868e96; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.9rem; margin-right: 0.8rem; flex-shrink: 0; }
    .hof-rank-1 { background: #ffd43b; color: #fff; }
    .hof-rank-2 { background: #ced4da; color: #fff; }
    .hof-rank-3 { background: #e7f5ff; color: #74c0fc; }
    .hof-info { flex: 1; display: flex; flex-direction: column; gap: 0; }
    .hof-name { font-weight: 500; font-size: 0.95rem; color: #333; }
    .hof-detail { font-size: 0.8rem; color: #999; display: flex; align-items: center; gap: 4px; }
    .hof-score { font-weight: 600; color: #333; font-size: 1rem; display: flex; align-items: center; gap: 4px; }
    .hof-empty { text-align: center; color: #adb5bd; padding: 2rem 0; font-size: 0.9rem; }
</style>
