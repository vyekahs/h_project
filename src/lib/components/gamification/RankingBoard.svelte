<script lang="ts">
    import { onMount } from 'svelte';
    
    // Legacy Svelte 4 syntax for stability
    export let gameId: string;
    export let preview: boolean = false;
    
    let rankings: any[] = [];
    let loading = true;
    let error: string | null = null;
    let lastGameId = '';
    
    // Watch for difficulty changes
    $: if (gameId && gameId !== lastGameId) {
        lastGameId = gameId;
        loadRankings(gameId);
    }
    
    // Initial load
    onMount(() => {
        loadRankings(gameId);
    });
    
    async function loadRankings(gid: string) {
        loading = true;
        try {
            // No difficulty param needed for unified ranking
            const res = await fetch(`/api/ranking/${gid}`);
            if (res.ok) {
                rankings = await res.json();
            } else {
                error = 'Failed to load rankings';
            }
        } catch (e) {
            error = 'Error loading rankings';
        } finally {
            loading = false;
        }
    }
    
    function formatTime(seconds: number) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
    
    function formatDate(dateStr: string) {
        return new Date(dateStr).toLocaleDateString();
    }
    
    // Limit rows if preview
    $: displayRankings = preview && rankings ? rankings.slice(0, 3) : (rankings || []);
</script>

<div class="ranking-board" class:preview>
    <div class="header">
        {#if !preview}
        <h3>이달의 랭킹</h3>
        {/if}
    </div>
    
    {#if loading}
        <div class="loading">불러오는 중...</div>
    {:else if error}
        <div class="error">{error}</div>
    {:else if rankings.length === 0}
        <div class="empty">아직 이번 달 기록이 없습니다.</div>
    {:else}
        <table class:preview-table={preview}>
            {#if !preview}
            <thead>
                <tr>
                    <th>순위</th>
                    <th>닉네임</th>
                    <th>누적 점수</th>
                </tr>
            </thead>
            {/if}
            <tbody>
                {#each displayRankings as rank}
                    <tr class:top3={rank.rank <= 3}>
                        <td class="rank-cell">
                            {#if rank.rank === 1}🥇
                            {:else if rank.rank === 2}🥈
                            {:else if rank.rank === 3}🥉
                            {:else}{rank.rank}{/if}
                        </td>
                        <td class="name-cell">{rank.nickname || '익명'}</td>
                        <td class="score-cell">{rank.score.toLocaleString()} P</td>
                    </tr>
                {/each}
            </tbody>
        </table>
    {/if}
</div>
<div></div>

<style>
    /* ... existing styles ... */
    
    .ranking-board.preview {
        box-shadow: none;
        padding: 0;
        border: none;
        background: transparent;
    }
    
    .preview-table {
        font-size: 0.85rem;
    }
    
    .preview-table td {
        padding: 0.4rem;
        border: none;
    }
    
    
    .name-cell {
        max-width: 100px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    
    .score-cell {
        font-weight: 700;
        color: #333;
    }

    .ranking-board {
        background: white;
        border-radius: 16px;
        padding: 1.5rem;
        box-shadow: 0 4px 20px rgba(0,0,0,0.05);
        width: 100%;
    }
    
    .header h3 {
        margin: 0 0 1rem 0;
        text-align: center;
        color: #333;
        font-size: 1.2rem;
    }
    
    table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.95rem;
    }
    
    th {
        text-align: left;
        padding: 0.8rem;
        color: #888;
        font-weight: 500;
        font-size: 0.85rem;
        border-bottom: 1px solid #eee;
    }
    
    td {
        padding: 0.8rem;
        border-bottom: 1px solid #f9f9f9;
        color: #444;
    }
    
    .rank-cell {
        font-weight: bold;
        width: 40px; /* Reduced width */
        text-align: center;
    }
    
    
    
    .top3 {
        background: rgba(255, 251, 240, 0.5); /* Lighter bg */
    }
    
    .loading, .empty, .error {
        text-align: center;
        padding: 1rem;
        color: #888;
        font-size: 0.9rem; /* Smaller for preview */
    }
</style>
