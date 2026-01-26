import { query } from '$lib/server/db';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { promoteWaitlist } from '$lib/server/reservations';
import { verifyAdminSession, verifyAttendeeSession } from '$lib/server/auth';

async function canModifyGame(request: Request, gameId: string | number): Promise<boolean> {
    const sessionToken = request.headers.get('cookie')?.match(/admin_session=([^;]+)/)?.[1];
    if (sessionToken && await verifyAdminSession(sessionToken)) return true;

    const userSessionToken = request.headers.get('cookie')?.match(/user_session=([^;]+)/)?.[1];
    if (!userSessionToken) return false;

    try {
        const user = await verifyAttendeeSession(userSessionToken);
        if (!user || !user.can_manage_games) return false;

        const res = await query('SELECT created_by FROM game_sessions WHERE id = $1', [gameId]);
        if (res.rows.length === 0) return false;
        
        return res.rows[0].created_by === user.id;
    } catch (e) {
        return false;
    }
}

export const load: PageServerLoad = async ({ locals, cookies, request }) => {
    const userAuthCookie = cookies.get('user_auth');
// ... load function logic (omitted, assuming it stays same but preserving previous code)
// WAIT, replace_file_content replaces the chunk. I need to keep load intact. 
// I will just Insert canModifyGame before load.

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
        SELECT gs.id, gs.game_name, gs.end_time, gs.created_by, 
               COALESCE(json_agg(json_build_object('id', a.id, 'name', a.name)) FILTER (WHERE a.id IS NOT NULL), '[]') as players
        FROM game_sessions gs
        LEFT JOIN session_participants sp ON gs.id = sp.session_id
        LEFT JOIN attendees a ON sp.attendee_id = a.id
        WHERE gs.status = 'playing'
        GROUP BY gs.id, gs.game_name, gs.end_time, gs.created_by
        ORDER BY gs.end_time ASC
    `);

    const scheduledGamesResult = await query(`
        SELECT gs.id, gs.game_name, gs.game_id, gs.min_players, gs.max_players, gs.scheduled_at, gs.created_by, g.image_url,
               COALESCE(json_agg(json_build_object('id', a.id, 'name', a.name)) FILTER (WHERE a.id IS NOT NULL), '[]') as participants
        FROM game_sessions gs
        LEFT JOIN session_participants sp ON gs.id = sp.session_id
        LEFT JOIN attendees a ON sp.attendee_id = a.id
        LEFT JOIN games g ON gs.game_id = g.id
        WHERE gs.status = 'scheduled'
        GROUP BY gs.id, gs.game_name, gs.game_id, gs.min_players, gs.max_players, gs.scheduled_at, gs.created_by, g.image_url
        ORDER BY gs.scheduled_at ASC
    `);

    // Fetch all games for dropdown
    const allGamesResult = await query('SELECT id, name, min_players, max_players, playtime_min, image_url FROM games ORDER BY name ASC');
    
    // Fetch all reservations
    // Fetch all reservations
    const reservationsResult = await query(`
        SELECT r.id, r.session_id, r.game_id, r.attendee_id, r.status, a.name as attendee_name, 
               COALESCE(g.name, gs.game_name) as game_name
        FROM reservations r
        JOIN attendees a ON r.attendee_id = a.id
        LEFT JOIN games g ON r.game_id = g.id
        LEFT JOIN game_sessions gs ON r.session_id = gs.id
        WHERE r.status != 'cancelled'
    `);

    const noticeResult = await query('SELECT content FROM notices WHERE is_active = true ORDER BY created_at DESC LIMIT 1');
    const notice = noticeResult.rows[0]?.content || null;

    const sessionToken = cookies.get('admin_session');
    const isAdmin = sessionToken ? await verifyAdminSession(sessionToken) : false;

    // Check if system is open
    const sysRes = await query("SELECT value FROM system_settings WHERE key = 'is_open'");
    const isOpen = sysRes.rows[0]?.value !== 'false';

    const userSessionToken = cookies.get('user_session');
    let user = null;
    let userPenaltyInfo = null;
    let userReservation = null;
    let userScheduledGames: any[] = [];
    let userPlayingGame = null;

    if (userSessionToken) {
        try {
            user = await verifyAttendeeSession(userSessionToken);
            if (user) {
                // Refresh permissions from DB
                const userStatus = await query('SELECT can_manage_games, penalty_points, is_blacklisted FROM attendees WHERE id = $1', [user.id]);
                if (userStatus.rows.length > 0) {
                     user.can_manage_games = userStatus.rows[0].can_manage_games;
                     userPenaltyInfo = userStatus.rows[0];
                } else {
                     userPenaltyInfo = null; // User might have been deleted?
                }
    
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
                    ORDER BY gs.scheduled_at ASC
                `, [user.id]);
                userScheduledGames = schedResult.rows;
    
                const playingResult = await query(`
                    SELECT gs.id, gs.game_name
                    FROM session_participants sp
                    JOIN game_sessions gs ON sp.session_id = gs.id
                    WHERE sp.attendee_id = $1 AND gs.status = 'playing'
                `, [user.id]);
                userPlayingGame = playingResult.rows[0] || null;
            }
        } catch (e) {}
    }

    return {
        attendees: attendeesResult.rows,
        games: gamesResult.rows,
        scheduledGames: scheduledGamesResult.rows,
        user: user,
        isAdmin: isAdmin,
        isOpen: isOpen,
        notice: notice,
        userPenaltyInfo: userPenaltyInfo,
        userReservation: userReservation,
        userScheduledGames: userScheduledGames,
        userPlayingGame: userPlayingGame,
        allGames: allGamesResult.rows,
        reservations: reservationsResult.rows,
    };
};

