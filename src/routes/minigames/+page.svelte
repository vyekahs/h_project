<script lang="ts">
    import ActivityTicker from '$lib/components/games/ActivityTicker.svelte';

    let { data } = $props();

    const games = [
        {
            id: 'sudoku',
            name: '스도쿠',
            tagline: '논리 퍼즐의 정석',
            url: '/minigames/start/sudoku',
            accentColor: '#60a5fa',
            releasedAt: '2024-12-01',
            forceNew: false
        },
        {
            id: 'killer-sudoku',
            name: '킬러 스도쿠',
            tagline: '스도쿠에 연산 한 스푼',
            url: '/minigames/start/killer-sudoku',
            accentColor: '#facc15',
            releasedAt: '2025-01-10',
            forceNew: false
        },
        {
            id: 'unblock-me',
            name: '언블록미',
            tagline: '슬라이딩 블록 퍼즐',
            url: '/minigames/start/unblock-me',
            accentColor: '#f87171',
            releasedAt: '2025-01-15',
            forceNew: false
        },
        {
            id: 'tichu',
            name: '티츄',
            tagline: '2:2 트릭테이킹 카드게임',
            url: '/minigames/tichu',
            accentColor: '#22c55e',
            releasedAt: '2025-01-20',
            forceNew: false
        },
        {
            id: 'energy',
            name: '에너지 서킷',
            tagline: '회로를 연결하여 전구를 켜세요',
            url: '/minigames/start/energy',
            accentColor: '#f59e0b',
            releasedAt: '2025-02-01',
            forceNew: false
        },
        {
            id: 'water-sort',
            name: '워터소트',
            tagline: '색깔 물을 정리하세요',
            url: '/minigames/start/water-sort',
            accentColor: '#6366f1',
            releasedAt: '2025-02-10',
            forceNew: false
        },
        {
            id: 'triple-tile',
            name: '트리플 타일',
            tagline: '3개를 모아 타일을 제거하세요',
            url: '/minigames/start/triple-tile',
            accentColor: '#ec4899',
            releasedAt: '2025-03-01',
            forceNew: false
        },
        {
            id: 'train-tracks',
            name: '트레인 트랙',
            tagline: '선로를 연결하여 기차길을 완성하세요',
            url: '/minigames/start/train-tracks',
            accentColor: '#78716c',
            releasedAt: '2026-03-12',
            forceNew: true
        },
        {
            id: '2048',
            name: '2048',
            tagline: '타일을 합쳐 2048을 만드세요',
            url: '/minigames/start/2048',
            accentColor: '#edc22e',
            releasedAt: '2026-03-16',
            forceNew: true
        },
        {
            id: 'freecell',
            name: '프리셀',
            tagline: '전략적 카드 퍼즐',
            url: '/minigames/start/freecell',
            accentColor: '#059669',
            releasedAt: '2026-03-23',
            forceNew: true
        },
        {
            id: 'regicide',
            name: '레지사이드',
            tagline: '12명의 적을 무찔러라',
            url: '/minigames/start/regicide',
            accentColor: '#dc2626',
            releasedAt: '2026-03-26',
            forceNew: true
        }
    ];

    const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    function isNewGame(game: typeof games[0]) {
        return game.forceNew || (now - new Date(game.releasedAt).getTime()) <= TWO_WEEKS;
    }

    const newGames = games.filter(isNewGame);

    const popularGames = $derived(
        data.popularGames
            .map((pg: { gameId: string }) => games.find(g => g.id === pg.gameId))
            .filter(Boolean) as typeof games
    );
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

    <div class="featured-row">
        {#if popularGames.length > 0}
            <section class="featured-section">
                <h2 class="section-title"><span class="section-emoji"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg></span> 인기 게임</h2>
                <div class="featured-list">
                    {#each popularGames as game}
                        <a href={game.url} class="featured-card" style="--accent: {game.accentColor}">
                            <div class="featured-icon">
                                <div class="featured-icon-box">
                                    {#if game.id === 'sudoku'}
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" /><path d="M15 3v18" /></svg>
                                    {:else if game.id === 'killer-sudoku'}
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3"/><text x="5.5" y="9" font-size="4.5" font-weight="bold" fill="currentColor" stroke="none">20</text></svg>
                                    {:else if game.id === 'unblock-me'}
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="9" width="10" height="6" rx="1.5" fill="currentColor" stroke="none"/><path d="M16 12h5m-2-2l2 2l-2 2" stroke-width="2.5"/></svg>
                                    {:else if game.id === 'tichu'}
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="2" width="12" height="17" rx="2"/><rect x="9" y="5" width="12" height="17" rx="2" fill="rgba(255,255,255,0.3)"/><text x="7" y="13" font-size="7" font-weight="bold" fill="currentColor" stroke="none">T</text></svg>
                                    {:else if game.id === 'energy'}
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4" stroke-width="1.5"/><path d="M12 4v-2M12 12v2M8 8H6M18 8h-2" stroke-width="1.5"/><path d="M11 14l-1.5 4h5L13 14" fill="rgba(255,255,255,0.3)" stroke-width="1.5"/></svg>
                                    {:else if game.id === 'water-sort'}
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="18" rx="3.5" stroke-width="1.5"/><rect x="14" y="3" width="7" height="18" rx="3.5" stroke-width="1.5"/></svg>
                                    {:else if game.id === 'triple-tile'}
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="10" width="8" height="8" rx="2" fill="rgba(255,255,255,0.3)"/><rect x="8" y="7" width="8" height="8" rx="2" fill="rgba(255,255,255,0.5)"/><rect x="14" y="4" width="8" height="8" rx="2" fill="rgba(255,255,255,0.7)"/></svg>
                                    {:else if game.id === 'train-tracks'}
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="4" x2="5" y2="20"/><line x1="19" y1="4" x2="19" y2="20"/><line x1="5" y1="7" x2="19" y2="7"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="5" y1="17" x2="19" y2="17"/></svg>
                                    {:else if game.id === '2048'}
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5" fill="rgba(255,255,255,0.15)"/><rect x="3" y="13" width="8" height="8" rx="1.5" fill="rgba(255,255,255,0.3)"/><rect x="13" y="13" width="8" height="8" rx="1.5" fill="rgba(255,255,255,0.45)"/><text x="7" y="7" dy=".35em" font-size="4.5" font-weight="bold" fill="currentColor" stroke="none" text-anchor="middle">2</text><text x="17" y="7" dy=".35em" font-size="4.5" font-weight="bold" fill="currentColor" stroke="none" text-anchor="middle">0</text><text x="7" y="17" dy=".35em" font-size="4.5" font-weight="bold" fill="currentColor" stroke="none" text-anchor="middle">4</text><text x="17" y="17" dy=".35em" font-size="4.5" font-weight="bold" fill="currentColor" stroke="none" text-anchor="middle">8</text></svg>
                                    {:else if game.id === 'freecell'}
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="3" fill="rgba(255,255,255,0.1)"/><text x="9" y="11" font-size="9" font-weight="bold" fill="currentColor" stroke="none" text-anchor="middle">K</text><path d="M15 13 L18 16 L15 19 L12 16 Z" fill="currentColor" stroke="none"/></svg>
                                    {/if}
                                </div>
                            </div>
                            <span class="featured-name">{game.name}</span>
                        </a>
                    {/each}
                </div>
            </section>
        {/if}

        {#if newGames.length > 0}
            <section class="featured-section">
                <h2 class="section-title"><span class="section-emoji"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg></span> 새로운 게임</h2>
                <div class="featured-list">
                    {#each newGames as game}
                        <a href={game.url} class="featured-card" style="--accent: {game.accentColor}">
                            <div class="featured-icon">
                                <div class="featured-icon-box">
                                    {#if game.id === 'sudoku'}
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" /><path d="M15 3v18" /></svg>
                                    {:else if game.id === 'killer-sudoku'}
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3"/><text x="5.5" y="9" font-size="4.5" font-weight="bold" fill="currentColor" stroke="none">20</text></svg>
                                    {:else if game.id === 'unblock-me'}
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="9" width="10" height="6" rx="1.5" fill="currentColor" stroke="none"/><path d="M16 12h5m-2-2l2 2l-2 2" stroke-width="2.5"/></svg>
                                    {:else if game.id === 'tichu'}
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="2" width="12" height="17" rx="2"/><rect x="9" y="5" width="12" height="17" rx="2" fill="rgba(255,255,255,0.3)"/><text x="7" y="13" font-size="7" font-weight="bold" fill="currentColor" stroke="none">T</text></svg>
                                    {:else if game.id === 'energy'}
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4" stroke-width="1.5"/><path d="M12 4v-2M12 12v2M8 8H6M18 8h-2" stroke-width="1.5"/><path d="M11 14l-1.5 4h5L13 14" fill="rgba(255,255,255,0.3)" stroke-width="1.5"/></svg>
                                    {:else if game.id === 'water-sort'}
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="18" rx="3.5" stroke-width="1.5"/><rect x="14" y="3" width="7" height="18" rx="3.5" stroke-width="1.5"/></svg>
                                    {:else if game.id === 'triple-tile'}
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="10" width="8" height="8" rx="2" fill="rgba(255,255,255,0.3)"/><rect x="8" y="7" width="8" height="8" rx="2" fill="rgba(255,255,255,0.5)"/><rect x="14" y="4" width="8" height="8" rx="2" fill="rgba(255,255,255,0.7)"/></svg>
                                    {:else if game.id === 'train-tracks'}
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="4" x2="5" y2="20"/><line x1="19" y1="4" x2="19" y2="20"/><line x1="5" y1="7" x2="19" y2="7"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="5" y1="17" x2="19" y2="17"/></svg>
                                    {:else if game.id === '2048'}
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5" fill="rgba(255,255,255,0.15)"/><rect x="3" y="13" width="8" height="8" rx="1.5" fill="rgba(255,255,255,0.3)"/><rect x="13" y="13" width="8" height="8" rx="1.5" fill="rgba(255,255,255,0.45)"/><text x="7" y="7" dy=".35em" font-size="4.5" font-weight="bold" fill="currentColor" stroke="none" text-anchor="middle">2</text><text x="17" y="7" dy=".35em" font-size="4.5" font-weight="bold" fill="currentColor" stroke="none" text-anchor="middle">0</text><text x="7" y="17" dy=".35em" font-size="4.5" font-weight="bold" fill="currentColor" stroke="none" text-anchor="middle">4</text><text x="17" y="17" dy=".35em" font-weight="bold" font-size="4.5" fill="currentColor" stroke="none" text-anchor="middle">8</text></svg>
                                    {:else if game.id === 'freecell'}
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="3" fill="rgba(255,255,255,0.1)"/><text x="9" y="11" font-size="9" font-weight="bold" fill="currentColor" stroke="none" text-anchor="middle">K</text><path d="M15 13 L18 16 L15 19 L12 16 Z" fill="currentColor" stroke="none"/></svg>
                                    {/if}
                                </div>
                            </div>
                            <span class="featured-name">{game.name}</span>
                        </a>
                    {/each}
                </div>
            </section>
        {/if}
    </div>

    <section class="section-title-row">
        <h2 class="section-title"><span class="section-emoji"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg></span> 전체 게임</h2>
    </section>

    <section class="games-grid">
        {#each games as game}
            {@const rank = data.userRanks[game.id]}
            <a href={game.url} class="game-icon-item" style="--accent: {game.accentColor}">
                <div class="icon-wrapper glass-panel">
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
                        {:else if game.id === 'energy'}
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="8" r="4" stroke-width="1.5"/>
                                <path d="M12 4v-2M12 12v2M8 8H6M18 8h-2" stroke-width="1.5"/>
                                <path d="M11 14l-1.5 4h5L13 14" fill="rgba(255,255,255,0.3)" stroke-width="1.5"/>
                                <line x1="10" y1="19" x2="14" y2="19" stroke-width="1.5"/>
                                <line x1="10.5" y1="20.5" x2="13.5" y2="20.5" stroke-width="1.5"/>
                            </svg>
                        {:else if game.id === 'water-sort'}
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="3" width="7" height="18" rx="3.5" stroke-width="1.5"/>
                                <rect x="14" y="3" width="7" height="18" rx="3.5" stroke-width="1.5"/>
                                <rect x="4" y="12" width="5" height="8" rx="2.5" fill="rgba(255,255,255,0.5)" stroke="none"/>
                                <rect x="15" y="9" width="5" height="11" rx="2.5" fill="rgba(255,255,255,0.5)" stroke="none"/>
                            </svg>
                        {:else if game.id === 'triple-tile'}
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="2" y="10" width="8" height="8" rx="2" fill="rgba(255,255,255,0.3)"/>
                                <rect x="8" y="7" width="8" height="8" rx="2" fill="rgba(255,255,255,0.5)"/>
                                <rect x="14" y="4" width="8" height="8" rx="2" fill="rgba(255,255,255,0.7)"/>
                                <text x="5" y="16" font-size="5" fill="currentColor" stroke="none" text-anchor="middle">3</text>
                            </svg>
                        {:else if game.id === 'train-tracks'}
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="5" y1="4" x2="5" y2="20"/>
                                <line x1="19" y1="4" x2="19" y2="20"/>
                                <line x1="5" y1="7" x2="19" y2="7"/>
                                <line x1="5" y1="12" x2="19" y2="12"/>
                                <line x1="5" y1="17" x2="19" y2="17"/>
                            </svg>
                        {:else if game.id === '2048'}
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="3" width="8" height="8" rx="1.5" />
                                <rect x="13" y="3" width="8" height="8" rx="1.5" fill="rgba(255,255,255,0.15)"/>
                                <rect x="3" y="13" width="8" height="8" rx="1.5" fill="rgba(255,255,255,0.3)"/>
                                <rect x="13" y="13" width="8" height="8" rx="1.5" fill="rgba(255,255,255,0.45)"/>
                                <text x="7" y="7" dy=".35em" font-size="4.5" font-weight="bold" fill="currentColor" stroke="none" text-anchor="middle">2</text>
                                <text x="17" y="7" dy=".35em" font-size="4.5" font-weight="bold" fill="currentColor" stroke="none" text-anchor="middle">0</text>
                                <text x="7" y="17" dy=".35em" font-size="4.5" font-weight="bold" fill="currentColor" stroke="none" text-anchor="middle">4</text>
                                <text x="17" y="17" dy=".35em" font-size="4.5" font-weight="bold" fill="currentColor" stroke="none" text-anchor="middle">8</text>
                            </svg>
                        {:else if game.id === 'freecell'}
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="4" y="2" width="16" height="20" rx="3" fill="rgba(255,255,255,0.1)"/>
                                <text x="9" y="11" font-size="9" font-weight="bold" fill="currentColor" stroke="none" text-anchor="middle">K</text>
                                <path d="M15 13 L18 16 L15 19 L12 16 Z" fill="currentColor" stroke="none"/>
                            </svg>
                        {/if}
                    </div>
                    <div class="glow-effect"></div>
                </div>
                {#if rank}
                    <div class="rank-badge" class:rank-first={rank === 1}>#{rank}</div>
                {/if}
                <span class="icon-label">{game.name}</span>
            </a>
        {/each}

        <div class="game-icon-item coming-soon">
            <div class="icon-wrapper glass-panel">
                <div class="icon-box disabled">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
            </div>
            <span class="icon-label">Coming Soon</span>
        </div>
    </section>
</div>

<style>
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
        box-shadow: 0 4px 12px var(--shadow-sm);
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    .glass-title-badge h1 {
        font-family: 'Outfit', sans-serif;
        font-size: 1.4rem;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;
        letter-spacing: -0.02em;
        line-height: 1.1;
    }


    .ticker-wrapper {
        margin-bottom: 2rem;
    }

    /* Featured Row - side by side */
    .featured-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem;
        margin-bottom: 1.5rem;
    }

    .featured-section {
        margin-bottom: 0;
    }

    .section-title-row {
        margin-bottom: 0.75rem;
    }

    .section-title {
        font-size: 0.85rem;
        font-weight: 700;
        color: var(--text-dark);
        margin: 0 0 0.75rem 0;
        display: flex;
        align-items: center;
        gap: 0.35rem;
    }

    .section-emoji {
        font-size: 1rem;
    }

    .featured-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .featured-card {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        padding: 0.55rem 0.7rem;
        background: rgba(255, 255, 255, 0.7);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.8);
        border-radius: 14px;
        text-decoration: none;
        color: var(--text-primary);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    }

    .featured-card:active {
        transform: scale(0.97);
    }

    .featured-icon {
        flex-shrink: 0;
        width: 36px;
        height: 36px;
    }

    .featured-icon-box {
        width: 100%;
        height: 100%;
        border-radius: 10px;
        background: linear-gradient(135deg, var(--accent, var(--color-blue)) 0%, white 200%);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--bg-primary);
    }

    .featured-icon-box svg {
        width: 55%;
        height: 55%;
    }

    .featured-name {
        font-size: 0.8rem;
        font-weight: 700;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* Grid Layout - App Icon Grid */
    .games-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 1.25rem 0.5rem;
        justify-items: center;
    }

    /* Glass Panel Utility */
    .glass-panel {
        background: rgba(255, 255, 255, 0.65);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.8);
        box-shadow:
            0 4px 6px -1px var(--overlay-light),
            0 2px 4px -1px var(--shadow-sm),
            inset 0 0 0 1px rgba(255, 255, 255, 0.5);
        border-radius: 24px;
    }

    /* Game Icon Item */
    .game-icon-item {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        text-decoration: none;
        color: var(--text-primary);
        width: 100%;
        max-width: 90px;
        transition: transform 0.2s ease;
    }

    .game-icon-item:active {
        transform: scale(0.92);
    }

    /* Icon Wrapper - Square glass box */
    .icon-wrapper {
        position: relative;
        width: 100%;
        aspect-ratio: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        isolation: isolate;
    }

    .icon-wrapper.glass-panel {
        border-radius: 22%;
    }

    /* Icon Box - Fills entire wrapper */
    .icon-box {
        width: 100%;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(135deg, var(--accent, var(--color-blue)) 0%, white 200%);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--bg-primary);
    }

    .icon-box svg {
        width: 55%;
        height: 55%;
    }

    /* Rank Badge - Small overlay */
    .rank-badge {
        position: absolute;
        top: -3px;
        right: -3px;
        z-index: 3;
        background: rgba(255, 255, 255, 0.95);
        color: var(--accent);
        font-size: 0.6rem;
        font-weight: 800;
        min-width: 1.3rem;
        height: 1.3rem;
        border-radius: 100px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 0.25rem;
        box-shadow: 0 2px 6px var(--shadow-md);
        border: 1.5px solid var(--bg-primary);
        line-height: 1;
    }

    .rank-badge.rank-first {
        background: linear-gradient(135deg, var(--color-amber), var(--color-amber-dark));
        color: var(--bg-primary);
        border-color: var(--color-amber);
        font-size: 0.75rem;
        box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
        animation: crownPulse 2s ease-in-out infinite;
    }

    @keyframes crownPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
    }

    /* Icon Label */
    .icon-label {
        font-size: 0.7rem;
        font-weight: 600;
        text-align: center;
        color: var(--text-dark);
        line-height: 1.2;
        letter-spacing: -0.3px;
        word-break: keep-all;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
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

    .game-icon-item:active .glow-effect {
        opacity: 0.15;
    }

    /* Coming Soon State */
    .game-icon-item.coming-soon {
        cursor: default;
        opacity: 0.5;
    }

    .game-icon-item.coming-soon:active {
        transform: none;
    }

    .game-icon-item.coming-soon .icon-wrapper.glass-panel {
        border-style: dashed;
        background: rgba(255, 255, 255, 0.4);
    }

    .icon-box.disabled {
        background: var(--border-light);
        color: var(--text-secondary);
    }

    /* Responsive: 3 columns on narrow screens */
    @media (max-width: 400px) {
        .games-grid {
            grid-template-columns: repeat(3, 1fr);
        }
        .game-icon-item {
            max-width: 80px;
        }
    }

    /* Desktop */
    @media (min-width: 640px) {
        .game-icon-item {
            max-width: 100px;
        }
    }
</style>
