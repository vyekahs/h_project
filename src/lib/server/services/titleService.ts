import { db } from '$lib/server/db/index';
import { sql, eq } from 'drizzle-orm';
import { minigameUserPoints, minigameTitles, minigameUserTitles } from '$lib/server/db/schema/minigame';

export const TitleService = {
    async checkAndAssignTitles(userId: number) {
        const assignedTitles: string[] = [];

        // 1. Fetch User Stats & Titles & Owned (서로 독립적이라 병렬로)
        const [pointRes, gameRes, titlesResult, ownedRes] = await Promise.all([
            db.execute(sql`
                SELECT
                    p.total_points,
                    a.arrival_time
                FROM minigame_user_points p
                RIGHT JOIN attendees a ON p.user_id = a.id
                WHERE a.id = ${userId}
            `),
            db.execute(sql`SELECT COUNT(*) as play_count FROM minigame_rankings WHERE user_id = ${userId}`),
            db
                .select({
                    id: minigameTitles.id,
                    titleCode: minigameTitles.titleCode,
                    conditionType: minigameTitles.conditionType,
                    conditionValue: minigameTitles.conditionValue,
                })
                .from(minigameTitles),
            db
                .select({ titleId: minigameUserTitles.titleId })
                .from(minigameUserTitles)
                .where(eq(minigameUserTitles.userId, userId)),
        ]);

        const totalPoints = (pointRes[0] as any)?.total_points || 0;
        const arrivalTime = new Date((pointRes[0] as any)?.arrival_time || Date.now());
        const playCount = parseInt(String((gameRes[0] as any)?.play_count || '0'));
        const ownedTitleIds = new Set(ownedRes.map(r => r.titleId));

        // 2. Fetch User Ranks (위 값들에 의존하므로 순차 실행)
        const rankRes = await db.execute(sql`
            SELECT
                (SELECT COUNT(*) + 1 FROM minigame_user_points WHERE total_points > ${totalPoints}) as point_rank,
                (SELECT COUNT(*) + 1 FROM (SELECT user_id FROM minigame_rankings GROUP BY user_id HAVING COUNT(*) > ${playCount}) as p) as play_rank
        `);
        const myPointRank = parseInt(String((rankRes[0] as any).point_rank));

        // 2.5. 게임별 순위 조건이 걸린 칭호들을 모아 한 번에 배치 조회
        // (칭호 개수만큼 순차 쿼리를 날리면 칭호가 늘어날수록 매 기록 제출마다 느려짐)
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const allTimeRankKey = (gameId: string, difficulty: string) => `${gameId}::${difficulty}`;
        const allTimeRankPairs = new Map<string, { gameId: string; difficulty: string }>();
        const monthlyRankGameIds = new Set<string>();

        for (const title of titlesResult) {
            const cond: any = title.conditionValue;
            if (cond?.rank === undefined || !cond.gameId) continue;
            if (cond.difficulty) {
                allTimeRankPairs.set(allTimeRankKey(cond.gameId, cond.difficulty), { gameId: cond.gameId, difficulty: cond.difficulty });
            } else {
                monthlyRankGameIds.add(cond.gameId);
            }
        }

        const allTimeRankMap = new Map<string, number>();
        const monthlyRankMap = new Map<string, number>();

        try {
            const [allTimeRows, monthlyRows] = await Promise.all([
                allTimeRankPairs.size > 0
                    ? db.execute(sql`
                        SELECT game_id, difficulty, rnk FROM (
                            SELECT user_id, game_id, difficulty,
                                   RANK() OVER (PARTITION BY game_id, difficulty ORDER BY score DESC) as rnk
                            FROM minigame_rankings
                            WHERE (game_id, difficulty) IN (${sql.join(
                                Array.from(allTimeRankPairs.values()).map(p => sql`(${p.gameId}, ${p.difficulty})`),
                                sql`, `
                            )})
                        ) ranked
                        WHERE user_id = ${userId}
                    `)
                    : Promise.resolve([]),
                monthlyRankGameIds.size > 0
                    ? db.execute(sql`
                        SELECT game_id, rnk FROM (
                            SELECT user_id, game_id,
                                   RANK() OVER (PARTITION BY game_id ORDER BY total_score DESC) as rnk
                            FROM minigame_monthly_rankings
                            WHERE month_key = ${monthKey} AND game_id IN (${sql.join(
                                Array.from(monthlyRankGameIds).map(g => sql`${g}`),
                                sql`, `
                            )})
                        ) ranked
                        WHERE user_id = ${userId}
                    `)
                    : Promise.resolve([]),
            ]);

            for (const row of allTimeRows as any[]) {
                allTimeRankMap.set(allTimeRankKey(row.game_id, row.difficulty), parseInt(String(row.rnk)));
            }
            for (const row of monthlyRows as any[]) {
                monthlyRankMap.set(row.game_id, parseInt(String(row.rnk)));
            }
        } catch (err) {
            console.warn('Failed to batch-fetch game rank titles', err);
        }

        // 3. Evaluate & Sync
        for (const title of titlesResult) {
            let qualified = false;
            const cond: any = title.conditionValue;

            try {
                if (cond.value !== undefined) {
                    if (cond.type === 'total_points') qualified = totalPoints >= cond.value;
                    else if (cond.type === 'play_count') qualified = playCount >= cond.value;
                    else if (cond.type === 'gift_count') qualified = false;
                    else if (cond.type === 'account_age') {
                         const diffTime = Math.abs(Date.now() - arrivalTime.getTime());
                         const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                         qualified = diffDays <= cond.value;
                    }
                }
                else if (cond.rank !== undefined) {
                    if (cond.gameId) {
                        // 위에서 배치 조회해둔 순위 맵에서 조회 (칭호별 개별 쿼리 제거)
                        const rnk = cond.difficulty
                            ? allTimeRankMap.get(allTimeRankKey(cond.gameId, cond.difficulty))
                            : monthlyRankMap.get(cond.gameId);

                        qualified = rnk !== undefined && rnk <= cond.rank;
                    }
                    else if (cond.type === 'monthly_play_count') {
                         const monthlyRes = await db.execute(sql`
                            SELECT rnk, play_count FROM (
                                SELECT user_id, COUNT(*) as play_count, RANK() OVER (ORDER BY COUNT(*) DESC) as rnk
                                FROM point_transactions
                                WHERE transaction_type = 'game_clear'
                                AND created_at >= date_trunc('month', CURRENT_DATE)
                                GROUP BY user_id
                            ) as ranked
                            WHERE user_id = ${userId}
                        `);

                        if (monthlyRes.length > 0) {
                            const row = monthlyRes[0] as any;
                            const targetRank = cond.rank || 1;
                            const minCount = cond.min_count || 1;
                            qualified = (parseInt(String(row.rnk)) <= targetRank) && (parseInt(String(row.play_count)) >= minCount);
                        } else {
                            qualified = false;
                        }
                    }
                    else if (cond.type === 'total_points' || title.titleCode === 'rich_person' || title.titleCode === 'high_scorer' || title.titleCode === 'puzzle_god') {
                        const targetRank = cond.rank || (title.titleCode === 'high_scorer' ? 5 : 1);
                        qualified = myPointRank <= targetRank;
                    }
                    else if (cond.type === 'clear_count' || title.titleCode === 'challenger') {
                         qualified = (parseInt(String((rankRes[0] as any).play_rank)) <= cond.rank);
                    }
                    else if (cond.type === 'gift_count' || title.titleCode === 'giver') {
                         qualified = false;
                    }
                }
            } catch (err) {
                console.warn(`Error evaluating title ${title.titleCode}`, err);
            }

            if (qualified) {
                const cond: any = title.conditionValue;
                const isMasterTitle = cond.gameId && !cond.difficulty && cond.rank === 1;

                if (isMasterTitle) {
                    try {
                        // 마스터 칭호: 본인 외 다른 보유자 전원 회수
                        await db.execute(sql`
                            UPDATE minigame_user_points SET equipped_title_id = NULL
                            WHERE equipped_title_id = ${title.id} AND user_id != ${userId}
                        `);
                        await db.execute(sql`
                            DELETE FROM minigame_user_titles
                            WHERE title_id = ${title.id} AND user_id != ${userId}
                        `);
                        if (!ownedTitleIds.has(title.id)) {
                            await db.insert(minigameUserTitles)
                                .values({ userId, titleId: title.id })
                                .onConflictDoNothing();
                            assignedTitles.push(title.titleCode);
                        }
                    } catch (e) {
                        console.error(`Failed to assign title ${title.titleCode}`, e);
                    }
                } else if (!ownedTitleIds.has(title.id)) {
                    try {
                        await db.insert(minigameUserTitles)
                            .values({ userId, titleId: title.id })
                            .onConflictDoNothing();
                        assignedTitles.push(title.titleCode);
                    } catch (e) {
                        console.error(`Failed to assign title ${title.titleCode}`, e);
                    }
                }
            } else {
                if (ownedTitleIds.has(title.id)) {
                    try {
                        // 장착 중이면 해제
                        await db.execute(sql`
                            UPDATE minigame_user_points SET equipped_title_id = NULL
                            WHERE user_id = ${userId} AND equipped_title_id = ${title.id}
                        `);
                        await db.delete(minigameUserTitles)
                            .where(sql`user_id = ${userId} AND title_id = ${title.id}`);
                    } catch (e) {
                        console.error(`Failed to revoke title ${title.titleCode}`, e);
                    }
                }
            }
        }

        return assignedTitles;
    },

    async getUserTitle(userId: number) {
        const res = await db.execute(sql`
            SELECT t.title_name, t.title_code
            FROM minigame_user_points up
            JOIN minigame_titles t ON up.equipped_title_id = t.id
            WHERE up.user_id = ${userId}
        `);

        return res[0] || null;
    },

    async getOwnedTitles(userId: number) {
        const res = await db.execute(sql`
            SELECT t.id, t.title_code, t.title_name, t.description, ut.acquired_at,
                   (up.equipped_title_id = t.id) as is_equipped
            FROM minigame_user_titles ut
            JOIN minigame_titles t ON ut.title_id = t.id
            LEFT JOIN minigame_user_points up ON up.user_id = ut.user_id
            WHERE ut.user_id = ${userId}
            ORDER BY ut.acquired_at DESC
        `);
        return res;
    },

    async equipTitle(userId: number, titleId: number | null) {
        if (titleId !== null) {
            const check = await db
                .select()
                .from(minigameUserTitles)
                .where(sql`user_id = ${userId} AND title_id = ${titleId}`);
            if (check.length === 0) {
                throw new Error('User does not own this title');
            }
        }

        console.log(`Executing update for user ${userId}, title ${titleId}`);
        const result = await db.update(minigameUserPoints)
            .set({ equippedTitleId: titleId })
            .where(eq(minigameUserPoints.userId, userId))
            .returning();

        if (result.length === 0) {
            console.log(`User ${userId} has no points row. Creating one.`);
            await db.insert(minigameUserPoints)
                .values({ userId, totalPoints: 0, dailyEarned: 0, lastEarnedAt: sql`NOW()`, equippedTitleId: titleId });
        }
        return true;
    }
};
