import { json } from '@sveltejs/kit';
import { RankingService } from '$lib/server/services/rankingService';
import { TitleService } from '$lib/server/services/titleService';
import { verifyAttendeeSession } from '$lib/server/auth';
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';


import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
    // Authenticate
    const sessionToken = cookies.get('user_session');
    if (!sessionToken) {
        return json({ error: '로그인이 필요합니다' }, { status: 401 });
    }
    const user = await verifyAttendeeSession(sessionToken);
    if (!user) {
        return json({ error: '세션이 만료되었습니다' }, { status: 401 });
    }
    const userId = user.id;

    // 카페 방문 이력 확인
    const visitCheck = await db.execute(sql`SELECT 1 FROM visits WHERE attendee_id = ${userId} LIMIT 1`);
    if (visitCheck.length === 0) {
        return json({ error: '카페 방문 기록이 없습니다' }, { status: 403 });
    }

    const { gameId, difficulty, clearTime, score, skipReward, mistakes } = await request.json();

    if (!gameId || !difficulty || clearTime === undefined) {
        return json({ error: 'Missing required fields' }, { status: 400 });
    }

    try {
        const result = await RankingService.submitScore(userId, gameId, difficulty, clearTime, score, skipReward, mistakes || 0);

        // Trigger Title Check and return newly assigned titles
        let newTitles: string[] = [];
        try {
            const assignedCodes = await TitleService.checkAndAssignTitles(userId);
            if (assignedCodes.length > 0) {
                const titleInfoRes = await db.execute(sql`
                    SELECT title_name, condition_value FROM minigame_titles
                    WHERE title_code = ANY(ARRAY[${sql.join(assignedCodes.map(c => sql`${c}`), sql`, `)}])
                `);
                
                // Filter out titles that belong to a different game
                newTitles = titleInfoRes
                    .filter((r: any) => {
                        const cond = r.condition_value;
                        if (!cond) return true; // General titles might not have a condition_value or gameId
                        if (cond.gameId && cond.gameId !== gameId) return false;
                        return true;
                    })
                    .map((r: any) => r.title_name);
            }
        } catch (e) {
            console.error('[API] Title check failed:', e);
        }

        return json({ ...result, newTitles });
    } catch (e: any) {
        console.error(e);
        return json({ error: e.message, stack: e.stack }, { status: 500 });
    }
}
