<script lang="ts">
    import type { PageData } from './$types';

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
</script>

<svelte:window on:click={handleWindowClick} />

<div class="library-container">
    <div class="header">
        <h1>🎲 보드게임 도감</h1>
        <p>우리 동호회가 보유한 보드게임 목록입니다.</p>
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
        {#each filteredGames as game}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div class="game-card" class:inactive={!game.is_active} on:click={() => openDetailModal(game)}>
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
                        <span class="badge complexity">⚖️ {game.complexity || '-'} / 5</span>
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
</div>

{#if showDetailModal && selectedDetailGame}
    <div class="modal-backdrop" on:click={closeDetailModal} on:keydown={(e) => e.key === 'Escape' && closeDetailModal()} role="button" tabindex="0" aria-label="Close modal">
        <div class="modal detail-modal" on:click|stopPropagation role="presentation">
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

<style>
    .library-container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 2rem 1rem;
    }
    .header {
        text-align: center;
        margin-bottom: 2rem;
    }
    .header h1 {
        margin: 0 0 0.5rem 0;
        color: #333;
    }
    .header p {
        color: #666;
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
        border: 1px solid #ddd;
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
        border: 1px solid #ddd;
        border-radius: 8px;
        background: white;
        font-size: 1rem;
        text-align: left;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .dropdown-toggle .arrow {
        font-size: 0.8rem;
        color: #666;
    }
    .dropdown-menu {
        position: absolute;
        top: 100%;
        left: 0;
        width: 100%;
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
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
        background: #f5f5f5;
    }

    .games-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 2rem;
    }
    .game-card {
        background: white;
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 4px 15px rgba(0,0,0,0.05);
        transition: transform 0.2s, box-shadow 0.2s;
        border: 1px solid #eee;
        display: flex;
        flex-direction: column;
        cursor: pointer;
    }
    .game-card:hover {
        transform: translateY(-5px);
        box-shadow: 0 8px 25px rgba(0,0,0,0.1);
    }
    .game-image {
        height: 180px;
        background: #f8f9fa;
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
        color: #333;
    }
    .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-bottom: 1rem;
    }
    .badge {
        font-size: 0.8rem;
        padding: 0.25rem 0.6rem;
        border-radius: 20px;
        background: #f0f0f0;
        color: #555;
        font-weight: 500;
    }
    .badge.complexity { background: #f3e5f5; color: #7b1fa2; }
    
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
        background: rgba(0,0,0,0.3);
        color: white;
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
        background: #666;
        color: white;
        padding: 2px 6px;
        border-radius: 4px;
    }
    .dlc-info {
        font-size: 0.9rem;
        color: #4caf50;
        margin: 0 0 0.5rem 0;
        font-weight: 500;
    }

    .desc {
        color: #666;
        font-size: 0.95rem;
        line-height: 1.5;
        margin: 0;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
    .empty-state {
        grid-column: 1 / -1;
        text-align: center;
        padding: 3rem;
        color: #999;
        font-size: 1.1rem;
    }

    /* Modal Styles */
    .modal-backdrop {
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }
    .modal {
        background: white;
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
        color: #666;
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
        background: #f5f5f5;
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
        background: #f8f9fa;
        padding: 1rem;
        border-radius: 8px;
    }
    .info-item {
        display: flex;
        flex-direction: column;
    }
    .info-item .label {
        font-size: 0.85rem;
        color: #666;
        margin-bottom: 0.25rem;
    }
    .info-item .value {
        font-weight: bold;
        font-size: 1.1rem;
    }
    .complexity-badge {
        color: #7b1fa2;
    }
    .best-players {
        margin-bottom: 1.5rem;
        padding: 0.75rem;
        background: #e3f2fd;
        border-radius: 6px;
        color: #1565c0;
    }
    .dlc-section, .description-section {
        margin-bottom: 1.5rem;
    }
    .dlc-section h4, .description-section h4 {
        margin: 0 0 0.5rem 0;
        font-size: 1rem;
        color: #333;
    }
    .dlc-section p, .description-section p {
        margin: 0;
        color: #555;
        line-height: 1.6;
    }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
    }
    .btn-primary {
        background: #007bff;
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
    }

    @media (max-width: 600px) {
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
