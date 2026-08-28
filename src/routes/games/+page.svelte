<script lang="ts">
    import type { PageData } from './$types';
    import { enhance } from '$app/forms';

    export let data: PageData;

    let searchQuery = '';
    let complexityFilter = 'All';
    let playerFilter = 'All';
    let sortBy: 'popular' | 'name' | 'complexity' = 'popular';

    let viewMode: 'grid' | 'list' = 'grid';
    if (typeof localStorage !== 'undefined') {
        const savedView = localStorage.getItem('games_view_mode');
        if (savedView === 'grid' || savedView === 'list') viewMode = savedView;
    }
    function setViewMode(mode: 'grid' | 'list') {
        viewMode = mode;
        try { localStorage.setItem('games_view_mode', mode); } catch {}
    }

    $: filteredGames = data.games.filter((g: any) => {
        const matchesSearch = g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              (g.description && g.description.toLowerCase().includes(searchQuery.toLowerCase()));

        let matchesComplexity = true;
        const score = g.complexity || 0;
        if (complexityFilter === 'Light') matchesComplexity = score >= 1 && score < 2.5;
        else if (complexityFilter === 'Medium') matchesComplexity = score >= 2.5 && score < 3.5;
        else if (complexityFilter === 'Heavy') matchesComplexity = score >= 3.5;

        let matchesPlayers = true;
        if (playerFilter === '5+') {
            matchesPlayers = (g.max_players || 0) >= 5;
        } else if (playerFilter !== 'All') {
            const n = parseInt(playerFilter);
            matchesPlayers = (g.min_players || 1) <= n && (g.max_players || n) >= n;
        }

        return matchesSearch && matchesComplexity && matchesPlayers;
    }).sort((a: any, b: any) => {
        if (sortBy === 'popular') return (b.play_count || 0) - (a.play_count || 0);
        if (sortBy === 'complexity') return (b.complexity || 0) - (a.complexity || 0);
        return a.name.localeCompare(b.name, 'ko');
    });

    // 필터 드롭다운과 같은 3단계 기준으로 라벨/등급을 매겨, 카드에도 같은 기준으로 보여준다
    function complexityLabel(score: number | null | undefined): string | null {
        if (!score) return null;
        if (score < 2.5) return '가벼움';
        if (score < 3.5) return '중간';
        return '무거움';
    }
    function complexityTier(score: number | null | undefined): string {
        if (!score) return '';
        if (score < 2.5) return 'tier-light';
        if (score < 3.5) return 'tier-medium';
        return 'tier-heavy';
    }

    function resetFilters() {
        searchQuery = '';
        complexityFilter = 'All';
        playerFilter = 'All';
    }

    // Pagination
    let visibleCount = 10;

    // Reset pagination when filter changes
    $: if (searchQuery || complexityFilter || playerFilter) {
        visibleCount = 10;
    }

    let showDetailModal = false;
    let selectedDetailGame: any = null;

    function openDetailModal(game: any) {
        selectedDetailGame = game;
        showDetailModal = true;
    }

    function closeDetailModal() {
        showDetailModal = false;
        selectedDetailGame = null;
    }

    // BGG Logic
    let showBggModal = false;
    let bggQuery = '';
    let bggResults: any[] = [];
    let bggLoading = false;
    let importingId: string | null = null;
    let alertVisible = false;
    let alertMessage = '';

    function openBggModal() {
        showBggModal = true;
        bggQuery = '';
        bggResults = [];
    }

    function showAlert(msg: string) {
        alertMessage = msg;
        alertVisible = true;
    }

    function focusOnMount(node: HTMLElement) {
        node.focus();
    }
</script>

