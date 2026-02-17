import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { tutorialProgress } from '$lib/server/db/schema/minigame';
import { eq } from 'drizzle-orm';

export const TutorialService = {
    async getCompletedTutorials(userId: number): Promise<string[]> {
        const result = await db
            .select({ tutorialId: tutorialProgress.tutorialId })
            .from(tutorialProgress)
            .where(eq(tutorialProgress.userId, userId));
        return result.map(row => row.tutorialId);
    },

    async completeTutorial(userId: number, tutorialId: string): Promise<boolean> {
        try {
            await db.insert(tutorialProgress)
                .values({ userId, tutorialId })
                .onConflictDoNothing();
            return true;
        } catch (e) {
            console.error('Failed to complete tutorial', e);
            return false;
        }
    }
};
