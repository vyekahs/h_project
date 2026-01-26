import { query } from '$lib/server/db';
import { fail, redirect } from '@sveltejs/kit';
import QRCode from 'qrcode';
import type { Actions, PageServerLoad } from './$types';
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

export const load: PageServerLoad = async () => {
    // Auto-finish expired games
    await query("UPDATE game_sessions SET status = 'finished' WHERE status = 'playing' AND end_time < NOW()");

    const attendeesResult = await query(`
        SELECT a.id, a.name, a.arrival_time, a.status, a.penalty_points, a.is_blacklisted, a.can_manage_games,
               MAX(g.id) as game_id,
               MAX(g.game_name) as game_name,
               BOOL_OR(g.id IS NOT NULL) as is_playing
        FROM attendees a
        LEFT JOIN session_participants sp ON a.id = sp.attendee_id
        LEFT JOIN game_sessions g ON sp.session_id = g.id AND g.status = 'playing'
        WHERE a.status = 'present'
        GROUP BY a.id, a.name, a.arrival_time, a.status, a.penalty_points, a.is_blacklisted, a.can_manage_games
        ORDER BY is_playing, a.arrival_time DESC
    `);
    const historyResult = await query(`
        SELECT id, name, penalty_points, is_blacklisted
        FROM attendees
        ORDER BY name ASC
    `);

    const gamesResult = await query(`
        SELECT gs.*, g.image_url, json_agg(json_build_object('id', a.id, 'name', a.name)) as players
        FROM game_sessions gs
        LEFT JOIN session_participants sp ON gs.id = sp.session_id
        LEFT JOIN attendees a ON sp.attendee_id = a.id
        LEFT JOIN games g ON gs.game_id = g.id
        WHERE gs.status = 'playing'
        GROUP BY gs.id, g.image_url
        ORDER BY gs.start_time DESC
    `);

    const scheduledGamesResult = await query(`
        SELECT gs.id, gs.game_name, gs.game_id, gs.min_players, gs.max_players, gs.scheduled_at, g.image_url,
               COALESCE(json_agg(json_build_object('id', a.id, 'name', a.name)) FILTER (WHERE a.id IS NOT NULL), '[]') as participants
        FROM game_sessions gs
        LEFT JOIN session_participants sp ON gs.id = sp.session_id
        LEFT JOIN attendees a ON sp.attendee_id = a.id
        LEFT JOIN games g ON gs.game_id = g.id
        WHERE gs.status = 'scheduled'
        GROUP BY gs.id, gs.game_name, gs.game_id, gs.min_players, gs.max_players, gs.scheduled_at, g.image_url
        ORDER BY gs.scheduled_at ASC
    `);

    const reservationsResult = await query(`
        SELECT r.*, a.name as attendee_name, gs.game_name
        FROM reservations r
        JOIN attendees a ON r.attendee_id = a.id
        JOIN game_sessions gs ON r.session_id = gs.id
        WHERE r.status IN ('pending', 'waitlisted', 'confirmed')
        ORDER BY r.created_at ASC
    `);

    const gameNamesResult = await query(`
        SELECT DISTINCT ON (game_name) 
            game_name, 
            ROUND(EXTRACT(EPOCH FROM (end_time - start_time))/60) as duration 
        FROM game_sessions 
        ORDER BY game_name, start_time DESC
    `);

    const noticeResult = await query('SELECT content FROM notices WHERE is_active = true ORDER BY created_at DESC LIMIT 1');
    const presentNames = new Set(attendeesResult.rows.map((a: any) => a.name));
    const savedMembers = historyResult.rows
        .filter((r: any) => !presentNames.has(r.name))
        .map((r: any) => ({ id: r.id, name: r.name, penalty_points: r.penalty_points, is_blacklisted: r.is_blacklisted }));
    
    const allGamesResult = await query('SELECT id, name, playtime_min FROM games WHERE is_active = true ORDER BY name ASC');

    const settingsResult = await query('SELECT key, value FROM system_settings');
    const settings = settingsResult.rows.reduce((acc: any, row: any) => {
        acc[row.key] = row.value;
        return acc;
    }, {
        closing_time_weekday: '22:00',
        closing_time_weekend: '23:00',
        weekend_days: '5,6',
        is_open: 'true',
        no_show_limit_minutes: '10',
        auto_dissolve_limit_minutes: '10',
        penalty_threshold: '3'
    });

    return {
        attendees: attendeesResult.rows,
        savedMembers,
        games: gamesResult.rows,
        scheduledGames: scheduledGamesResult.rows,
        reservations: reservationsResult.rows,
        savedGameNames: gameNamesResult.rows,
        allGames: allGamesResult.rows,
        notice: noticeResult.rows[0]?.content || null,
        settings
    };
};

