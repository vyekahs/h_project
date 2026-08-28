import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { verifyAdminSession, verifyAttendeeSession } from '$lib/server/auth';
import { searchBggGames, fetchAndTranslateBggGame } from '$lib/server/bgg';

export const load: PageServerLoad = async ({ cookies, request }) => {
    const result = await db.execute(sql`
        SELECT g.*, COALESCE(pc.play_count, 0)::int AS play_count
        FROM games g
        LEFT JOIN (
            SELECT game_id, COUNT(*) AS play_count
            FROM game_sessions
            WHERE status = 'finished' AND game_id IS NOT NULL
            GROUP BY game_id
        ) pc ON pc.game_id = g.id
        WHERE g.is_active = true
        ORDER BY g.name ASC
    `);

    // Auth Check for UI rendering
    const userSessionToken = cookies.get('user_session');
    let user = null;
    if (userSessionToken) {
        try {
            user = await verifyAttendeeSession(userSessionToken);
        } catch (e) {
            console.error('Failed to verify user session', e);
        }
    }

    // Admin Check
    // Admin Check
    const sessionToken = cookies.get('admin_session');
    const isAdmin = sessionToken ? await verifyAdminSession(sessionToken) : false;

    return {
        games: result as any[],
        user,
        isAdmin
    };
};

export const actions: Actions = {
    searchBgg: async ({ request, cookies }) => {
        const data = await request.formData();
        const queryStr = data.get('query')?.toString();

        // Permission Check
        // Permission Check
        const sessionToken = cookies.get('admin_session');
        const isAdmin = sessionToken ? await verifyAdminSession(sessionToken) : false;
        const userSessionToken = cookies.get('user_session');

        if (!isAdmin) {
             if (!userSessionToken) return fail(401, { error: 'Unauthorized' });
             const user = await verifyAttendeeSession(userSessionToken);
             if (!user || !user.can_manage_games) return fail(403, { error: '권한이 없습니다.' });
        }

        if (!queryStr) {
            return fail(400, { error: '검색어를 입력해주세요.' });
        }

        try {
            const games = await searchBggGames(queryStr);
            return { success: true, bggGames: games };
        } catch (err) {
            console.error('[BGG Search Error]', err);
            return fail(500, { error: err instanceof Error ? err.message : 'BGG 검색 중 오류가 발생했습니다.' });
        }
    },

    importBgg: async ({ request, cookies }) => {
        const data = await request.formData();
        const bggId = data.get('bggId')?.toString();

        // Permission Check
        const sessionToken = cookies.get('admin_session');
        const isAdmin = sessionToken ? await verifyAdminSession(sessionToken) : false;
        const userSessionToken = cookies.get('user_session');

        if (!isAdmin) {
             if (!userSessionToken) return fail(401, { error: 'Unauthorized' });
             const user = await verifyAttendeeSession(userSessionToken);
             if (!user || !user.can_manage_games) return fail(403, { error: '권한이 없습니다.' });
        }

        if (!bggId) {
            return fail(400, { error: 'BGG ID가 없습니다.' });
        }

        try {
            const searchName = data.get('searchName')?.toString();
            const game = await fetchAndTranslateBggGame(bggId, searchName);

            await db.execute(sql`
                INSERT INTO games (name, min_players, max_players, playtime_min, max_playtime, min_age, complexity, best_players, description, image_url, bgg_id)
                VALUES (${game.name}, ${game.minPlayers}, ${game.maxPlayers}, ${game.playtimeMin}, ${game.playtimeMax}, ${game.minAge}, ${game.complexity.toFixed(2)}, ${game.bestPlayers}, ${game.description}, ${game.imageUrl}, ${bggId})
                ON CONFLICT (bgg_id) DO UPDATE SET
                name = EXCLUDED.name, min_players = EXCLUDED.min_players, max_players = EXCLUDED.max_players,
                playtime_min = EXCLUDED.playtime_min, max_playtime = EXCLUDED.max_playtime, min_age = EXCLUDED.min_age,
                complexity = EXCLUDED.complexity, best_players = EXCLUDED.best_players, description = EXCLUDED.description,
                image_url = EXCLUDED.image_url
            `);

            return { success: true, imported: true };
        } catch (err) {
            console.error('[BGG Import Error]', err);
            return fail(500, { error: 'BGG 가져오기 중 오류가 발생했습니다.' });
        }
    }
};