<div class="library-container">
    <div class="header">
        <h1>보드게임 목록</h1>
        <p>보유한 보드게임 목록입니다.</p>
        {#if data.user && (data.user.can_manage_games)}
             <button class="btn-create" on:click={openBggModal}>게임 DB 추가</button>
        {/if}
    </div>

    <div class="filters">
        <div class="search-input-wrap">
            <input type="text" placeholder="게임 검색..." bind:value={searchQuery} class="search-input" />
            {#if searchQuery}
                <button type="button" class="search-clear" on:click={() => searchQuery = ''} aria-label="검색어 지우기">✕</button>
            {/if}
        </div>

        <select class="complexity-select" bind:value={complexityFilter} aria-label="난이도 필터">
            <option value="All">모든 난이도</option>
            <option value="Light">가벼움 (1.0~2.5)</option>
            <option value="Medium">중간 (2.5~3.5)</option>
            <option value="Heavy">무거움 (3.5+)</option>
        </select>

        <select class="player-select" bind:value={playerFilter} aria-label="인원 필터">
            <option value="All">모든 인원</option>
            <option value="1">1인</option>
            <option value="2">2인</option>
            <option value="3">3인</option>
            <option value="4">4인</option>
            <option value="5+">5인 이상</option>
        </select>

        <select class="sort-select" bind:value={sortBy} aria-label="정렬 기준">
            <option value="popular">인기순</option>
            <option value="name">이름순</option>
            <option value="complexity">난이도순</option>
        </select>

        <div class="view-toggle" role="group" aria-label="보기 방식">
            <button type="button" class="view-toggle-btn" class:active={viewMode === 'grid'} aria-pressed={viewMode === 'grid'} aria-label="격자로 보기" on:click={() => setViewMode('grid')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <rect x="1" y="1" width="6" height="6" rx="1.2" fill="currentColor"/>
                    <rect x="9" y="1" width="6" height="6" rx="1.2" fill="currentColor"/>
                    <rect x="1" y="9" width="6" height="6" rx="1.2" fill="currentColor"/>
                    <rect x="9" y="9" width="6" height="6" rx="1.2" fill="currentColor"/>
                </svg>
            </button>
            <button type="button" class="view-toggle-btn" class:active={viewMode === 'list'} aria-pressed={viewMode === 'list'} aria-label="목록으로 보기" on:click={() => setViewMode('list')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <rect x="1" y="1.75" width="14" height="2.5" rx="1.25" fill="currentColor"/>
                    <rect x="1" y="6.75" width="14" height="2.5" rx="1.25" fill="currentColor"/>
                    <rect x="1" y="11.75" width="14" height="2.5" rx="1.25" fill="currentColor"/>
                </svg>
            </button>
        </div>
    </div>

    <p class="result-count">총 {data.games.length}개 중 {filteredGames.length}개 표시</p>

    <div class="games-grid" class:list-view={viewMode === 'list'}>
        {#each filteredGames.slice(0, visibleCount) as game}
            <div 
                class="game-card" 
                class:inactive={!game.is_active} 
                on:click={() => openDetailModal(game)}
                on:keydown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openDetailModal(game);
                    }
                }}
                role="button"
                tabindex="0"
                aria-label="{game.name} 상세 정보 보기"
            >
                <div class="game-image">
                    {#if game.image_url}
                        <img src={game.image_url} alt={game.name} />
                    {:else}
                        <div class="placeholder">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                        </div>
                    {/if}
                    {#if !game.is_active}
                        <div class="inactive-overlay">비활성화됨</div>
                    {/if}
                </div>
                <div class="game-info">
                    <div class="title-row">
                        <h2>{game.name}</h2>
                        {#if !game.is_active}
                            <span class="badge-inactive">비활성화됨</span>
                        {/if}
                    </div>
                    <div class="meta">
                        <span class="badge players">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                            {game.min_players}-{game.max_players}인
                        </span>
                        <span class="badge time">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            {game.playtime_min}분
                        </span>
                        <span class="badge complexity {complexityTier(game.complexity)}">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="20" x2="6" y2="14"/><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/></svg>
                            {#if game.complexity}{complexityLabel(game.complexity)} · {game.complexity}/5{:else}난이도 정보 없음{/if}
                        </span>
                        {#if game.play_count > 0}
                            <span class="badge popular">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
                                {game.play_count}회 플레이됨
                            </span>
                        {/if}
                    </div>
                    {#if game.included_dlcs}
                        <p class="dlc-info">포함된 확장: {game.included_dlcs}</p>
                    {/if}
                </div>
            </div>
        {/each}
        {#if filteredGames.length === 0}
            <div class="empty-state">
                <p>검색 결과가 없습니다.</p>
                <button type="button" class="btn-reset-filters" on:click={resetFilters}>필터 초기화</button>
            </div>
        {/if}
    </div>

    {#if filteredGames.length > visibleCount}
        <button class="btn-load-more" on:click={() => visibleCount += 10}>
            더보기 ({filteredGames.length - visibleCount}개 남음)
        </button>
    {/if}
</div>

{#if showDetailModal && selectedDetailGame}
    <div 
        class="modal-backdrop" 
        on:click={closeDetailModal} 
        on:keydown={(e) => e.key === 'Escape' && closeDetailModal()} 
        role="button" 
        tabindex="-1" 
        aria-label="모달 닫기"
    >
        <div class="modal detail-modal" on:click|stopPropagation on:keydown|stopPropagation role="dialog" tabindex="-1">
            <div class="detail-hero">
                {#if selectedDetailGame.image_url}
                    <img src={selectedDetailGame.image_url} alt={selectedDetailGame.name} />
                {:else}
                    <div class="detail-hero-placeholder">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    </div>
                {/if}
                <button type="button" class="btn-close-float" on:click={closeDetailModal} aria-label="닫기">✕</button>
            </div>

            <div class="detail-scroll">
                <div class="detail-title-row">
                    <h2>{selectedDetailGame.name}</h2>
                    {#if !selectedDetailGame.is_active}
                        <span class="badge-inactive">비활성화됨</span>
                    {/if}
                </div>

                <div class="detail-badges">
                    <span class="badge">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        {selectedDetailGame.min_players}-{selectedDetailGame.max_players}인
                    </span>
                    <span class="badge">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {selectedDetailGame.playtime_min}~{selectedDetailGame.max_playtime || selectedDetailGame.playtime_min}분
                    </span>
                    <span class="badge">{selectedDetailGame.min_age ? selectedDetailGame.min_age + '세 이상' : '연령 제한 없음'}</span>
                    <span class="badge complexity {complexityTier(selectedDetailGame.complexity)}">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="20" x2="6" y2="14"/><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/></svg>
                        {#if selectedDetailGame.complexity}{complexityLabel(selectedDetailGame.complexity)} · {selectedDetailGame.complexity}/5{:else}난이도 정보 없음{/if}
                    </span>
                </div>

                {#if selectedDetailGame.best_players}
                    <div class="best-players">
                        <span class="label">베스트 인원</span>
                        <span class="value">{selectedDetailGame.best_players}명</span>
                    </div>
                {/if}

                {#if selectedDetailGame.included_dlcs}
                    <div class="dlc-section">
                        <h3>포함된 확장</h3>
                        <p>{selectedDetailGame.included_dlcs}</p>
                    </div>
                {/if}

                <div class="description-section">
                    <h3>게임 설명</h3>
                    <p>{selectedDetailGame.description || '설명이 없습니다.'}</p>
                </div>
            </div>

            <div class="modal-actions">
                <button type="button" class="btn-cancel" on:click={closeDetailModal}>닫기</button>
                {#if data.user}
                    <a href="/?startWtp={selectedDetailGame.id}" class="btn-primary">같이 할래요 등록</a>
                {/if}
            </div>
        </div>
    </div>
{/if}

<!-- BGG Search Modal -->
{#if showBggModal}
    <div 
        class="modal-backdrop" 
        on:click={() => showBggModal = false} 
        on:keydown={(e) => e.key === 'Escape' && (showBggModal = false)} 
        role="button" 
        tabindex="-1" 
        aria-label="모달 닫기"
    >
        <div class="modal" on:click|stopPropagation on:keydown|stopPropagation role="dialog" tabindex="-1">
            <h2>BGG 게임 검색 및 추가</h2>
            
            <form method="POST" action="?/searchBgg" use:enhance={() => {
                bggLoading = true;
                return async ({ result }) => {
                    bggLoading = false;
                    if (result.type === 'success') {
                        // @ts-ignore
                        bggResults = result.data.bggGames;
                        if (bggResults.length === 0) {
                            showAlert('검색 결과가 없습니다.');
                        }
                    } else if (result.type === 'failure') {
                        // @ts-ignore
                        showAlert(result.data?.error || '검색 실패');
                    }
                };
            }} class="bgg-search-form">
                <input type="text" name="query" placeholder="게임 이름 (영문 추천)" bind:value={bggQuery} required use:focusOnMount>
                <button type="submit" class="btn-primary" disabled={bggLoading}>
                    {bggLoading ? '...' : '검색'}
                </button>
            </form>

            <div class="bgg-results">
                {#if bggLoading}
                    <div class="loader">BGG에서 검색 중입니다...</div>
                {:else if bggResults.length > 0}
                    {#each bggResults as game}
                        <div class="bgg-item">
                            <div class="bgg-info">
                                <h3>{game.name}</h3>
                                <span class="bgg-year">{game.year}</span>
                            </div>
                            <form method="POST" action="?/importBgg" use:enhance={() => {
                                importingId = game.id;
                                return async ({ result, update }) => {
                                    importingId = null;
                                    if (result.type === 'success') {
                                        showAlert(`'${game.name}' 게임이 추가되었습니다!`);
                                        showBggModal = false;
                                        await update(); // Refresh game list
                                    } else {
                                        // @ts-ignore
                                        showAlert(result.data?.error || '가져오기 실패');
                                    }
                                };
                            }}>
                                <input type="hidden" name="bggId" value={game.id}>
                                <input type="hidden" name="searchName" value={bggQuery}> <!-- Pass query as potential Korean name hint -->
                                <button type="submit" class="btn-primary" style="font-size: 0.8rem; padding: 0.4rem 0.8rem;" disabled={importingId === game.id}>
                                    {importingId === game.id ? '추가 중...' : '가져오기'}
                                </button>
                            </form>
                        </div>
                    {/each}
                {/if}
            </div>

            <div class="modal-actions" style="margin-top: 1rem;">
                <button type="button" class="btn-cancel" on:click={() => showBggModal = false}>닫기</button>
            </div>
        </div>
    </div>
{/if}

<!-- Alert Modal -->
{#if alertVisible}
    <div 
        class="modal-backdrop" 
        on:click={() => alertVisible = false} 
        on:keydown={(e) => e.key === 'Escape' && (alertVisible = false)} 
        role="button" 
        tabindex="-1" 
        aria-label="알림 닫기"
    >
        <div class="modal alert-modal" on:click|stopPropagation on:keydown|stopPropagation role="alertdialog" tabindex="-1">
            <h3>알림</h3>
            <p>{alertMessage}</p>
            <div class="modal-actions" style="justify-content: center;">
                <button class="btn-primary" on:click={() => alertVisible = false}>확인</button>
            </div>
        </div>
    </div>
{/if}

<style>
    .library-container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 2rem 1rem;
    }
    .header {
        text-align: center;
        margin-bottom: 2rem;
        position: relative;
    }
    .header h1 {
        margin: 0 0 0.5rem 0;
        color: var(--text-primary);
    }
    .header p {
        color: var(--text-secondary);
    }
    .filters {
        display: flex;
        gap: 1rem;
        margin-bottom: 2rem;
        justify-content: center;
        position: relative; /* Ensure stacking context */
        z-index: 10;
    }
    .search-input-wrap {
        position: relative;
        width: 100%;
        max-width: 300px;
    }
    .search-input {
        padding: 0.75rem;
        padding-right: 2.25rem;
        border: 1px solid var(--border-default);
        border-radius: 8px;
        width: 100%;
        font-size: 1rem;
    }
    .search-clear {
        position: absolute;
        top: 50%;
        right: 0.5rem;
        transform: translateY(-50%);
        border: none;
        background: none;
        color: var(--text-secondary);
        font-size: 0.9rem;
        line-height: 1;
        padding: 0.35rem;
        cursor: pointer;
        border-radius: 50%;
    }
    .search-clear:hover {
        color: var(--text-primary);
        background: var(--bg-secondary);
    }
    .result-count {
        text-align: center;
        color: var(--text-secondary);
        font-size: 0.85rem;
        margin: -1rem 0 1.5rem;
    }
    .complexity-select,
    .player-select,
    .sort-select {
        padding: 0.75rem;
        border: 1px solid var(--border-default);
        border-radius: 8px;
        background: var(--bg-primary);
        color: var(--text-primary);
        font-size: 1rem;
        cursor: pointer;
    }
    .complexity-select {
        min-width: 150px;
    }
    .player-select {
        min-width: 120px;
    }
    .sort-select {
        min-width: 110px;
    }

    .games-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 1rem;
    }
    .games-grid.list-view {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }
    .games-grid.list-view .game-card {
        flex-direction: row;
    }
    .games-grid.list-view .game-image {
        width: 96px;
        height: 96px;
        flex: 0 0 96px;
    }
    .games-grid.list-view .game-info {
        padding: 0.6rem 1rem;
        justify-content: center;
    }
    .games-grid.list-view .game-info h2 {
        font-size: 1.05rem;
    }
    .games-grid.list-view .dlc-info,
    .games-grid.list-view .badge.complexity {
        display: none;
    }
    .view-toggle {
        display: flex;
        border: 1px solid var(--border-default);
        border-radius: 8px;
        overflow: hidden;
        flex: 0 0 auto;
    }
    .view-toggle-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 38px;
        padding: 0.6rem 0;
        border: none;
        background: var(--bg-primary);
        color: var(--text-secondary);
        cursor: pointer;
    }
    .view-toggle-btn + .view-toggle-btn {
        border-left: 1px solid var(--border-default);
    }
    .view-toggle-btn.active {
        background: var(--color-info-bg);
        color: var(--color-blue-bright);
    }
    .game-card {
        background: var(--bg-primary);
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 4px 15px var(--overlay-light);
        transition: transform 0.2s, box-shadow 0.2s;
        border: 1px solid var(--border-light);
        display: flex;
        flex-direction: column;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
    }
    .game-card:active {
        transform: scale(0.98);
        box-shadow: 0 2px 8px var(--overlay-light);
    }
    .game-card:hover,
    .game-card:focus-visible {
        transform: translateY(-5px);
        box-shadow: 0 8px 25px var(--shadow-md);
    }
    .game-card:focus-visible {
        outline: 2px solid var(--color-blue-bright);
        outline-offset: 2px;
    }
    .game-image {
        height: 130px;
        background: var(--bg-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
    }
    .game-image img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
    .game-image .placeholder {
        color: var(--text-muted);
        opacity: 0.5;
    }
    .game-info {
        padding: 1.1rem;
        flex: 1;
        display: flex;
        flex-direction: column;
    }
    .game-info h2 {
        margin: 0 0 0.5rem 0;
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
    }
    .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        margin-bottom: 1rem;
    }
    .badge {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        white-space: nowrap;
        font-size: 0.8rem;
        padding: 0.3rem 0.65rem;
        border-radius: 20px;
        background: var(--bg-elevated);
        color: var(--text-darker);
        font-weight: 500;
    }
    .badge svg {
        flex-shrink: 0;
        opacity: 0.8;
    }
    .badge.complexity { background: var(--color-info-bg); color: var(--color-blue-bright); }
    .badge.complexity.tier-light { background: var(--color-success-bg); color: var(--color-green-dark); }
    .badge.complexity.tier-medium { background: var(--color-warning-bg); color: var(--color-orange-dark); }
    .badge.complexity.tier-heavy { background: var(--color-error-bg); color: var(--color-red-dark); }
    .badge.popular { background: var(--color-warning-bg); color: var(--color-orange-dark); }
    
    .game-card.inactive {
        filter: grayscale(0.8);
        opacity: 0.7;
    }
    .game-image {
        position: relative;
    }
    .inactive-overlay {
        position: absolute;
        top: 0; left: 0; width: 100%; height: 100%;
        background: var(--shadow-heavy);
        color: var(--bg-primary);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 1.2rem;
    }
    .title-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.5rem;
        min-width: 0;
    }
    .title-row h2 { margin: 0; }
    .badge-inactive {
        flex-shrink: 0;
        font-size: 0.75rem;
        background: var(--text-secondary);
        color: var(--bg-primary);
        padding: 2px 6px;
        border-radius: 4px;
    }
    .dlc-info {
        font-size: 0.9rem;
        color: var(--color-green);
        margin: 0 0 0.5rem 0;
        font-weight: 500;
    }

    .empty-state {
        grid-column: 1 / -1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
        text-align: center;
        padding: 3rem;
        color: var(--text-muted);
        font-size: 1.1rem;
    }
    .empty-state p {
        margin: 0;
    }
    .btn-reset-filters {
        padding: 0.5rem 1.2rem;
        border: 1px solid var(--border-default);
        border-radius: 8px;
        background: var(--bg-primary);
        color: var(--text-darker);
        font-size: 0.9rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }
    .btn-reset-filters:hover {
        background: var(--bg-secondary);
        border-color: var(--border-medium);
    }
    .btn-load-more {
        display: block;
        width: 100%;
        max-width: 400px;
        margin: 2rem auto 0;
        padding: 0.9rem;
        background: var(--bg-primary);
        border: 1px solid var(--border-default);
        border-radius: 12px;
        color: var(--text-darker);
        font-weight: 600;
        font-size: 0.95rem;
        cursor: pointer;
        transition: all 0.2s;
    }
    .btn-load-more:hover {
        background: var(--bg-secondary);
        color: var(--text-primary);
        border-color: var(--border-medium);
    }

    /* Modal Styles */
    .modal-backdrop {
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: var(--overlay-heavy);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1100;
    }
    .modal {
        background: var(--bg-primary);
        background-color: var(--bg-primary); /* Force opaque background */
        box-shadow: 0 4px 20px var(--shadow-lg); /* Add shadow for better separation */
        padding: 2rem;
        border-radius: 12px;
        width: 90%;
        max-width: 500px;
        max-height: 90vh;
        overflow-y: auto;
    }
    .detail-modal {
        max-width: 480px;
        padding: 0;
        display: flex;
        flex-direction: column;
        max-height: 85vh;
        overflow: hidden;
    }
    .detail-hero {
        position: relative;
        flex: 0 0 auto;
        width: 100%;
        height: 220px;
        background: var(--bg-secondary);
        overflow: hidden;
    }
    .detail-hero img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
    .detail-hero-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 4.5rem;
        opacity: 0.4;
    }
    .btn-close-float {
        position: absolute;
        top: 0.75rem;
        right: 0.75rem;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: none;
        background: rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        color: #fff;
        font-size: 1rem;
        line-height: 1;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .detail-scroll {
        flex: 1 1 auto;
        overflow-y: auto;
        padding: 1.25rem 1.5rem;
    }
    .detail-title-row {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
    }
    .detail-title-row h2 {
        margin: 0;
        font-size: 1.4rem;
        color: var(--text-primary);
    }
    .detail-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        margin-bottom: 1.25rem;
    }
    .best-players {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
        padding: 0.75rem 1rem;
        background: var(--color-info-bg);
        border-radius: 8px;
        color: var(--color-blue-bright);
    }
    .best-players .label {
        font-weight: 500;
    }
    .best-players .value {
        font-weight: bold;
        font-size: 1.1rem;
    }
    .dlc-section, .description-section {
        margin-bottom: 1.5rem;
    }
    .dlc-section h3, .description-section h3 {
        margin: 0 0 0.5rem 0;
        font-size: 1rem;
        font-weight: 600;
        color: var(--text-primary);
    }
    .dlc-section p, .description-section p {
        margin: 0;
        color: var(--text-darker);
        line-height: 1.6;
    }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.6rem;
    }
    .detail-modal .modal-actions {
        flex: 0 0 auto;
        padding: 1rem 1.5rem;
        border-top: 1px solid var(--border-light);
    }
    .btn-primary {
        display: inline-flex;
        align-items: center;
        text-decoration: none;
        background: var(--color-blue-bright);
        color: var(--bg-primary);
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
    }


    .btn-create {
        position: absolute;
        top: 0;
        right: 0;
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
        background-color: var(--color-amber); 
        color: var(--bg-primary);
    }
    /* BGG Modal Styles */
    .bgg-search-form {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 2rem;
    }
    .bgg-search-form input {
        flex: 1;
        padding: 0.75rem;
        border: 1px solid var(--border-default);
        border-radius: 8px;
    }
    .bgg-results {
        max-height: 400px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .bgg-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem;
        border: 1px solid var(--border-light);
        border-radius: 8px;
        background: var(--bg-primary);
        text-align: left;
    }
    .bgg-info h3 {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
        color: var(--text-primary);
    }
    .bgg-year {
        font-size: 0.8rem;
        color: var(--text-tertiary);
    }
    .loader {
        text-align: center;
        padding: 2rem;
        color: var(--text-secondary);
    }
    .btn-cancel {
        background: var(--bg-tertiary);
        color: var(--text-dark);
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 8px;
        font-weight: bold;
        cursor: pointer;
    }
    .alert-modal {
        text-align: center;
    }

    @media (max-width: 600px) {
        .header {
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        .btn-create {
            position: static;
            margin-top: 0.5rem;
            width: 100%;
        }
        .filters {
            flex-wrap: wrap;
            gap: 0.5rem;
            justify-content: flex-start;
        }
        .search-input-wrap {
            flex: 1 1 100%; /* 검색창은 자기 줄을 온전히 차지 */
            min-width: 0;
            max-width: none;
        }
        .search-input {
            width: 100%;
        }
        .complexity-select,
        .player-select {
            flex: 1 1 auto; /* 나머지 컨트롤과 함께 줄바꿈되며, 남는 공간을 채움 */
            min-width: 130px;
            width: auto;
            padding: 0.75rem 0.5rem; /* Slightly smaller padding on mobile */
            font-size: 0.9rem;
        }
        .sort-select {
            flex: 0 0 auto;
            min-width: 0;
            max-width: 90px;
            padding: 0.75rem 0.4rem;
            font-size: 0.85rem;
        }
        .detail-hero {
            height: 160px;
        }
        .detail-modal {
            max-height: 90vh;
        }
    }
</style>
