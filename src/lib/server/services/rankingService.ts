import { query } from '$lib/server/db';
import { PointService } from './pointService';

export const RankingService = {
    /**
     * Submit a game record.
     * Updates ranking if it's a new personal best (Highest Score).
     * Unified Score = Base (Difficulty) + Time Bonus
     */
    async submitScore(userId: number, gameId: string, difficulty: string, clearTime: number, score?: number, skipReward: boolean = false, mistakes: number = 0) {
        
        // 1. Calculate Unified Score
        let calculatedScore = 0;
        
        if (gameId === 'sudoku' || gameId === 'killer-sudoku') {
             const timeLimit = difficulty === 'easy' ? 300 :
                              difficulty === 'medium' ? 600 :
                              difficulty === 'hard' ? 900 : 
                              difficulty === 'expert' ? 1200 : 1500;
                              
             // Adjusted Base Score (10% of previous)
             const baseScore = difficulty === 'easy' ? 10 :
                               difficulty === 'medium' ? 50 :
                               difficulty === 'hard' ? 120 :
                               difficulty === 'expert' ? 250 : 400;
                               
             // Progressive Time Multiplier (1, 2, 3, 4, 5)
             const timeMultiplier = difficulty === 'easy' ? 1 :
                                    difficulty === 'medium' ? 2 :
                                    difficulty === 'hard' ? 3 :
                                    difficulty === 'expert' ? 4 : 5;
                                    
             const bonus = Math.max(0, (timeLimit - clearTime) * timeMultiplier);
             calculatedScore = baseScore + bonus;
        } else {
             calculatedScore = score || 0;
        }

        // 2. Logic Update: Monthly Cumulative Ranking
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
        
        await query(`
            INSERT INTO minigame_monthly_rankings (user_id, game_id, month_key, total_score, score_updated_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (user_id, game_id, month_key)
            DO UPDATE SET 
                total_score = minigame_monthly_rankings.total_score + EXCLUDED.total_score,
                score_updated_at = NOW()
        `, [userId, gameId, monthKey, calculatedScore]);

        // 3. Update All-time Best Record (minigame_rankings)
        // Store BEST single-game score per difficulty (not cumulative)

        await query(`
            INSERT INTO minigame_rankings (game_id, difficulty, user_id, clear_time, score, mistakes, achieved_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (game_id, difficulty, user_id)
            DO UPDATE SET
                clear_time = CASE WHEN EXCLUDED.score > minigame_rankings.score THEN EXCLUDED.clear_time ELSE minigame_rankings.clear_time END,
                score = GREATEST(minigame_rankings.score, EXCLUDED.score),
                mistakes = CASE WHEN EXCLUDED.score > minigame_rankings.score THEN EXCLUDED.mistakes ELSE minigame_rankings.mistakes END,
                achieved_at = CASE WHEN EXCLUDED.score > minigame_rankings.score THEN NOW() ELSE minigame_rankings.achieved_at END
        `, [gameId, difficulty, userId, clearTime, calculatedScore, mistakes]);
        
        // 4. Update Game History (For My Page)
        // REQUEST: Arcade games should NOT appear in My Page activity log.
        // Logic removed.

        
        // 4. Calculate Rewards (Points)
        let earnedPoints = 0;
        let finalPoints = 0; // Current balance or just earned? Usually current balance.

        if (!skipReward) {
            let basePoints = 10;
            if (difficulty === 'normal' || difficulty === 'medium') basePoints = 25;
            if (difficulty === 'hard') basePoints = 50;
            if (difficulty === 'expert') basePoints = 100;
            if (difficulty === 'master') basePoints = 150; 
            
            earnedPoints += basePoints;
            
            try {
                finalPoints = await PointService.addPoints(userId, earnedPoints, 'game_clear', `${gameId}:${difficulty}`);
            } catch (e) {
                console.error('[RankingService] Points update failed:', e);
            }
        }
        
        // Check for new titles (Fire-and-forget)
        import('./titleService').then(({ TitleService }) => {
            TitleService.checkAndAssignTitles(userId).catch(e => {
                console.error('[RankingService] Title check failed:', e);
            });
        });
        
        return {
            earnedPoints: skipReward ? 0 : finalPoints, 
            score: calculatedScore
        };
    },

    /**
     * Get Hall of Fame: Top scorer per difficulty (best single-game record)
     */
    async getHallOfFame(gameId: string) {
        const sql = `
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
            WHERE r.game_id = $1
            ORDER BY r.difficulty, r.score DESC, r.clear_time ASC
        `;
        return (await query(sql, [gameId])).rows;
    },

    /**
     * Get Top scorers across all difficulties (for arcade preview)
     */
    async getTopScorers(gameId: string, limit = 3) {
        const sql = `
            SELECT
                r.difficulty,
                r.user_id,
                a.name as nickname,
                r.score,
                r.clear_time,
                r.mistakes,
                r.achieved_at
            FROM minigame_rankings r
            LEFT JOIN attendees a ON r.user_id = a.id
            WHERE r.game_id = $1
            ORDER BY r.score DESC, r.clear_time ASC
            LIMIT $2
        `;
        return (await query(sql, [gameId, limit])).rows;
    },

    /**
     * Get Monthly Leaderboard
     * Shows current month's cumulative scores
     */
    async getLeaderboard(gameId: string, limit = 100) {
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const sql = `
            SELECT
                r.user_id,
                a.name as nickname,
                r.total_score as score,
                r.score_updated_at as achieved_at,
                RANK() OVER (ORDER BY r.total_score DESC) as rank
            FROM minigame_monthly_rankings r
            LEFT JOIN attendees a ON r.user_id = a.id
            WHERE r.game_id = $1 AND r.month_key = $2
            ORDER BY r.total_score DESC
            LIMIT $3
        `;
        return (await query(sql, [gameId, monthKey, limit])).rows;
    }
};