export const actions: Actions = {
    reserveGame: async ({ request, cookies }) => {
        const data = await request.formData();
        const sessionId = data.get('sessionId');
        let attendeeId = data.get('attendeeId');
        const sessionToken = cookies.get('admin_session');
        const isAdmin = sessionToken ? await verifyAdminSession(sessionToken) : false;
        const userSessionToken = cookies.get('user_session');
        
        // Determine attendeeId based on auth
        if (isAdmin && attendeeId) {
            // Admin reserving for specific user
        } else if (userSessionToken) {
            const user = await verifyAttendeeSession(userSessionToken);
            if (user) {
                attendeeId = user.id;
            } else {
                return fail(401, { error: 'Invalid session' });
            }
        } else {
            if (isAdmin) return fail(400, { error: '예약할 사용자를 선택해주세요.' });
            return fail(401, { error: '로그인이 필요합니다.' });
        }

        if (!sessionId) return fail(400, { error: '게임 세션을 선택해주세요.' });

        // 0. Check if blacklisted or has too many penalties
        const attendeeInfo = await query('SELECT is_blacklisted, penalty_points FROM attendees WHERE id = $1', [attendeeId]);
        if (attendeeInfo.rows.length > 0) {
            const { is_blacklisted, penalty_points } = attendeeInfo.rows[0];
            if (is_blacklisted) return fail(403, { error: '블랙리스트에 등록되어 예약이 불가능합니다.' });
            if (penalty_points >= 3) return fail(403, { error: '페널티 누적으로 인해 예약이 불가능합니다.' });
        }

        // 1. Check if already playing or reserved
        // 1. Check if already playing or reserved (for TODAY)
        const busyCheck = await query(`
            SELECT 1 FROM session_participants sp
            JOIN game_sessions gs ON sp.session_id = gs.id
            WHERE sp.attendee_id = $1 
            AND (
                gs.status = 'playing' 
                OR (gs.status = 'scheduled' AND gs.scheduled_at::date = CURRENT_DATE)
            )
            UNION
            SELECT 1 FROM reservations r
            JOIN game_sessions gs ON r.session_id = gs.id
            WHERE r.attendee_id = $1 
            AND r.status IN ('pending', 'waitlisted', 'confirmed')
            AND (
                gs.status = 'playing' 
                OR (gs.status = 'scheduled' AND gs.scheduled_at::date = CURRENT_DATE)
            )
        `, [attendeeId]);

        if (busyCheck.rows.length > 0) {
            return fail(400, { error: '오늘 진행 중이거나 예약된 게임이 있어 예약할 수 없습니다.' });
        }

        // 2. Create reservation
        await query(
            'INSERT INTO reservations (session_id, attendee_id, status) VALUES ($1, $2, $3)',
            [sessionId, attendeeId, 'confirmed']
        );

        return { success: true };
    },

    createScheduledGame: async ({ request, cookies }) => {
        const data = await request.formData();
        const gameName = data.get('gameName')?.toString();
        const scheduledAt = data.get('scheduledAt')?.toString();
        const minPlayers = parseInt(data.get('minPlayers')?.toString() || '2');
        const maxPlayers = parseInt(data.get('maxPlayers')?.toString() || '4');
        const sessionToken = cookies.get('admin_session');
        const isAdmin = sessionToken ? await verifyAdminSession(sessionToken) : false;
        const userSessionToken = cookies.get('user_session');
        let creatorId = null;

        if (!isAdmin) {
             if (!userSessionToken) return fail(401, { error: 'Unauthorized' });
             const user = await verifyAttendeeSession(userSessionToken);
             if (!user || !user.can_manage_games) return fail(403, { error: '관리자 권한이 필요합니다.' });
             creatorId = user.id;
        }

        if (!gameName) return fail(400, { error: '게임 이름을 입력해주세요.' });
        if (!scheduledAt) return fail(400, { error: '시작 예정 시간을 입력해주세요.' });

        // 2. Create scheduled session
        await query('BEGIN');
        try {
            const sessionResult = await query(
                'INSERT INTO game_sessions (game_name, status, scheduled_at, min_players, max_players, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
                [gameName, 'scheduled', scheduledAt, minPlayers, maxPlayers, creatorId]
            );
            const newSessionId = sessionResult.rows[0].id;

            if (creatorId) {
                await query('INSERT INTO session_participants (session_id, attendee_id) VALUES ($1, $2)', [newSessionId, creatorId]);
            }
            
            await query('COMMIT');
            return { success: true };
        } catch (e) {
            await query('ROLLBACK');
            console.error('Failed to create scheduled game:', e);
            return fail(500, { error: '게임 생성에 실패했습니다.' });
        }
    },

    joinScheduledGame: async ({ request, cookies }) => {
        const data = await request.formData();
        const sessionId = data.get('sessionId');
        const attendeeId = data.get('attendeeId');
        const sessionToken = cookies.get('admin_session');
        const isAdmin = sessionToken ? await verifyAdminSession(sessionToken) : false;
        const userSessionToken = cookies.get('user_session');

        let finalAttendeeId: number;

        if (isAdmin && attendeeId) {
            finalAttendeeId = parseInt(attendeeId.toString());
        } else if (userSessionToken) {
            const user = await verifyAttendeeSession(userSessionToken);
            if (user) {
                finalAttendeeId = user.id;
            } else {
                 return fail(401, { error: 'Invalid session' });
            }
        } else {
            return fail(401, { error: '로그인이 필요합니다.' });
        }

        // 0. Check if blacklisted or has too many penalties
        const attendeeInfo = await query('SELECT is_blacklisted, penalty_points FROM attendees WHERE id = $1', [finalAttendeeId]);
        if (attendeeInfo.rows.length > 0) {
            const { is_blacklisted, penalty_points } = attendeeInfo.rows[0];
            if (is_blacklisted) return fail(403, { error: '블랙리스트에 등록되어 예약이 불가능합니다.' });
            if (penalty_points >= 3) return fail(403, { error: '페널티 누적으로 인해 예약이 불가능합니다.' });
        }

        // 1. Check if busy
        // 1. Check if already joined THIS session
        const existingParticipant = await query('SELECT 1 FROM session_participants WHERE session_id = $1 AND attendee_id = $2', [sessionId, finalAttendeeId]);
        if (existingParticipant.rows.length > 0) {
            return fail(400, { error: '이미 참여 중인 게임입니다.' });
        }

        // 2. Check if busy with OTHER games or reservations
        // Crucial Fix: effectively ignore reservations for THIS session ID here, treated as "modifying my status"
        const busyCheck = await query(`
            SELECT 1 FROM session_participants sp
            JOIN game_sessions gs ON sp.session_id = gs.id
            WHERE sp.attendee_id = $1 AND (gs.status = 'playing' OR gs.status = 'scheduled') AND gs.id != $2
            UNION
            SELECT 1 FROM reservations WHERE attendee_id = $1 AND status IN ('pending', 'waitlisted', 'confirmed') AND session_id != $2
        `, [finalAttendeeId, sessionId]);

        if (busyCheck.rows.length > 0) {
            return fail(400, { error: '이미 다른 게임에 참여 중이거나 예약된 내역이 있습니다.' });
        }

        // 2. Check if session is full
        const sessionInfo = await query(`
            SELECT gs.max_players, COUNT(sp.id) as current_players
            FROM game_sessions gs
            LEFT JOIN session_participants sp ON gs.id = sp.session_id
            WHERE gs.id = $1
            GROUP BY gs.max_players
        `, [sessionId]);

        if (sessionInfo.rows.length === 0) return fail(404, { error: '게임을 찾을 수 없습니다.' });
        
        const { max_players, current_players } = sessionInfo.rows[0];
        if (current_players >= (max_players || 4)) {
            // Add to waitlist instead?
            await query(
                'INSERT INTO reservations (session_id, attendee_id, status) VALUES ($1, $2, $3)',
                [sessionId, finalAttendeeId, 'waitlisted']
            );
            return { success: true, waitlisted: true };
        }

        // 3. Join session
        await query('BEGIN');
        try {
            await query('INSERT INTO session_participants (session_id, attendee_id) VALUES ($1, $2)', [sessionId, finalAttendeeId]);
            // If there was a reservation for this session, confirm it
            await query("UPDATE reservations SET status = 'confirmed' WHERE session_id = $1 AND attendee_id = $2 AND status != 'cancelled'", [sessionId, finalAttendeeId]);
            await query('COMMIT');
        } catch (e) {
            await query('ROLLBACK');
            throw e;
        }
        return { success: true };
    },

    cancelReservation: async ({ request, cookies }) => {
        const data = await request.formData();
        const reservationId = data.get('reservationId');
        const userSessionToken = cookies.get('user_session');

        if (!userSessionToken) return fail(401, { error: '로그인이 필요합니다.' });
        const user = await verifyAttendeeSession(userSessionToken);
        if (!user) return fail(401, { error: 'Invalid session' });

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
        const userSessionToken = cookies.get('user_session');

        if (!userSessionToken) return fail(401, { error: '로그인이 필요합니다.' });
        const user = await verifyAttendeeSession(userSessionToken);
        if (!user) return fail(401, { error: 'Invalid session' });

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
    },

    createGame: async ({ request }) => {
        const data = await request.formData();
        const gameName = data.get('gameName')?.toString();
        const gameId = data.get('gameId') ? parseInt(data.get('gameId') as string) : null;
        const duration = parseInt(data.get('duration')?.toString() || '0');
        let playerIds = data.getAll('players').map(p => p.toString());

        // Check permission (Admin or Manager)
        const sessionToken = request.headers.get('cookie')?.match(/admin_session=([^;]+)/)?.[1];
        const isAdmin = sessionToken ? await verifyAdminSession(sessionToken) : false;
        const userSessionToken = request.headers.get('cookie')?.match(/user_session=([^;]+)/)?.[1];
        let creatorId = null;

        if (!isAdmin) {
             if (!userSessionToken) return fail(401, { error: 'Unauthorized' });
             const user = await verifyAttendeeSession(userSessionToken);
             if (!user || !user.can_manage_games) return fail(403, { error: 'Unauthorized' });
             creatorId = user.id;
             // Enforce creator participation
             if (!playerIds.includes(creatorId.toString())) {
                 playerIds.push(creatorId.toString());
             }
        }

        if (!gameName || duration <= 0 || playerIds.length === 0) {
            return fail(400, { missing: true });
        }

        try {
            await query('BEGIN');
            
            // Check if any player is already playing
            const playingCheck = await query(`
                SELECT a.name 
                FROM session_participants sp
                JOIN game_sessions gs ON sp.session_id = gs.id
                JOIN attendees a ON sp.attendee_id = a.id
                WHERE gs.status = 'playing' AND sp.attendee_id = ANY($1)
            `, [playerIds]);

            if (playingCheck.rows.length > 0) {
                await query('ROLLBACK');
                const busyPlayers = playingCheck.rows.map((r: any) => r.name).join(', ');
                return fail(400, { error: `다음 인원은 이미 게임 중입니다: ${busyPlayers}` });
            }

            // 1. Create Game Session
            const sessionResult = await query(
                `INSERT INTO game_sessions (game_name, game_id, status, start_time, end_time, created_by) 
                 VALUES ($1, $2, 'playing', NOW(), NOW() + ($3 || ' minutes')::INTERVAL, $4) 
                 RETURNING id`,
                [gameName, gameId, duration, creatorId]
            );
            const newGameId = sessionResult.rows[0].id;

            for (const playerId of playerIds) {
                await query('INSERT INTO session_participants (session_id, attendee_id) VALUES ($1, $2)', [newGameId, playerId]);
            }
            await query('COMMIT');
            return { success: true };
        } catch (error) {
            await query('ROLLBACK');
            return fail(500, { error: 'Failed to create game' });
        }
    },

    endGame: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id')?.toString();
        
        if (!id) return fail(400, { missing: true });
        if (!(await canModifyGame(request, id))) return fail(403, { error: 'Unauthorized' });

        const winnerIds = data.getAll('winnerIds').map(id => id.toString());
        const scores: Record<string, number> = {};
        for (const [key, value] of data.entries()) {
            if (key.startsWith('score_')) {
                const attendeeId = key.replace('score_', '');
                if (value.toString().trim() !== '') {
                    scores[attendeeId] = parseInt(value.toString());
                }
            }
        }

        try {
            await query('BEGIN');
            await query('UPDATE game_sessions SET status = $1, end_time = NOW() WHERE id = $2', ['finished', id]);
            
            if (winnerIds.length > 0) {
                await query('UPDATE session_participants SET is_winner = true WHERE session_id = $1 AND attendee_id = ANY($2)', [id, winnerIds]);
            }
            for (const [attendeeId, score] of Object.entries(scores)) {
                await query('UPDATE session_participants SET score = $1 WHERE session_id = $2 AND attendee_id = $3', [score, id, attendeeId]);
            }
            await query('COMMIT');
            return { success: true };
        } catch (error) {
            await query('ROLLBACK');
            return fail(500, { error: 'Failed to end game' });
        }
    },

    extendGame: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id')?.toString();
        const minutes = parseInt(data.get('minutes')?.toString() || '0');

        if (!id || minutes <= 0) return fail(400, { missing: true });
        if (!(await canModifyGame(request, id))) return fail(403, { error: 'Unauthorized' });

        try {
            await query(
                'UPDATE game_sessions SET end_time = end_time + interval \'' + minutes + ' minutes\' WHERE id = $1',
                [id]
            );
            return { success: true };
        } catch (error) {
            return fail(500, { error: 'Failed to extend game' });
        }
    },

    dissolveScheduledGame: async ({ request }) => {
        const data = await request.formData();
        const sessionId = data.get('sessionId')?.toString();
        if (!sessionId) return fail(400, { error: 'Invalid ID' });
        if (!(await canModifyGame(request, sessionId))) return fail(403, { error: 'Unauthorized' });

        await query('BEGIN');
        try {
            await query('DELETE FROM session_participants WHERE session_id = $1', [sessionId]);
            await query('DELETE FROM reservations WHERE session_id = $1', [sessionId]);
            await query('DELETE FROM game_sessions WHERE id = $1', [sessionId]);
            await query('COMMIT');
            return { success: true };
        } catch (e) {
            await query('ROLLBACK');
            return fail(500, { error: 'Failed to dissolve game' });
        }
    },

    startScheduledGame: async ({ request }) => {
        const data = await request.formData();
        const sessionId = data.get('sessionId')?.toString();
        const duration = parseInt(data.get('duration')?.toString() || '60');

        if (!sessionId) return fail(400, { error: 'Invalid ID' });
        if (!(await canModifyGame(request, sessionId))) return fail(403, { error: 'Unauthorized' });

        await query('BEGIN');
        try {
            await query(
                "UPDATE game_sessions SET status = 'playing', start_time = NOW(), end_time = NOW() + interval '" + duration + " minutes' WHERE id = $1",
                [sessionId]
            );
            await query("UPDATE reservations SET status = 'confirmed' WHERE session_id = $1 AND status = 'pending'", [sessionId]);
            await query('COMMIT');
            return { success: true };
        } catch (e) {
            await query('ROLLBACK');
            return fail(500, { error: 'Failed to start game' });
        }
    },


};
