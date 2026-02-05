import { query } from '$lib/server/db';
import { verifyAttendeeSession } from '$lib/server/auth';
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ cookies }) => {
    const userSessionToken = cookies.get('user_session');
    if (!userSessionToken) {
        throw redirect(302, '/login');
    }

    const user = await verifyAttendeeSession(userSessionToken);
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

    // Fetch Registered Devices
    const devicesResult = await query('SELECT id, name, created_at, last_seen_at FROM user_devices WHERE attendee_id = $1 ORDER BY created_at DESC', [user.id]);

    return {
        user,
        history: historyResult.rows,
        stats,
        devices: devicesResult.rows
    };
};

export const actions = {
    deleteDevice: async ({ request, cookies }) => {
        const userSessionToken = cookies.get('user_session');
        if (!userSessionToken) return redirect(302, '/login');
        const user = await verifyAttendeeSession(userSessionToken);
        if (!user) return redirect(302, '/login');

        const data = await request.formData();
        const deviceId = data.get('deviceId');

        if (!deviceId) return { error: 'Invalid ID' };

        try {
            await query('DELETE FROM user_devices WHERE id = $1 AND attendee_id = $2', [deviceId, user.id]);
            return { success: true };
        } catch (e) {
            return { error: '기기 삭제에 실패했습니다.' };
        }
    }
};
