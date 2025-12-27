import { query } from '$lib/server/db';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
    const userAuth = cookies.get('user_auth');
    if (!userAuth) throw error(401, '로그인이 필요합니다.');

    const gamesResult = await query('SELECT id, name, min_players, max_players, image_url FROM games WHERE is_active = true ORDER BY name ASC');

    return {
        games: gamesResult.rows
    };
};
