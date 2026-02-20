import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { PointService } from './pointService';

export const RankingService = {
    async submitScore(userId: number, gameId: string, difficulty: string, clearTime: number, score?: number, skipReward: boolean = false, mistakes: number = 0) {

        // 1. Calculate Unified Score
        let calculatedScore = 0;

        if (gameId === 'sudoku' || gameId === 'killer-sudoku') {
             const timeLimit = difficulty === 'easy' ? 300 :
                              difficulty === 'medium' ? 600 :
                              difficulty === 'hard' ? 900 :
                              difficulty === 'expert' ? 1200 : 1500;

             const baseScore = difficulty === 'easy' ? 10 :
                               difficulty === 'medium' ? 50 :
                               difficulty === 'hard' ? 120 :
                               difficulty === 'expert' ? 250 : 400;

             const timeMultiplier = difficulty === 'easy' ? 1 :
                                    difficulty === 'medium' ? 2 :
                                    difficulty === 'hard' ? 3 :
                                    difficulty === 'expert' ? 4 : 5;

             const bonus = Math.max(0, (timeLimit - clearTime) * timeMultiplier);
             const rawScore = baseScore + bonus;
             const mistakePenalty = Math.round(rawScore * 0.15 * mistakes);
             calculatedScore = Math.max(baseScore, rawScore - mistakePenalty);
        } else if (gameId === 'unblock-me') {
             const timeLimit = difficulty === 'easy' ? 10 :
                              difficulty === 'medium' ? 20 :
                              difficulty === 'hard' ? 45 :
                              difficulty === 'expert' ? 90 : 120;

             const baseScore = difficulty === 'easy' ? 10 :
                               difficulty === 'medium' ? 50 :
                               difficulty === 'hard' ? 120 :
                               difficulty === 'expert' ? 250 : 400;

             const timeMultiplier = difficulty === 'easy' ? 1 :
                                    difficulty === 'medium' ? 2 :
                                    difficulty === 'hard' ? 3 :
                                    difficulty === 'expert' ? 4 : 5;

             const timeBonus = Math.max(0, (timeLimit - clearTime) * timeMultiplier);

             const extraMoves = Math.max(0, mistakes);
             const movePenaltyPerMove = difficulty === 'easy' ? 1 :
                                        difficulty === 'medium' ? 3 :
                                        difficulty === 'hard' ? 5 :
                                        difficulty === 'expert' ? 8 : 12;
             const movePenalty = extraMoves * movePenaltyPerMove;

             calculatedScore = Math.max(baseScore, baseScore + timeBonus - movePenalty);
        } else {
             calculatedScore = score || 0;
        }

        // 2. Monthly Cumulative Ranking
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        await db.execute(sql`
            INSERT INTO minigame_monthly_rankings (user_id, game_id, month_key, total_score, score_updated_at)
            VALUES (${userId}, ${gameId}, ${monthKey}, ${calculatedScore}, NOW())
            ON CONFLICT (user_id, game_id, month_key)
            DO UPDATE SET
                total_score = minigame_monthly_rankings.total_score + EXCLUDED.total_score,
                score_updated_at = NOW()
        `);

        // 3. Update All-time Best Record
        await db.execute(sql`
            INSERT INTO minigame_rankings (game_id, difficulty, user_id, clear_time, score, mistakes, achieved_at)
            VALUES (${gameId}, ${difficulty}, ${userId}, ${clearTime}, ${calculatedScore}, ${mistakes}, NOW())
            ON CONFLICT (game_id, difficulty, user_id)
            DO UPDATE SET
                clear_time = CASE WHEN EXCLUDED.score > minigame_rankings.score THEN EXCLUDED.clear_time ELSE minigame_rankings.clear_time END,
                score = GREATEST(minigame_rankings.score, EXCLUDED.score),
                mistakes = CASE WHEN EXCLUDED.score > minigame_rankings.score THEN EXCLUDED.mistakes ELSE minigame_rankings.mistakes END,
                achieved_at = CASE WHEN EXCLUDED.score > minigame_rankings.score THEN NOW() ELSE minigame_rankings.achieved_at END
        `);

        // 4. Calculate Rewards
        let earnedPoints = 0;
        let finalPoints = 0;

        if (!skipReward) {
            let basePoints = 10;
            if (gameId === 'tichu') {
                // 티츄 포인트 지급 임시 비활성화
                // basePoints = calculatedScore >= 100 ? 25 : 5;
                basePoints = 0;
            } else {
                if (difficulty === 'normal' || difficulty === 'medium') basePoints = 25;
                if (difficulty === 'hard') basePoints = 50;
                if (difficulty === 'expert') basePoints = 100;
                if (difficulty === 'master') basePoints = 150;
            }

            earnedPoints += basePoints;

            if (earnedPoints > 0) {
                try {
                    finalPoints = await PointService.addPoints(userId, earnedPoints, 'game_clear', `${gameId}:${difficulty}`);
                } catch (e) {
                    console.error('[RankingService] Points update failed:', e);
                }
            }
        }

        return {
            earnedPoints: skipReward ? 0 : finalPoints,
            score: calculatedScore
        };
    },

    async getHallOfFame(gameId: string) {
        const res = await db.execute(sql`
            SELECT DISTINCT ON (r.difficulty)
                r.difficulty,
                r.user_id,
                a.name as nickname,
                r.score,
                r.clear_time,
                r.mistakes,
                r.achieved_at
            FROM minigame_rankings r
            LEFT JOIN attendees a ON r.user_id = a.id
            WHERE r.game_id = ${gameId}
            ORDER BY r.difficulty, r.score DESC, r.clear_time ASC
        `);
        return res;
    },

    async getRecentActivity(limit = 20) {
        const res = await db.execute(sql`
            SELECT
                r.game_id,
                r.difficulty,
                r.user_id,
                a.name as nickname,
                r.score,
                r.clear_time,
                r.achieved_at
            FROM minigame_rankings r
            LEFT JOIN attendees a ON r.user_id = a.id
            ORDER BY r.achieved_at DESC
            LIMIT ${limit}
        `);
        return res;
    },

    async getUserRank(userId: number, gameId: string): Promise<number | null> {
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const result = await db.execute(sql`
            SELECT rank FROM (
                SELECT user_id, RANK() OVER (ORDER BY total_score DESC) as rank
                FROM minigame_monthly_rankings
                WHERE game_id = ${gameId} AND month_key = ${monthKey}
            ) ranked
            WHERE user_id = ${userId}
        `);
        if (result.length > 0) {
            const rank = parseInt(String(result[0].rank));
            return rank <= 100 ? rank : null;
        }
        return null;
    },

    async getLeaderboard(gameId: string, limit = 100) {
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const res = await db.execute(sql`
            SELECT
                r.user_id,
                a.name as nickname,
                r.total_score as score,
                r.score_updated_at as achieved_at,
                RANK() OVER (ORDER BY r.total_score DESC) as rank
            FROM minigame_monthly_rankings r
            LEFT JOIN attendees a ON r.user_id = a.id
            WHERE r.game_id = ${gameId} AND r.month_key = ${monthKey}
            ORDER BY r.total_score DESC
            LIMIT ${limit}
        `);
        return res;
    }
};
