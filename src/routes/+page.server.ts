import { query } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
    // Auto-finish expired games
    await query("UPDATE game_sessions SET status = 'finished' WHERE status = 'playing' AND end_time < NOW()");

    const attendeesResult = await query(`
        SELECT a.id, a.name, a.arrival_time, a.status,
               BOOL_OR(gs.id IS NOT NULL) as is_playing
        FROM attendees a
        LEFT JOIN session_participants sp ON a.name = sp.player_name
        LEFT JOIN game_sessions gs ON sp.session_id = gs.id AND gs.status = 'playing'
        WHERE a.status = 'present'
        GROUP BY a.id
        ORDER BY is_playing ASC, a.arrival_time DESC
    `);
    const gamesResult = await query(`
        SELECT gs.*, json_agg(sp.player_name) as players
        FROM game_sessions gs
        LEFT JOIN session_participants sp ON gs.id = sp.session_id
        WHERE gs.status = $1
        GROUP BY gs.id
        ORDER BY gs.start_time DESC
    `, ['playing']);

    const noticeResult = await query('SELECT content FROM notices WHERE is_active = true ORDER BY created_at DESC LIMIT 1');

    return {
        attendees: attendeesResult.rows,
        games: gamesResult.rows,
        notice: noticeResult.rows[0]?.content || null
    };
};
