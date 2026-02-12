<script lang="ts">
    import { enhance } from '$app/forms';
    import type { PageData } from './$types';

    export let data: PageData;
    export let form;

    let showModal = false;
    let showBggModal = false;
    let isEditing = false;
    let selectedGame: any = null;
    let isUnlimitedTime = false;

    // BGG State
    let bggQuery = '';
    let bggResults: any[] = [];
    let isSearching = false;
    let isImporting = false;

    function openAddModal() {
        isEditing = false;
        selectedGame = {
            name: '',
            min_players: 2,
            max_players: 4,
            playtime_min: 30,
            complexity: 2.5,
            description: '',
            image_url: '',
            included_dlcs: ''
        };
        isUnlimitedTime = false;
        showModal = true;
    }

    function openEditModal(game: any) {
        isEditing = true;
        selectedGame = { ...game };
        isUnlimitedTime = selectedGame.playtime_min === 0;
        showModal = true;
    }

    function closeModal() {
        showModal = false;
        selectedGame = null;
    }

    function closeBggModal() {
        showBggModal = false;
        bggResults = [];
        bggQuery = '';
        importedIds = new Set();
        lastImportedId = null;
    }

    // Game Search & Pagination
    let gameSearch = '';
    let visibleCount = 12;
    $: filteredGames = gameSearch
        ? data.games.filter((g: any) => g.name.toLowerCase().includes(gameSearch.toLowerCase()))
        : data.games;
    $: visibleGames = filteredGames.slice(0, visibleCount);
    $: hasMore = visibleCount < filteredGames.length;
    // 검색어 변경 시 페이지네이션 리셋
    $: if (gameSearch !== undefined) visibleCount = 12;

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

    // BGG import 성공 추적
    let lastImportedId: string | null = null;
    let importedIds: Set<string> = new Set();

    $: if (form?.success) {
        // @ts-ignore
        if (form.imported) {
            // 모달을 닫지 않고 성공 표시만
            if (lastImportedId) {
                importedIds.add(lastImportedId);
                importedIds = importedIds; // trigger reactivity
            }
            lastImportedId = null;
        // @ts-ignore
        } else if (form.bggGames) {
            // @ts-ignore
            bggResults = form.bggGames || [];
            isSearching = false;
        } else {
            closeModal();
        }
    }
</script>

