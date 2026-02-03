import { query } from '$lib/server/db';
import { verifyAttendeeSession } from '$lib/server/auth';
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ parent }) => {
    const { user } = await parent();

    if (!user) {
        throw redirect(302, '/login');
    }

    // Fetch Game History
    const historyResult = await query(`
        SELECT 
            gs.id, 
            gs.game_name, 
            gs.end_time,
            sp.score as my_score, 
            sp.is_winner as is_winner,
            (
                SELECT json_agg(json_build_object(
                    'name', a2.name, 
                    'score', sp2.score, 
                    'is_winner', sp2.is_winner
                ))
                FROM session_participants sp2
                JOIN attendees a2 ON sp2.attendee_id = a2.id
                WHERE sp2.session_id = gs.id AND sp2.attendee_id != $1
            ) as opponents
        FROM session_participants sp
        JOIN game_sessions gs ON sp.session_id = gs.id
        WHERE sp.attendee_id = $1 AND gs.status = 'finished'
        ORDER BY gs.end_time DESC
    `, [user.id]);

    // Fetch Stats
    const statsResult = await query(`
        SELECT 
            COUNT(*) as total_games,
            COUNT(*) FILTER (WHERE is_winner = true) as total_wins
        FROM session_participants sp
        JOIN game_sessions gs ON sp.session_id = gs.id
        WHERE sp.attendee_id = $1 AND gs.status = 'finished'
    `, [user.id]);

    const stats = statsResult.rows[0];

    // Trigger Title Check (Background)
    try {
        import('$lib/server/services/titleService').then(({ TitleService }) => TitleService.checkAndAssignTitles(user.id)).catch(e => console.error('[MyPage] Title check failed', e));
    } catch(e) {
        console.error(e);
    }

    return {
        user,
        history: historyResult.rows,
        stats
    };
};
