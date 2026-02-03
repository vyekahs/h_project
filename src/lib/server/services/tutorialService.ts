import { query } from '$lib/server/db';

export const TutorialService = {
    /**
     * Get list of completed tutorial IDs for a user
     */
    async getCompletedTutorials(userId: number): Promise<string[]> {
        const sql = `
            SELECT tutorial_id 
            FROM tutorial_progress
            WHERE user_id = $1
        `;
        const result = await query(sql, [userId]);
        return result.rows.map((row: any) => row.tutorial_id);
    },

    /**
     * Mark a tutorial as completed
     */
    async completeTutorial(userId: number, tutorialId: string): Promise<boolean> {
        try {
            const sql = `
                INSERT INTO tutorial_progress (user_id, tutorial_id)
                VALUES ($1, $2)
                ON CONFLICT (user_id, tutorial_id) DO NOTHING
            `;
            await query(sql, [userId, tutorialId]);
            return true;
        } catch (e) {
            console.error('Failed to complete tutorial', e);
            return false;
        }
    }
};
