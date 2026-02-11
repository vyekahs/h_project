import { GAME_CONFIG } from '$lib/config';

export function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export async function submitGameScore(params: {
    gameId: string;
    difficulty: string;
    clearTime: number;
    score?: number;
    mistakes?: number;
}): Promise<{ earnedPoints: number; score: number } | null> {
    try {
        const res = await fetch('/api/game/record', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                gameId: params.gameId,
                difficulty: params.difficulty,
                clearTime: params.clearTime,
                score: params.score ?? 0,
                mistakes: params.mistakes ?? 0,
                skipReward: !GAME_CONFIG.ENABLE_REWARDS
            })
        });
        const data = await res.json();
        if (res.ok) {
            return { earnedPoints: data.earnedPoints, score: data.score };
        } else {
            console.error('Score submit failed:', res.status, data);
            return null;
        }
    } catch (e) {
        console.error('Failed to submit score', e);
        return null;
    }
}
