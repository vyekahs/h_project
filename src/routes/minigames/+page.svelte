<script lang="ts">
    import ActivityTicker from '$lib/components/games/ActivityTicker.svelte';
    import PresenceBadge from '$lib/components/games/PresenceBadge.svelte';

    let { data } = $props();

    const games = [
        {
            id: 'sudoku',
            name: '스도쿠',
            tagline: '논리 퍼즐의 정석',
            url: '/minigames/start/sudoku',
            accentColor: '#60a5fa',
            category: '퍼즐'
        },
        {
            id: 'killer-sudoku',
            name: '킬러 스도쿠',
            tagline: '스도쿠에 연산 한 스푼',
            url: '/minigames/start/killer-sudoku',
            accentColor: '#facc15',
            category: '퍼즐'
        },
        // {
        //     id: 'unblock-me',
        //     name: '언블록미',
        //     tagline: '슬라이딩 블록 퍼즐',
        //     url: '/minigames/start/unblock-me',
        //     accentColor: '#f87171',
        //     releasedAt: '2025-01-15',
        //     forceNew: false
        // },
        {
            id: 'tichu',
            name: '티츄',
            tagline: '2:2 트릭테이킹 카드게임',
            url: '/minigames/tichu',
            accentColor: '#22c55e',
            category: '카드'
        },
        {
            id: 'energy',
            name: '에너지 서킷',
            tagline: '회로를 연결하여 전구를 켜세요',
            url: '/minigames/start/energy',
            accentColor: '#f59e0b',
            category: '퍼즐'
        },
        {
            id: 'water-sort',
            name: '워터소트',
            tagline: '색깔 물을 정리하세요',
            url: '/minigames/start/water-sort',
            accentColor: '#6366f1',
            category: '퍼즐'
        },
        {
            id: 'triple-tile',
            name: '트리플 타일',
            tagline: '3개를 모아 타일을 제거하세요',
            url: '/minigames/start/triple-tile',
            accentColor: '#ec4899',
            category: '캐주얼'
        },
        {
            id: 'train-tracks',
            name: '트레인 트랙',
            tagline: '선로를 연결하여 기차길을 완성하세요',
            url: '/minigames/start/train-tracks',
            accentColor: '#78716c',
            category: '퍼즐'
        },
        {
            id: '2048',
            name: '2048',
            tagline: '타일을 합쳐 2048을 만드세요',
            url: '/minigames/start/2048',
            accentColor: '#edc22e',
            category: '캐주얼'
        },
        {
            id: 'freecell',
            name: '프리셀',
            tagline: '전략적 카드 퍼즐',
            url: '/minigames/start/freecell',
            accentColor: '#059669',
            category: '카드'
        },
        // {
        //     id: 'regicide',
        //     name: '레지사이드',
        //     tagline: '12명의 적을 무찔러라',
        //     url: '/minigames/start/regicide',
        //     accentColor: '#dc2626',
        //     releasedAt: '2026-03-26',
        //     forceNew: true
        // },
        {
            id: 'block-blaster',
            name: '블럭블라스터',
            tagline: '블록을 채워 줄을 완성하세요',
            url: '/minigames/start/block-blaster',
            accentColor: '#8b5cf6',
            category: '캐주얼'
        },
        // {
        //     id: 'match-crash',
        //     name: '매치크래쉬',
        //     tagline: '3개를 맞춰 터뜨려라!',
        //     url: '/minigames/start/match-crash',
        //     accentColor: '#e74c3c',
        //     releasedAt: '2026-04-21',
        //     forceNew: true
        // }
    ];

    // 인기 게임을 별도 섹션으로 안 보여주고, "전체 게임" 그리드 안에서
    // 해당 아이콘에 금/은/동 배지로만 표시한다 — 순서 그대로 순위를 뜻함
    const popularGameIds = $derived(data.popularGames.map((pg: { gameId: string }) => pg.gameId));

    // 게임이 늘어날수록(로드맵상 18개+) "전체 게임"을 한 번에 다 훑어야
    // 하는 부담이 커진다 — 장르 칩으로 좁혀볼 수 있게 함
    const categories = ['전체', ...Array.from(new Set(games.map(g => g.category)))];
    let selectedCategory = $state('전체');
    const filteredGames = $derived(
        selectedCategory === '전체' ? games : games.filter(g => g.category === selectedCategory)
    );
