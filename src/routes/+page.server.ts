import { query } from '$lib/server/db';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { verifyAdminSession, verifyAttendeeSession } from '$lib/server/auth';
import { TitleService } from '$lib/server/services/titleService';
import { PartyService } from '$lib/server/services/partyService';
import { emitLiveEvent } from '$lib/server/liveEvents';

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

export const load: PageServerLoad = async ({ locals }) => {
    // hooks.server.ts에서 이미 설정된 인증 정보 사용 (중복 DB 호출 제거)
    const user = locals.user || null;
    const isAdmin = locals.isAdmin || false;

    // 독립적인 쿼리들을 병렬 실행
    const [
        attendeesResult,
        gamesResult,
        scheduledGamesResult,
        allGamesResult,
        reservationsResult,
        noticeResult,
        sysRes
    ] = await Promise.all([
        query(`
            SELECT a.id, a.name, v.arrival_time,
                   t.title_name,
                   EXISTS(SELECT 1 FROM session_participants sp JOIN game_sessions gs ON sp.session_id = gs.id WHERE sp.attendee_id = a.id AND gs.status = 'playing') as is_playing
            FROM visits v
            JOIN attendees a ON v.attendee_id = a.id
            LEFT JOIN minigame_user_points up ON a.id = up.user_id
            LEFT JOIN minigame_titles t ON up.equipped_title_id = t.id
            WHERE v.departure_time IS NULL
            ORDER BY v.arrival_time DESC
        `),
        query(`
            SELECT gs.id, gs.game_name, gs.end_time, gs.created_by, gs.party_id,
                   COALESCE(json_agg(json_build_object(
                       'id', COALESCE(a.id, -sp.id),
                       'name', COALESCE(a.name, sp.guest_name),
                       'title_name', t.title_name,
                       'is_guest', (sp.attendee_id IS NULL)
                   )) FILTER (WHERE sp.id IS NOT NULL), '[]') as players
            FROM game_sessions gs
            LEFT JOIN session_participants sp ON gs.id = sp.session_id
            LEFT JOIN attendees a ON sp.attendee_id = a.id
            LEFT JOIN minigame_user_points up ON a.id = up.user_id
            LEFT JOIN minigame_titles t ON up.equipped_title_id = t.id
            WHERE gs.status = 'playing'
            GROUP BY gs.id, gs.game_name, gs.end_time, gs.created_by, gs.party_id
            ORDER BY gs.end_time ASC
        `),
        query(`
            SELECT gs.id, gs.game_name, gs.game_id, gs.min_players, gs.max_players, gs.scheduled_at, gs.created_by, gs.party_id, g.image_url,
                   COALESCE(json_agg(json_build_object(
                       'id', COALESCE(a.id, -sp.id),
                       'name', COALESCE(a.name, sp.guest_name),
                       'title_name', t.title_name,
                       'is_guest', (sp.attendee_id IS NULL)
                   )) FILTER (WHERE sp.id IS NOT NULL), '[]') as participants
            FROM game_sessions gs
            LEFT JOIN session_participants sp ON gs.id = sp.session_id
            LEFT JOIN attendees a ON sp.attendee_id = a.id
            LEFT JOIN games g ON gs.game_id = g.id
            LEFT JOIN minigame_user_points up ON a.id = up.user_id
            LEFT JOIN minigame_titles t ON up.equipped_title_id = t.id
            WHERE gs.status = 'scheduled'
            GROUP BY gs.id, gs.game_name, gs.game_id, gs.min_players, gs.max_players, gs.scheduled_at, gs.created_by, gs.party_id, g.image_url
            ORDER BY gs.scheduled_at ASC
        `),
        query('SELECT id, name, min_players, max_players, playtime_min, image_url FROM games ORDER BY name ASC'),
        query(`
            SELECT r.id, r.session_id, r.game_id, r.attendee_id, r.status, a.name as attendee_name,
                   COALESCE(g.name, gs.game_name) as game_name
            FROM reservations r
            JOIN attendees a ON r.attendee_id = a.id
            LEFT JOIN games g ON r.game_id = g.id
            LEFT JOIN game_sessions gs ON r.session_id = gs.id
            WHERE r.status != 'cancelled'
        `),
        query('SELECT content FROM notices WHERE is_active = true ORDER BY created_at DESC LIMIT 1'),
        query("SELECT value FROM system_settings WHERE key = 'is_open'")
    ]);

    const notice = noticeResult.rows[0]?.content || null;
    const isOpen = sysRes.rows[0]?.value !== 'false';

    // 유저별 데이터도 병렬로 조회
    let userPenaltyInfo = null;
    let userReservation = null;
    let userScheduledGames: any[] = [];
    let userPlayingGame = null;
    let parties: any[] = [];
    let userPartyIds: number[] = [];

    if (user) {
        try {
            const [userStatusRes, titleRes, resResult, schedResult, playingResult, partiesResult, partyMembershipResult] = await Promise.all([
                query('SELECT can_manage_games, penalty_points, is_blacklisted FROM attendees WHERE id = $1', [user.id]),
                TitleService.getUserTitle(user.id),
                query(`
                    SELECT r.*, gs.game_name, gs.status as session_status, gs.scheduled_at
                    FROM reservations r
                    JOIN game_sessions gs ON r.session_id = gs.id
                    WHERE r.attendee_id = $1 AND r.status IN ('pending', 'waitlisted', 'confirmed')
                    LIMIT 1
                `, [user.id]),
                query(`
                    SELECT gs.*
                    FROM game_sessions gs
                    JOIN session_participants sp ON gs.id = sp.session_id
                    WHERE sp.attendee_id = $1 AND gs.status = 'scheduled'
                    ORDER BY gs.scheduled_at ASC
                `, [user.id]),
                query(`
                    SELECT gs.id, gs.game_name
                    FROM session_participants sp
                    JOIN game_sessions gs ON sp.session_id = gs.id
                    WHERE sp.attendee_id = $1 AND gs.status = 'playing'
                `, [user.id]),
                PartyService.getUserParties(user.id),
                query('SELECT party_id FROM game_party_members WHERE attendee_id = $1', [user.id])
            ]);

            if (userStatusRes.rows.length > 0) {
                user.can_manage_games = userStatusRes.rows[0].can_manage_games;
            }
            if (titleRes) {
                (user as any).title = titleRes;
            }
            userReservation = resResult.rows[0] || null;
            userScheduledGames = schedResult.rows;
            userPlayingGame = playingResult.rows[0] || null;
            parties = partiesResult;
            userPartyIds = partyMembershipResult.rows.map((r: any) => r.party_id);
        } catch (e) {}
    }

    return {
        attendees: attendeesResult.rows,
        games: gamesResult.rows,
        scheduledGames: scheduledGamesResult.rows,
        user,
        isAdmin,
        isOpen,
        notice,
        userPenaltyInfo,
        userReservation,
        userScheduledGames,
        userPlayingGame,
        allGames: allGamesResult.rows,
        reservations: reservationsResult.rows,
        parties,
        userPartyIds,
    };
};

