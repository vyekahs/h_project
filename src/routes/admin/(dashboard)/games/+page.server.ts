import { query } from '$lib/server/db';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async () => {
    const result = await query('SELECT * FROM games ORDER BY name ASC');
    return {
        games: result.rows
    };
};

export const actions: Actions = {
    create: async ({ request }) => {
        const data = await request.formData();
        const name = data.get('name') as string;
        const min_players = data.get('min_players') ? parseInt(data.get('min_players') as string) : null;
        const max_players = data.get('max_players') ? parseInt(data.get('max_players') as string) : null;
        const playtime_min = data.get('playtime_min') ? parseInt(data.get('playtime_min') as string) : null;
        const difficulty = data.get('difficulty') as string;
        const description = data.get('description') as string;
        // Image URL handling would ideally involve upload, but for now text input
        const image_url = data.get('image_url') as string;
        const included_dlcs = data.get('included_dlcs') as string;

        if (!name) {
            return fail(400, { error: '게임 이름은 필수입니다.' });
        }

        try {
            await query(
                `INSERT INTO games (name, min_players, max_players, playtime_min, difficulty, description, image_url, included_dlcs) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [name, min_players, max_players, playtime_min, difficulty, description, image_url, included_dlcs]
            );
            return { success: true };
        } catch (err) {
            console.error(err);
            return fail(500, { error: '게임 등록 중 오류가 발생했습니다.' });
        }
    },

    update: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id');
        const name = data.get('name') as string;
        const min_players = data.get('min_players') ? parseInt(data.get('min_players') as string) : null;
        const max_players = data.get('max_players') ? parseInt(data.get('max_players') as string) : null;
        const playtime_min = data.get('playtime_min') ? parseInt(data.get('playtime_min') as string) : null;
        const difficulty = data.get('difficulty') as string;
        const description = data.get('description') as string;
        const image_url = data.get('image_url') as string;
        const included_dlcs = data.get('included_dlcs') as string;

        if (!id || !name) {
            return fail(400, { error: '잘못된 요청입니다.' });
        }

        try {
            await query(
                `UPDATE games 
                 SET name = $1, min_players = $2, max_players = $3, playtime_min = $4, difficulty = $5, description = $6, image_url = $7, included_dlcs = $8
                 WHERE id = $9`,
                [name, min_players, max_players, playtime_min, difficulty, description, image_url, included_dlcs, id]
            );
            return { success: true };
        } catch (err) {
            console.error(err);
            return fail(500, { error: '게임 수정 중 오류가 발생했습니다.' });
        }
    },

    delete: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id');

        if (!id) return fail(400, { error: 'ID가 없습니다.' });

        try {
            await query('DELETE FROM games WHERE id = $1', [id]);
            return { success: true };
        } catch (err) {
            console.error(err);
            return fail(500, { error: '게임 삭제 중 오류가 발생했습니다.' });
        }
    }
};
