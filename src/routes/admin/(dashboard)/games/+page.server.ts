import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { searchBggGames, fetchAndTranslateBggGame } from '$lib/server/bgg';

export const load: PageServerLoad = async () => {
    const result = await db.execute(sql`SELECT * FROM games ORDER BY name ASC`);
    return {
        games: result as any[]
    };
};


export const actions: Actions = {
    create: async ({ request }) => {
        const data = await request.formData();
        const name = data.get('name');
        const minPlayers = data.get('min_players');
        const maxPlayers = data.get('max_players');
        const playtimeMin = data.get('playtime_min');
        const complexity = data.get('complexity');
        const description = data.get('description');
        const imageUrl = data.get('image_url');
        const includedDlcs = data.get('included_dlcs');

        try {
            await db.execute(sql`
                INSERT INTO games (name, min_players, max_players, playtime_min, complexity, description, image_url, included_dlcs)
                VALUES (${name}, ${minPlayers}, ${maxPlayers}, ${playtimeMin}, ${complexity}, ${description}, ${imageUrl}, ${includedDlcs})
            `);
            return { success: true };
        } catch (err) {
            console.error(err);
            return fail(500, { error: '게임 추가 중 오류가 발생했습니다.' });
        }
    },

    update: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id');
        const name = data.get('name');
        const minPlayers = data.get('min_players');
        const maxPlayers = data.get('max_players');
        const playtimeMin = data.get('playtime_min');
        const complexity = data.get('complexity');
        const description = data.get('description');
        const imageUrl = data.get('image_url');
        const includedDlcs = data.get('included_dlcs');

        try {
            await db.execute(sql`
                UPDATE games SET
                name = ${name}, min_players = ${minPlayers}, max_players = ${maxPlayers}, playtime_min = ${playtimeMin},
                complexity = ${complexity}, description = ${description}, image_url = ${imageUrl}, included_dlcs = ${includedDlcs}
                WHERE id = ${id}
            `);
            return { success: true };
        } catch (err) {
            console.error(err);
            return fail(500, { error: '게임 수정 중 오류가 발생했습니다.' });
        }
    },

    delete: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id');

        try {
            // Check if the game has any sessions
            const sessions = await db.execute(sql`SELECT id FROM game_sessions WHERE game_id = ${id} LIMIT 1`);

            if (sessions.length > 0) {
                // If it has sessions, just deactivate it
                await db.execute(sql`UPDATE games SET is_active = false WHERE id = ${id}`);
                return { success: true, deactivated: true };
            } else {
                // If no sessions, delete the record
                await db.execute(sql`DELETE FROM games WHERE id = ${id}`);
                return { success: true, deleted: true };
            }
        } catch (err) {
            console.error(err);
            return fail(500, { error: '게임 삭제/비활성화 중 오류가 발생했습니다.' });
        }
    },

    reactivate: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id');

        try {
            await db.execute(sql`UPDATE games SET is_active = true WHERE id = ${id}`);
            return { success: true };
        } catch (err) {
            console.error(err);
            return fail(500, { error: '게임 복구 중 오류가 발생했습니다.' });
        }
    },

    searchBgg: async ({ request }) => {
        const data = await request.formData();
        const queryStr = data.get('query')?.toString();

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

    importBgg: async ({ request }) => {
        const data = await request.formData();
        const bggId = data.get('bggId')?.toString();

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
