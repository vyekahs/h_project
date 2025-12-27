import { query } from '$lib/server/db';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { promoteWaitlist } from '$lib/server/reservations';

export const load: PageServerLoad = async ({ cookies }) => {
    // ... (rest of load function remains the same)
    // Auto-finish expired games
    await query("UPDATE game_sessions SET status = 'finished' WHERE status = 'playing' AND end_time < NOW()");

    const attendeesResult = await query(`
        SELECT a.id, a.name, v.arrival_time,
               EXISTS(SELECT 1 FROM session_participants sp JOIN game_sessions gs ON sp.session_id = gs.id WHERE sp.attendee_id = a.id AND gs.status = 'playing') as is_playing
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
        WHERE gs.status = 'playing'
        GROUP BY gs.id, gs.game_name, gs.end_time
        ORDER BY gs.end_time ASC
    `);

    const scheduledGamesResult = await query(`
        SELECT gs.id, gs.game_name, gs.game_id, g.image_url, g.min_players, g.max_players,
               json_agg(json_build_object('id', a.id, 'name', a.name)) as participants
        FROM game_sessions gs
        LEFT JOIN session_participants sp ON gs.id = sp.session_id
        LEFT JOIN attendees a ON sp.attendee_id = a.id
        LEFT JOIN games g ON gs.game_id = g.id
        WHERE gs.status = 'scheduled'
        GROUP BY gs.id, g.image_url, g.min_players, g.max_players
        ORDER BY gs.created_at ASC
    `);

    const reservationsResult = await query(`
        SELECT r.id, r.session_id, r.game_id, r.attendee_id, r.status, a.name as attendee_name
        FROM reservations r
        JOIN attendees a ON r.attendee_id = a.id
        WHERE r.status IN ('pending', 'waitlisted', 'confirmed')
    `);

    const noticeResult = await query('SELECT content FROM notices WHERE is_active = true ORDER BY created_at DESC LIMIT 1');
    const settingsResult = await query("SELECT value FROM system_settings WHERE key = 'is_open'");
    const isOpen = settingsResult.rows[0]?.value !== 'false';

    const userAuth = cookies.get('user_auth');
    let user = null;
    let userPenaltyInfo = null;
    let userReservation = null;
    let userScheduledGame = null;

    if (userAuth) {
        try {
            user = JSON.parse(userAuth);
            
            const penaltyResult = await query('SELECT penalty_points, is_blacklisted FROM attendees WHERE id = $1', [user.id]);
            userPenaltyInfo = penaltyResult.rows[0] || null;

            const resResult = await query(`
                SELECT r.*, gs.game_name, gs.status as session_status
                FROM reservations r
                JOIN game_sessions gs ON r.session_id = gs.id
                WHERE r.attendee_id = $1 AND r.status IN ('pending', 'waitlisted', 'confirmed')
                LIMIT 1
            `, [user.id]);
            userReservation = resResult.rows[0] || null;

            const schedResult = await query(`
                SELECT gs.*
                FROM game_sessions gs
                JOIN session_participants sp ON gs.id = sp.session_id
                WHERE sp.attendee_id = $1 AND gs.status = 'scheduled'
                LIMIT 1
            `, [user.id]);
            userScheduledGame = schedResult.rows[0] || null;
        } catch (e) {}
    }

    const allGamesResult = await query('SELECT id, name, min_players, max_players, image_url FROM games WHERE is_active = true ORDER BY name ASC');

    return {
        attendees: attendeesResult.rows,
        games: gamesResult.rows,
        scheduledGames: scheduledGamesResult.rows,
        reservations: reservationsResult.rows,
        allGames: allGamesResult.rows,
        notice: noticeResult.rows[0]?.content || null,
        isOpen,
        user,
        userPenaltyInfo,
        userReservation,
        userScheduledGame
    };
};

