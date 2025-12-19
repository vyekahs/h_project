import { query } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
    // Auto-finish expired games
    await query("UPDATE game_sessions SET status = 'finished' WHERE status = 'playing' AND end_time < NOW()");

    const attendeesResult = await query(`
        SELECT a.id, a.name, v.arrival_time,
               EXISTS(SELECT 1 FROM session_participants sp JOIN game_sessions gs ON sp.session_id = gs.id WHERE sp.attendee_id = a.id AND gs.end_time > NOW()) as is_playing
        FROM visits v
        JOIN attendees a ON v.attendee_id = a.id
        WHERE v.departure_time IS NULL
        ORDER BY v.arrival_time DESC
    `);
    const gamesResult = await query(`
        SELECT gs.id, gs.game_name, gs.end_time, array_agg(a.name) as players
        FROM game_sessions gs
        JOIN session_participants sp ON gs.id = sp.session_id
        JOIN attendees a ON sp.attendee_id = a.id
        WHERE gs.end_time > NOW()
        GROUP BY gs.id, gs.game_name, gs.end_time
        ORDER BY gs.end_time ASC
    `);

    const noticeResult = await query('SELECT content FROM notices WHERE is_active = true ORDER BY created_at DESC LIMIT 1');
    const settingsResult = await query("SELECT value FROM system_settings WHERE key = 'is_open'");
    const isOpen = settingsResult.rows[0]?.value !== 'false'; // Default to true if not set

    return {
        attendees: attendeesResult.rows,
        games: gamesResult.rows,
        notice: noticeResult.rows[0]?.content || null,
        isOpen
    };
};
