<script lang="ts">
    import type { PageData } from './$types';
    import { enhance } from '$app/forms';

    export let data: PageData;

    let selectedGameId = '';
    let scheduledAt = '';

    // Set default time to 30 minutes from now, rounded to 10 minutes
    const now = new Date();
    now.setMinutes(Math.ceil((now.getMinutes() + 30) / 10) * 10);
    scheduledAt = now.toISOString().slice(0, 16);
</script>

<div class="container">
    <header>
        <a href="/" class="btn-back">← 돌아가기</a>
        <h1>📅 게임 예약 생성</h1>
    </header>

    <main>
        <form method="POST" action="/?/createScheduledGame" use:enhance>
            <section class="game-selection">
                <h2>1. 게임 선택</h2>
                <div class="game-grid">
                    {#each data.games as game}
                        <label class="game-card {selectedGameId === String(game.id) ? 'selected' : ''}">
                            <input type="radio" name="gameId" value={game.id} bind:group={selectedGameId} required>
                            {#if game.image_url}
                                <img src={game.image_url} alt={game.name}>
                            {:else}
                                <div class="no-image">🎲</div>
                            {/if}
                            <div class="info">
                                <span class="name">{game.name}</span>
                                <span class="players">👥 {game.min_players}~{game.max_players}인</span>
                            </div>
                        </label>
                    {/each}
                </div>
            </section>

            <section class="time-selection">
                <h2>2. 시작 예정 시간</h2>
                <div class="time-input-wrapper">
                    <input type="datetime-local" name="scheduledAt" bind:value={scheduledAt} required>
                    <p class="hint">※ 시작 10분 전까지 최소 인원이 모이지 않으면 자동 폭파됩니다.</p>
                </div>
            </section>

            <div class="actions">
                <button type="submit" class="btn-submit" disabled={!selectedGameId}>예약 생성하기</button>
            </div>
        </form>
    </main>
</div>

<style>
    .container {
        max-width: 600px;
        margin: 0 auto;
        padding: 1.5rem;
    }
    header {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 2rem;
    }
    h1 {
        font-size: 1.5rem;
        margin: 0;
    }
    .btn-back {
        text-decoration: none;
        color: #666;
        font-size: 0.9rem;
    }
    section {
        margin-bottom: 2.5rem;
    }
    h2 {
        font-size: 1.1rem;
        color: #444;
        margin-bottom: 1rem;
        border-bottom: 2px solid #eee;
        padding-bottom: 0.5rem;
    }
    .game-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 1rem;
    }
    .game-card {
        background: white;
        border-radius: 12px;
        overflow: hidden;
        border: 2px solid #eee;
        cursor: pointer;
        transition: all 0.2s;
        position: relative;
    }
    .game-card:hover {
        border-color: #4c6ef5;
        transform: translateY(-2px);
    }
    .game-card.selected {
        border-color: #4c6ef5;
        background: #edf2ff;
    }
    .game-card input {
        position: absolute;
        opacity: 0;
    }
    .game-card img, .no-image {
        width: 100%;
        aspect-ratio: 1;
        object-fit: cover;
        background: #f8f9fa;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2rem;
    }
    .info {
        padding: 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    .name {
        font-weight: 700;
        font-size: 0.9rem;
        color: #212529;
    }
    .players {
        font-size: 0.8rem;
        color: #868e96;
    }
    .time-input-wrapper {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    input[type="datetime-local"] {
        padding: 0.75rem;
        border-radius: 8px;
        border: 1px solid #ced4da;
        font-size: 1rem;
        font-family: inherit;
    }
    .hint {
        font-size: 0.8rem;
        color: #fa5252;
        margin: 0;
    }
    .actions {
        position: sticky;
        bottom: 1.5rem;
    }
    .btn-submit {
        width: 100%;
        background: #4c6ef5;
        color: white;
        border: none;
        padding: 1rem;
        border-radius: 12px;
        font-size: 1.1rem;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(76, 110, 245, 0.3);
        transition: all 0.2s;
    }
    .btn-submit:hover:not(:disabled) {
        background: #364fc7;
        transform: translateY(-2px);
    }
    .btn-submit:disabled {
        background: #dee2e6;
        cursor: not-allowed;
        box-shadow: none;
    }
</style>
