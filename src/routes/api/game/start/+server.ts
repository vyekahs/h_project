import { json } from '@sveltejs/kit';
import { verifyAttendeeSession } from '$lib/server/auth';
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
    const sessionToken = cookies.get('user_session');
    if (!sessionToken) {
        return json({ ok: false }, { status: 401 });
    }
    const user = await verifyAttendeeSession(sessionToken);
    if (!user) {
        return json({ ok: false }, { status: 401 });
    }

    try {
        const { gameId, difficulty } = await request.json();
        if (!gameId) {
            return json({ ok: false }, { status: 400 });
        }

        await db.execute(sql`
            INSERT INTO minigame_play_log (game_id, difficulty, user_id, type)
            VALUES (${gameId}, ${difficulty || null}, ${user.id}, 'start')
        `);

        return json({ ok: true });
    } catch {
        return json({ ok: false }, { status: 500 });
    }
};