export const actions: Actions = {
    // ... (addAttendee, removeAttendee omitted for brevity, they are unchanged)
    addAttendee: async ({ request }) => {
        const data = await request.formData();
        const name = data.get('name')?.toString().trim();

        if (!name) {
            return fail(400, { error: '이름을 입력해주세요.' });
        }

        // Ensure is_open is true
        await query("INSERT INTO system_settings (key, value) VALUES ('is_open', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true'");

        // 1. Check if ANY attendee with this name exists
        const existingResult = await query('SELECT * FROM attendees WHERE name = $1 ORDER BY id DESC', [name]);
        const existingRecords = existingResult.rows;

        // Check if ANY of them are currently present
        const alreadyPresent = existingRecords.find((a: any) => a.status === 'present');
        if (alreadyPresent) {
            return fail(400, { error: '이미 참여 중인 인원입니다.' });
        }

        if (existingRecords.length > 0) {
            // User exists but is not present. Reuse the most recent record (first in list due to DESC sort)
            const attendeeToReactivate = existingRecords[0];

             // Re-entry: Update status and Add new visit
            await query('BEGIN');
            try {
                await query('UPDATE attendees SET status = $1, arrival_time = NOW(), updated_at = NOW() WHERE id = $2', ['present', attendeeToReactivate.id]);
                await query('INSERT INTO visits (attendee_id, arrival_time) VALUES ($1, NOW())', [attendeeToReactivate.id]);
                await query('COMMIT');
            } catch (e) {
                await query('ROLLBACK');
                throw e;
            }
        } else {
            // New Entry: Create attendee and Add visit
            await query('BEGIN');
            try {
                const result = await query('INSERT INTO attendees (name, status, arrival_time) VALUES ($1, $2, NOW()) RETURNING id', [name, 'present']);
                const newId = result.rows[0].id;
                await query('INSERT INTO visits (attendee_id, arrival_time) VALUES ($1, NOW())', [newId]);
                await query('COMMIT');
            } catch (e) {
                await query('ROLLBACK');
                throw e;
            }
        }
    },

    removeAttendee: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id');
        const endGame = data.get('endGame') === 'true';
        const gameId = data.get('gameId');

        if (!id) return fail(400, { error: 'Invalid ID' });

        await query('BEGIN');
        try {
            // 1. Update Attendee Status
            await query('UPDATE attendees SET status = $1, updated_at = NOW() WHERE id = $2', ['left', id]);

            // 2. Close current visit
            await query('UPDATE visits SET departure_time = NOW() WHERE attendee_id = $1 AND departure_time IS NULL', [id]);

            // 3. End Game if requested
            if (endGame && gameId) {
                await query('UPDATE game_sessions SET status = $1, end_time = NOW() WHERE id = $2', ['finished', gameId]);
            }

            await query('COMMIT');
        } catch (e) {
            await query('ROLLBACK');
            return fail(500, { error: 'Failed to remove attendee' });
        }
    },

    createGame: async ({ request }) => {
        const data = await request.formData();
        const gameName = data.get('gameName')?.toString();
        const gameId = data.get('gameId') ? parseInt(data.get('gameId') as string) : null;
        const duration = parseInt(data.get('duration')?.toString() || '0');
        const playerIds = data.getAll('players').map(p => p.toString());

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
            // 0. Get Creator ID (if Manager)
            const userAuth = request.headers.get('cookie')?.match(/user_auth=([^;]+)/)?.[1];
            let createdBy = null;
            if (userAuth) {
                try {
                    const user = JSON.parse(decodeURIComponent(userAuth));
                    createdBy = user.id;
                } catch (e) {
                    // ignore
                }
            }

            // 1. Create Game Session
            const sessionResult = await query(
                `INSERT INTO game_sessions (game_name, game_id, status, start_time, end_time, created_by) 
                 VALUES ($1, $2, 'playing', NOW(), NOW() + ($3 || ' minutes')::INTERVAL, $4) 
                 RETURNING id`,
                [gameName, gameId, duration, createdBy]
            );
            const newGameId = sessionResult.rows[0].id;

            for (const playerId of playerIds) {
                await query('INSERT INTO session_participants (session_id, attendee_id) VALUES ($1, $2)', [newGameId, playerId]);
            }
            await query('COMMIT');
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
        
        // Process scores: scores are sent as "score_{attendeeId}"
        const scores: Record<string, number> = {};
        for (const [key, value] of data.entries()) {
            if (key.startsWith('score_')) {
                const attendeeId = key.replace('score_', '');
                if (value.toString().trim() !== '') {
                    scores[attendeeId] = parseInt(value.toString());
                }
            }
        }

        if (!id) {
            return fail(400, { missing: true });
        }

        try {
            await query('BEGIN');
            await query('UPDATE game_sessions SET status = $1, end_time = NOW() WHERE id = $2', ['finished', id]);
            
            if (winnerIds.length > 0) {
                await query('UPDATE session_participants SET is_winner = true WHERE session_id = $1 AND attendee_id = ANY($2)', [id, winnerIds]);
            }

            // Update scores
            for (const [attendeeId, score] of Object.entries(scores)) {
                await query('UPDATE session_participants SET score = $1 WHERE session_id = $2 AND attendee_id = $3', [score, id, attendeeId]);
            }
            
            await query('COMMIT');
        } catch (error) {
            await query('ROLLBACK');
            return fail(500, { error: 'Failed to end game' });
        }
    },
    updateNotice: async ({ request }) => {
        const data = await request.formData();
        const content = data.get('content')?.toString();

        if (!content) {
            return fail(400, { missing: true });
        }

        try {
            await query('BEGIN');
            await query('UPDATE notices SET is_active = false');
            await query('INSERT INTO notices (content) VALUES ($1)', [content]);
            await query('COMMIT');
        } catch (error) {
            await query('ROLLBACK');
            return fail(500, { error: 'Failed to update notice' });
        }
    },
    clearNotice: async () => {
        try {
            await query('UPDATE notices SET is_active = false');
        } catch (error) {
            return fail(500, { error: 'Failed to clear notice' });
        }
    },
    extendGame: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id')?.toString();
        const minutes = parseInt(data.get('minutes')?.toString() || '0');

        if (!id || minutes <= 0) {
            return fail(400, { missing: true });
        }
        if (!(await canModifyGame(request, id))) return fail(403, { error: 'Unauthorized' });

        try {
            await query(
                'UPDATE game_sessions SET end_time = end_time + interval \'' + minutes + ' minutes\' WHERE id = $1',
                [id]
            );
        } catch (error) {
            return fail(500, { error: 'Failed to extend game' });
        }
    },
    updateSettings: async ({ request }) => {
        const data = await request.formData();
        const weekday = data.get('closing_time_weekday')?.toString();
        const weekend = data.get('closing_time_weekend')?.toString();
        const weekendDays = data.getAll('weekend_days').join(',');
        const noShowLimit = data.get('no_show_limit_minutes')?.toString();
        const autoDissolveLimit = data.get('auto_dissolve_limit_minutes')?.toString();
        const penaltyThreshold = data.get('penalty_threshold')?.toString();

        try {
            await query('BEGIN');
            if (weekday) await query('INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', ['closing_time_weekday', weekday]);
            if (weekend) await query('INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', ['closing_time_weekend', weekend]);
            if (weekendDays !== undefined) await query('INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', ['weekend_days', weekendDays]);
            if (noShowLimit) await query('INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', ['no_show_limit_minutes', noShowLimit]);
            if (autoDissolveLimit) await query('INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', ['auto_dissolve_limit_minutes', autoDissolveLimit]);
            if (penaltyThreshold) await query('INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', ['penalty_threshold', penaltyThreshold]);
            await query('COMMIT');
        } catch (error) {
            await query('ROLLBACK');
            return fail(500, { error: 'Failed to update settings' });
        }
    },
    closeDay: async () => {
        try {
            await query('BEGIN');
            // Checkout all active visits
            await query('UPDATE visits SET departure_time = NOW() WHERE departure_time IS NULL');
            // Set all attendees to 'left'
            await query("UPDATE attendees SET status = 'left' WHERE status = 'present'");
            // End all active games
            await query("UPDATE game_sessions SET status = 'finished', end_time = NOW() WHERE status = 'playing'");
            // Set is_open to false
            await query("INSERT INTO system_settings (key, value) VALUES ('is_open', 'false') ON CONFLICT (key) DO UPDATE SET value = 'false'");
            
            // Record business date to prevent auto-close from re-triggering if reopened
            const now = new Date();
            const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
            const currentHour = kstNow.getUTCHours();
            let businessDateObj = new Date(kstNow);
            if (currentHour < 9) {
                businessDateObj.setUTCDate(businessDateObj.getUTCDate() - 1);
            }
            const businessDate = businessDateObj.toISOString().split('T')[0];
            await query("INSERT INTO system_settings (key, value) VALUES ('last_auto_close_date', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [businessDate]);

            await query('COMMIT');
        } catch (error) {
            await query('ROLLBACK');
            return fail(500, { error: 'Failed to close day' });
        }
    },
    openDay: async () => {
        try {
            await query("INSERT INTO system_settings (key, value) VALUES ('is_open', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true'");
        } catch (error) {
            return fail(500, { error: 'Failed to open day' });
        }
    },

    confirmReservation: async ({ request }) => {
        const data = await request.formData();
        const reservationId = data.get('reservationId');
        if (!reservationId) return fail(400, { error: 'Invalid ID' });

        await query("UPDATE reservations SET status = 'confirmed' WHERE id = $1", [reservationId]);
        return { success: true };
    },

    cancelReservationAdmin: async ({ request }) => {
        const data = await request.formData();
        const reservationId = data.get('reservationId');
        if (!reservationId) return fail(400, { error: 'Invalid ID' });

        const res = await query('SELECT session_id FROM reservations WHERE id = $1', [reservationId]);
        const sessionId = res.rows[0]?.session_id;

        await query('DELETE FROM reservations WHERE id = $1', [reservationId]);
        if (sessionId) {
            const { promoteWaitlist } = await import('$lib/server/reservations');
            await promoteWaitlist(sessionId);
        }
        return { success: true };
    },

    dissolveScheduledGame: async ({ request }) => {
        const data = await request.formData();
        const sessionId = data.get('sessionId');
        if (!sessionId) return fail(400, { error: 'Invalid ID' });
        if (!(await canModifyGame(request, sessionId.toString()))) return fail(403, { error: 'Unauthorized' });

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
        const sessionId = data.get('sessionId');
        const duration = parseInt(data.get('duration')?.toString() || '60');

        if (!sessionId) return fail(400, { error: 'Invalid ID' });
        if (!(await canModifyGame(request, sessionId.toString()))) return fail(403, { error: 'Unauthorized' });

        await query('BEGIN');
        try {
            await query(
                "UPDATE game_sessions SET status = 'playing', start_time = NOW(), end_time = NOW() + interval '" + duration + " minutes' WHERE id = $1",
                [sessionId]
            );
            // Confirm all pending reservations for this session (if any)
            await query("UPDATE reservations SET status = 'confirmed' WHERE session_id = $1 AND status = 'pending'", [sessionId]);
            await query('COMMIT');
            return { success: true };
        } catch (e) {
            await query('ROLLBACK');
            return fail(500, { error: 'Failed to start game' });
        }
    },

    applyPenaltyAdmin: async ({ request }) => {
        const data = await request.formData();
        const attendeeId = data.get('attendeeId');
        const points = parseInt(data.get('points')?.toString() || '1');

        if (!attendeeId) return fail(400, { error: 'Invalid ID' });

        const { applyPenalty } = await import('$lib/server/reservations');
        await applyPenalty(Number(attendeeId), points);
        return { success: true };
    },

    toggleBlacklist: async ({ request }) => {
        const sessionToken = request.headers.get('cookie')?.match(/admin_session=([^;]+)/)?.[1];
        if (!sessionToken || !(await verifyAdminSession(sessionToken))) return fail(403, { error: 'Unauthorized' });

        const data = await request.formData();
        const attendeeId = data.get('attendeeId');
        if (!attendeeId) return fail(400, { error: 'Invalid ID' });

        await query('UPDATE attendees SET is_blacklisted = NOT is_blacklisted WHERE id = $1', [attendeeId]);
        return { success: true };
    },

    toggleManager: async ({ request }) => {
        const sessionToken = request.headers.get('cookie')?.match(/admin_session=([^;]+)/)?.[1];
        if (!sessionToken || !(await verifyAdminSession(sessionToken))) return fail(403, { error: 'Unauthorized' });

        const data = await request.formData();
        const attendeeId = data.get('attendeeId');
        if (!attendeeId) return fail(400, { error: 'Invalid ID' });

        await query('UPDATE attendees SET can_manage_games = NOT can_manage_games WHERE id = $1', [attendeeId]);
        return { success: true };
    },

    joinGame: async ({ request, cookies }) => {
        const data = await request.formData();
        const sessionId = data.get('sessionId');
        const attendeeId = data.get('attendeeId');

        if (!sessionId || !attendeeId) return fail(400, { error: 'Invalid ID' });

        const sessionToken = cookies.get('admin_session');
        if (!sessionToken || !(await verifyAdminSession(sessionToken))) return fail(403, { error: 'Unauthorized' });

        const finalAttendeeId = parseInt(attendeeId.toString());

        // 0. Check if blacklisted or has too many penalties
        const attendeeInfo = await query('SELECT is_blacklisted, penalty_points FROM attendees WHERE id = $1', [finalAttendeeId]);
        if (attendeeInfo.rows.length > 0) {
            const { is_blacklisted, penalty_points } = attendeeInfo.rows[0];
            if (is_blacklisted) return fail(403, { error: '블랙리스트에 등록되어 예약이 불가능합니다.' });
            if (penalty_points >= 3) return fail(403, { error: '페널티 누적으로 인해 예약이 불가능합니다.' });
        }

        // 1. Check if already joined THIS session
        const existingParticipant = await query('SELECT 1 FROM session_participants WHERE session_id = $1 AND attendee_id = $2', [sessionId, finalAttendeeId]);
        if (existingParticipant.rows.length > 0) {
            return fail(400, { error: '이미 참여 중인 게임입니다.' });
        }

        // 2. Check if busy with OTHER games or reservations
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

        // 3. Join session
        await query('BEGIN');
        try {
            await query('INSERT INTO session_participants (session_id, attendee_id) VALUES ($1, $2)', [sessionId, finalAttendeeId]);
            await query("UPDATE reservations SET status = 'confirmed' WHERE session_id = $1 AND attendee_id = $2 AND status != 'cancelled'", [sessionId, finalAttendeeId]);
            await query('COMMIT');
        } catch (e) {
            await query('ROLLBACK');
            return fail(500, { error: 'Failed to join game' });
        }
        return { success: true };
    },
    addTable: async ({ request }) => {
        const data = await request.formData();
        const name = data.get('name')?.toString().trim();
        if (!name) return fail(400, { error: '테이블 이름을 입력해주세요.' });

        await query('INSERT INTO tables (name) VALUES ($1)', [name]);
        return { success: true };
    },

    removeTable: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id');
        if (!id) return fail(400, { error: 'Invalid ID' });

        await query('UPDATE tables SET is_active = false WHERE id = $1', [id]);
        return { success: true };
    }
};
