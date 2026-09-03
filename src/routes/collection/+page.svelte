<script lang="ts">
    let { data } = $props();

    const playedCount = $derived(Object.keys(data.playedByGameId).length);
    const totalCount = $derived(data.games.length);

    function formatDate(iso: string) {
        return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    }
</script>

<svelte:head>
    <title>장식장 - 혼놀 라운지</title>
</svelte:head>

<div class="collection-container">
    <header class="collection-header">
        <div class="header-top">
            <h1>장식장</h1>
            <a href="/games" class="btn-catalog">전체 게임 보기</a>
        </div>
        <p class="collection-progress">
            <strong>{playedCount}</strong> / {totalCount}종 수집
            <span class="progress-track">
                <span class="progress-fill" style="width: {totalCount > 0 ? (playedCount / totalCount) * 100 : 0}%"></span>
            </span>
        </p>
    </header>

    {#if totalCount === 0}
        <div class="empty-state">
            <p>등록된 게임이 아직 없어요.</p>
        </div>
    {:else}
        <section class="shelf-grid">
            {#each data.games as game}
                {@const played = data.playedByGameId[game.id]}
                {#if played}
                    <a
                        href="/mypage?tab=history&game={encodeURIComponent(game.name)}"
                        class="shelf-item played"
                        aria-label="{game.name} — {played.playCount}회 플레이, 활동 기록 보기"
                    >
                        <div class="cover">
                            {#if game.image_url}
                                <img src={game.image_url} alt={game.name} loading="lazy" />
                            {:else}
                                <div class="cover-placeholder">
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                </div>
                            {/if}
                            <span class="play-badge" title="{formatDate(played.firstPlayed)}에 처음 플레이">×{played.playCount}</span>
                        </div>
                        <span class="shelf-label">{game.name}</span>
                    </a>
                {:else}
                    <div class="shelf-item locked" aria-label="{game.name} — 아직 플레이하지 않음">
                        <div class="cover">
                            {#if game.image_url}
                                <img src={game.image_url} alt="" loading="lazy" />
                            {:else}
                                <div class="cover-placeholder">
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                </div>
                            {/if}
                            <span class="lock-badge" aria-hidden="true">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            </span>
                        </div>
                        <span class="shelf-label">{game.name}</span>
                    </div>
                {/if}
            {/each}
        </section>
    {/if}
</div>

<style>
    .collection-container {
        max-width: 600px;
        margin: 0 auto;
        padding: 1.5rem;
        padding-bottom: 6rem;
        min-height: 100vh;
        box-sizing: border-box;
        background: var(--bg-secondary);
    }

    .collection-header {
        /* 오락실 페이지와 같은 이유로: 전역 알림벨이 화면 우상단에
           고정되어 있어(top:12px, right:12px, 지름 약 40px) 헤더가 그
           영역과 겹치지 않도록 위쪽 여백을 확보한다 */
        padding-top: 1.5rem;
        margin-bottom: 1.5rem;
    }
    .header-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.6rem;
    }
    .collection-header h1 {
        font-size: 1.4rem;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;
        letter-spacing: -0.02em;
    }
    .btn-catalog {
        flex-shrink: 0;
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--text-secondary);
        background: var(--bg-primary);
        border: 1px solid var(--border-default);
        padding: 0.4rem 0.75rem;
        border-radius: 100px;
        text-decoration: none;
        white-space: nowrap;
    }
    .collection-progress {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        font-size: 0.85rem;
        color: var(--text-secondary);
        margin: 0;
    }
    .collection-progress strong {
        color: var(--color-blue);
        font-size: 1rem;
    }
    .progress-track {
        flex: 1;
        height: 6px;
        background: var(--bg-elevated);
        border-radius: 100px;
        overflow: hidden;
    }
    .progress-fill {
        display: block;
        height: 100%;
        background: var(--color-blue);
        border-radius: 100px;
        transition: width 0.3s ease;
    }

    .shelf-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1.1rem 0.75rem;
    }
    @media (min-width: 480px) {
        .shelf-grid {
            grid-template-columns: repeat(4, 1fr);
        }
    }
    @media (min-width: 1024px) {
        .collection-container {
            max-width: 960px;
        }
        .shelf-grid {
            grid-template-columns: repeat(6, 1fr);
        }
    }

    .shelf-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.4rem;
        text-decoration: none;
        cursor: default;
    }
    a.shelf-item {
        cursor: pointer;
    }

    .cover {
        position: relative;
        width: 100%;
        aspect-ratio: 3 / 4;
        border-radius: 10px;
        overflow: hidden;
        background: var(--bg-primary);
        box-shadow: 0 2px 8px var(--shadow-sm);
    }
    .cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }
    .cover-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-tertiary);
    }

    .shelf-item.locked .cover img,
    .shelf-item.locked .cover-placeholder {
        filter: grayscale(1);
        opacity: 0.35;
    }

    .shelf-item.played .cover {
        transition: transform 0.15s ease;
    }
    .shelf-item.played:active .cover {
        transform: scale(0.96);
    }

    .play-badge {
        position: absolute;
        bottom: 4px;
        right: 4px;
        background: var(--color-blue);
        color: #fff;
        font-size: 0.65rem;
        font-weight: 800;
        padding: 0.1rem 0.4rem;
        border-radius: 100px;
        line-height: 1.4;
    }
    .lock-badge {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: var(--text-tertiary);
        opacity: 0.7;
    }

    .shelf-label {
        font-size: 0.72rem;
        font-weight: 600;
        color: var(--text-primary);
        text-align: center;
        line-height: 1.3;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
    .shelf-item.locked .shelf-label {
        color: var(--text-tertiary);
    }

    .empty-state {
        text-align: center;
        padding: 3rem 1rem;
        color: var(--text-tertiary);
    }
</style>
