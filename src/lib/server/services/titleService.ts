import { query } from '$lib/server/db';

export const TitleService = {
    /**
     * Check and assign titles based on user stats
     */
    async checkAndAssignTitles(userId: number) {
        const assignedTitles: string[] = [];

        // 1. Fetch User Stats
        // 1. Fetch User Stats & Rankings
        const pointRes = await query('SELECT total_points FROM minigame_user_points WHERE user_id = $1', [userId]);
        const totalPoints = pointRes.rows[0]?.total_points || 0;

        const gameRes = await query('SELECT COUNT(*) as play_count FROM minigame_rankings WHERE user_id = $1', [userId]);
        const playCount = parseInt(gameRes.rows[0]?.play_count || '0');

        // Check Ranking #1 for specific categories
        
        // Sudoku Master: Total Score Ranking #1 (Matches Leaderboard)
        const sudokuTotalRankRes = await query(`
            SELECT rank FROM (
                SELECT user_id, RANK() OVER (ORDER BY SUM(score) DESC) as rank
                FROM minigame_rankings
                WHERE game_id = 'sudoku'
                GROUP BY user_id
            ) as r WHERE user_id = $1
        `, [userId]);
        const isSudokuMaster = sudokuTotalRankRes.rows[0]?.rank === '1';

        // 2. Define Criteria
        const checks = [
            { code: 'beginner', check: () => playCount >= 1 },
            { code: 'point_collector', check: () => totalPoints >= 1000 },
            { code: 'rich_person', check: () => totalPoints >= 5000 },
            { code: 'sudoku_master', check: () => isSudokuMaster }
            // 'speed_demon' removed as Easy Rank is not visible to users
        ];

        // 3. Assign Titles
        for (const { code, check } of checks) {
            if (check()) {
                const titleRes = await query('SELECT id FROM minigame_titles WHERE title_code = $1', [code]);
                if (titleRes.rows.length > 0) {
                    const titleId = titleRes.rows[0].id;
                    try {
                        const result = await query(`
                            INSERT INTO minigame_user_titles (user_id, title_id, acquired_at)
                            VALUES ($1, $2, NOW())
                            ON CONFLICT DO NOTHING
                            RETURNING id
                        `, [userId, titleId]);

                        if (result.rows.length > 0) {
                             assignedTitles.push(code);
                             // If it's a "Ranking 1" title, potentially trigger an alert or notification here
                        }
                    } catch (e) {
                        console.error(`Failed to assign title ${code}`, e);
                    }
                }
            }
        }
        
        return assignedTitles;
    },

    /**
     * Get user's active (equipped) title
     */
    async getUserTitle(userId: number) {
        const res = await query(`
            SELECT t.title_name, t.title_code
            FROM minigame_user_points up
            JOIN minigame_titles t ON up.equipped_title_id = t.id
            WHERE up.user_id = $1
        `, [userId]);
        
        return res.rows[0] || null;
    },

    /**
     * Get all titles owned by user
     */
    async getOwnedTitles(userId: number) {
        // Also fetch equipped status
        const res = await query(`
            SELECT t.id, t.title_code, t.title_name, t.description, ut.acquired_at,
                   (up.equipped_title_id = t.id) as is_equipped
            FROM minigame_user_titles ut
            JOIN minigame_titles t ON ut.title_id = t.id
            LEFT JOIN minigame_user_points up ON up.user_id = ut.user_id
            WHERE ut.user_id = $1
            ORDER BY ut.acquired_at DESC
        `, [userId]);
        return res.rows;
    },

    /**
     * Equip a title
     */
    async equipTitle(userId: number, titleId: number) {
        // Verify ownership
        const check = await query('SELECT 1 FROM minigame_user_titles WHERE user_id = $1 AND title_id = $2', [userId, titleId]);
        if (check.rows.length === 0) {
            throw new Error('User does not own this title');
        }

        await query('UPDATE minigame_user_points SET equipped_title_id = $1 WHERE user_id = $2', [titleId, userId]);
        return true;
    }
};
