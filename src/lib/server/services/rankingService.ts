import { query } from '$lib/server/db';
import { PointService } from './pointService';

export const RankingService = {
    /**
     * Submit a game record.
     * Updates ranking if it's a new personal best (Highest Score).
     * Unified Score = Base (Difficulty) + Time Bonus
     */
    async submitScore(userId: number, gameId: string, difficulty: string, clearTime: number, score?: number) {
        
        // 1. Calculate Unified Score
        let calculatedScore = 0;
        
        if (gameId === 'sudoku') {
            const timeLimit = difficulty === 'easy' ? 300 :
                              difficulty === 'medium' ? 600 :
                              difficulty === 'hard' ? 900 : 
                              difficulty === 'expert' ? 1200 : 1500;
                              
             const baseScore = difficulty === 'easy' ? 100 :
                               difficulty === 'medium' ? 500 :
                               difficulty === 'hard' ? 1200 :
                               difficulty === 'expert' ? 2500 : 4000;
                               
             const timeMultiplier = difficulty === 'easy' ? 5 :
                                    difficulty === 'medium' ? 10 : 15;
                                    
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

        // 3. Keep Existing "Best Record" Logic (All Time Fame)
        // Store best individual run for record keeping
        const existingRes = await query(`
            SELECT score FROM minigame_rankings
            WHERE game_id = $1 AND user_id = $2
        `, [gameId, userId]);
        
        let isNewRecord = false;
        const currentBest = existingRes.rows[0];
        
        if (!currentBest || calculatedScore > currentBest.score) {
            isNewRecord = true;
            await query(`
                INSERT INTO minigame_rankings (game_id, difficulty, user_id, clear_time, score, achieved_at)
                VALUES ($1, $2, $3, $4, $5, NOW())
                ON CONFLICT (game_id, difficulty, user_id)
                DO UPDATE SET 
                    clear_time = EXCLUDED.clear_time,
                    score = EXCLUDED.score,
                    achieved_at = NOW()
            `, [gameId, difficulty, userId, clearTime, calculatedScore]);
        }
        
        // 4. Calculate Rewards (Points)
        let earnedPoints = 0;
        let basePoints = 10;
        if (difficulty === 'normal' || difficulty === 'medium') basePoints = 25;
        if (difficulty === 'hard') basePoints = 50;
        if (difficulty === 'expert') basePoints = 100;
        if (difficulty === 'master') basePoints = 150; 
        
        earnedPoints += basePoints;
        
        if (isNewRecord) {
            earnedPoints += Math.floor(basePoints * 0.5); // +50% Bonus
        }
        
        const finalPoints = await PointService.addPoints(userId, earnedPoints, 'game_clear', `${gameId}:${difficulty}`);
        
        // Check for new titles
        await import('./titleService').then(({ TitleService }) => TitleService.checkAndAssignTitles(userId));
        
        return {
            isNewRecord,
            earnedPoints: finalPoints, 
            score: calculatedScore
        };
    },

    /**
     * Get Integrated Leaderboard
     * NOW DEFAULTS TO MONTHLY RANKING
     */
    async getLeaderboard(gameId: string, limit = 100) {
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

         const sql = `
            SELECT 
                r.user_id,
                u.username as nickname, 
                'Total' as difficulty,
                0 as clear_time,
                r.total_score as score,
                r.score_updated_at as achieved_at,
                RANK() OVER (ORDER BY r.total_score DESC) as rank
            FROM minigame_monthly_rankings r
            LEFT JOIN users u ON r.user_id = u.id
            WHERE r.game_id = $1 AND r.month_key = $2
            ORDER BY r.total_score DESC
            LIMIT $3
        `;
        return (await query(sql, [gameId, monthKey, limit])).rows;
    }
};
