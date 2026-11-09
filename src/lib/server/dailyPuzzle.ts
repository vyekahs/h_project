import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { kstDateKey, shiftDateKey, dailyStreak, type DailyPuzzleGame, type DailyBoard, type DailyEntry } from '$lib/games/dailyPuzzle';

/** 순위: 시간이 짧을수록, 같으면 이동이 적을수록, 그래도 같으면 먼저 푼 사람 */
const RANK_ORDER = sql`r.clear_time ASC, r.moves ASC, r.created_at ASC`;

export async function getDailyBoard(gameId: DailyPuzzleGame, userId: number | null, topN = 5): Promise<DailyBoard> {
	const date = kstDateKey();
	const rows = (await db.execute(sql`
		SELECT r.user_id, a.name, r.clear_time, r.moves,
		       RANK() OVER (ORDER BY ${RANK_ORDER}) AS rank
		FROM daily_puzzle_results r
		JOIN attendees a ON a.id = r.user_id
		WHERE r.puzzle_date = ${date} AND r.game_id = ${gameId}
		ORDER BY ${RANK_ORDER}
	`)) as any[];

	const entries: DailyEntry[] = rows.map((r) => ({
		userId: Number(r.user_id),
		name: r.name,
		clearTime: Number(r.clear_time),
		moves: Number(r.moves),
		rank: Number(r.rank)
	}));

	let streak = 0;
	if (userId !== null) {
		// 연속 기록은 최근 1년만 보면 충분하다
		const since = shiftDateKey(date, -366);
		const days = (await db.execute(sql`
			SELECT to_char(puzzle_date, 'YYYY-MM-DD') AS d FROM daily_puzzle_results
			WHERE user_id = ${userId} AND game_id = ${gameId} AND puzzle_date >= ${since}
		`)) as any[];
		streak = dailyStreak(days.map((r) => r.d), date);
	}

	return {
		date,
		gameId,
		top: entries.slice(0, topN),
		total: entries.length,
		mine: userId === null ? null : entries.find((e) => e.userId === userId) ?? null,
		streak
	};
}

/**
 * 기록 저장. 그날 첫 클리어만 남는다(두 번째부터는 기존 기록 그대로).
 * 날짜는 오늘이나 어제만 받는다 — 자정 직전에 시작해 자정 넘어 끝낸 판도 그 문제의 날짜로 남긴다.
 */
export async function submitDailyResult(
	gameId: DailyPuzzleGame,
	userId: number,
	date: string,
	clearTime: number,
	moves: number
): Promise<{ recorded: boolean } | { error: string }> {
	const today = kstDateKey();
	if (date !== today && date !== shiftDateKey(today, -1)) return { error: '지난 퍼즐입니다' };
	if (!Number.isInteger(clearTime) || clearTime <= 0 || !Number.isInteger(moves) || moves < 0) {
		return { error: '잘못된 기록입니다' };
	}

	const inserted = (await db.execute(sql`
		INSERT INTO daily_puzzle_results (puzzle_date, game_id, user_id, clear_time, moves)
		VALUES (${date}, ${gameId}, ${userId}, ${clearTime}, ${moves})
		ON CONFLICT (puzzle_date, game_id, user_id) DO NOTHING
		RETURNING user_id
	`)) as any[];
	return { recorded: inserted.length > 0 };
}
