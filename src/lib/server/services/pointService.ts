import { db } from '$lib/server/db/index';
import { sql, eq } from 'drizzle-orm';
import { minigameUserPoints, pointTransactions } from '$lib/server/db/schema/minigame';

export const PointService = {
    DAILY_SOFT_CAP: 500,
    DAILY_HARD_CAP: 750,

    async getUserPoints(userId: number) {
        const result = await db
            .select({
                total_points: minigameUserPoints.totalPoints,
                daily_earned: minigameUserPoints.dailyEarned,
                last_earned_at: minigameUserPoints.lastEarnedAt,
            })
            .from(minigameUserPoints)
            .where(eq(minigameUserPoints.userId, userId));

        if (result.length === 0) {
            await db.insert(minigameUserPoints)
                .values({ userId, totalPoints: 0, dailyEarned: 0, lastEarnedAt: sql`NOW()` });
            return { total_points: 0, daily_earned: 0 };
        }

        const data = result[0];

        const lastEarned = new Date(data.last_earned_at!);
        const now = new Date();
        const isSameDay = lastEarned.getDate() === now.getDate() &&
                          lastEarned.getMonth() === now.getMonth() &&
                          lastEarned.getFullYear() === now.getFullYear();

        if (!isSameDay) {
            await db.update(minigameUserPoints)
                .set({ dailyEarned: 0, lastEarnedAt: sql`NOW()` })
                .where(eq(minigameUserPoints.userId, userId));
            return { ...data, daily_earned: 0 };
        }

        return data;
    },

    async addPoints(userId: number, amount: number, type: string, referenceId?: string): Promise<number> {
        if (amount <= 0) return 0;

        const user = await this.getUserPoints(userId);
        let currentDaily = user.daily_earned ?? 0;

        if (currentDaily >= this.DAILY_HARD_CAP) {
            return 0;
        }

        let actualAmount = amount;

        if (currentDaily >= this.DAILY_SOFT_CAP) {
            actualAmount = Math.floor(amount * 0.5);
        }
        else if (currentDaily + amount > this.DAILY_SOFT_CAP) {
            const normalPortion = this.DAILY_SOFT_CAP - currentDaily;
            const reducedPortion = (amount - normalPortion);
            actualAmount = normalPortion + Math.floor(reducedPortion * 0.5);
        }

        if (currentDaily + actualAmount > this.DAILY_HARD_CAP) {
            actualAmount = this.DAILY_HARD_CAP - currentDaily;
        }

        if (actualAmount <= 0) return 0;

        await db.transaction(async (tx) => {
            await tx.update(minigameUserPoints)
                .set({
                    totalPoints: sql`${minigameUserPoints.totalPoints} + ${actualAmount}`,
                    dailyEarned: sql`${minigameUserPoints.dailyEarned} + ${actualAmount}`,
                    lastEarnedAt: sql`NOW()`,
                })
                .where(eq(minigameUserPoints.userId, userId));

            await tx.insert(pointTransactions)
                .values({ userId, amount: actualAmount, transactionType: type, referenceId });
        });

        // 칭호 체크는 호출부에서 필요할 때 명시적으로 호출한다.
        // (RankingService.submitScore를 통해 여기로 들어오는 경로는 /api/game/record가
        // 이미 자체적으로 checkAndAssignTitles를 호출/await하고 있어서, 여기서도 같이
        // fire-and-forget으로 또 돌리면 같은 유저에 대해 동시에 두 번 실행됨 — 두 실행이
        // minigame_user_titles/minigame_user_points에 동시에 쓰기 작업을 해 락 경합을
        // 일으키고, 게임 점수 제출마다 칭호 체크 쿼리 비용이 두 배가 되는 원인이었음)

        return actualAmount;
    },

    async deductPoints(userId: number, amount: number, type: string, referenceId?: string): Promise<boolean> {
        if (amount <= 0) return false;

        return await db.transaction(async (tx) => {
            const user = await tx
                .select({ totalPoints: minigameUserPoints.totalPoints })
                .from(minigameUserPoints)
                .where(eq(minigameUserPoints.userId, userId));

            if (user.length === 0 || (user[0].totalPoints ?? 0) < amount) {
                return false;
            }

            await tx.update(minigameUserPoints)
                .set({ totalPoints: sql`${minigameUserPoints.totalPoints} - ${amount}` })
                .where(eq(minigameUserPoints.userId, userId));

            await tx.insert(pointTransactions)
                .values({ userId, amount: -amount, transactionType: type, referenceId });

            return true;
        });
    }
};
