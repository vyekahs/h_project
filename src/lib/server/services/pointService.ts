import { query } from '$lib/server/db';

export const PointService = {
    DAILY_SOFT_CAP: 500,
    DAILY_HARD_CAP: 750,

    /**
     * Get user's current point status
     */
    async getUserPoints(userId: number) {
        const sql = `
            SELECT total_points, daily_earned, last_earned_at
            FROM minigame_user_points
            WHERE user_id = $1
        `;
        const result = await query(sql, [userId]);
        
        if (result.rows.length === 0) {
            // Initialize if new user
            await query(`
                INSERT INTO minigame_user_points (user_id, total_points, daily_earned, last_earned_at)
                VALUES ($1, 0, 0, NOW())
            `, [userId]);
            return { total_points: 0, daily_earned: 0 };
        }
        
        const data = result.rows[0];
        
        // Reset daily earned if it's a new day
        const lastEarned = new Date(data.last_earned_at);
        const now = new Date();
        const isSameDay = lastEarned.getDate() === now.getDate() && 
                          lastEarned.getMonth() === now.getMonth() && 
                          lastEarned.getFullYear() === now.getFullYear();
                          
        if (!isSameDay) {
            await query(`
                UPDATE minigame_user_points 
                SET daily_earned = 0, last_earned_at = NOW()
                WHERE user_id = $1
            `, [userId]);
            return { ...data, daily_earned: 0 };
        }
        
        return data;
    },

    /**
     * Add points to user
     * Returns actual points added (considering caps)
     */
    async addPoints(userId: number, amount: number, type: string, referenceId?: string): Promise<number> {
        if (amount <= 0) return 0;
        
        const user = await this.getUserPoints(userId);
        let currentDaily = user.daily_earned;
        
        // Check Hard Cap
        if (currentDaily >= this.DAILY_HARD_CAP) {
            return 0;
        }

        // Calculate actual add amount (Soft Cap logic)
        let actualAmount = amount;
        
        // If already over soft cap, reduce by 50%
        if (currentDaily >= this.DAILY_SOFT_CAP) {
            actualAmount = Math.floor(amount * 0.5);
        } 
        // If this addition crosses the soft cap
        else if (currentDaily + amount > this.DAILY_SOFT_CAP) {
            const normalPortion = this.DAILY_SOFT_CAP - currentDaily;
            const reducedPortion = (amount - normalPortion);
            actualAmount = normalPortion + Math.floor(reducedPortion * 0.5);
        }
        
        // Cap at hard cap
        if (currentDaily + actualAmount > this.DAILY_HARD_CAP) {
            actualAmount = this.DAILY_HARD_CAP - currentDaily;
        }

        if (actualAmount <= 0) return 0;

        // Transaction
        try {
            await query('BEGIN');
            
            // Update User Points
            await query(`
                UPDATE minigame_user_points
                SET total_points = total_points + $1,
                    daily_earned = daily_earned + $1,
                    last_earned_at = NOW()
                WHERE user_id = $2
            `, [actualAmount, userId]);
            
            // Log Transaction
            await query(`
                INSERT INTO point_transactions (user_id, amount, transaction_type, reference_id)
                VALUES ($1, $2, $3, $4)
            `, [userId, actualAmount, type, referenceId]);
            
            await query('COMMIT');
            
            // Check for new titles (async, don't block return)
            import('./titleService').then(({ TitleService }) => TitleService.checkAndAssignTitles(userId)).catch(console.error);

            return actualAmount;
        } catch (e) {
            await query('ROLLBACK');
            throw e;
        }
    },
    
    /**
     * Deduct points (Purchase, etc)
     */
    async deductPoints(userId: number, amount: number, type: string, referenceId?: string): Promise<boolean> {
        if (amount <= 0) return false;
        
        try {
            await query('BEGIN');
            
            // Check balance
            const user = await this.getUserPoints(userId);
            if (user.total_points < amount) {
                await query('ROLLBACK');
                return false;
            }
            
            // Deduct
            await query(`
                UPDATE minigame_user_points
                SET total_points = total_points - $1
                WHERE user_id = $2
            `, [amount, userId]);
            
            // Log
            await query(`
                INSERT INTO point_transactions (user_id, amount, transaction_type, reference_id)
                VALUES ($1, $2, $3, $4)
            `, [userId, -amount, type, referenceId]);
            
            await query('COMMIT');
            return true;
        } catch (e) {
            await query('ROLLBACK');
            throw e;
        }
    }
};