<div class="games-page">
    <div class="header">
        <h1>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:10px; vertical-align:text-bottom;"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
            보드게임 도감 관리
        </h1>
        <div class="header-actions">
            <button class="btn-secondary" on:click={() => showBggModal = true}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                BGG에서 가져오기
            </button>
            <button class="btn-primary" on:click={openAddModal}>+ 게임 추가</button>
        </div>
    </div>

    <div class="search-bar">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" placeholder="게임 이름 검색..." bind:value={gameSearch} />
        {#if gameSearch}
            <button class="btn-clear-search" on:click={() => gameSearch = ''}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        {/if}
        <span class="search-count">{filteredGames.length}개</span>
    </div>

    <div class="games-grid">
        {#each visibleGames as game}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div class="game-card" class:inactive={!game.is_active} on:click={() => openDetailModal(game)}>
                <div class="game-image">
                    {#if game.image_url}
                        <img src={game.image_url} alt={game.name} />
                    {:else}
                        <div class="placeholder">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#adb5bd;"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                        </div>
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
                        <span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align:text-top;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                            {game.min_players}-{game.max_players}인
                        </span>
                        <span>⏱ {game.playtime_min === 0 ? '무제한' : game.playtime_min + '분'}</span>
                        <span class="complexity-badge">{game.complexity || '-'} / 5</span>
                    </div>
                    {#if game.included_dlcs}
                        <p class="dlc-info">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align:text-top;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            포함된 확장: {game.included_dlcs}
                        </p>
                    {/if}
                    <p class="desc">{game.description || '설명이 없습니다.'}</p>
                    <div class="actions">
                        {#if game.is_active}
                            <button class="btn-edit" on:click|stopPropagation={() => openEditModal(game)}>수정</button>
                            <form method="POST" action="?/delete" use:enhance on:submit|preventDefault={(e) => confirm('정말 삭제하시겠습니까? (기록이 있는 경우 비활성화됩니다)') && (e.target as HTMLFormElement).submit()} on:click|stopPropagation>
                                <input type="hidden" name="id" value={game.id} />
                                <button type="submit" class="btn-delete">삭제</button>
                            </form>
                        {:else}
                            <form method="POST" action="?/reactivate" use:enhance on:click|stopPropagation>
                                <input type="hidden" name="id" value={game.id} />
                                <button type="submit" class="btn-restore">복구</button>
                            </form>
                        {/if}
                    </div>
                </div>
            </div>
        {/each}
        {#if filteredGames.length === 0}
            <div class="empty-state">{gameSearch ? '검색 결과가 없습니다.' : '등록된 게임이 없습니다.'}</div>
        {/if}
    </div>
    {#if hasMore}
        <button class="btn-load-more" on:click={() => visibleCount += 12}>
            더 보기 ({visibleGames.length}/{filteredGames.length})
        </button>
    {/if}
</div>

{#if showDetailModal && selectedDetailGame}
    <div class="modal-backdrop" on:click={closeDetailModal}>
        <div class="modal detail-modal" on:click|stopPropagation>
            <div class="detail-header">
                <h2>{selectedDetailGame.name}</h2>
                <button class="btn-close" on:click={closeDetailModal}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            
            <div class="detail-content">
                <div class="detail-image">
                    {#if selectedDetailGame.image_url}
                        <img src={selectedDetailGame.image_url} alt={selectedDetailGame.name} />
                    {:else}
                        <div class="placeholder">
                            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#adb5bd;"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                        </div>
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
                            <span class="value">
                                {#if selectedDetailGame.playtime_min === 0}
                                    무제한
                                {:else}
                                    {selectedDetailGame.playtime_min}분~{selectedDetailGame.max_playtime || selectedDetailGame.playtime_min}분
                                {/if}
                            </span>
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
                            <span class="label">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; vertical-align:middle;"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
                                베스트 인원:
                            </span>
                            <span class="value">{selectedDetailGame.best_players}명</span>
                        </div>
                    {/if}

                    {#if selectedDetailGame.included_dlcs}
                        <div class="dlc-section">
                            <h4>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; vertical-align:text-bottom;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                포함된 확장
                            </h4>
                            <p>{selectedDetailGame.included_dlcs}</p>
                        </div>
                    {/if}

                    <div class="description-section">
                        <h4>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; vertical-align:text-bottom;"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
                            게임 설명
                        </h4>
                        <p>{selectedDetailGame.description || '설명이 없습니다.'}</p>
                    </div>
                </div>
            </div>

            <div class="modal-actions">
                <button class="btn-edit" on:click={() => { openEditModal(selectedDetailGame); closeDetailModal(); }}>수정</button>
                <button class="btn-primary" on:click={closeDetailModal}>닫기</button>
            </div>
        </div>
    </div>
{/if}

{#if showModal}
    <div class="modal-backdrop" on:click={closeModal}>
        <div class="modal" on:click|stopPropagation>
            <h2>{isEditing ? '게임 수정' : '새 게임 등록'}</h2>
            <form method="POST" action={isEditing ? '?/update' : '?/create'} use:enhance>
                {#if isEditing}
                    <input type="hidden" name="id" value={selectedGame.id} />
                {/if}
                
                <div class="form-group">
                    <label>게임 이름</label>
                    <input type="text" name="name" bind:value={selectedGame.name} required placeholder="예: 스플렌더" />
                </div>

                <div class="row">
                    <div class="form-group">
                        <label>최소 인원</label>
                        <input type="number" name="min_players" bind:value={selectedGame.min_players} min="1" />
                    </div>
                    <div class="form-group">
                        <label>최대 인원</label>
                        <input type="number" name="max_players" bind:value={selectedGame.max_players} min="1" />
                    </div>
                </div>

                <div class="row">
                    <div class="form-group">
                        <label for="playtime">플레이 시간 (분)</label>
                        <div class="playtime-input-group">
                            <input type="number" id="playtime" name="playtime_min" 
                                value={isUnlimitedTime ? 0 : selectedGame.playtime_min} 
                                on:input={(e) => selectedGame.playtime_min = parseInt(e.currentTarget.value)}
                                step="5" 
                                disabled={isUnlimitedTime} 
                            />
                            <label class="checkbox-label">
                                <input type="checkbox" bind:checked={isUnlimitedTime} on:change={() => {
                                    if (isUnlimitedTime) selectedGame.playtime_min = 0;
                                    else selectedGame.playtime_min = 30;
                                }} />
                                제한 시간 없음
                            </label>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="complexity">난이도 (Weight 1~5)</label>
                        <input type="number" id="complexity" name="complexity" bind:value={selectedGame.complexity} step="0.01" min="1" max="5" />
                    </div>
                </div>

                <div class="form-group">
                    <label for="included_dlcs">포함된 확장 (DLC)</label>
                    <input type="text" id="included_dlcs" name="included_dlcs" bind:value={selectedGame.included_dlcs} placeholder="예: 도시와 기사, 항해사 (쉼표로 구분)" />
                </div>

                <div class="form-group">
                    <label for="image_url">이미지 URL</label>
                    <input type="text" id="image_url" name="image_url" bind:value={selectedGame.image_url} placeholder="https://..." />
                </div>

                <div class="form-group">
                    <label for="description">설명</label>
                    <textarea id="description" name="description" bind:value={selectedGame.description} rows="3"></textarea>
                </div>

                <div class="modal-actions">
                    <button type="button" class="btn-cancel" on:click={closeModal}>취소</button>
                    <button type="submit" class="btn-submit">{isEditing ? '수정' : '등록'}</button>
                </div>
            </form>
        </div>
    </div>
{/if}

{#if showBggModal}
    <div class="modal-backdrop" on:click={closeBggModal} on:keydown={(e) => e.key === 'Escape' && closeBggModal()} role="button" tabindex="0" aria-label="Close modal">
        <div class="modal bgg-modal" on:click|stopPropagation role="presentation">
            <h2>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:text-bottom;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                BGG 게임 검색
            </h2>
            <form method="POST" action="?/searchBgg" use:enhance={() => {
                isSearching = true;
                return async ({ update }) => {
                    await update();
                    isSearching = false;
                };
            }} class="search-form">
                <div class="search-row">
                    <input type="text" name="query" bind:value={bggQuery} placeholder="게임 이름 (영어)" required />
                    <button type="submit" class="btn-primary" disabled={isSearching}>
                        {isSearching ? '검색 중...' : '검색'}
                    </button>
                </div>
            </form>

            <div class="search-results">
                {#if bggResults.length > 0}
                    <ul>
                        {#each bggResults as game}
                            <li>
                                <div class="result-info">
                                    <span class="name">{game.name}</span>
                                    <span class="year">({game.year})</span>
                                </div>
                                {#if importedIds.has(game.id)}
                                    <span class="imported-badge">추가됨 ✓</span>
                                {:else}
                                    <form method="POST" action="?/importBgg" use:enhance={() => {
                                        isImporting = true;
                                        lastImportedId = game.id;
                                        return async ({ update }) => {
                                            await update();
                                            isImporting = false;
                                        };
                                    }}>
                                        <input type="hidden" name="bggId" value={game.id} />
                                        <input type="hidden" name="searchName" value={game.name} />
                                        <button type="submit" class="btn-secondary" disabled={isImporting}>
                                            {isImporting ? '가져오는 중...' : '가져오기'}
                                        </button>
                                    </form>
                                {/if}
                            </li>
                        {/each}
                    </ul>
                {:else if !isSearching && bggQuery}
                    <p class="no-results">검색 결과가 없습니다.</p>
                {/if}
            </div>

            <div class="modal-actions">
                <button type="button" class="btn-cancel" on:click={closeBggModal}>닫기</button>
            </div>
        </div>
    </div>
{/if}

<style>
    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
    }
    .games-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 1.5rem;
    }
    .game-card {
        background: white;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        border: 1px solid #eee;
        display: flex;
        flex-direction: column;
        cursor: pointer;
        transition: transform 0.2s, box-shadow 0.2s;
    }
    .game-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    .game-image {
        height: 160px;
        background: #f5f5f5;
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
        font-size: 3rem;
    }
    .game-info {
        padding: 1rem;
        flex: 1;
        display: flex;
        flex-direction: column;
    }
    .game-info h3 {
        margin: 0 0 0.5rem 0;
        font-size: 1.1rem;
    }
    .meta {
        display: flex;
        gap: 0.5rem;
        font-size: 0.85rem;
        color: #666;
        margin-bottom: 0.5rem;
    }
    .complexity-badge {
        padding: 0 6px;
        border-radius: 4px;
        font-weight: bold;
    }

    .dlc-info {
        font-size: 0.85rem;
        color: #4caf50;
        margin: 0 0 0.5rem 0;
        font-weight: 500;
    }
    .desc {
        font-size: 0.9rem;
        color: #555;
        margin: 0 0 1rem 0;
        flex: 1;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
    .actions {
        display: flex;
        gap: 0.5rem;
        justify-content: flex-end;
    }
    button {
        cursor: pointer;
        border: none;
        border-radius: 6px;
        padding: 0.5rem 1rem;
        font-size: 0.9rem;
    }
    .btn-primary { background: #007bff; color: white; font-weight: bold; }
    .btn-edit { background: #f0f0f0; color: #333; }
    .btn-delete { background: #ffebee; color: #d32f2f; }
    .btn-restore { background: #e8f5e9; color: #2e7d32; font-weight: bold; }

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
    
    /* Modal */
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
    
    /* Detail Modal Styles */
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
    
    @media (max-width: 600px) {
        .detail-content {
            flex-direction: column;
        }
        .detail-image {
            width: 100%;
            height: 200px;
            flex: none;
        }
    }

    .form-group { margin-bottom: 1rem; }
    .row { display: flex; gap: 1rem; }
    .row .form-group { flex: 1; }
    label { display: block; margin-bottom: 0.5rem; font-weight: bold; font-size: 0.9rem; }
    input, textarea {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 1rem;
        box-sizing: border-box;
    }
    .playtime-input-group {
        display: flex;
        gap: 1rem;
        align-items: center;
    }
    .checkbox-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        white-space: nowrap;
        font-weight: normal;
        margin: 0;
        cursor: pointer;
    }
    .checkbox-label input {
        width: auto;
        margin: 0;
    }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 2rem;
    }
    .btn-cancel { background: #eee; color: #333; }
    .btn-submit { background: #007bff; color: white; font-weight: bold; }
    .btn-secondary { background: #6c757d; color: white; }

    /* BGG Modal Styles */
    .bgg-modal {
        max-width: 600px;
        height: 80vh;
        display: flex;
        flex-direction: column;
    }
    .search-form {
        margin-bottom: 1rem;
    }
    .search-row {
        display: flex;
        gap: 0.5rem;
    }
    .search-row input {
        flex: 1;
    }
    .search-results {
        flex: 1;
        overflow-y: auto;
        border: 1px solid #eee;
        border-radius: 8px;
        padding: 0.5rem;
    }
    .search-results ul {
        list-style: none;
        padding: 0;
        margin: 0;
    }
    .search-results li {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem;
        border-bottom: 1px solid #eee;
    }
    .search-results li:last-child {
        border-bottom: none;
    }
    .result-info {
        display: flex;
        flex-direction: column;
    }
    .result-info .name {
        font-weight: bold;
    }
    .result-info .year {
        font-size: 0.85rem;
        color: #666;
    }
    .no-results {
        text-align: center;
        color: #888;
        margin-top: 2rem;
    }
    .header-actions {
        display: flex;
        gap: 0.5rem;
    }

    /* Search Bar */
    .search-bar {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 1.5rem;
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 0.5rem 0.75rem;
    }
    .search-bar svg {
        color: #adb5bd;
        flex-shrink: 0;
    }
    .search-bar input {
        flex: 1;
        border: none;
        outline: none;
        font-size: 0.95rem;
        padding: 0.25rem 0;
        background: transparent;
    }
    .btn-clear-search {
        background: none;
        border: none;
        padding: 2px;
        cursor: pointer;
        color: #adb5bd;
        display: flex;
        align-items: center;
    }
    .btn-clear-search:hover {
        color: #666;
    }
    .search-count {
        font-size: 0.85rem;
        color: #888;
        white-space: nowrap;
    }

    /* Load More */
    .btn-load-more {
        display: block;
        width: 100%;
        padding: 0.75rem;
        margin-top: 1.5rem;
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        font-size: 0.9rem;
        color: #555;
        cursor: pointer;
        transition: background 0.2s;
    }
    .btn-load-more:hover {
        background: #f8f9fa;
    }

    /* Imported Badge */
    .imported-badge {
        color: #2e7d32;
        font-size: 0.85rem;
        font-weight: 600;
        padding: 0.4rem 0.75rem;
        background: #e8f5e9;
        border-radius: 6px;
        white-space: nowrap;
    }
</style>