export const actions: Actions = {
    reserveGame: async ({ request, cookies }) => {
        try {
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
                    attendeeId = user.id.toString();
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

            // Get game info to determine status default
            const gameInfo = await query('SELECT status, party_id FROM game_sessions WHERE id = $1', [sessionId]);
            if (gameInfo.rows.length === 0) return fail(404, { error: '게임을 찾을 수 없습니다.' });
            const gameStatus = gameInfo.rows[0].status;

            // Check party restriction
            if (gameInfo.rows[0].party_id) {
                const isMember = await PartyService.isPartyMember(gameInfo.rows[0].party_id, parseInt(attendeeId as string));
                if (!isMember) {
                    return fail(403, { error: '고정팟 전용 게임입니다. 팟 멤버만 참여할 수 있습니다.' });
                }
            }

            // 1. Check if already playing or reserved OR Requested
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
                AND r.status IN ('pending', 'waitlisted', 'confirmed', 'pending_approval')
                AND (
                    gs.status = 'playing' 
                    OR (gs.status = 'scheduled' AND gs.scheduled_at::date = CURRENT_DATE)
                )
            `, [attendeeId]);

            if (busyCheck.rows.length > 0) {
                 // If trying to join the SAME game, show specific error
                 const sameGameCheck = await query(`
                    SELECT 1 FROM session_participants WHERE session_id = $1 AND attendee_id = $2
                    UNION
                    SELECT 1 FROM reservations WHERE session_id = $1 AND attendee_id = $2 AND status IN ('pending_approval', 'confirmed')
                 `, [sessionId, attendeeId]);
                 
                 if (sameGameCheck.rows.length > 0) {
                     return fail(400, { error: '이미 참여 중이거나 요청을 보냈습니다.' });
                 }

                return fail(400, { error: '오늘 진행 중이거나 예약된 게임이 있어 예약(요청)할 수 없습니다.' });
            }

            // 2. Create reservation
            const status = gameStatus === 'playing' ? 'pending_approval' : 'confirmed';

            await query(
                'INSERT INTO reservations (session_id, attendee_id, status) VALUES ($1, $2, $3)',
                [sessionId, attendeeId, status]
            );

            emitLiveEvent('games');
            return { success: true };
        } catch (e: any) {
            console.error('reserveGame Error:', e);
            return fail(500, { error: e.message || '예약 처리 중 오류가 발생했습니다.' });
        }
    },

    createScheduledGame: async ({ request, cookies }) => {
        const data = await request.formData();
        const gameName = data.get('gameName')?.toString();
        const scheduledAt = data.get('scheduledAt')?.toString();
        const minPlayers = parseInt(data.get('minPlayers')?.toString() || '2');
        const maxPlayers = parseInt(data.get('maxPlayers')?.toString() || '4');
        const guestCount = parseInt(data.get('guestCount')?.toString() || '0');
        const playerIds = data.getAll('players').map(p => p.toString()).filter(p => p);
        const partyId = data.get('partyId') ? parseInt(data.get('partyId') as string) : null;
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
        if (guestCount > maxPlayers - 1) return fail(400, { error: `게스트 수가 최대 인원(${maxPlayers}명, 본인 포함)을 초과할 수 없습니다.` });

        // 2. Create scheduled session
        await query('BEGIN');
        try {
            const sessionResult = await query(
                'INSERT INTO game_sessions (game_name, status, scheduled_at, min_players, max_players, created_by, party_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
                [gameName, 'scheduled', scheduledAt, minPlayers, maxPlayers, creatorId, partyId]
            );
            const newSessionId = sessionResult.rows[0].id;

            if (creatorId) {
                await query('INSERT INTO session_participants (session_id, attendee_id) VALUES ($1, $2)', [newSessionId, creatorId]);
            }
            for (const playerId of playerIds) {
                if (playerId !== creatorId?.toString()) {
                    await query('INSERT INTO session_participants (session_id, attendee_id) VALUES ($1, $2)', [newSessionId, playerId]);
                }
            }
            for (let i = 1; i <= guestCount; i++) {
                await query('INSERT INTO session_participants (session_id, attendee_id, guest_name) VALUES ($1, NULL, $2)', [newSessionId, `게스트${i}`]);
            }

            await query('COMMIT');
            emitLiveEvent('games');
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
        // 0.5. Get target session info to check date
        const targetSession = await query('SELECT scheduled_at, party_id FROM game_sessions WHERE id = $1', [sessionId]);
        if (targetSession.rows.length === 0) {
            return fail(404, { error: '세션을 찾을 수 없습니다.' });
        }
        const targetDate = targetSession.rows[0].scheduled_at;

        // Check party restriction
        if (targetSession.rows[0].party_id) {
            const isMember = await PartyService.isPartyMember(targetSession.rows[0].party_id, finalAttendeeId);
            if (!isMember) {
                return fail(403, { error: '고정팟 전용 게임입니다. 팟 멤버만 참여할 수 있습니다.' });
            }
        }

        // 1. Check if already joined THIS session
        const existingParticipant = await query('SELECT 1 FROM session_participants WHERE session_id = $1 AND attendee_id = $2', [sessionId, finalAttendeeId]);
        if (existingParticipant.rows.length > 0) {
            return fail(400, { error: '이미 참여 중인 게임입니다.' });
        }

        // 2. Check if busy with OTHER games or reservations ON THE SAME DAY
        // Logic:
        // - If I am PLAYING a game (status='playing'), that counts as TODAY.
        // - If target game is TODAY, and I am playing, then CONFLICT.
        // - If target game is FUTURE, and I am playing today, NO CONFLICT.
        // - If I have a scheduled game/reservation, check if it falls on the SAME DATE as targetDate.
        
        const busyCheck = await query(`
            SELECT 1 FROM session_participants sp
            JOIN game_sessions gs ON sp.session_id = gs.id
            WHERE sp.attendee_id = $1 
            AND gs.id != $2
            AND (
                (gs.status = 'playing' AND $3::date = CURRENT_DATE) -- Conflict if playing AND target is today
                OR 
                (gs.status = 'scheduled' AND gs.scheduled_at::date = $3::date) -- Conflict if scheduled on same date
            )
            UNION
            SELECT 1 FROM reservations r
            JOIN game_sessions gs ON r.session_id = gs.id
            WHERE r.attendee_id = $1 
            AND r.status IN ('pending', 'waitlisted', 'confirmed') 
            AND r.session_id != $2
            AND (
                (gs.status = 'playing' AND $3::date = CURRENT_DATE)
                OR
                (gs.status = 'scheduled' AND gs.scheduled_at::date = $3::date)
            )
        `, [finalAttendeeId, sessionId, targetDate]);

        if (busyCheck.rows.length > 0) {
            return fail(400, { error: '해당 날짜에 이미 다른 게임에 참여 중이거나 예약된 내역이 있습니다.' });
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
            emitLiveEvent('games');
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
        emitLiveEvent('games');
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

        emitLiveEvent('games');
        return { success: true };
    },

    createGame: async ({ request }) => {
        const data = await request.formData();
        const gameName = data.get('gameName')?.toString();
        const gameId = data.get('gameId') ? parseInt(data.get('gameId') as string) : null;
        const duration = parseInt(data.get('duration')?.toString() || '0');
        let playerIds = data.getAll('players').map(p => p.toString());
        const guestCount = parseInt(data.get('guestCount')?.toString() || '0');
        const partyId = data.get('partyId') ? parseInt(data.get('partyId') as string) : null;

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

        if (!gameName || duration <= 0 || (playerIds.length === 0 && guestCount === 0)) {
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
                `INSERT INTO game_sessions (game_name, game_id, status, start_time, end_time, created_by, party_id)
                 VALUES ($1, $2, 'playing', NOW(), NOW() + ($3 || ' minutes')::INTERVAL, $4, $5)
                 RETURNING id`,
                [gameName, gameId, duration, creatorId, partyId]
            );
            const newGameId = sessionResult.rows[0].id;

            for (const playerId of playerIds) {
                await query('INSERT INTO session_participants (session_id, attendee_id) VALUES ($1, $2)', [newGameId, playerId]);
            }
            for (let i = 1; i <= guestCount; i++) {
                await query('INSERT INTO session_participants (session_id, attendee_id, guest_name) VALUES ($1, NULL, $2)', [newGameId, `게스트${i}`]);
            }
            await query('COMMIT');
            emitLiveEvent('games');
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

            // Separate regular winners (positive IDs) from guest winners (negative IDs)
            const regularWinnerIds = winnerIds.filter(wid => parseInt(wid) > 0);
            const guestWinnerSpIds = winnerIds.filter(wid => parseInt(wid) < 0).map(wid => Math.abs(parseInt(wid)));

            if (regularWinnerIds.length > 0) {
                await query('UPDATE session_participants SET is_winner = true WHERE session_id = $1 AND attendee_id = ANY($2)', [id, regularWinnerIds]);
            }
            if (guestWinnerSpIds.length > 0) {
                await query('UPDATE session_participants SET is_winner = true WHERE session_id = $1 AND id = ANY($2)', [id, guestWinnerSpIds]);
            }
            for (const [participantId, score] of Object.entries(scores)) {
                const numId = parseInt(participantId);
                if (numId > 0) {
                    await query('UPDATE session_participants SET score = $1 WHERE session_id = $2 AND attendee_id = $3', [score, id, participantId]);
                } else {
                    // Guest: negative ID represents session_participants.id
                    await query('UPDATE session_participants SET score = $1 WHERE session_id = $2 AND id = $3', [score, id, Math.abs(numId)]);
                }
            }
            await query('COMMIT');
            emitLiveEvent('games');
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
            emitLiveEvent('games');
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
            emitLiveEvent('games');
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
            emitLiveEvent('games');
            return { success: true };
        } catch (e) {
            await query('ROLLBACK');
            return fail(500, { error: 'Failed to start game' });
        }
    },



    approveJoinRequest: async ({ request, cookies }) => {
        const data = await request.formData();
        const reservationId = data.get('reservationId');
        const userSessionToken = cookies.get('user_session');

        if (!userSessionToken) return fail(401, { error: '로그인이 필요합니다.' });
        const user = await verifyAttendeeSession(userSessionToken);
        if (!user) return fail(401, { error: 'Invalid session' });
        
        // 1. Get Reservation Info
        const resInfo = await query('SELECT session_id, status FROM reservations WHERE id = $1', [reservationId]);
        if (resInfo.rows.length === 0) return fail(404, { error: '요청을 찾을 수 없습니다.' });
        const { session_id, status } = resInfo.rows[0];

        // 2. Concurrency Check: Status must be 'pending_approval'
        if (status !== 'pending_approval') {
             return fail(400, { error: '이미 처리된 요청입니다.' });
        }

        // 3. Authorization: Host OR Participant
        // Check if user is Host (Manager and Creator check inside canModifyGame logic usually, but here manually)
        // OR check if user is in session_participants
        const isParticipant = await query('SELECT 1 FROM session_participants WHERE session_id = $1 AND attendee_id = $2', [session_id, user.id]);
        
        let authorized = false;
        if (isParticipant.rows.length > 0) {
            authorized = true;
        } else {
             // Fallback to canModifyGame logic manually or use the helper if it fits. 
             // canModifyGame uses `request` via `locals` usually but our verifyAttendeeSession returns user.
             // We can check if user is admin (assuming verifyAttendeeSession doesn't return admin flags directly unless we changed it).
             // Let's assume admins can also approve.
             // Simplest check: Is this user the creator? (We need to fetch game creator)
             const gameInfo = await query('SELECT created_by FROM game_sessions WHERE id = $1', [session_id]);
             if (gameInfo.rows.length > 0 && gameInfo.rows[0].created_by === user.id && user.can_manage_games) {
                 authorized = true;
             }
             // Admin check might need extra info, but participants cover 99% of cases for "Peer Approval".
             // If we really want "Admins" too, we need that info. 
             // But the requirement specifically asked for "Participants".
        }

        if (!authorized) return fail(403, { error: '승인 권한이 없습니다. 게임 참여자만 승인할 수 있습니다.' });

        await query('BEGIN');
        try {
            // Re-check status inside transaction to be safe? 
            // Or rely on UPDATE returning rows.
            const r = await query("UPDATE reservations SET status = 'confirmed' WHERE id = $1 AND status = 'pending_approval' RETURNING attendee_id, session_id", [reservationId]);
            if (r.rows.length > 0) {
                const { attendee_id, session_id } = r.rows[0];
                await query('INSERT INTO session_participants (session_id, attendee_id) VALUES ($1, $2)', [session_id, attendee_id]);
                await query('COMMIT');
                emitLiveEvent('games');
                return { success: true };
            } else {
                await query('ROLLBACK');
                return fail(400, { error: '이미 처리되었거나 유효하지 않은 요청입니다.' });
            }
        } catch (e) {
            await query('ROLLBACK');
            return fail(500, { error: 'Failed' });
        }
    },

    rejectJoinRequest: async ({ request, cookies }) => {
        const data = await request.formData();
        const reservationId = data.get('reservationId');
        const sessionToken = cookies.get('admin_session');
        const isAdmin = sessionToken ? await verifyAdminSession(sessionToken) : false;
        const userSessionToken = cookies.get('user_session');

        // Check perms
        const resInfo = await query('SELECT session_id, status FROM reservations WHERE id = $1', [reservationId]);
        if (resInfo.rows.length === 0) return fail(404, { error: '요청을 찾을 수 없습니다.' });
        const { session_id, status } = resInfo.rows[0];

        // Concurrency Check
        if (status !== 'pending_approval') {
             return fail(400, { error: '이미 처리된 요청입니다.' });
        }

        let authorized = false;
        if (isAdmin) {
             authorized = true;
        } else if (userSessionToken) {
             const user = await verifyAttendeeSession(userSessionToken);
             if (user) {
                  // Check if host
                  if (await canModifyGame(request, session_id)) {
                       authorized = true;
                  } else {
                       // Check if participant
                       const isParticipant = await query('SELECT 1 FROM session_participants WHERE session_id = $1 AND attendee_id = $2', [session_id, user.id]);
                       if (isParticipant.rows.length > 0) {
                            authorized = true;
                       }
                  }
             }
        }

        if (!authorized) return fail(403, { error: '권한이 없습니다.' });

        await query("UPDATE reservations SET status = 'cancelled' WHERE id = $1 AND status = 'pending_approval'", [reservationId]);
        return { success: true };
    },

    leavePlayingGame: async ({ request, cookies }) => {
        const data = await request.formData();
        const sessionId = data.get('sessionId');
        const userSessionToken = cookies.get('user_session');

        if (!userSessionToken) return fail(401, { error: '로그인이 필요합니다.' });
        const user = await verifyAttendeeSession(userSessionToken);
        if (!user) return fail(401, { error: 'Invalid session' });

        // Check verification (min 2 registered players, excluding guests)
        const countRes = await query('SELECT COUNT(*) as cnt FROM session_participants WHERE session_id = $1 AND attendee_id IS NOT NULL', [sessionId]);
        const playerCount = parseInt(countRes.rows[0].cnt, 10);

        if (playerCount <= 2) {
            return fail(400, { error: '게임 최소 인원(2명) 유지를 위해 나갈 수 없습니다.' });
        }

        await query('DELETE FROM session_participants WHERE session_id = $1 AND attendee_id = $2', [sessionId, user.id]);
        emitLiveEvent('games');
        return { success: true };
    },


};
