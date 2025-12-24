<script lang="ts">
    import { enhance } from '$app/forms';
    import type { PageData } from './$types';

    export let data: PageData;
    export let form;

    let showModal = false;
    let isEditing = false;
    let selectedGame: any = null;

    function openAddModal() {
        isEditing = false;
        selectedGame = {
            name: '',
            min_players: 2,
            max_players: 4,
            playtime_min: 30,
            difficulty: 'Medium',
            description: '',
            image_url: '',
            included_dlcs: ''
        };
        showModal = true;
    }

    function openEditModal(game: any) {
        isEditing = true;
        selectedGame = { ...game };
        showModal = true;
    }

    function closeModal() {
        showModal = false;
        selectedGame = null;
    }

    $: if (form?.success) {
        closeModal();
    }
</script>

<div class="games-page">
    <div class="header">
        <h1>📚 보드게임 도감 관리</h1>
        <button class="btn-primary" on:click={openAddModal}>+ 게임 추가</button>
    </div>

    <div class="games-grid">
        {#each data.games as game}
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
                        <span>👥 {game.min_players}-{game.max_players}인</span>
                        <span>⏱ {game.playtime_min}분</span>
                        <span class="difficulty {game.difficulty?.toLowerCase()}">{game.difficulty || '-'}</span>
                    </div>
                    {#if game.included_dlcs}
                        <p class="dlc-info">➕ 포함된 확장: {game.included_dlcs}</p>
                    {/if}
                    <p class="desc">{game.description || '설명이 없습니다.'}</p>
                    <div class="actions">
                        <button class="btn-edit" on:click={() => openEditModal(game)}>수정</button>
                        <form method="POST" action="?/delete" use:enhance on:submit|preventDefault={(e) => confirm('정말 삭제하시겠습니까?') && e.target.submit()}>
                            <input type="hidden" name="id" value={game.id} />
                            <button type="submit" class="btn-delete">삭제</button>
                        </form>
                    </div>
                </div>
            </div>
        {/each}
        {#if data.games.length === 0}
            <div class="empty-state">등록된 게임이 없습니다.</div>
        {/if}
    </div>
</div>

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
                        <label>플레이 시간 (분)</label>
                        <input type="number" name="playtime_min" bind:value={selectedGame.playtime_min} step="5" />
                    </div>
                    <div class="form-group">
                        <label>난이도</label>
                        <select name="difficulty" bind:value={selectedGame.difficulty}>
                            <option value="Easy">쉬움 (Easy)</option>
                            <option value="Medium">보통 (Medium)</option>
                            <option value="Hard">어려움 (Hard)</option>
                        </select>
                    </div>
                </div>

                <div class="form-group">
                    <label>포함된 확장 (DLC)</label>
                    <input type="text" name="included_dlcs" bind:value={selectedGame.included_dlcs} placeholder="예: 도시와 기사, 항해사 (쉼표로 구분)" />
                </div>

                <div class="form-group">
                    <label>이미지 URL</label>
                    <input type="text" name="image_url" bind:value={selectedGame.image_url} placeholder="https://..." />
                </div>

                <div class="form-group">
                    <label>설명</label>
                    <textarea name="description" bind:value={selectedGame.description} rows="3"></textarea>
                </div>

                <div class="modal-actions">
                    <button type="button" class="btn-cancel" on:click={closeModal}>취소</button>
                    <button type="submit" class="btn-submit">{isEditing ? '수정' : '등록'}</button>
                </div>
            </form>
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
    .difficulty {
        padding: 0 6px;
        border-radius: 4px;
        font-weight: bold;
    }
    .difficulty.easy { background: #e8f5e9; color: #2e7d32; }
    .difficulty.medium { background: #fff3e0; color: #ef6c00; }
    .difficulty.hard { background: #ffebee; color: #c62828; }

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
    .form-group { margin-bottom: 1rem; }
    .row { display: flex; gap: 1rem; }
    .row .form-group { flex: 1; }
    label { display: block; margin-bottom: 0.5rem; font-weight: bold; font-size: 0.9rem; }
    input, select, textarea {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 1rem;
        box-sizing: border-box;
    }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 2rem;
    }
    .btn-cancel { background: #eee; color: #333; }
    .btn-submit { background: #007bff; color: white; font-weight: bold; }
</style>
