import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { verifyAdminSession, verifyAttendeeSession } from '$lib/server/auth';
import { updateSettingsCache, markAllLeft } from '$lib/server/ble';
import { emitLiveEvent } from '$lib/server/liveEvents';

async function canModifyGame(request: Request, gameId: string | number): Promise<boolean> {
    const sessionToken = request.headers.get('cookie')?.match(/admin_session=([^;]+)/)?.[1];
    if (sessionToken && await verifyAdminSession(sessionToken)) return true;

    const userSessionToken = request.headers.get('cookie')?.match(/user_session=([^;]+)/)?.[1];
    if (!userSessionToken) return false;

    try {
        const user = await verifyAttendeeSession(userSessionToken);
        if (!user || !user.can_manage_games) return false;

        const res = await db.execute(sql`SELECT created_by FROM game_sessions WHERE id = ${gameId}`);
        if (res.length === 0) return false;

        return (res[0] as any).created_by === user.id;
    } catch (e) {
        return false;
    }
}

export const load: PageServerLoad = async () => {
    const [attendeesResult, historyResult, gamesResult, scheduledGamesResult, reservationsResult, gameNamesResult, noticeResult, allGamesResult, settingsResult, recurringSchedulesResult, dailyVisitPlansResult, todayScheduledParticipantsResult] = await Promise.all([
        db.execute(sql`
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
        `),
        db.execute(sql`
            SELECT id, name, penalty_points, is_blacklisted
            FROM attendees
            ORDER BY name ASC
        `),
        db.execute(sql`
            SELECT gs.*, g.image_url,
                COALESCE(json_agg(json_build_object(
                    'id', COALESCE(a.id, -sp.id),
                    'name', COALESCE(a.name, sp.guest_name),
                    'is_guest', (sp.attendee_id IS NULL)
                )) FILTER (WHERE sp.id IS NOT NULL), '[]') as players
            FROM game_sessions gs
            LEFT JOIN session_participants sp ON gs.id = sp.session_id
            LEFT JOIN attendees a ON sp.attendee_id = a.id
            LEFT JOIN games g ON gs.game_id = g.id
            WHERE gs.status = 'playing'
            GROUP BY gs.id, g.image_url
            ORDER BY gs.start_time DESC
        `),
        db.execute(sql`
            SELECT gs.id, gs.game_name, gs.game_id, gs.min_players, gs.max_players, gs.scheduled_at, g.image_url,
                   COALESCE(json_agg(json_build_object(
                       'id', COALESCE(a.id, -sp.id),
                       'name', COALESCE(a.name, sp.guest_name),
                       'is_guest', (sp.attendee_id IS NULL)
                   )) FILTER (WHERE sp.id IS NOT NULL), '[]') as participants
            FROM game_sessions gs
            LEFT JOIN session_participants sp ON gs.id = sp.session_id
            LEFT JOIN attendees a ON sp.attendee_id = a.id
            LEFT JOIN games g ON gs.game_id = g.id
            WHERE gs.status = 'scheduled'
            GROUP BY gs.id, gs.game_name, gs.game_id, gs.min_players, gs.max_players, gs.scheduled_at, g.image_url
            ORDER BY gs.scheduled_at ASC
        `),
        db.execute(sql`
            SELECT r.*, a.name as attendee_name, gs.game_name
            FROM reservations r
            JOIN attendees a ON r.attendee_id = a.id
            JOIN game_sessions gs ON r.session_id = gs.id
            WHERE r.status IN ('pending', 'waitlisted', 'confirmed')
            ORDER BY r.created_at ASC
        `),
        db.execute(sql`
            SELECT DISTINCT ON (game_name)
                game_name,
                ROUND(EXTRACT(EPOCH FROM (end_time - start_time))/60) as duration
            FROM game_sessions
            ORDER BY game_name, start_time DESC
        `),
        db.execute(sql`SELECT content FROM notices WHERE is_active = true ORDER BY created_at DESC LIMIT 1`),
        db.execute(sql`SELECT id, name, playtime_min, min_players, max_players, image_url FROM games WHERE is_active = true ORDER BY name ASC`),
        db.execute(sql`SELECT key, value FROM system_settings`),
        db.execute(sql`
            SELECT rs.*,
                (SELECT COUNT(*) FROM recurring_game_skips rsk WHERE rsk.recurring_schedule_id = rs.id) as skip_count,
                EXISTS(
                    SELECT 1 FROM recurring_game_skips rsk
                    WHERE rsk.recurring_schedule_id = rs.id
                      AND rsk.skip_date = (
                          CURRENT_DATE + ((rs.day_of_week - EXTRACT(DOW FROM CURRENT_DATE)::int + 7) % 7) * INTERVAL '1 day'
                      )::date
                ) as is_skipped_this_week
            FROM recurring_game_schedules rs
            ORDER BY rs.is_active DESC, rs.day_of_week ASC, rs.scheduled_time ASC
        `),
        db.execute(sql`
            SELECT dvp.id, dvp.attendee_id, a.name, dvp.planned_time,
                   t.title_name
            FROM daily_visit_plans dvp
            JOIN attendees a ON dvp.attendee_id = a.id
            LEFT JOIN minigame_user_points up ON a.id = up.user_id
            LEFT JOIN minigame_titles t ON up.equipped_title_id = t.id
            WHERE dvp.plan_date = CURRENT_DATE
            ORDER BY dvp.created_at ASC
        `),
        db.execute(sql`
            SELECT DISTINCT ON (sp.attendee_id) sp.attendee_id, a.name, t.title_name,
                   gs.party_id IS NOT NULL as is_party,
                   TO_CHAR(gs.scheduled_at AT TIME ZONE 'Asia/Seoul', 'HH24:MI') as planned_time
            FROM session_participants sp
            JOIN game_sessions gs ON sp.session_id = gs.id
            JOIN attendees a ON sp.attendee_id = a.id
            LEFT JOIN minigame_user_points up ON a.id = up.user_id
            LEFT JOIN minigame_titles t ON up.equipped_title_id = t.id
            WHERE gs.status = 'scheduled'
              AND gs.scheduled_at::date = (NOW() AT TIME ZONE 'Asia/Seoul')::date
              AND sp.attendee_id IS NOT NULL
            ORDER BY sp.attendee_id, gs.scheduled_at ASC
        `),
    ]);

    const presentNames = new Set((attendeesResult as any[]).map((a: any) => a.name));
    const savedMembers = (historyResult as any[])
        .filter((r: any) => !presentNames.has(r.name))
        .map((r: any) => ({ id: r.id, name: r.name, penalty_points: r.penalty_points, is_blacklisted: r.is_blacklisted }));

    const settings = (settingsResult as any[]).reduce((acc: any, row: any) => {
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
        attendees: attendeesResult as any[],
        allUsers: historyResult as any[],
        savedMembers,
        games: gamesResult as any[],
        scheduledGames: scheduledGamesResult as any[],
        reservations: reservationsResult as any[],
        savedGameNames: gameNamesResult as any[],
        allGames: allGamesResult as any[],
        notice: (noticeResult[0] as any)?.content || null,
        settings,
        recurringSchedules: recurringSchedulesResult as any[],
        dailyVisitPlans: dailyVisitPlansResult as any[],
        todayScheduledParticipants: todayScheduledParticipantsResult as any[]
    };
};

export const actions: Actions = {
    addAttendee: async ({ request }) => {
        const data = await request.formData();
        const name = data.get('name')?.toString().trim();

        if (!name) {
            return fail(400, { error: '이름을 입력해주세요.' });
        }

        // Ensure is_open is true
        await db.execute(sql`INSERT INTO system_settings (key, value) VALUES ('is_open', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true'`);
        updateSettingsCache(true);

        // 1. Check if ANY attendee with this name exists
        const existingResult = await db.execute(sql`SELECT * FROM attendees WHERE name = ${name} ORDER BY id DESC`);

        // Check if ANY of them are currently present
        const alreadyPresent = (existingResult as any[]).find((a: any) => a.status === 'present');
        if (alreadyPresent) {
            return fail(400, { error: '이미 참여 중인 인원입니다.' });
        }

        if (existingResult.length > 0) {
            // User exists but is not present. Reuse the most recent record
            const attendeeToReactivate = existingResult[0] as any;

            await db.transaction(async (tx) => {
                await tx.execute(sql`UPDATE attendees SET status = 'present', arrival_time = NOW(), updated_at = NOW() WHERE id = ${attendeeToReactivate.id}`);
                await tx.execute(sql`INSERT INTO visits (attendee_id, arrival_time) VALUES (${attendeeToReactivate.id}, NOW())`);
                await tx.execute(sql`DELETE FROM daily_visit_plans WHERE attendee_id = ${attendeeToReactivate.id} AND plan_date = CURRENT_DATE`);
            });
        } else {
            // New Entry: Create attendee and Add visit
            await db.transaction(async (tx) => {
                const result = await tx.execute(sql`INSERT INTO attendees (name, status, arrival_time) VALUES (${name}, 'present', NOW()) RETURNING id`);
                const newId = (result[0] as any).id;
                await tx.execute(sql`INSERT INTO visits (attendee_id, arrival_time) VALUES (${newId}, NOW())`);
            });
        }
        emitLiveEvent('visitors');
    },

    removeAttendee: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id');
        const endGame = data.get('endGame') === 'true';
        const gameId = data.get('gameId');

        if (!id) return fail(400, { error: 'Invalid ID' });

        try {
            await db.transaction(async (tx) => {
                // 1. Update Attendee Status
                await tx.execute(sql`UPDATE attendees SET status = 'left', updated_at = NOW() WHERE id = ${id}`);

                // 2. Close current visit
                await tx.execute(sql`UPDATE visits SET departure_time = NOW() WHERE attendee_id = ${id} AND departure_time IS NULL`);

                // 3. End Game if requested
                if (endGame && gameId) {
                    await tx.execute(sql`UPDATE game_sessions SET status = 'finished', end_time = NOW() WHERE id = ${gameId}`);
                }
            });
            emitLiveEvent('visitors');
            if (endGame && gameId) emitLiveEvent('games');
        } catch (e) {
            return fail(500, { error: 'Failed to remove attendee' });
        }
    },

    createGame: async ({ request }) => {
        const data = await request.formData();
        const gameName = data.get('gameName')?.toString();
        const gameId = data.get('gameId') ? parseInt(data.get('gameId') as string) : null;
        const duration = parseInt(data.get('duration')?.toString() || '0');
        const playerIds = data.getAll('players').map(p => p.toString());
        const guestCount = parseInt(data.get('guestCount')?.toString() || '0');

        if (!gameName || duration <= 0 || (playerIds.length === 0 && guestCount === 0)) {
            return fail(400, { missing: true });
        }

        try {
            const result = await db.transaction(async (tx) => {
                // Check if any player is already playing
                const playingCheck = await tx.execute(sql`
                    SELECT a.name
                    FROM session_participants sp
                    JOIN game_sessions gs ON sp.session_id = gs.id
                    JOIN attendees a ON sp.attendee_id = a.id
                    WHERE gs.status = 'playing' AND sp.attendee_id = ANY(${'{' + playerIds.join(',') + '}'}::int[])
                `);

                if (playingCheck.length > 0) {
                    const busyPlayers = (playingCheck as any[]).map((r: any) => r.name).join(', ');
                    return { error: `다음 인원은 이미 게임 중입니다: ${busyPlayers}` };
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
                const sessionResult = await tx.execute(sql`
                    INSERT INTO game_sessions (game_name, game_id, status, start_time, end_time, created_by)
                    VALUES (${gameName}, ${gameId}, 'playing', NOW(), NOW() + (${duration} || ' minutes')::INTERVAL, ${createdBy})
                    RETURNING id
                `);
                const newGameId = (sessionResult[0] as any).id;

                for (const playerId of playerIds) {
                    await tx.execute(sql`INSERT INTO session_participants (session_id, attendee_id) VALUES (${newGameId}, ${playerId})`);
                }
                for (let i = 1; i <= guestCount; i++) {
                    await tx.execute(sql`INSERT INTO session_participants (session_id, attendee_id, guest_name) VALUES (${newGameId}, NULL, ${`게스트${i}`})`);
                }
                return { success: true };
            });
            if ('error' in result) return fail(400, result);
            emitLiveEvent('games');
        } catch (error) {
            console.error('Failed to create game:', error);
            return fail(500, { error: 'Failed to create game' });
        }
    },
    endGame: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id')?.toString();

        if (!id) return fail(400, { missing: true });
        if (!(await canModifyGame(request, id))) return fail(403, { error: 'Unauthorized' });

        const winnerIds = data.getAll('winnerIds').map(id => id.toString());

        // Process scores
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
            await db.transaction(async (tx) => {
                await tx.execute(sql`UPDATE game_sessions SET status = 'finished', end_time = NOW() WHERE id = ${id}`);

                // Separate regular winners (positive IDs) from guest winners (negative IDs)
                const regularWinnerIds = winnerIds.filter(wid => parseInt(wid) > 0);
                const guestWinnerSpIds = winnerIds.filter(wid => parseInt(wid) < 0).map(wid => Math.abs(parseInt(wid)));

                if (regularWinnerIds.length > 0) {
                    await tx.execute(sql`UPDATE session_participants SET is_winner = true WHERE session_id = ${id} AND attendee_id = ANY(${'{' + regularWinnerIds.join(',') + '}'}::int[])`);
                }
                if (guestWinnerSpIds.length > 0) {
                    await tx.execute(sql`UPDATE session_participants SET is_winner = true WHERE session_id = ${id} AND id = ANY(${'{' + guestWinnerSpIds.join(',') + '}'}::int[])`);
                }

                // Update scores
                for (const [participantId, score] of Object.entries(scores)) {
                    const numId = parseInt(participantId);
                    if (numId > 0) {
                        await tx.execute(sql`UPDATE session_participants SET score = ${score} WHERE session_id = ${id} AND attendee_id = ${participantId}`);
                    } else {
                        await tx.execute(sql`UPDATE session_participants SET score = ${score} WHERE session_id = ${id} AND id = ${Math.abs(numId)}`);
                    }
                }
            });
            emitLiveEvent('games');
        } catch (error) {
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
            await db.transaction(async (tx) => {
                await tx.execute(sql`UPDATE notices SET is_active = false`);
                await tx.execute(sql`INSERT INTO notices (content) VALUES (${content})`);
            });
        } catch (error) {
            return fail(500, { error: 'Failed to update notice' });
        }
    },
    clearNotice: async () => {
        try {
            await db.execute(sql`UPDATE notices SET is_active = false`);
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
            await db.execute(sql`
                UPDATE game_sessions SET end_time = end_time + ${minutes + ' minutes'}::INTERVAL WHERE id = ${id}
            `);
            emitLiveEvent('games');
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
            await db.transaction(async (tx) => {
                if (weekday) await tx.execute(sql`INSERT INTO system_settings (key, value) VALUES ('closing_time_weekday', ${weekday}) ON CONFLICT (key) DO UPDATE SET value = ${weekday}`);
                if (weekend) await tx.execute(sql`INSERT INTO system_settings (key, value) VALUES ('closing_time_weekend', ${weekend}) ON CONFLICT (key) DO UPDATE SET value = ${weekend}`);
                if (weekendDays !== undefined) await tx.execute(sql`INSERT INTO system_settings (key, value) VALUES ('weekend_days', ${weekendDays}) ON CONFLICT (key) DO UPDATE SET value = ${weekendDays}`);
                if (noShowLimit) await tx.execute(sql`INSERT INTO system_settings (key, value) VALUES ('no_show_limit_minutes', ${noShowLimit}) ON CONFLICT (key) DO UPDATE SET value = ${noShowLimit}`);
                if (autoDissolveLimit) await tx.execute(sql`INSERT INTO system_settings (key, value) VALUES ('auto_dissolve_limit_minutes', ${autoDissolveLimit}) ON CONFLICT (key) DO UPDATE SET value = ${autoDissolveLimit}`);
                if (penaltyThreshold) await tx.execute(sql`INSERT INTO system_settings (key, value) VALUES ('penalty_threshold', ${penaltyThreshold}) ON CONFLICT (key) DO UPDATE SET value = ${penaltyThreshold}`);
            });
        } catch (error) {
            return fail(500, { error: 'Failed to update settings' });
        }
    },
    closeDay: async () => {
        try {
            await db.transaction(async (tx) => {
                // Calculate business date (before 9AM KST = previous day)
                const now = new Date();
                const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
                const currentHour = kstNow.getUTCHours();
                let businessDateObj = new Date(kstNow);
                if (currentHour < 9) {
                    businessDateObj.setUTCDate(businessDateObj.getUTCDate() - 1);
                }
                const businessDate = businessDateObj.toISOString().split('T')[0];

                // Checkout all active visits
                await tx.execute(sql`UPDATE visits SET departure_time = NOW() WHERE departure_time IS NULL`);
                // Set all attendees to 'left'
                await tx.execute(sql`UPDATE attendees SET status = 'left' WHERE status = 'present'`);
                // End all active games
                await tx.execute(sql`UPDATE game_sessions SET status = 'finished', end_time = NOW() WHERE status = 'playing'`);
                // Cancel scheduled games for this business day only
                await tx.execute(sql`UPDATE game_sessions SET status = 'finished' WHERE status = 'scheduled' AND scheduled_at::date = ${businessDate}::date`);
                // Set is_open to false
                await tx.execute(sql`INSERT INTO system_settings (key, value) VALUES ('is_open', 'false') ON CONFLICT (key) DO UPDATE SET value = 'false'`);
                updateSettingsCache(false);
                markAllLeft();

                // Record business date to prevent auto-close from re-triggering if reopened
                await tx.execute(sql`INSERT INTO system_settings (key, value) VALUES ('last_auto_close_date', ${businessDate}) ON CONFLICT (key) DO UPDATE SET value = ${businessDate}`);
            });
            emitLiveEvent('visitors');
            emitLiveEvent('games');
        } catch (error) {
            return fail(500, { error: 'Failed to close day' });
        }
    },
    openDay: async () => {
        try {
            await db.execute(sql`INSERT INTO system_settings (key, value) VALUES ('is_open', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true'`);
            updateSettingsCache(true);
            emitLiveEvent('visitors');
        } catch (error) {
            return fail(500, { error: 'Failed to open day' });
        }
    },

    confirmReservation: async ({ request }) => {
        const data = await request.formData();
        const reservationId = data.get('reservationId');
        if (!reservationId) return fail(400, { error: 'Invalid ID' });

        await db.execute(sql`UPDATE reservations SET status = 'confirmed' WHERE id = ${reservationId}`);
        return { success: true };
    },

    cancelReservationAdmin: async ({ request }) => {
        const data = await request.formData();
        const reservationId = data.get('reservationId');
        if (!reservationId) return fail(400, { error: 'Invalid ID' });

        const res = await db.execute(sql`SELECT session_id FROM reservations WHERE id = ${reservationId}`);
        const sessionId = (res[0] as any)?.session_id;

        await db.execute(sql`DELETE FROM reservations WHERE id = ${reservationId}`);
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

        try {
            await db.transaction(async (tx) => {
                // 반복일정이면 skip 기록 추가 (재생성 방지)
                const sess = await tx.execute(sql`SELECT recurring_schedule_id, scheduled_at FROM game_sessions WHERE id = ${sessionId}`);
                const session = (sess as any[])[0];
                if (session?.recurring_schedule_id) {
                    const skipDate = session.scheduled_at
                        ? new Date(session.scheduled_at).toISOString().split('T')[0]
                        : new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
                    await tx.execute(sql`
                        INSERT INTO recurring_game_skips (recurring_schedule_id, skip_date)
                        VALUES (${session.recurring_schedule_id}, ${skipDate}::date)
                        ON CONFLICT DO NOTHING
                    `);
                }
                await tx.execute(sql`DELETE FROM session_participants WHERE session_id = ${sessionId}`);
                await tx.execute(sql`DELETE FROM reservations WHERE session_id = ${sessionId}`);
                await tx.execute(sql`DELETE FROM game_sessions WHERE id = ${sessionId}`);
            });
            emitLiveEvent('games');
            return { success: true };
        } catch (e) {
            return fail(500, { error: 'Failed to dissolve game' });
        }
    },

    startScheduledGame: async ({ request }) => {
        const data = await request.formData();
        const sessionId = data.get('sessionId');
        const duration = parseInt(data.get('duration')?.toString() || '60');

        if (!sessionId) return fail(400, { error: 'Invalid ID' });
        if (!(await canModifyGame(request, sessionId.toString()))) return fail(403, { error: 'Unauthorized' });

        try {
            await db.transaction(async (tx) => {
                await tx.execute(sql`
                    UPDATE game_sessions SET status = 'playing', start_time = NOW(), end_time = NOW() + ${duration + ' minutes'}::INTERVAL WHERE id = ${sessionId}
                `);
                // Confirm all pending reservations for this session (if any)
                await tx.execute(sql`UPDATE reservations SET status = 'confirmed' WHERE session_id = ${sessionId} AND status = 'pending'`);
            });
            emitLiveEvent('games');
            return { success: true };
        } catch (e) {
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

        await db.execute(sql`UPDATE attendees SET is_blacklisted = NOT is_blacklisted WHERE id = ${attendeeId}`);
        return { success: true };
    },

    toggleManager: async ({ request }) => {
        const sessionToken = request.headers.get('cookie')?.match(/admin_session=([^;]+)/)?.[1];
        if (!sessionToken || !(await verifyAdminSession(sessionToken))) return fail(403, { error: 'Unauthorized' });

        const data = await request.formData();
        const attendeeId = data.get('attendeeId');
        if (!attendeeId) return fail(400, { error: 'Invalid ID' });

        await db.execute(sql`UPDATE attendees SET can_manage_games = NOT can_manage_games WHERE id = ${attendeeId}`);
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
        const attendeeInfo = await db.execute(sql`SELECT is_blacklisted, penalty_points FROM attendees WHERE id = ${finalAttendeeId}`);
        if (attendeeInfo.length > 0) {
            const { is_blacklisted, penalty_points } = attendeeInfo[0] as any;
            if (is_blacklisted) return fail(403, { error: '블랙리스트에 등록되어 예약이 불가능합니다.' });
            if (penalty_points >= 3) return fail(403, { error: '페널티 누적으로 인해 예약이 불가능합니다.' });
        }

        // 1. Check if already joined THIS session
        const existingParticipant = await db.execute(sql`SELECT 1 FROM session_participants WHERE session_id = ${sessionId} AND attendee_id = ${finalAttendeeId}`);
        if (existingParticipant.length > 0) {
            return fail(400, { error: '이미 참여 중인 게임입니다.' });
        }

        // 2. Join session
        try {
            await db.transaction(async (tx) => {
                await tx.execute(sql`INSERT INTO session_participants (session_id, attendee_id) VALUES (${sessionId}, ${finalAttendeeId})`);
                await tx.execute(sql`UPDATE reservations SET status = 'confirmed' WHERE session_id = ${sessionId} AND attendee_id = ${finalAttendeeId} AND status != 'cancelled'`);
            });
        } catch (e) {
            return fail(500, { error: 'Failed to join game' });
        }
        return { success: true };
    },
    addGuestToGame: async ({ request, cookies }) => {
        const data = await request.formData();
        const sessionId = data.get('sessionId');
        const customName = data.get('guestName')?.toString().trim();

        if (!sessionId) return fail(400, { error: 'Invalid session ID' });

        const sessionToken = cookies.get('admin_session');
        if (!sessionToken || !(await verifyAdminSession(sessionToken))) return fail(403, { error: 'Unauthorized' });

        const existingGuests = await db.execute(sql`
            SELECT guest_name FROM session_participants
            WHERE session_id = ${sessionId} AND attendee_id IS NULL
        `);
        const nextNum = existingGuests.length + 1;
        const guestName = customName || `게스트${nextNum}`;

        await db.execute(sql`
            INSERT INTO session_participants (session_id, attendee_id, guest_name)
            VALUES (${sessionId}, NULL, ${guestName})
        `);

        return { success: true };
    },
    addTable: async ({ request }) => {
        const data = await request.formData();
        const name = data.get('name')?.toString().trim();
        if (!name) return fail(400, { error: '테이블 이름을 입력해주세요.' });

        await db.execute(sql`INSERT INTO tables (name) VALUES (${name})`);
        return { success: true };
    },

    removeTable: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id');
        if (!id) return fail(400, { error: 'Invalid ID' });

        await db.execute(sql`UPDATE tables SET is_active = false WHERE id = ${id}`);
        return { success: true };
    },

    skipRecurringWeek: async ({ request }) => {
        const data = await request.formData();
        const scheduleId = data.get('scheduleId');
        if (!scheduleId) return fail(400, { error: 'Invalid ID' });

        try {
            const schedule = await db.execute(sql`SELECT day_of_week FROM recurring_game_schedules WHERE id = ${scheduleId}`);
            if (schedule.length === 0) return fail(404, { error: '스케줄을 찾을 수 없습니다.' });

            const now = new Date();
            const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
            const today = kstNow.getUTCDay();
            const targetDay = (schedule[0] as any).day_of_week;
            let diff = targetDay - today;
            if (diff < 0) diff += 7;
            const skipDate = new Date(kstNow);
            skipDate.setUTCDate(skipDate.getUTCDate() + diff);
            const skipDateStr = skipDate.toISOString().split('T')[0];

            // 이미 스킵되어 있으면 해제, 아니면 스킵 추가 (토글)
            const existing = await db.execute(sql`
                SELECT id FROM recurring_game_skips WHERE recurring_schedule_id = ${scheduleId} AND skip_date = ${skipDateStr}::date
            `);

            if (existing.length > 0) {
                // 스킵 해제
                await db.execute(sql`
                    DELETE FROM recurring_game_skips WHERE recurring_schedule_id = ${scheduleId} AND skip_date = ${skipDateStr}::date
                `);
                emitLiveEvent('games');
                return { success: true, message: '이번주 스킵이 해제되었습니다.' };
            } else {
                // 스킵 추가
                await db.transaction(async (tx) => {
                    await tx.execute(sql`
                        INSERT INTO recurring_game_skips (recurring_schedule_id, skip_date) VALUES (${scheduleId}, ${skipDateStr}) ON CONFLICT DO NOTHING
                    `);
                    await tx.execute(sql`
                        DELETE FROM game_sessions WHERE recurring_schedule_id = ${scheduleId} AND status = 'scheduled' AND scheduled_at::date = ${skipDateStr}::date
                    `);
                });
                emitLiveEvent('games');
                return { success: true, message: '이번주 스킵 처리되었습니다.' };
            }
        } catch (e) {
            return fail(500, { error: '처리 중 오류가 발생했습니다.' });
        }
    },

    toggleRecurringActive: async ({ request }) => {
        const data = await request.formData();
        const scheduleId = data.get('scheduleId');
        if (!scheduleId) return fail(400, { error: 'Invalid ID' });

        try {
            await db.execute(sql`UPDATE recurring_game_schedules SET is_active = NOT is_active WHERE id = ${scheduleId}`);
            return { success: true };
        } catch (e) {
            return fail(500, { error: '처리 중 오류가 발생했습니다.' });
        }
    },

    createScheduledGame: async ({ request }) => {
        const data = await request.formData();
        const gameName = data.get('gameName')?.toString();
        const scheduledAt = data.get('scheduledAt')?.toString();
        const minPlayers = parseInt(data.get('minPlayers')?.toString() || '2');
        const maxPlayers = parseInt(data.get('maxPlayers')?.toString() || '4');
        const guestCount = parseInt(data.get('guestCount')?.toString() || '0');
        const showOnMain = data.get('showOnMain') === 'true';
        const isRecurring = data.get('isRecurring') === 'true';

        if (!gameName) return fail(400, { error: '게임 이름을 입력해주세요.' });
        if (!scheduledAt) return fail(400, { error: '시작 예정 시간을 입력해주세요.' });
        if (guestCount > maxPlayers) return fail(400, { error: `게스트 수가 최대 인원(${maxPlayers}명)을 초과할 수 없습니다.` });

        try {
            await db.transaction(async (tx) => {
                const sessionResult = await tx.execute(sql`
                    INSERT INTO game_sessions (game_name, status, scheduled_at, min_players, max_players, show_on_main)
                    VALUES (${gameName}, 'scheduled', ${scheduledAt}, ${minPlayers}, ${maxPlayers}, ${showOnMain})
                    RETURNING id
                `);
                const newSessionId = (sessionResult[0] as any).id;

                for (let i = 1; i <= guestCount; i++) {
                    await tx.execute(sql`INSERT INTO session_participants (session_id, attendee_id, guest_name) VALUES (${newSessionId}, NULL, ${`게스트${i}`})`);
                }

                if (isRecurring) {
                    const scheduledDate = new Date(scheduledAt);
                    const dayOfWeek = scheduledDate.getDay();
                    const timeStr = scheduledDate.toTimeString().slice(0, 8);

                    const gameIdResult = await tx.execute(sql`SELECT id FROM games WHERE name = ${gameName} LIMIT 1`);
                    const gameIdVal = (gameIdResult[0] as any)?.id ?? null;

                    const recurResult = await tx.execute(sql`
                        INSERT INTO recurring_game_schedules (game_name, game_id, day_of_week, scheduled_time, min_players, max_players, show_on_main)
                        VALUES (${gameName}, ${gameIdVal}, ${dayOfWeek}, ${timeStr}, ${minPlayers}, ${maxPlayers}, ${showOnMain})
                        RETURNING id
                    `);
                    await tx.execute(sql`UPDATE game_sessions SET recurring_schedule_id = ${(recurResult[0] as any).id} WHERE id = ${newSessionId}`);
                }
            });
            emitLiveEvent('games');
            return { success: true };
        } catch (e) {
            console.error('Failed to create scheduled game:', e);
            return fail(500, { error: '게임 생성에 실패했습니다.' });
        }
    },

    deleteRecurringSchedule: async ({ request }) => {
        const data = await request.formData();
        const scheduleId = data.get('scheduleId');
        if (!scheduleId) return fail(400, { error: 'Invalid ID' });

        try {
            await db.transaction(async (tx) => {
                await tx.execute(sql`UPDATE game_sessions SET recurring_schedule_id = NULL WHERE recurring_schedule_id = ${scheduleId}`);
                await tx.execute(sql`DELETE FROM recurring_game_skips WHERE recurring_schedule_id = ${scheduleId}`);
                await tx.execute(sql`DELETE FROM recurring_game_schedules WHERE id = ${scheduleId}`);
            });
            return { success: true };
        } catch (e) {
            return fail(500, { error: '처리 중 오류가 발생했습니다.' });
        }
    }
};
