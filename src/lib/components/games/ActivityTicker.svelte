<script lang="ts">
    import { GAME_REGISTRY } from '$lib/games/gameRegistry';

    interface ActivityItem {
        game_id: string;
        difficulty: string;
        nickname: string;
        score: number;
        clear_time: number;
        achieved_at: string;
    }

    let { activities }: { activities: ActivityItem[] } = $props();

    const difficultyLabels: Record<string, string> = {
        easy: '쉬움', medium: '보통', hard: '어려움', expert: '전문가', master: '마스터'
    };

    function formatReadableTime(seconds: number): string {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        const parts: string[] = [];
        if (h > 0) parts.push(`${h}시간`);
        if (m > 0) parts.push(`${m}분`);
        if (s > 0 || parts.length === 0) parts.push(`${s}초`);
        return parts.join(' ');
    }

    let message = $derived.by(() => {
        if (activities.length === 0) return null;
        const item = activities[0];
        const gameName = GAME_REGISTRY[item.game_id]?.name || item.game_id;
        const name = item.nickname || '익명';

        if (item.game_id === 'tichu') {
            return `🔥 ${name}님이 티츄에서 승리!`;
        }

        const diffLabel = difficultyLabels[item.difficulty] || item.difficulty;
        const time = formatReadableTime(item.clear_time);
        return `🔥 ${name}님이 ${gameName}(${diffLabel})을 ${time}만에 클리어!`;
    });
</script>

{#if message}
    <div class="ticker-container">
        <span class="ticker-text">{message}</span>
    </div>
{/if}

<style>
    .ticker-container {
        width: 100%;
        background: rgba(255, 255, 255, 0.5);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.6);
        border-radius: 16px;
        height: 2.8rem;
        display: flex;
        align-items: center;
        padding: 0 1.25rem;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02);
    }

    .ticker-text {
        font-size: 0.9rem;
        color: var(--text-dark);
        font-weight: 500;
        letter-spacing: -0.2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
</style>
