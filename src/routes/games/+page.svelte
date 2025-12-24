<script lang="ts">
    import type { PageData } from './$types';

    export let data: PageData;

    let searchQuery = '';
    let difficultyFilter = 'All';

    $: filteredGames = data.games.filter((g: any) => {
        const matchesSearch = g.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                              (g.description && g.description.toLowerCase().includes(searchQuery.toLowerCase()));
        const matchesDiff = difficultyFilter === 'All' || g.difficulty === difficultyFilter;
        return matchesSearch && matchesDiff;
    });
    let dropdownOpen = false;

    function toggleDropdown() {
        dropdownOpen = !dropdownOpen;
    }

    function selectDifficulty(diff: string) {
        difficultyFilter = diff;
        dropdownOpen = false;
    }

    // Close dropdown when clicking outside
    function handleWindowClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (dropdownOpen && !target.closest('.custom-dropdown')) {
            dropdownOpen = false;
        }
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
                {difficultyFilter === 'All' ? '모든 난이도' : 
                 difficultyFilter === 'Easy' ? '쉬움 (Easy)' : 
                 difficultyFilter === 'Medium' ? '보통 (Medium)' : '어려움 (Hard)'}
                <span class="arrow">▼</span>
            </button>
            {#if dropdownOpen}
                <ul class="dropdown-menu">
                    <li><button on:click={() => selectDifficulty('All')}>모든 난이도</button></li>
                    <li><button on:click={() => selectDifficulty('Easy')}>쉬움 (Easy)</button></li>
                    <li><button on:click={() => selectDifficulty('Medium')}>보통 (Medium)</button></li>
                    <li><button on:click={() => selectDifficulty('Hard')}>어려움 (Hard)</button></li>
                </ul>
            {/if}
        </div>
    </div>

    <div class="games-grid">
        {#each filteredGames as game}
            <div class="game-card">
                <div class="game-image">
                    {#if game.image_url}
                        <img src={game.image_url} alt={game.name} />
                    {:else}
                        <div class="placeholder">🎲</div>
                    {/if}
                </div>
                <div class="game-info">
                    <h3>{game.name}</h3>
                    <div class="meta">
                        <span class="badge players">👥 {game.min_players}-{game.max_players}인</span>
                        <span class="badge time">⏱ {game.playtime_min}분</span>
                        <span class="badge difficulty {game.difficulty?.toLowerCase()}">{game.difficulty || '-'}</span>
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
        min-width: 140px;
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
    .badge.difficulty.easy { background: #e8f5e9; color: #2e7d32; }
    .badge.difficulty.medium { background: #fff3e0; color: #ef6c00; }
    .badge.difficulty.hard { background: #ffebee; color: #c62828; }

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
    }
</style>
