import { query } from '$lib/server/db';

export const TitleService = {
    /**
     * Check and assign titles based on user stats
     */
    async checkAndAssignTitles(userId: number) {
        const assignedTitles: string[] = [];

        // 1. Fetch User Stats
        // 1. Fetch User Stats & Rankings
        const pointRes = await query(`
            SELECT 
                p.total_points,
                a.arrival_time
            FROM minigame_user_points p
            RIGHT JOIN attendees a ON p.user_id = a.id
            WHERE a.id = $1
        `, [userId]);
        
        const totalPoints = pointRes.rows[0]?.total_points || 0;
        const arrivalTime = new Date(pointRes.rows[0]?.arrival_time || Date.now());

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

        // 2. Fetch User Ranks (Optimization: pre-fetch ranks)
        const rankRes = await query(`
            SELECT 
                (SELECT COUNT(*) + 1 FROM minigame_user_points WHERE total_points > $1) as point_rank,
                (SELECT COUNT(*) + 1 FROM (SELECT user_id FROM minigame_rankings GROUP BY user_id HAVING COUNT(*) > $2) as p) as play_rank
        `, [totalPoints, playCount]);
        const myPointRank = parseInt(rankRes.rows[0].point_rank);
        
        // 3. Fetch All Titles
        const titlesResult = await query('SELECT id, title_code, condition_type, condition_value FROM minigame_titles');
        
        // 4. Fetch Owned Titles (For optimization & revocation)
        const ownedRes = await query('SELECT title_id FROM minigame_user_titles WHERE user_id = $1', [userId]);
        const ownedTitleIds = new Set(ownedRes.rows.map(r => r.title_id));

        // 5. Evaluate & Sync (Assign or Revoke)
        for (const title of titlesResult.rows) {
            let qualified = false;
            const cond = title.condition_value;

            try {
                // Check Value Threshold
                if (cond.value !== undefined) {
                    if (cond.type === 'total_points') qualified = totalPoints >= cond.value;
                    else if (cond.type === 'play_count') qualified = playCount >= cond.value;
                    else if (cond.type === 'gift_count') qualified = false; // Not implemented
                    else if (cond.type === 'account_age') {
                         // Check if account is NEWER than X days
                         const diffTime = Math.abs(Date.now() - arrivalTime.getTime());
                         const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                         qualified = diffDays <= cond.value;
                    }
                } 
                // Check Ranking Threshold
                else if (cond.rank !== undefined) {
                    if (cond.gameId) {
                        // Game-Specific Ranking
                        const diffClause = cond.difficulty ? "AND difficulty = $4" : "";
                        const params = [userId, cond.gameId, cond.rank];
                        if (cond.difficulty) params.push(cond.difficulty);
                        
                        const rankCheckRes = await query(`
                            SELECT 1 FROM (
                                SELECT user_id, RANK() OVER (ORDER BY score DESC) as rnk
                                FROM minigame_rankings
                                WHERE game_id = $2 ${diffClause}
                            ) as ranked
                            WHERE user_id = $1 AND rnk <= $3
                        `, params);
                        
                        qualified = rankCheckRes.rows.length > 0;
                    } 
                    else if (cond.type === 'monthly_play_count') {
                        // Monthly Play Count Ranking
                         const monthlyRes = await query(`
                            SELECT rnk, play_count FROM (
                                SELECT user_id, COUNT(*) as play_count, RANK() OVER (ORDER BY COUNT(*) DESC) as rnk
                                FROM point_transactions
                                WHERE transaction_type = 'game_clear'
                                AND created_at >= date_trunc('month', CURRENT_DATE)
                                GROUP BY user_id
                            ) as ranked
                            WHERE user_id = $1
                        `, [userId]);
                        
                        if (monthlyRes.rows.length > 0) {
                            const { rnk, play_count } = monthlyRes.rows[0];
                            const targetRank = cond.rank || 1;
                            const minCount = cond.min_count || 1;
                            qualified = (parseInt(rnk) <= targetRank) && (parseInt(play_count) >= minCount);
                        } else {
                            qualified = false;
                        }
                    }
                    else if (cond.type === 'total_points' || title.title_code === 'rich_person' || title.title_code === 'high_scorer' || title.title_code === 'puzzle_god') {
                        // Total Point Ranking
                        const targetRank = cond.rank || (title.title_code === 'high_scorer' ? 5 : 1);
                        qualified = myPointRank <= targetRank;
                    } 
                    else if (cond.type === 'clear_count' || title.title_code === 'challenger') {
                         qualified = (parseInt(rankRes.rows[0].play_rank) <= cond.rank);
                    }
                    else if (cond.type === 'gift_count' || title.title_code === 'giver') {
                         qualified = false; // Not implemented
                    }
                }
            } catch (err) {
                console.warn(`Error evaluating title ${title.title_code}`, err);
            }

            if (qualified) {
                // Assign if not owned
                if (!ownedTitleIds.has(title.id)) {
                    try {
                        await query(`
                            INSERT INTO minigame_user_titles (user_id, title_id, acquired_at)
                            VALUES ($1, $2, NOW())
                            ON CONFLICT DO NOTHING
                        `, [userId, title.id]);
                        assignedTitles.push(title.title_code);
                    } catch (e) {
                        console.error(`Failed to assign title ${title.title_code}`, e);
                    }
                }
            } else {
                // Revoke if owned
                if (ownedTitleIds.has(title.id)) {
                    try {
                        await query(`
                            DELETE FROM minigame_user_titles 
                            WHERE user_id = $1 AND title_id = $2
                        `, [userId, title.id]);
                        // console.log(`Revoked title ${title.title_code} from user ${userId}`);
                    } catch (e) {
                        console.error(`Failed to revoke title ${title.title_code}`, e);
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
    async equipTitle(userId: number, titleId: number | null) {
        if (titleId !== null) {
            // Verify ownership
            const check = await query('SELECT 1 FROM minigame_user_titles WHERE user_id = $1 AND title_id = $2', [userId, titleId]);
            if (check.rows.length === 0) {
                throw new Error('User does not own this title');
            }
        }

        console.log(`Executing update for user ${userId}, title ${titleId}`);
        await query('UPDATE minigame_user_points SET equipped_title_id = $1 WHERE user_id = $2', [titleId, userId]);
        return true;
    }
};