export const actions: Actions = {
    reserveGame: async ({ request, cookies }) => {
        const data = await request.formData();
        const sessionId = data.get('sessionId');
        const userAuth = cookies.get('user_auth');
        
        if (!userAuth) return fail(401, { error: '로그인이 필요합니다.' });
        const user = JSON.parse(userAuth);

        // 0. Check if blacklisted or has too many penalties
        const attendeeInfo = await query('SELECT is_blacklisted, penalty_points FROM attendees WHERE id = $1', [user.id]);
        if (attendeeInfo.rows.length > 0) {
            const { is_blacklisted, penalty_points } = attendeeInfo.rows[0];
            if (is_blacklisted) return fail(403, { error: '블랙리스트에 등록되어 예약이 불가능합니다.' });
            if (penalty_points >= 3) return fail(403, { error: '페널티 누적으로 인해 예약이 불가능합니다. 관리자에게 문의하세요.' });
        }

        // 1. Check if already playing or reserved
        const busyCheck = await query(`
            SELECT 1 FROM session_participants sp
            JOIN game_sessions gs ON sp.session_id = gs.id
            WHERE sp.attendee_id = $1 AND (gs.status = 'playing' OR gs.status = 'scheduled')
            UNION
            SELECT 1 FROM reservations WHERE attendee_id = $1 AND status IN ('pending', 'waitlisted', 'confirmed')
        `, [user.id]);

        if (busyCheck.rows.length > 0) {
            return fail(400, { error: '이미 게임 중이거나 예약된 내역이 있습니다. (1인 1예약 원칙)' });
        }

        // 2. Create reservation
        await query(
            'INSERT INTO reservations (session_id, attendee_id, status) VALUES ($1, $2, $3)',
            [sessionId, user.id, 'pending']
        );

        return { success: true };
    },

    createScheduledGame: async ({ request, cookies }) => {
        const data = await request.formData();
        const gameId = data.get('gameId');
        const scheduledAt = data.get('scheduledAt')?.toString(); // Expected format: YYYY-MM-DDTHH:mm
        const userAuth = cookies.get('user_auth');

        if (!userAuth) return fail(401, { error: '로그인이 필요합니다.' });
        const user = JSON.parse(userAuth);

        if (!scheduledAt) return fail(400, { error: '시작 예정 시간을 입력해주세요.' });

        // 0. Check if blacklisted or has too many penalties
        const attendeeInfo = await query('SELECT is_blacklisted, penalty_points FROM attendees WHERE id = $1', [user.id]);
        if (attendeeInfo.rows.length > 0) {
            const { is_blacklisted, penalty_points } = attendeeInfo.rows[0];
            if (is_blacklisted) return fail(403, { error: '블랙리스트에 등록되어 예약이 불가능합니다.' });
            if (penalty_points >= 3) return fail(403, { error: '페널티 누적으로 인해 예약이 불가능합니다. 관리자에게 문의하세요.' });
        }

        // 1. Check if busy
        const busyCheck = await query(`
            SELECT 1 FROM session_participants sp
            JOIN game_sessions gs ON sp.session_id = gs.id
            WHERE sp.attendee_id = $1 AND (gs.status = 'playing' OR gs.status = 'scheduled')
            UNION
            SELECT 1 FROM reservations WHERE attendee_id = $1 AND status IN ('pending', 'waitlisted', 'confirmed')
        `, [user.id]);

        if (busyCheck.rows.length > 0) {
            return fail(400, { error: '이미 게임 중이거나 예약된 내역이 있습니다.' });
        }

        // 2. Create scheduled session
        await query('BEGIN');
        try {
            const gameResult = await query('SELECT name FROM games WHERE id = $1', [gameId]);
            const gameName = gameResult.rows[0].name;

            const sessionResult = await query(
                'INSERT INTO game_sessions (game_name, game_id, status, scheduled_at) VALUES ($1, $2, $3, $4) RETURNING id',
                [gameName, gameId, 'scheduled', scheduledAt]
            );
            const newSessionId = sessionResult.rows[0].id;

            // Add creator as participant
            await query('INSERT INTO session_participants (session_id, attendee_id) VALUES ($1, $2)', [newSessionId, user.id]);
            
            await query('COMMIT');
            return { success: true };
        } catch (e) {
            await query('ROLLBACK');
            return fail(500, { error: '게임 생성에 실패했습니다.' });
        }
    },

    joinScheduledGame: async ({ request, cookies }) => {
        const data = await request.formData();
        const sessionId = data.get('sessionId');
        const userAuth = cookies.get('user_auth');

        if (!userAuth) return fail(401, { error: '로그인이 필요합니다.' });
        const user = JSON.parse(userAuth);

        // 0. Check if blacklisted or has too many penalties
        const attendeeInfo = await query('SELECT is_blacklisted, penalty_points FROM attendees WHERE id = $1', [user.id]);
        if (attendeeInfo.rows.length > 0) {
            const { is_blacklisted, penalty_points } = attendeeInfo.rows[0];
            if (is_blacklisted) return fail(403, { error: '블랙리스트에 등록되어 예약이 불가능합니다.' });
            if (penalty_points >= 3) return fail(403, { error: '페널티 누적으로 인해 예약이 불가능합니다. 관리자에게 문의하세요.' });
        }

        // 1. Check if busy
        const busyCheck = await query(`
            SELECT 1 FROM session_participants sp
            JOIN game_sessions gs ON sp.session_id = gs.id
            WHERE sp.attendee_id = $1 AND (gs.status = 'playing' OR gs.status = 'scheduled')
            UNION
            SELECT 1 FROM reservations WHERE attendee_id = $1 AND status IN ('pending', 'waitlisted', 'confirmed')
        `, [user.id]);

        if (busyCheck.rows.length > 0) {
            return fail(400, { error: '이미 게임 중이거나 예약된 내역이 있습니다.' });
        }

        // 2. Check if session is full
        const sessionInfo = await query(`
            SELECT g.max_players, COUNT(sp.id) as current_players
            FROM game_sessions gs
            JOIN games g ON gs.game_id = g.id
            LEFT JOIN session_participants sp ON gs.id = sp.session_id
            WHERE gs.id = $1
            GROUP BY g.max_players
        `, [sessionId]);

        if (sessionInfo.rows.length === 0) return fail(404, { error: '게임을 찾을 수 없습니다.' });
        
        const { max_players, current_players } = sessionInfo.rows[0];
        if (current_players >= max_players) {
            // Add to waitlist instead?
            await query(
                'INSERT INTO reservations (session_id, attendee_id, status) VALUES ($1, $2, $3)',
                [sessionId, user.id, 'waitlisted']
            );
            return { success: true, waitlisted: true };
        }

        // 3. Join session
        await query('INSERT INTO session_participants (session_id, attendee_id) VALUES ($1, $2)', [sessionId, user.id]);
        return { success: true };
    },

    cancelReservation: async ({ request, cookies }) => {
        const data = await request.formData();
        const reservationId = data.get('reservationId');
        const userAuth = cookies.get('user_auth');

        if (!userAuth) return fail(401, { error: '로그인이 필요합니다.' });
        const user = JSON.parse(userAuth);

        const reservation = await query(`
            SELECT r.session_id, gs.scheduled_at 
            FROM reservations r 
            JOIN game_sessions gs ON r.session_id = gs.id 
            WHERE r.id = $1 AND r.attendee_id = $2
        `, [reservationId, user.id]);
        if (reservation.rows.length === 0) return fail(404, { error: '예약을 찾을 수 없습니다.' });

        const { session_id: sessionId, scheduled_at } = reservation.rows[0];

        // Apply penalty if cancelled within 10 minutes of start
        if (scheduled_at && new Date(scheduled_at).getTime() - Date.now() < 10 * 60 * 1000) {
            const { applyPenalty } = await import('$lib/server/reservations');
            await applyPenalty(user.id);
        }

        await query('DELETE FROM reservations WHERE id = $1', [reservationId]);
        
        if (sessionId) {
            const { promoteWaitlist } = await import('$lib/server/reservations');
            await promoteWaitlist(sessionId);
        }

        return { success: true };
    },

    leaveScheduledGame: async ({ request, cookies }) => {
        const data = await request.formData();
        const sessionId = data.get('sessionId');
        const userAuth = cookies.get('user_auth');

        if (!userAuth) return fail(401, { error: '로그인이 필요합니다.' });
        const user = JSON.parse(userAuth);

        const session = await query('SELECT scheduled_at FROM game_sessions WHERE id = $1', [sessionId]);
        if (session.rows.length > 0) {
            const { scheduled_at } = session.rows[0];
            // Apply penalty if leaving within 10 minutes of start
            if (scheduled_at && new Date(scheduled_at).getTime() - Date.now() < 10 * 60 * 1000) {
                const { applyPenalty } = await import('$lib/server/reservations');
                await applyPenalty(user.id);
            }
        }

        await query('DELETE FROM session_participants WHERE session_id = $1 AND attendee_id = $2', [sessionId, user.id]);
        
        const { promoteWaitlist } = await import('$lib/server/reservations');
        await promoteWaitlist(Number(sessionId));

        return { success: true };
    }
};
