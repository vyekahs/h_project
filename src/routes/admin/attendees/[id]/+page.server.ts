import { query } from '$lib/server/db';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
    const attendeeId = params.id;

    if (!attendeeId) {
        throw error(400, 'Invalid attendee ID');
    }

    // 1. Fetch Attendee Info
    const attendeeResult = await query('SELECT id, name, status, arrival_time FROM attendees WHERE id = $1', [attendeeId]);
    
    if (attendeeResult.rows.length === 0) {
        throw error(404, 'Attendee not found');
    }
    const attendee = attendeeResult.rows[0];

    // 2. Fetch Game History
    const historyResult = await query(`
        SELECT 
            gs.id, 
            gs.game_name, 
            gs.start_time, 
            gs.end_time, 
            gs.status,
            ROUND(EXTRACT(EPOCH FROM (COALESCE(gs.end_time, NOW()) - gs.start_time))/60) as duration_minutes
        FROM game_sessions gs
        JOIN session_participants sp ON gs.id = sp.session_id
        WHERE sp.attendee_id = $1
        ORDER BY gs.start_time DESC
    `, [attendeeId]);

    // 3. Fetch Partners
    const partnersResult = await query(`
        SELECT 
            a.id, 
            a.name, 
            COUNT(*) as game_count
        FROM session_participants sp1
        JOIN session_participants sp2 ON sp1.session_id = sp2.session_id
        JOIN attendees a ON sp2.attendee_id = a.id
        WHERE sp1.attendee_id = $1 AND sp2.attendee_id != $1
        GROUP BY a.id, a.name
        ORDER BY game_count DESC
        LIMIT 10
    `, [attendeeId]);

    // 4. Fetch Visit History
    const visitsResult = await query(`
        SELECT 
            arrival_time, 
            departure_time,
            ROUND(EXTRACT(EPOCH FROM (COALESCE(departure_time, NOW()) - arrival_time))/60) as duration_minutes
        FROM visits
        WHERE attendee_id = $1
        ORDER BY arrival_time DESC
    `, [attendeeId]);

    return {
        attendee,
        history: historyResult.rows,
        partners: partnersResult.rows,
        visits: visitsResult.rows
    };
};