</script>

<div class="page-background"></div>

<div class="arcade-container">
    <header class="arcade-header">
        <div class="glass-title-badge">
            <h1>오락실</h1>
        </div>
        <div class="header-presence">
            <PresenceBadge />
        </div>
    </header>

    <div class="ticker-wrapper">
        <ActivityTicker activities={data.activityFeed} />
    </div>

    <section class="section-title-row">
        <h2 class="section-title"><span class="section-emoji"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg></span> 전체 게임</h2>
    </section>

    <div class="category-chips" role="group" aria-label="게임 장르 필터">
        {#each categories as category}
            <button
                type="button"
                class="category-chip"
                class:active={selectedCategory === category}
                aria-pressed={selectedCategory === category}
                onclick={() => selectedCategory = category}
            >
                {category}
            </button>
        {/each}
    </div>

    <section class="games-grid">
        {#each filteredGames as game}
            {@const rank = data.userRanks[game.id]}
            {@const popularRank = popularGameIds.indexOf(game.id) + 1}
            <a href={game.url} class="game-icon-item" style="--accent: {game.accentColor}">
                <div class="icon-wrapper glass-panel">
                    <div class="icon-box">
                        {#if game.id === 'sudoku'}
                            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" /><path d="M15 3v18" /></svg>
                        {:else if game.id === 'killer-sudoku'}
                            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3"/>
                                <path d="M12 4v16M4 12h16" stroke-width="1" stroke-opacity="0.3" stroke-dasharray="2 2"/>
                                <text x="5.5" y="9" font-size="4.5" font-weight="bold" fill="currentColor" stroke="none">20</text>
                            </svg>
                        {:else if game.id === 'unblock-me'}
                            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="2" y="2" width="20" height="20" rx="2" stroke-opacity="0.1"/>
                                <rect x="5" y="9" width="10" height="6" rx="1.5" fill="currentColor" stroke="none"/>
                                <path d="M16 12h5m-2-2l2 2l-2 2" stroke-width="2.5"/>
                            </svg>
                        {:else if game.id === 'tichu'}
                            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="2" width="12" height="17" rx="2"/>
                                <rect x="9" y="5" width="12" height="17" rx="2" fill="rgba(255,255,255,0.3)"/>
                                <text x="7" y="13" font-size="7" font-weight="bold" fill="currentColor" stroke="none">T</text>
                            </svg>
                        {:else if game.id === 'energy'}
                            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="8" r="4" stroke-width="1.5"/>
                                <path d="M12 4v-2M12 12v2M8 8H6M18 8h-2" stroke-width="1.5"/>
                                <path d="M11 14l-1.5 4h5L13 14" fill="rgba(255,255,255,0.3)" stroke-width="1.5"/>
                                <line x1="10" y1="19" x2="14" y2="19" stroke-width="1.5"/>
                                <line x1="10.5" y1="20.5" x2="13.5" y2="20.5" stroke-width="1.5"/>
                            </svg>
                        {:else if game.id === 'water-sort'}
                            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="3" width="7" height="18" rx="3.5" stroke-width="1.5"/>
                                <rect x="14" y="3" width="7" height="18" rx="3.5" stroke-width="1.5"/>
                                <rect x="4" y="12" width="5" height="8" rx="2.5" fill="rgba(255,255,255,0.5)" stroke="none"/>
                                <rect x="15" y="9" width="5" height="11" rx="2.5" fill="rgba(255,255,255,0.5)" stroke="none"/>
                            </svg>
                        {:else if game.id === 'triple-tile'}
                            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="2" y="10" width="8" height="8" rx="2" fill="rgba(255,255,255,0.3)"/>
                                <rect x="8" y="7" width="8" height="8" rx="2" fill="rgba(255,255,255,0.5)"/>
                                <rect x="14" y="4" width="8" height="8" rx="2" fill="rgba(255,255,255,0.7)"/>
                                <text x="5" y="16" font-size="5" fill="currentColor" stroke="none" text-anchor="middle">3</text>
                            </svg>
                        {:else if game.id === 'train-tracks'}
                            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="5" y1="4" x2="5" y2="20"/>
                                <line x1="19" y1="4" x2="19" y2="20"/>
                                <line x1="5" y1="7" x2="19" y2="7"/>
                                <line x1="5" y1="12" x2="19" y2="12"/>
                                <line x1="5" y1="17" x2="19" y2="17"/>
                            </svg>
                        {:else if game.id === '2048'}
                            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
                            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="4" y="2" width="16" height="20" rx="3" fill="rgba(255,255,255,0.1)"/>
                                <text x="9" y="11" font-size="9" font-weight="bold" fill="currentColor" stroke="none" text-anchor="middle">K</text>
                                <path d="M15 13 L18 16 L15 19 L12 16 Z" fill="currentColor" stroke="none"/>
                            </svg>
                        {:else if game.id === 'regicide'}
                            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="4" y="2" width="16" height="20" rx="3" fill="rgba(255,255,255,0.1)"/>
                                <path d="M8 14 l 2 -5 l 2 2 l 2 -2 l 2 5 z" fill="currentColor" stroke="none"/>
                                <line x1="8" y1="16.5" x2="16" y2="16.5" stroke="currentColor" stroke-width="1.5"/>
                            </svg>
                        {:else if game.id === 'block-blaster'}
                            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="4" y="16" width="16" height="4" rx="1" fill="rgba(255,255,255,0.2)"/>
                                <rect x="4" y="10" width="4" height="4" rx="1" fill="rgba(255,255,255,0.4)"/>
                                <rect x="16" y="4" width="4" height="10" rx="1" fill="rgba(255,255,255,0.15)"/>
                                <rect x="10" y="5" width="4" height="4" rx="1" fill="rgba(255,255,255,0.6)"/>
                            </svg>
                        {:else if game.id === 'match-crash'}
                            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="6" cy="12" r="4" fill="rgba(231,76,60,0.6)"/>
                                <circle cx="12" cy="12" r="4" fill="rgba(46,204,113,0.6)"/>
                                <circle cx="18" cy="12" r="4" fill="rgba(52,152,219,0.6)"/>
                            </svg>
                        {/if}
                    </div>
                    <div class="glow-effect"></div>
                </div>
                {#if rank}
                    <div class="rank-badge" class:rank-first={rank === 1}>#{rank}</div>
                {/if}
                {#if popularRank >= 1 && popularRank <= 3}
                    <div
                        class="popular-badge tier-{popularRank}"
                        aria-label={`이번 달 인기 게임 ${popularRank}위`}
                    >{popularRank}</div>
                {/if}
                <span class="icon-label">{game.name}</span>
            </a>
        {:else}
            <p class="no-results">이 장르의 게임이 아직 없어요</p>
        {/each}

        {#if selectedCategory === '전체'}
        <div class="game-icon-item coming-soon">
            <div class="icon-wrapper glass-panel">
                <div class="icon-box disabled">
                    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
            </div>
            <span class="icon-label">준비 중</span>
        </div>
        {/if}
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
        background: var(--arcade-bg-gradient);
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

    /* 제목은 배지 유무와 상관없이 항상 중앙에 고정하고, 현황 배지는
       우측에 절대 위치시킨다 — 비동기로 로드되어 나타났다 사라졌다 해도
       제목이 밀리지 않게 하기 위함이다. */
    .header-presence {
        position: absolute;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
    }

    .glass-title-badge {
        background: var(--glass-surface-soft);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid var(--glass-border-soft);
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

    /* Category Filter Chips */
    .category-chips {
        display: flex;
        gap: 0.5rem;
        overflow-x: auto;
        margin-bottom: 1.25rem;
        padding-bottom: 0.1rem;
    }

    .category-chip {
        flex-shrink: 0;
        border: 1px solid var(--glass-border-strong);
        background: var(--glass-surface-medium);
        color: var(--text-secondary);
        font-size: 0.85rem;
        font-weight: 600;
        padding: 0.45rem 0.9rem;
        border-radius: 100px;
        cursor: pointer;
        min-height: 36px;
        transition: all 0.15s ease;
    }

    .category-chip.active {
        background: var(--color-blue);
        border-color: var(--color-blue);
        color: #fff;
    }

    .no-results {
        grid-column: 1 / -1;
        text-align: center;
        color: var(--text-tertiary);
        padding: 2rem 0;
        font-size: 0.9rem;
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
        background: var(--glass-surface-medium);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid var(--glass-border-strong);
        box-shadow:
            0 4px 6px -1px var(--overlay-light),
            0 2px 4px -1px var(--shadow-sm),
            inset 0 0 0 1px var(--glass-inset-highlight);
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
        /* var(--bg-primary)는 다크 테마에서 거의 검정이 되어 아이콘이 안 보임 —
           accent 그라데이션 위 아이콘이라 테마와 무관하게 항상 흰색이어야 함 */
        color: #fff;
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
        /* 게임별 accentColor를 그대로 쓰면 10개 중 5개가 흰 배경에서
           1.5~2.5:1로 AA(4.5:1) 미달이었다 — 색감은 유지하되 균일하게
           어둡게 섞어서 모든 accentColor에서 확실히 대비를 확보 */
        color: color-mix(in srgb, var(--accent) 50%, black);
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
        /* var(--bg-primary)는 라이트 테마에서도 흰 배지 텍스트 대 amber
           배경이 1.67:1로 이미 AA 미달이었고, 다크 테마에선 거의 검정이 되어
           또 다른 방식으로 실패했다. amber는 테마별로 안 바뀌는 고정 색이라
           고정 진한 색으로 확실히 대비를 확보 */
        color: #451a03;
        border-color: var(--color-amber);
        font-size: 0.75rem;
        box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
        animation: crownPulse 2s ease-in-out infinite;
    }

    @keyframes crownPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
    }

    /* Popular Badge - 이번 달 전체 인기 게임 1~3위. rank-badge(개인 순위,
       오른쪽 위)와 헷갈리지 않게 반대쪽(왼쪽 위)에 금/은/동으로 표시 */
    .popular-badge {
        position: absolute;
        top: -3px;
        left: -3px;
        z-index: 3;
        font-size: 0.65rem;
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

    /* 그라데이션 두 색 중 어느 쪽에 텍스트가 걸리든 대비를 보장하기
       어려워(작은 배지라 10px대 텍스트, large-text 예외 못 받음) 단색 +
       실측 검증된 조합으로 확정 */
    .popular-badge.tier-1 {
        background: #f59e0b;
        color: #451a03;
        animation: crownPulse 2s ease-in-out infinite;
    }

    .popular-badge.tier-2 {
        background: #9ca3af;
        color: #1f2937;
    }

    .popular-badge.tier-3 {
        background: #92400e;
        color: #fff;
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
    }

    .game-icon-item.coming-soon:active {
        transform: none;
    }

    .game-icon-item.coming-soon .icon-wrapper.glass-panel {
        border-style: dashed;
        background: var(--glass-surface-faint);
    }

    /* 예전엔 아이템 전체에 opacity: 0.5를 걸어서 "비활성" 느낌을 냈는데,
       그 opacity가 라벨 텍스트에도 그대로 곱해져 실제 대비가 ~2.3:1까지
       떨어졌었다 — 아이콘/테두리는 이미 disabled 스타일로 충분히 흐릿하니
       라벨은 opacity 대신 톤 다운된 색상만으로 은은하게 표시 */
    .game-icon-item.coming-soon .icon-label {
        color: var(--text-tertiary);
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

    /* Wide desktop: 600px 고정폭이었을 땐 1280px에서도 화면 절반 이상이
       빈 그라디언트로 방치되고 하단 네비게이션까지 모바일 폭 그대로
       떠 있었다 — 컨테이너를 넓히고 그리드도 그만큼 채움 */
    @media (min-width: 1024px) {
        .arcade-container {
            max-width: 960px;
        }
        .games-grid {
            grid-template-columns: repeat(6, 1fr);
            gap: 1.5rem 1rem;
        }
        .game-icon-item {
            max-width: 120px;
        }
    }
</style>
