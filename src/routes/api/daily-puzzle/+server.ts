import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { verifyAttendeeSession } from '$lib/server/auth';
import { isDailyPuzzleGame } from '$lib/games/dailyPuzzle';
import { getDailyBoard, submitDailyResult } from '$lib/server/dailyPuzzle';
import type { RequestHandler } from './$types';

/** 오늘의 퍼즐 순위·내 기록·연속 참여 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const gameId = url.searchParams.get('gameId') ?? '';
	if (!isDailyPuzzleGame(gameId)) return json({ error: '오늘의 퍼즐이 없는 게임입니다' }, { status: 400 });
	return json(await getDailyBoard(gameId, locals.user?.id ?? null));
};

/** 클리어 기록 제출 — 그날 첫 클리어만 남는다 */
export const POST: RequestHandler = async ({ request, cookies }) => {
	const sessionToken = cookies.get('user_session');
	if (!sessionToken) return json({ error: '로그인이 필요합니다' }, { status: 401 });
	const user = await verifyAttendeeSession(sessionToken);
	if (!user) return json({ error: '세션이 만료되었습니다' }, { status: 401 });

	// 오락실 기록과 같은 조건: 카페에 한 번이라도 온 회원만
	const visitCheck = await db.execute(sql`SELECT 1 FROM visits WHERE attendee_id = ${user.id} LIMIT 1`);
	if (visitCheck.length === 0) return json({ error: '카페 방문 기록이 없습니다' }, { status: 403 });

	const { gameId, date, clearTime, moves } = await request.json();
	if (!isDailyPuzzleGame(gameId) || typeof date !== 'string') {
		return json({ error: '잘못된 요청입니다' }, { status: 400 });
	}

	const result = await submitDailyResult(gameId, user.id, date, clearTime, moves);
	if ('error' in result) return json(result, { status: 400 });

	return json({ ...result, board: await getDailyBoard(gameId, user.id) });
};
