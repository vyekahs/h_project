import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { verifyAdminSession, verifyAttendeeSession } from '$lib/server/auth';
import { PartyService } from '$lib/server/services/partyService';
import { emitLiveEvent } from '$lib/server/liveEvents';
import { getSharedData } from '$lib/server/dataCache';

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

export const load: PageServerLoad = async ({ locals }) => {
    // hooks.server.ts에서 이미 설정된 인증 정보 사용 (중복 DB 호출 제거)
    const user = locals.user || null;
    const isAdmin = locals.isAdmin || false;

    // 공용 데이터는 메모리 캐시에서 가져옴 (동시 요청 시 DB 1번만 조회)
    const shared = await getSharedData();

    // 유저별 데이터 — Drizzle이 커넥션 풀 자동 관리하므로 병렬 실행 가능
    let userPenaltyInfo = null;
    let userReservation = null;
    let userScheduledGames: any[] = [];
    let userPlayingGame = null;
    let parties: any[] = [];
    let userPartyIds: number[] = [];
    let userHasVisitPlan = false;

    if (user) {
        try {
            const [resResult, schedResult, playingResult, partiesResult, partyMembershipResult, visitPlanResult] = await Promise.all([
                db.execute(sql`
                    SELECT r.*, gs.game_name, gs.status as session_status, gs.scheduled_at
                    FROM reservations r
                    JOIN game_sessions gs ON r.session_id = gs.id
                    WHERE r.attendee_id = ${user.id} AND r.status IN ('pending', 'waitlisted', 'confirmed', 'pending_approval')
                    LIMIT 1
                `),
                db.execute(sql`
                    SELECT gs.*
                    FROM game_sessions gs
                    JOIN session_participants sp ON gs.id = sp.session_id
                    WHERE sp.attendee_id = ${user.id} AND gs.status = 'scheduled'
                    ORDER BY gs.scheduled_at ASC
                `),
                db.execute(sql`
                    SELECT gs.id, gs.game_name
                    FROM session_participants sp
                    JOIN game_sessions gs ON sp.session_id = gs.id
                    WHERE sp.attendee_id = ${user.id} AND gs.status = 'playing'
                `),
                db.execute(sql`
                    SELECT gp.id, gp.name, gp.game_id, gp.game_name, gp.duration, gp.guest_count,
                        g.image_url, g.name as resolved_game_name,
                        COALESCE(json_agg(json_build_object(
                            'id', a.id, 'name', a.name
                        ) ORDER BY a.name) FILTER (WHERE a.id IS NOT NULL), '[]') as members
                    FROM game_parties gp
                    LEFT JOIN game_party_members gpm ON gp.id = gpm.party_id
                    LEFT JOIN attendees a ON gpm.attendee_id = a.id
                    LEFT JOIN games g ON gp.game_id = g.id
                    WHERE gp.owner_id = ${user.id}
                    GROUP BY gp.id, gp.name, gp.game_id, gp.game_name, gp.duration, gp.guest_count, g.image_url, g.name
                    ORDER BY gp.updated_at DESC
                `),
                db.execute(sql`SELECT party_id FROM game_party_members WHERE attendee_id = ${user.id}`),
                db.execute(sql`SELECT id FROM daily_visit_plans WHERE attendee_id = ${user.id} AND plan_date = CURRENT_DATE`),
            ]);

            userReservation = (resResult[0] as any) || null;
            userScheduledGames = schedResult as any[];
            userPlayingGame = (playingResult[0] as any) || null;
            parties = partiesResult as any[];
            userPartyIds = (partyMembershipResult as any[]).map((r: any) => r.party_id);
            userHasVisitPlan = visitPlanResult.length > 0;
        } catch (e) {
            // query error — return defaults
        }
    }

    return {
        attendees: shared.attendees,
        games: shared.games,
        scheduledGames: shared.scheduledGames,
        user,
        isAdmin,
        isOpen: shared.isOpen,
        notice: shared.notice,
        userPenaltyInfo,
        userReservation,
        userScheduledGames,
        userPlayingGame,
        allGames: shared.allGames,
        reservations: shared.reservations,
        parties,
        userPartyIds,
        dailyVisitPlans: shared.dailyVisitPlans,
        mainScheduledGames: [
            ...shared.scheduledGames.filter((g: any) => g.show_on_main),
            ...shared.todayPlayingMainGames,
        ],
        todayScheduledParticipants: shared.todayScheduledParticipants,
        userHasVisitPlan,
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

            // 0. Check attendee info + game info + busy check (병렬)
            const [attendeeInfo, gameInfo, busyCheck] = await Promise.all([
                db.execute(sql`SELECT is_blacklisted, penalty_points FROM attendees WHERE id = ${attendeeId}`),
                db.execute(sql`SELECT status, party_id FROM game_sessions WHERE id = ${sessionId}`),
                db.execute(sql`
                    SELECT 1 FROM session_participants sp
                    JOIN game_sessions gs ON sp.session_id = gs.id
                    WHERE sp.attendee_id = ${attendeeId}
                    AND (
                        gs.status = 'playing'
                        OR (gs.status = 'scheduled' AND gs.scheduled_at::date = CURRENT_DATE)
                    )
                    UNION
                    SELECT 1 FROM reservations r
                    JOIN game_sessions gs ON r.session_id = gs.id
                    WHERE r.attendee_id = ${attendeeId}
                    AND r.status IN ('pending', 'waitlisted', 'confirmed', 'pending_approval')
                    AND (
                        gs.status = 'playing'
                        OR (gs.status = 'scheduled' AND gs.scheduled_at::date = CURRENT_DATE)
                    )
                `),
            ]);

            if (attendeeInfo.length > 0) {
                const { is_blacklisted, penalty_points } = attendeeInfo[0] as any;
                if (is_blacklisted) return fail(403, { error: '블랙리스트에 등록되어 예약이 불가능합니다.' });
                if (penalty_points >= 3) return fail(403, { error: '페널티 누적으로 인해 예약이 불가능합니다.' });
            }

            if (gameInfo.length === 0) return fail(404, { error: '게임을 찾을 수 없습니다.' });
            const gameStatus = (gameInfo[0] as any).status;

            // Check party restriction
            if ((gameInfo[0] as any).party_id) {
                const isMember = await PartyService.isPartyMember((gameInfo[0] as any).party_id, parseInt(attendeeId as string));
                if (!isMember) {
                    return fail(403, { error: '고정팟 전용 게임입니다. 팟 멤버만 참여할 수 있습니다.' });
                }
            }

            if (busyCheck.length > 0) {
                 // If trying to join the SAME game, show specific error
                 const sameGameCheck = await db.execute(sql`
                    SELECT 1 FROM session_participants WHERE session_id = ${sessionId} AND attendee_id = ${attendeeId}
                    UNION
                    SELECT 1 FROM reservations WHERE session_id = ${sessionId} AND attendee_id = ${attendeeId} AND status IN ('pending_approval', 'confirmed')
                 `);

                 if (sameGameCheck.length > 0) {
                     return fail(400, { error: '이미 참여 중이거나 요청을 보냈습니다.' });
                 }

                return fail(400, { error: '오늘 진행 중이거나 예약된 게임이 있어 예약(요청)할 수 없습니다.' });
            }

            // 2. Create reservation
            const status = gameStatus === 'playing' ? 'pending_approval' : 'confirmed';

            await db.execute(sql`
                INSERT INTO reservations (session_id, attendee_id, status) VALUES (${sessionId}, ${attendeeId}, ${status})
            `);

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
        const showOnMain = data.get('showOnMain') === 'true';
        const isRecurring = data.get('isRecurring') === 'true';
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

        // Only admin can set show_on_main and recurring
        const finalShowOnMain = isAdmin ? showOnMain : false;
        const finalIsRecurring = isAdmin ? isRecurring : false;

        // 2. Create scheduled session
        try {
            await db.transaction(async (tx) => {
                const sessionResult = await tx.execute(sql`
                    INSERT INTO game_sessions (game_name, status, scheduled_at, min_players, max_players, created_by, party_id, show_on_main)
                    VALUES (${gameName}, 'scheduled', ${scheduledAt}, ${minPlayers}, ${maxPlayers}, ${creatorId}, ${partyId}, ${finalShowOnMain})
                    RETURNING id
                `);
                const newSessionId = (sessionResult[0] as any).id;

                if (creatorId) {
                    await tx.execute(sql`INSERT INTO session_participants (session_id, attendee_id) VALUES (${newSessionId}, ${creatorId})`);
                }
                for (const playerId of playerIds) {
                    if (playerId !== creatorId?.toString()) {
                        await tx.execute(sql`INSERT INTO session_participants (session_id, attendee_id) VALUES (${newSessionId}, ${playerId})`);
                    }
                }
                for (let i = 1; i <= guestCount; i++) {
                    await tx.execute(sql`INSERT INTO session_participants (session_id, attendee_id, guest_name) VALUES (${newSessionId}, NULL, ${`게스트${i}`})`);
                }

                // Create recurring schedule if requested
                if (finalIsRecurring) {
                    const scheduledDate = new Date(scheduledAt);
                    const dayOfWeek = scheduledDate.getDay(); // 0=Sun, 6=Sat
                    const timeStr = scheduledDate.toTimeString().slice(0, 8); // HH:MM:SS

                    const gameIdResult = await tx.execute(sql`SELECT id FROM games WHERE name = ${gameName} LIMIT 1`);
                    const gameId = (gameIdResult[0] as any)?.id ?? null;

                    const recurResult = await tx.execute(sql`
                        INSERT INTO recurring_game_schedules (game_name, game_id, day_of_week, scheduled_time, min_players, max_players, party_id, created_by, show_on_main)
                        VALUES (${gameName}, ${gameId}, ${dayOfWeek}, ${timeStr}, ${minPlayers}, ${maxPlayers}, ${partyId}, ${creatorId}, ${finalShowOnMain})
                        RETURNING id
                    `);

                    // Link the session to the recurring schedule
                    const recurId = (recurResult[0] as any).id;
                    await tx.execute(sql`UPDATE game_sessions SET recurring_schedule_id = ${recurId} WHERE id = ${newSessionId}`);
                }
            });

            // 고정팟이 아니고 오늘 날짜면 참여자들을 갈 예정에 자동 등록
            if (!partyId && scheduledAt) {
                const isToday = new Date(scheduledAt).toDateString() === new Date().toDateString();
                if (isToday) {
                    const gameTime = new Date(scheduledAt).toTimeString().slice(0, 5);
                    const allPlayerIds = creatorId ? [creatorId.toString(), ...playerIds] : [...playerIds];
                    const uniqueIds = [...new Set(allPlayerIds)].filter(Boolean);
                    for (const pid of uniqueIds) {
                        await db.execute(sql`
                            INSERT INTO daily_visit_plans (attendee_id, plan_date, planned_time)
                            VALUES (${parseInt(pid)}, CURRENT_DATE, ${gameTime})
                            ON CONFLICT (attendee_id, plan_date) DO UPDATE SET
                                planned_time = COALESCE(daily_visit_plans.planned_time, EXCLUDED.planned_time)
                        `);
                    }
                    if (uniqueIds.length > 0) emitLiveEvent('visitors');
                }
            }

            emitLiveEvent('games');
            return { success: true };
        } catch (e) {
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
        const attendeeInfo = await db.execute(sql`SELECT is_blacklisted, penalty_points FROM attendees WHERE id = ${finalAttendeeId}`);
        if (attendeeInfo.length > 0) {
            const { is_blacklisted, penalty_points } = attendeeInfo[0] as any;
            if (is_blacklisted) return fail(403, { error: '블랙리스트에 등록되어 예약이 불가능합니다.' });
            if (penalty_points >= 3) return fail(403, { error: '페널티 누적으로 인해 예약이 불가능합니다.' });
        }

        // 1. Check if busy
        // 0.5. Get target session info to check date
        const targetSession = await db.execute(sql`SELECT scheduled_at, party_id FROM game_sessions WHERE id = ${sessionId}`);
        if (targetSession.length === 0) {
            return fail(404, { error: '세션을 찾을 수 없습니다.' });
        }
        const targetDate = (targetSession[0] as any).scheduled_at;

        // Check party restriction
        if ((targetSession[0] as any).party_id) {
            const isMember = await PartyService.isPartyMember((targetSession[0] as any).party_id, finalAttendeeId);
            if (!isMember) {
                return fail(403, { error: '고정팟 전용 게임입니다. 팟 멤버만 참여할 수 있습니다.' });
            }
        }

        // 1. Check if already joined THIS session
        const existingParticipant = await db.execute(sql`SELECT 1 FROM session_participants WHERE session_id = ${sessionId} AND attendee_id = ${finalAttendeeId}`);
        if (existingParticipant.length > 0) {
            return fail(400, { error: '이미 참여 중인 게임입니다.' });
        }

        // 2. Check if busy with OTHER games or reservations ON THE SAME DAY
        const busyCheck = await db.execute(sql`
            SELECT 1 FROM session_participants sp
            JOIN game_sessions gs ON sp.session_id = gs.id
            WHERE sp.attendee_id = ${finalAttendeeId}
            AND gs.id != ${sessionId}
            AND (
                (gs.status = 'playing' AND ${targetDate}::date = CURRENT_DATE)
                OR
                (gs.status = 'scheduled' AND gs.scheduled_at::date = ${targetDate}::date)
            )
            UNION
            SELECT 1 FROM reservations r
            JOIN game_sessions gs ON r.session_id = gs.id
            WHERE r.attendee_id = ${finalAttendeeId}
            AND r.status IN ('pending', 'waitlisted', 'confirmed')
            AND r.session_id != ${sessionId}
            AND (
                (gs.status = 'playing' AND ${targetDate}::date = CURRENT_DATE)
                OR
                (gs.status = 'scheduled' AND gs.scheduled_at::date = ${targetDate}::date)
            )
        `);

        if (busyCheck.length > 0) {
            return fail(400, { error: '해당 날짜에 이미 다른 게임에 참여 중이거나 예약된 내역이 있습니다.' });
        }

        // 2. Check if session is full
        const sessionInfo = await db.execute(sql`
            SELECT gs.max_players, COUNT(sp.id) as current_players
            FROM game_sessions gs
            LEFT JOIN session_participants sp ON gs.id = sp.session_id
            WHERE gs.id = ${sessionId}
            GROUP BY gs.max_players
        `);

        if (sessionInfo.length === 0) return fail(404, { error: '게임을 찾을 수 없습니다.' });

        const { max_players, current_players } = sessionInfo[0] as any;
        if (current_players >= (max_players || 4)) {
            // Add to waitlist instead
            await db.execute(sql`
                INSERT INTO reservations (session_id, attendee_id, status) VALUES (${sessionId}, ${finalAttendeeId}, 'waitlisted')
            `);
            emitLiveEvent('games');
            return { success: true, waitlisted: true };
        }

        // 3. Join session
        await db.transaction(async (tx) => {
            await tx.execute(sql`INSERT INTO session_participants (session_id, attendee_id) VALUES (${sessionId}, ${finalAttendeeId})`);
            // If there was a reservation for this session, confirm it
            await tx.execute(sql`UPDATE reservations SET status = 'confirmed' WHERE session_id = ${sessionId} AND attendee_id = ${finalAttendeeId} AND status != 'cancelled'`);
        });

        // 4. Auto-register daily visit plan (고정팟 제외, 오늘 날짜만)
        const isPartyGame = !!(targetSession[0] as any).party_id;
        const isToday = new Date((targetSession[0] as any).scheduled_at).toDateString() === new Date().toDateString();
        if (!isPartyGame && isToday) {
            const statusCheck = await db.execute(sql`SELECT status FROM attendees WHERE id = ${finalAttendeeId}`);
            if ((statusCheck[0] as any)?.status !== 'present') {
                const gameTime = new Date((targetSession[0] as any).scheduled_at).toTimeString().slice(0, 5);
                await db.execute(sql`
                    INSERT INTO daily_visit_plans (attendee_id, plan_date, planned_time)
                    VALUES (${finalAttendeeId}, CURRENT_DATE, ${gameTime})
                    ON CONFLICT (attendee_id, plan_date) DO UPDATE SET
                        planned_time = COALESCE(daily_visit_plans.planned_time, EXCLUDED.planned_time)
                `);
            }
        }

        emitLiveEvent('games');
        emitLiveEvent('visitors');
        return { success: true };
    },

    cancelReservation: async ({ request, cookies }) => {
        const data = await request.formData();
        const reservationId = data.get('reservationId');
        const userSessionToken = cookies.get('user_session');

        if (!userSessionToken) return fail(401, { error: '로그인이 필요합니다.' });
        const user = await verifyAttendeeSession(userSessionToken);
        if (!user) return fail(401, { error: 'Invalid session' });

        const reservation = await db.execute(sql`
            SELECT r.session_id, gs.scheduled_at
            FROM reservations r
            JOIN game_sessions gs ON r.session_id = gs.id
            WHERE r.id = ${reservationId} AND r.attendee_id = ${user.id}
        `);
        if (reservation.length === 0) return fail(404, { error: '예약을 찾을 수 없습니다.' });

        const { session_id: sessionId, scheduled_at } = reservation[0] as any;

        // Apply penalty if cancelled within 10 minutes of start
        if (scheduled_at && new Date(scheduled_at).getTime() - Date.now() < 10 * 60 * 1000) {
            const { applyPenalty } = await import('$lib/server/reservations');
            await applyPenalty(user.id);
        }

        await db.execute(sql`DELETE FROM reservations WHERE id = ${reservationId}`);

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

        const session = await db.execute(sql`SELECT scheduled_at FROM game_sessions WHERE id = ${sessionId}`);
        if (session.length > 0) {
            const { scheduled_at } = session[0] as any;
            // Apply penalty if leaving within 10 minutes of start
            if (scheduled_at && new Date(scheduled_at).getTime() - Date.now() < 10 * 60 * 1000) {
                const { applyPenalty } = await import('$lib/server/reservations');
                await applyPenalty(user.id);
            }
        }

        await db.execute(sql`DELETE FROM session_participants WHERE session_id = ${sessionId} AND attendee_id = ${user.id}`);

        const { promoteWaitlist } = await import('$lib/server/reservations');
        await promoteWaitlist(Number(sessionId));

        // 다른 오늘 시작예정 게임에 참여 중이 아니면 갈 예정에서 제거
        const otherScheduled = await db.execute(sql`
            SELECT 1 FROM session_participants sp
            JOIN game_sessions gs ON sp.session_id = gs.id
            WHERE sp.attendee_id = ${user.id}
            AND gs.status = 'scheduled'
            AND gs.scheduled_at::date = CURRENT_DATE
            AND gs.party_id IS NULL
        `);
        if (otherScheduled.length === 0) {
            await db.execute(sql`DELETE FROM daily_visit_plans WHERE attendee_id = ${user.id} AND plan_date = CURRENT_DATE`);
            emitLiveEvent('visitors');
        }

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

                // 1. Create Game Session
                const sessionResult = await tx.execute(sql`
                    INSERT INTO game_sessions (game_name, game_id, status, start_time, end_time, created_by, party_id)
                    VALUES (${gameName}, ${gameId}, 'playing', NOW(), NOW() + (${duration} || ' minutes')::INTERVAL, ${creatorId}, ${partyId})
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
            return { success: true };
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
            return { success: true };
        } catch (error) {
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
            await db.execute(sql`
                UPDATE game_sessions SET end_time = end_time + ${minutes + ' minutes'}::INTERVAL WHERE id = ${id}
            `);
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

        try {
            await db.transaction(async (tx) => {
                // 반복 게임이면 오늘 skip 기록을 추가하여 재생성 방지
                const session = await tx.execute(sql`
                    SELECT recurring_schedule_id, scheduled_at FROM game_sessions WHERE id = ${sessionId}
                `);
                const sess = (session as any[])[0];
                if (sess?.recurring_schedule_id) {
                    const skipDate = sess.scheduled_at
                        ? new Date(sess.scheduled_at).toISOString().split('T')[0]
                        : new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
                    await tx.execute(sql`
                        INSERT INTO recurring_game_skips (recurring_schedule_id, skip_date)
                        VALUES (${sess.recurring_schedule_id}, ${skipDate}::date)
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
        const sessionId = data.get('sessionId')?.toString();
        const duration = parseInt(data.get('duration')?.toString() || '60');

        if (!sessionId) return fail(400, { error: 'Invalid ID' });
        if (!(await canModifyGame(request, sessionId))) return fail(403, { error: 'Unauthorized' });

        try {
            await db.transaction(async (tx) => {
                await tx.execute(sql`
                    UPDATE game_sessions SET status = 'playing', start_time = NOW(), end_time = NOW() + ${duration + ' minutes'}::INTERVAL WHERE id = ${sessionId}
                `);
                await tx.execute(sql`UPDATE reservations SET status = 'confirmed' WHERE session_id = ${sessionId} AND status = 'pending'`);
            });
            emitLiveEvent('games');
            return { success: true };
        } catch (e) {
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
        const resInfo = await db.execute(sql`SELECT session_id, status FROM reservations WHERE id = ${reservationId}`);
        if (resInfo.length === 0) return fail(404, { error: '요청을 찾을 수 없습니다.' });
        const { session_id, status } = resInfo[0] as any;

        // 2. Concurrency Check: Status must be 'pending_approval'
        if (status !== 'pending_approval') {
             return fail(400, { error: '이미 처리된 요청입니다.' });
        }

        // 3. Authorization: Host OR Participant
        const isParticipant = await db.execute(sql`SELECT 1 FROM session_participants WHERE session_id = ${session_id} AND attendee_id = ${user.id}`);

        let authorized = false;
        if (isParticipant.length > 0) {
            authorized = true;
        } else {
             const gameInfo = await db.execute(sql`SELECT created_by FROM game_sessions WHERE id = ${session_id}`);
             if (gameInfo.length > 0 && (gameInfo[0] as any).created_by === user.id && user.can_manage_games) {
                 authorized = true;
             }
        }

        if (!authorized) return fail(403, { error: '승인 권한이 없습니다. 게임 참여자만 승인할 수 있습니다.' });

        try {
            const result = await db.transaction(async (tx) => {
                const r = await tx.execute(sql`UPDATE reservations SET status = 'confirmed' WHERE id = ${reservationId} AND status = 'pending_approval' RETURNING attendee_id, session_id`);
                if (r.length > 0) {
                    const { attendee_id, session_id } = r[0] as any;
                    await tx.execute(sql`INSERT INTO session_participants (session_id, attendee_id) VALUES (${session_id}, ${attendee_id})`);
                    return { success: true };
                } else {
                    return { error: '이미 처리되었거나 유효하지 않은 요청입니다.' };
                }
            });
            if ('error' in result) return fail(400, result);
            emitLiveEvent('games');
            return { success: true };
        } catch (e) {
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
        const resInfo = await db.execute(sql`SELECT session_id, status FROM reservations WHERE id = ${reservationId}`);
        if (resInfo.length === 0) return fail(404, { error: '요청을 찾을 수 없습니다.' });
        const { session_id, status } = resInfo[0] as any;

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
                       const isParticipant = await db.execute(sql`SELECT 1 FROM session_participants WHERE session_id = ${session_id} AND attendee_id = ${user.id}`);
                       if (isParticipant.length > 0) {
                            authorized = true;
                       }
                  }
             }
        }

        if (!authorized) return fail(403, { error: '권한이 없습니다.' });

        await db.execute(sql`UPDATE reservations SET status = 'cancelled' WHERE id = ${reservationId} AND status = 'pending_approval'`);
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
        const countRes = await db.execute(sql`SELECT COUNT(*) as cnt FROM session_participants WHERE session_id = ${sessionId} AND attendee_id IS NOT NULL`);
        const playerCount = parseInt((countRes[0] as any).cnt, 10);

        if (playerCount <= 2) {
            return fail(400, { error: '게임 최소 인원(2명) 유지를 위해 나갈 수 없습니다.' });
        }

        await db.execute(sql`DELETE FROM session_participants WHERE session_id = ${sessionId} AND attendee_id = ${user.id}`);
        emitLiveEvent('games');
        return { success: true };
    },

    skipRecurringWeek: async ({ request, cookies }) => {
        const sessionToken = cookies.get('admin_session');
        if (!sessionToken || !(await verifyAdminSession(sessionToken))) return fail(403, { error: '관리자 권한이 필요합니다.' });

        const data = await request.formData();
        const scheduleId = data.get('scheduleId');
        if (!scheduleId) return fail(400, { error: 'Invalid ID' });

        try {
            // Get next occurrence date for this schedule
            const schedule = await db.execute(sql`SELECT day_of_week FROM recurring_game_schedules WHERE id = ${scheduleId}`);
            if (schedule.length === 0) return fail(404, { error: '스케줄을 찾을 수 없습니다.' });

            // Calculate this week's date for the given day_of_week
            const now = new Date();
            const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
            const today = kstNow.getUTCDay();
            const targetDay = (schedule[0] as any).day_of_week;
            let diff = targetDay - today;
            if (diff < 0) diff += 7;
            const skipDate = new Date(kstNow);
            skipDate.setUTCDate(skipDate.getUTCDate() + diff);
            const skipDateStr = skipDate.toISOString().split('T')[0];

            await db.transaction(async (tx) => {
                // Add skip record
                await tx.execute(sql`
                    INSERT INTO recurring_game_skips (recurring_schedule_id, skip_date) VALUES (${scheduleId}, ${skipDateStr}) ON CONFLICT DO NOTHING
                `);
                // Delete already-created scheduled session for that date
                await tx.execute(sql`
                    DELETE FROM game_sessions WHERE recurring_schedule_id = ${scheduleId} AND status = 'scheduled' AND scheduled_at::date = ${skipDateStr}::date
                `);
            });
            emitLiveEvent('games');
            return { success: true };
        } catch (e) {
            return fail(500, { error: '처리 중 오류가 발생했습니다.' });
        }
    },

    toggleRecurringActive: async ({ request, cookies }) => {
        const sessionToken = cookies.get('admin_session');
        if (!sessionToken || !(await verifyAdminSession(sessionToken))) return fail(403, { error: '관리자 권한이 필요합니다.' });

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

    updateShowOnMain: async ({ request, cookies }) => {
        const sessionToken = cookies.get('admin_session');
        if (!sessionToken || !(await verifyAdminSession(sessionToken))) return fail(403, { error: '관리자 권한이 필요합니다.' });

        const data = await request.formData();
        const sessionId = data.get('sessionId');
        if (!sessionId) return fail(400, { error: 'Invalid ID' });

        try {
            await db.execute(sql`UPDATE game_sessions SET show_on_main = NOT show_on_main WHERE id = ${sessionId}`);
            emitLiveEvent('games');
            return { success: true };
        } catch (e) {
            return fail(500, { error: '처리 중 오류가 발생했습니다.' });
        }
    },

    deleteRecurringSchedule: async ({ request, cookies }) => {
        const sessionToken = cookies.get('admin_session');
        if (!sessionToken || !(await verifyAdminSession(sessionToken))) return fail(403, { error: '관리자 권한이 필요합니다.' });

        const data = await request.formData();
        const scheduleId = data.get('scheduleId');
        if (!scheduleId) return fail(400, { error: 'Invalid ID' });

        try {
            await db.transaction(async (tx) => {
                // Remove link from game_sessions
                await tx.execute(sql`UPDATE game_sessions SET recurring_schedule_id = NULL WHERE recurring_schedule_id = ${scheduleId}`);
                // Delete skips
                await tx.execute(sql`DELETE FROM recurring_game_skips WHERE recurring_schedule_id = ${scheduleId}`);
                // Delete the schedule
                await tx.execute(sql`DELETE FROM recurring_game_schedules WHERE id = ${scheduleId}`);
            });
            return { success: true };
        } catch (e) {
            return fail(500, { error: '처리 중 오류가 발생했습니다.' });
        }
    },

    toggleVisitPlan: async ({ request, cookies }) => {
        const userSessionToken = cookies.get('user_session');
        if (!userSessionToken) return fail(401, { error: '로그인이 필요합니다.' });
        const user = await verifyAttendeeSession(userSessionToken);
        if (!user) return fail(401, { error: 'Invalid session' });

        const data = await request.formData();
        const isCancel = data.get('cancel') === 'true';
        const plannedTime = data.get('plannedTime')?.toString() || null;

        try {
            if (isCancel) {
                await db.execute(sql`DELETE FROM daily_visit_plans WHERE attendee_id = ${user.id} AND plan_date = CURRENT_DATE`);
            } else {
                // 이미 참여중(present)인 유저는 추가 불가
                const statusCheck = await db.execute(sql`SELECT status FROM attendees WHERE id = ${user.id}`);
                if ((statusCheck[0] as any)?.status === 'present') {
                    return fail(400, { error: '이미 입장한 상태에서는 갈 예정에 추가할 수 없습니다.' });
                }
                await db.execute(sql`
                    INSERT INTO daily_visit_plans (attendee_id, plan_date, planned_time)
                    VALUES (${user.id}, CURRENT_DATE, ${plannedTime})
                    ON CONFLICT (attendee_id, plan_date) DO UPDATE SET planned_time = ${plannedTime}
                `);
            }

            emitLiveEvent('visitors');
            return { success: true };
        } catch (e: any) {
            return fail(500, { error: '처리 중 오류가 발생했습니다.' });
        }
    },

};
