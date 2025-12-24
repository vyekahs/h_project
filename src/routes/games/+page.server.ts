import { query } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
    const result = await query('SELECT * FROM games WHERE is_active = true ORDER BY name ASC');
    return {
        games: result.rows
    };
};
