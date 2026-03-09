<script lang="ts">
    import type { PageData } from './$types';
    import { enhance } from '$app/forms';

    export let data: PageData;

    let searchQuery = '';
    let complexityFilter = 'All';

    $: filteredGames = data.games.filter((g: any) => {
        const matchesSearch = g.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                              (g.description && g.description.toLowerCase().includes(searchQuery.toLowerCase()));
        
        let matchesComplexity = true;
        const score = g.complexity || 0;
        if (complexityFilter === 'Light') matchesComplexity = score >= 1 && score < 2.5;
        else if (complexityFilter === 'Medium') matchesComplexity = score >= 2.5 && score < 3.5;
        else if (complexityFilter === 'Heavy') matchesComplexity = score >= 3.5;

        return matchesSearch && matchesComplexity;
    });

    let dropdownOpen = false;

    function toggleDropdown() {
        dropdownOpen = !dropdownOpen;
    }

    function selectComplexity(filter: string) {
        complexityFilter = filter;
        dropdownOpen = false;
    }

    // Close dropdown when clicking outside
    function handleWindowClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (dropdownOpen && !target.closest('.custom-dropdown')) {
            dropdownOpen = false;
        }
    }

    // Pagination
    let visibleCount = 10;

    // Reset pagination when filter changes
    $: if (searchQuery || complexityFilter) {
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

<svelte:window on:click={handleWindowClick} />

<div class="library-container">
    <div class="header">
        <a href="/" class="btn-back">← 뒤로가기</a>
        <h1>🎲 보드게임 목록</h1>
        <p>보유한 보드게임 목록입니다.</p>
        {#if data.user && (data.user.can_manage_games)}
             <button class="btn-create" on:click={openBggModal}>🎲 게임 DB 추가</button>
        {/if}
    </div>

    <div class="filters">
        <input type="text" placeholder="게임 검색..." bind:value={searchQuery} class="search-input" />
        
        <div class="custom-dropdown">
            <button class="dropdown-toggle" on:click|stopPropagation={toggleDropdown}>
                {complexityFilter === 'All' ? '모든 난이도' : 
                 complexityFilter === 'Light' ? '가벼움 (1.0~2.5)' : 
                 complexityFilter === 'Medium' ? '중간 (2.5~3.5)' : '무거움 (3.5+)'}
                <span class="arrow">▼</span>
            </button>
            {#if dropdownOpen}
                <ul class="dropdown-menu">
                    <li><button on:click={() => selectComplexity('All')}>모든 난이도</button></li>
                    <li><button on:click={() => selectComplexity('Light')}>가벼움 (1.0~2.5)</button></li>
                    <li><button on:click={() => selectComplexity('Medium')}>중간 (2.5~3.5)</button></li>
                    <li><button on:click={() => selectComplexity('Heavy')}>무거움 (3.5+)</button></li>
                </ul>
            {/if}
        </div>
    </div>

    <div class="games-grid">
        {#each filteredGames.slice(0, visibleCount) as game}
            <div 
                class="game-card" 
                class:inactive={!game.is_active} 
                on:click={() => openDetailModal(game)}
                on:keydown={(e) => e.key === 'Enter' && openDetailModal(game)}
                role="button"
                tabindex="0"
                aria-label="{game.name} 상세 정보 보기"
            >
                <div class="game-image">
                    {#if game.image_url}
                        <img src={game.image_url} alt={game.name} />
                    {:else}
                        <div class="placeholder">🎲</div>
                    {/if}
                    {#if !game.is_active}
                        <div class="inactive-overlay">비활성화됨</div>
                    {/if}
                </div>
                <div class="game-info">
                    <div class="title-row">
                        <h3>{game.name}</h3>
                        {#if !game.is_active}
                            <span class="badge-inactive">비활성화됨</span>
                        {/if}
                    </div>
                    <div class="meta">
                        <span class="badge players">👥 {game.min_players}-{game.max_players}인</span>
                        <span class="badge time">⏱ {game.playtime_min}분</span>
                        <span class="badge complexity">난이도: {game.complexity || '-'} / 5</span>
                    </div>
                    {#if game.included_dlcs}
                        <p class="dlc-info">➕ 포함된 확장: {game.included_dlcs}</p>
                    {/if}
                    <p class="desc">{game.description || '설명이 없습니다.'}</p>
                </div>
            </div>
        {/each}
        {#if filteredGames.length === 0}
            <div class="empty-state">검색 결과가 없습니다.</div>
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
            <div class="detail-header">
                <h2>{selectedDetailGame.name}</h2>
                <button class="btn-close" on:click={closeDetailModal}>✕</button>
            </div>
            
            <div class="detail-content">
                <div class="detail-image">
                    {#if selectedDetailGame.image_url}
                        <img src={selectedDetailGame.image_url} alt={selectedDetailGame.name} />
                    {:else}
                        <div class="placeholder">🎲</div>
                    {/if}
                </div>
                
                <div class="detail-info">
                    <div class="info-grid">
                        <div class="info-item">
                            <span class="label">인원</span>
                            <span class="value">{selectedDetailGame.min_players}-{selectedDetailGame.max_players}명</span>
                        </div>
                        <div class="info-item">
                            <span class="label">시간</span>
                            <span class="value">{selectedDetailGame.playtime_min}분~{selectedDetailGame.max_playtime || selectedDetailGame.playtime_min}분</span>
                        </div>
                        <div class="info-item">
                            <span class="label">연령</span>
                            <span class="value">{selectedDetailGame.min_age ? selectedDetailGame.min_age + '세 이상' : '-'}</span>
                        </div>
                        <div class="info-item">
                            <span class="label">난이도</span>
                            <span class="value complexity-badge">⚖️ {selectedDetailGame.complexity || '-'} / 5</span>
                        </div>
                    </div>

                    {#if selectedDetailGame.best_players}
                        <div class="best-players">
                            <span class="label">👍 베스트 인원:</span>
                            <span class="value">{selectedDetailGame.best_players}명</span>
                        </div>
                    {/if}

                    {#if selectedDetailGame.included_dlcs}
                        <div class="dlc-section">
                            <h4>➕ 포함된 확장</h4>
                            <p>{selectedDetailGame.included_dlcs}</p>
                        </div>
                    {/if}

                    <div class="description-section">
                        <h4>📝 게임 설명</h4>
                        <p>{selectedDetailGame.description || '설명이 없습니다.'}</p>
                    </div>
                </div>
            </div>

            <div class="modal-actions">
                <button class="btn-primary" on:click={closeDetailModal}>닫기</button>
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
            <h2>🎲 BGG 게임 검색 및 추가</h2>
            
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
                    <div class="loader">BGG에서 검색 중입니다... ⏳</div>
                {:else if bggResults.length > 0}
                    {#each bggResults as game}
                        <div class="bgg-item">
                            <div class="bgg-info">
                                <h4>{game.name}</h4>
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
    .search-input {
        padding: 0.75rem;
        border: 1px solid var(--border-default);
        border-radius: 8px;
        width: 100%;
        max-width: 300px;
        font-size: 1rem;
    }
    .custom-dropdown {
        position: relative;
        display: inline-block;
        min-width: 160px;
    }
    .dropdown-toggle {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid var(--border-default);
        border-radius: 8px;
        background: var(--bg-primary);
        font-size: 1rem;
        text-align: left;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .dropdown-toggle .arrow {
        font-size: 0.8rem;
        color: var(--text-secondary);
    }
    .dropdown-menu {
        position: absolute;
        top: 100%;
        left: 0;
        width: 100%;
        background: var(--bg-primary);
        border: 1px solid var(--border-default);
        border-radius: 8px;
        box-shadow: 0 4px 12px var(--shadow-md);
        padding: 0.5rem 0;
        margin-top: 0.5rem;
        list-style: none;
        z-index: 100;
    }
    .dropdown-menu li button {
        width: 100%;
        padding: 0.5rem 1rem;
        border: none;
        background: none;
        text-align: left;
        cursor: pointer;
        font-size: 0.95rem;
    }
    .dropdown-menu li button:hover {
        background: var(--bg-surface);
    }

    .games-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 2rem;
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
    }
    .game-card:hover {
        transform: translateY(-5px);
        box-shadow: 0 8px 25px var(--shadow-md);
    }
    .game-image {
        height: 180px;
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
        font-size: 4rem;
        opacity: 0.5;
    }
    .game-info {
        padding: 1.5rem;
        flex: 1;
        display: flex;
        flex-direction: column;
    }
    .game-info h3 {
        margin: 0 0 0.5rem 0;
        font-size: 1.25rem;
        color: var(--text-primary);
    }
    .meta {
        margin-bottom: 1rem;
    }
    .badge {
        font-size: 0.8rem;
        padding: 0.25rem 0.6rem;
        border-radius: 20px;
        background: var(--bg-elevated);
        color: var(--text-darker);
        font-weight: 500;
    }
    .badge.complexity { background: var(--color-info-bg); color: var(--color-blue-bright); }
    
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
    }
    .title-row h3 { margin: 0; }
    .badge-inactive {
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

    .desc {
        color: var(--text-secondary);
        font-size: 0.95rem;
        line-height: 1.5;
        margin: 0;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
    .empty-state {
        grid-column: 1 / -1;
        text-align: center;
        padding: 3rem;
        color: var(--text-muted);
        font-size: 1.1rem;
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
        z-index: 1000;
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
        max-width: 700px;
    }
    .detail-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
    }
    .detail-header h2 { margin: 0; }
    .btn-close {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0;
        color: var(--text-secondary);
    }
    .detail-content {
        display: flex;
        gap: 2rem;
        margin-bottom: 2rem;
    }
    .detail-image {
        flex: 0 0 250px;
        height: 250px;
        border-radius: 8px;
        overflow: hidden;
        background: var(--bg-surface);
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .detail-image img {
        width: 100%;
        height: 100%;
        object-fit: contain;
    }
    .detail-image .placeholder { font-size: 4rem; }
    .detail-info { flex: 1; }
    .info-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1rem;
        margin-bottom: 1.5rem;
        background: var(--bg-secondary);
        padding: 1rem;
        border-radius: 8px;
    }
    .info-item {
        display: flex;
        flex-direction: column;
    }
    .info-item .label {
        font-size: 0.85rem;
        color: var(--text-secondary);
        margin-bottom: 0.25rem;
    }
    .info-item .value {
        font-weight: bold;
        font-size: 1.1rem;
    }
    .complexity-badge {
        color: var(--color-blue-bright);
    }
    .best-players {
        margin-bottom: 1.5rem;
        padding: 0.75rem;
        background: var(--color-info-bg);
        border-radius: 6px;
        color: var(--color-blue-bright);
    }
    .dlc-section, .description-section {
        margin-bottom: 1.5rem;
    }
    .dlc-section h4, .description-section h4 {
        margin: 0 0 0.5rem 0;
        font-size: 1rem;
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
    }
    .btn-primary {
        background: var(--color-blue-bright);
        color: var(--bg-primary);
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
    }


    .btn-back {
        position: absolute;
        top: 0;
        left: 0;
        padding: 0.5rem 1rem;
        background: none;
        border: 1px solid transparent;
        color: var(--text-secondary);
        font-size: 0.95rem;
        font-weight: 600;
        text-decoration: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 0.25rem;
        border-radius: 6px;
        transition: all 0.2s;
    }
    .btn-back:hover {
        color: var(--text-primary);
        background: var(--bg-secondary);
        border-color: var(--border-default);
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
    .bgg-info h4 {
        margin: 0;
        font-size: 1rem;
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
        .btn-back {
            position: static;
            margin-bottom: 0.5rem;
            width: auto;
            align-self: flex-start;
        }
        .filters {
            flex-wrap: nowrap;
            gap: 0.5rem;
            justify-content: space-between;
        }
        .search-input {
            flex: 1;
            min-width: 0; /* Allow shrinking */
            width: 100%;
        }
        .custom-dropdown {
            flex: 0 0 auto; /* Prevent shrinking */
            width: auto;
            max-width: 140px; /* Prevent it from taking too much space */
        }
        .dropdown-toggle {
            padding: 0.75rem 0.5rem; /* Slightly smaller padding on mobile */
            font-size: 0.9rem;
        }
        .dropdown-toggle .arrow {
            margin-left: 4px;
        }
        .detail-content {
            flex-direction: column;
        }
        .detail-image {
            width: 100%;
            height: 200px;
            flex: none;
        }
    }
</style>
