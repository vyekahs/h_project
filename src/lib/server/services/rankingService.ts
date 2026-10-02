import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { PointService } from './pointService';
import { calculateScore as calculateRegicideScore } from '$lib/games/regicide/gameLogic';

export const RankingService = {
    /**
     * @param cleared false면 끝까지 가지 못한 판(레지사이드처럼 진행한 만큼 점수를 주는 게임).
     *   점수·랭킹에는 그대로 더하되 플레이 로그에 'partial'로 남겨, 활동 알림의 "클리어!"와
     *   월별 클리어 횟수 집계에서는 빠진다.
     */
    async submitScore(userId: number, gameId: string, difficulty: string, clearTime: number, score?: number, skipReward: boolean = false, mistakes: number = 0, cleared: boolean = true) {
        
        // 0. Get Previous Rank Before Score Update
        const previousRank = await this.getUserRank(userId, gameId);

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
        } else if (gameId === 'energy') {
             const timeLimit = difficulty === 'easy' ? 120 :
                              difficulty === 'medium' ? 180 :
                              difficulty === 'hard' ? 300 :
                              difficulty === 'expert' ? 480 : 600;

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
                                        difficulty === 'medium' ? 2 :
                                        difficulty === 'hard' ? 4 :
                                        difficulty === 'expert' ? 6 : 10;
             const movePenalty = extraMoves * movePenaltyPerMove;

             calculatedScore = Math.max(baseScore, baseScore + timeBonus - movePenalty);
        } else if (gameId === 'water-sort') {
             const timeLimit = difficulty === 'easy' ? 120 :
                              difficulty === 'medium' ? 180 :
                              difficulty === 'hard' ? 300 :
                              difficulty === 'expert' ? 480 : 600;

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
                                        difficulty === 'medium' ? 2 :
                                        difficulty === 'hard' ? 4 :
                                        difficulty === 'expert' ? 6 : 10;
             const movePenalty = extraMoves * movePenaltyPerMove;

             calculatedScore = Math.max(baseScore, baseScore + timeBonus - movePenalty);
        } else if (gameId === 'triple-tile') {
             const timeLimit = difficulty === 'easy' ? 120 :
                              difficulty === 'medium' ? 180 :
                              difficulty === 'hard' ? 300 :
                              difficulty === 'expert' ? 480 : 600;

             const baseScore = difficulty === 'easy' ? 10 :
                               difficulty === 'medium' ? 50 :
                               difficulty === 'hard' ? 120 :
                               difficulty === 'expert' ? 250 : 400;

             const timeMultiplier = difficulty === 'easy' ? 1 :
                                    difficulty === 'medium' ? 2 :
                                    difficulty === 'hard' ? 3 :
                                    difficulty === 'expert' ? 4 : 5;

             const timeBonus = Math.max(0, (timeLimit - clearTime) * timeMultiplier);

             // mistakes = shuffle uses
             const shufflePenaltyPerUse = difficulty === 'easy' ? 5 :
                                           difficulty === 'medium' ? 10 :
                                           difficulty === 'hard' ? 20 :
                                           difficulty === 'expert' ? 40 : 60;
             const shufflePenalty = Math.max(0, mistakes) * shufflePenaltyPerUse;

             calculatedScore = Math.max(baseScore, baseScore + timeBonus - shufflePenalty);
        } else if (gameId === 'train-tracks') {
             const timeLimit = difficulty === 'easy' ? 120 :
                              difficulty === 'medium' ? 180 :
                              difficulty === 'hard' ? 300 :
                              difficulty === 'expert' ? 480 : 600;

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
        } else if (gameId === 'freecell') {
             const timeLimit = difficulty === 'easy' ? 300 :
                              difficulty === 'medium' ? 480 :
                              difficulty === 'hard' ? 600 :
                              difficulty === 'expert' ? 900 : 1200;

             const baseScore = difficulty === 'easy' ? 10 :
                               difficulty === 'medium' ? 50 :
                               difficulty === 'hard' ? 120 :
                               difficulty === 'expert' ? 250 : 400;

             const timeMultiplier = difficulty === 'easy' ? 1 :
                                    difficulty === 'medium' ? 2 :
                                    difficulty === 'hard' ? 3 :
                                    difficulty === 'expert' ? 4 : 5;

             const timeBonus = Math.max(0, (timeLimit - clearTime) * timeMultiplier);

             // mistakes = undoCount
             const undoPenaltyPerUse = difficulty === 'easy' ? 1 :
                                       difficulty === 'medium' ? 2 :
                                       difficulty === 'hard' ? 4 :
                                       difficulty === 'expert' ? 6 : 10;
             const undoPenalty = Math.max(0, mistakes) * undoPenaltyPerUse;

             calculatedScore = Math.max(baseScore, baseScore + timeBonus - undoPenalty);
        } else if (gameId === 'regicide') {
             // Regicide: single 'classic' difficulty
             // score = 처치한 적 수 (0~12), mistakes = jestersUsed (0, 1, 2)
             // 12명을 다 잡았으면 클리어로 보고 등급·시간 보너스를 얹는다.
             // 계산은 클라이언트와 같은 함수(getKillScore 등)를 쓴다 — 시작 화면의 설명과
             // 결과창 표시가 어긋나지 않도록.
             calculatedScore = calculateRegicideScore(score ?? 0, mistakes, clearTime);
        } else {
             calculatedScore = score || 0;
        }

        // 2~4. 월간 누적 랭킹 / 플레이 로그 / 전판 최고기록 갱신 + 포인트 지급
        // — 서로 다른 테이블(행)을 건드리는 독립적인 쓰기라 병렬로 실행한다.
        // (기존엔 4개를 순차로 await해서 커넥션을 그만큼 더 오래 붙잡고 있었음.
        // 포인트 지급 실패는 기존처럼 전체 실패로 이어지지 않도록 자체 catch로 격리)
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        let earnedPoints = 0;
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
            earnedPoints = basePoints;
        }

        const [, , , finalPoints] = await Promise.all([
            db.execute(sql`
                INSERT INTO minigame_monthly_rankings (user_id, game_id, month_key, total_score, score_updated_at)
                VALUES (${userId}, ${gameId}, ${monthKey}, ${calculatedScore}, NOW())
                ON CONFLICT (user_id, game_id, month_key)
                DO UPDATE SET
                    total_score = minigame_monthly_rankings.total_score + EXCLUDED.total_score,
                    score_updated_at = NOW()
            `),
            db.execute(sql`
                INSERT INTO minigame_play_log (game_id, difficulty, user_id, score, clear_time, type)
                VALUES (${gameId}, ${difficulty}, ${userId}, ${calculatedScore}, ${clearTime}, ${cleared ? 'clear' : 'partial'})
            `),
            db.execute(sql`
                INSERT INTO minigame_rankings (game_id, difficulty, user_id, clear_time, score, mistakes, achieved_at)
                VALUES (${gameId}, ${difficulty}, ${userId}, ${clearTime}, ${calculatedScore}, ${mistakes}, NOW())
                ON CONFLICT (game_id, difficulty, user_id)
                DO UPDATE SET
                    clear_time = CASE WHEN EXCLUDED.score > minigame_rankings.score THEN EXCLUDED.clear_time ELSE minigame_rankings.clear_time END,
                    score = GREATEST(minigame_rankings.score, EXCLUDED.score),
                    mistakes = CASE WHEN EXCLUDED.score > minigame_rankings.score THEN EXCLUDED.mistakes ELSE minigame_rankings.mistakes END,
                    achieved_at = CASE WHEN EXCLUDED.score > minigame_rankings.score THEN NOW() ELSE minigame_rankings.achieved_at END
            `),
            earnedPoints > 0
                ? PointService.addPoints(userId, earnedPoints, 'game_clear', `${gameId}:${difficulty}`).catch((e) => {
                    console.error('[RankingService] Points update failed:', e);
                    return 0;
                })
                : Promise.resolve(0),
        ]);

        // 5. Get New Rank (월간 랭킹 갱신이 위에서 이미 끝났으므로 이 시점에 조회해야 정확함)
        const currentRank = await this.getUserRank(userId, gameId);

        return {
            earnedPoints: skipReward ? 0 : finalPoints,
            score: calculatedScore,
            previousRank,
            currentRank
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

    // gameIds를 넘기면 그 목록에 없는 게임(예: 내려간 미니게임)의 활동은
    // 제외한다 — 안 그러면 오락실 그리드에 없는 게임 활동이 티커에 뜨는
    // 불일치가 생긴다.
    async getRecentActivity(limit = 20, gameIds?: string[]) {
        const gameFilter = gameIds && gameIds.length > 0
            ? sql`AND p.game_id IN (${sql.join(gameIds.map(g => sql`${g}`), sql`, `)})`
            : sql``;
        const res = await db.execute(sql`
            SELECT
                p.game_id,
                p.difficulty,
                p.user_id,
                a.name as nickname,
                p.score,
                p.clear_time,
                p.played_at as achieved_at
            FROM minigame_play_log p
            LEFT JOIN attendees a ON p.user_id = a.id
            WHERE p.type = 'clear'
            ${gameFilter}
            ORDER BY p.played_at DESC
            LIMIT ${limit}
        `);
        return res;
    },

    async getUserRank(userId: number, gameId: string): Promise<number | null> {
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const result = await db.execute(sql`
            SELECT rank FROM (
                SELECT user_id, RANK() OVER (ORDER BY total_score DESC, score_updated_at ASC) as rank
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

    /**
     * 여러 게임의 유저 순위를 한 번에 조회 (게임 개수만큼 쿼리를 날리지 않도록 배치 처리).
     * /minigames 허브 페이지가 게임마다 getUserRank()를 따로 호출해서 방문 한 번에
     * 쿼리 13개가 동시에 나가던 것 때문에 커넥션이 순간적으로 몰리던 문제를 해결.
     */
    async getUserRanksForGames(userId: number, gameIds: string[]): Promise<Record<string, number | null>> {
        const ranks: Record<string, number | null> = {};
        for (const gameId of gameIds) ranks[gameId] = null;
        if (gameIds.length === 0) return ranks;

        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const result = await db.execute(sql`
            SELECT game_id, rank FROM (
                SELECT user_id, game_id,
                       RANK() OVER (PARTITION BY game_id ORDER BY total_score DESC, score_updated_at ASC) as rank
                FROM minigame_monthly_rankings
                WHERE month_key = ${monthKey} AND game_id IN (${sql.join(gameIds.map(g => sql`${g}`), sql`, `)})
            ) ranked
            WHERE user_id = ${userId}
        `);

        for (const row of result as any[]) {
            const rank = parseInt(String(row.rank));
            ranks[row.game_id] = rank <= 100 ? rank : null;
        }
        return ranks;
    },

    async getPopularGames(limit = 3): Promise<{ gameId: string; playCount: number }[]> {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const res = await db.execute(sql`
            SELECT game_id, COUNT(*) as play_count
            FROM minigame_play_log
            WHERE played_at >= ${oneMonthAgo.toISOString()} AND type != 'start'
            GROUP BY game_id
            ORDER BY play_count DESC
            LIMIT ${limit}
        `);
        return (res as any[]).map(r => ({ gameId: r.game_id, playCount: Number(r.play_count) }));
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
                RANK() OVER (ORDER BY r.total_score DESC, r.score_updated_at ASC) as rank
            FROM minigame_monthly_rankings r
            LEFT JOIN attendees a ON r.user_id = a.id
            WHERE r.game_id = ${gameId} AND r.month_key = ${monthKey}
            ORDER BY r.total_score DESC, r.score_updated_at ASC
            LIMIT ${limit}
        `);
        return res;
    }
};
