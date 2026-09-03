import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { verifyAdminSession, verifyAttendeeSession } from '$lib/server/auth';
import { updateSettingsCache, markAllLeft } from '$lib/server/ble';
import { emitLiveEvent } from '$lib/server/liveEvents';
import { recordUndo, takeUndo } from '$lib/server/adminUndo';

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
    const [attendeesResult, historyResult, gamesResult, scheduledGamesResult, reservationsResult, gameNamesResult, allGamesResult, settingsResult, dailyVisitPlansResult, todayScheduledParticipantsResult] = await Promise.all([
        db.execute(sql`
            -- MAX(g.id)와 MAX(g.game_name)을 따로 집계하면 한 사람이 두 판에
            -- 걸쳐 있을 때 이름과 id가 서로 다른 판에서 올 수 있다. 게임 이름은
            -- 이 제품에서 고유하지 않다 — 예약 게임이 자동 시작되면 같은 이름의
            -- 판이 둘 돈다. 한 판을 확정해 이름·id·종료 시각을 같은 행에서 가져오고,
            -- 여러 판이면 먼저 끝나는 쪽을 고른다(운영자가 먼저 볼 판).
            SELECT a.id, a.name, a.arrival_time, a.status, a.penalty_points, a.is_blacklisted, a.can_manage_games,
                   s.id AS game_id,
                   s.game_name,
                   s.end_time AS game_end_time,
                   (s.id IS NOT NULL) AS is_playing
            FROM attendees a
            LEFT JOIN LATERAL (
                SELECT g.id, g.game_name, g.end_time
                FROM session_participants sp
                JOIN game_sessions g ON g.id = sp.session_id AND g.status = 'playing'
                WHERE sp.attendee_id = a.id
                ORDER BY g.end_time ASC
                LIMIT 1
            ) s ON TRUE
            WHERE a.status = 'present'
            ORDER BY (s.id IS NOT NULL), a.arrival_time DESC
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
            SELECT r.id, r.status, r.created_at, r.attendee_id,
                   a.name AS attendee_name, a.penalty_points, a.is_blacklisted,
                   a.status AS attendee_status,
                   gs.id AS session_id, gs.game_name,
                   gs.status AS session_status, gs.scheduled_at, gs.start_time, gs.max_players,
                   (SELECT COUNT(*) FROM session_participants sp WHERE sp.session_id = gs.id) AS current_players,
                   CASE WHEN r.status = 'waitlisted'
                        THEN ROW_NUMBER() OVER (PARTITION BY r.session_id, r.status ORDER BY r.created_at ASC)
                   END AS waitlist_position
            FROM reservations r
            JOIN attendees a ON r.attendee_id = a.id
            JOIN game_sessions gs ON r.session_id = gs.id
            WHERE r.status IN ('pending', 'waitlisted', 'confirmed', 'pending_approval')
              AND gs.status IN ('scheduled', 'playing')
            ORDER BY gs.scheduled_at ASC NULLS LAST, r.created_at ASC
        `),
        db.execute(sql`
            SELECT DISTINCT ON (game_name)
                game_name,
                ROUND(EXTRACT(EPOCH FROM (end_time - start_time))/60) as duration
            FROM game_sessions
            ORDER BY game_name, start_time DESC
        `),
        db.execute(sql`SELECT id, name, playtime_min, min_players, max_players, image_url FROM games WHERE is_active = true ORDER BY name ASC`),
        db.execute(sql`SELECT key, value FROM system_settings`),
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
        settings,
        dailyVisitPlans: dailyVisitPlansResult as any[],
        todayScheduledParticipants: todayScheduledParticipantsResult as any[]
    };
};

/** 페널티 사유 — 키는 penalty_logs.reason에 저장되고, 라벨은 운영자 피드백 문구에 쓰인다. */
const PENALTY_REASONS: Record<string, string> = {
    no_show: '노쇼',
    late: '지각',
    other: '기타'
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

        if (!id) return fail(400, { error: '잘못된 요청입니다.' });

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
            return fail(500, { error: '퇴장 처리에 실패했습니다.' });
        }
    },

    createGame: async ({ request }) => {
        const data = await request.formData();
        const gameName = data.get('gameName')?.toString();
        const gameId = data.get('gameId') ? parseInt(data.get('gameId') as string) : null;
        const duration = parseInt(data.get('duration')?.toString() || '0');
        const playerIds = data.getAll('players').map(p => p.toString());
        const guestCount = parseInt(data.get('guestCount')?.toString() || '0');

        // 어느 칸이 비었는지까지 돌려준다. 「필수 입력 항목을 모두 채워주세요」만
        // 말하는 모달은 운영자를 다시 폼으로 돌려보내 처음부터 훑게 했다.
        const missing: string[] = [];
        if (!gameName) missing.push('gameName');
        if (!(duration > 0)) missing.push('duration');
        if (playerIds.length === 0 && guestCount === 0) missing.push('players');
        if (missing.length > 0) return fail(400, { missing });

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
            return fail(500, { error: '게임 생성에 실패했습니다.' });
        }
    },
    endGame: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id')?.toString();

        if (!id) return fail(400, { missing: true });
        if (!(await canModifyGame(request, id))) return fail(403, { error: '권한이 없습니다.' });

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

        const nameRows = await db.execute(sql`SELECT game_name, end_time FROM game_sessions WHERE id = ${id} AND status = 'playing'`);
        const prev = (nameRows as any[])[0];
        const gameName = prev?.game_name as string | undefined;
        if (!gameName) return fail(404, { error: '이미 종료되었거나 없는 게임입니다.' });

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
            return fail(500, { error: '게임 종료에 실패했습니다.' });
        }

        // 종료는 스트립과 목록 양쪽에서 확인창 없이 한 번에 실행된다.
        // 되돌릴 수 있어야 그 한 번이 안전해진다.
        const undo = await recordUndo(
            'end_game',
            { sessionId: Number(id), prevEndTime: prev.end_time },
            `${gameName} 종료`
        );

        // 승자 기록은 선택이다. 화면이 "기록되었습니다"라고 말할지 여기서 결정한다 —
        // 이전에는 승자가 없어도 무조건 기록됐다고 알렸다.
        return { success: true, endedName: gameName, hadWinners: winnerIds.length > 0, undo };
    },
    /**
     * 게임 시간 조정. 음수도 받는다.
     *
     * 연장만 되고 줄일 수 없어서, 잘못 눌러 +20분이 되면 교정할 방법이 게임을
     * 종료하는 것뿐이었다. 다만 지금보다 앞으로는 못 당긴다 — 그건 종료이고,
     * 종료에는 승자 기록과 되돌리기가 붙는 별도의 경로가 있다.
     */
    extendGame: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id')?.toString();
        const minutes = parseInt(data.get('minutes')?.toString() || '0');

        if (!id || !Number.isFinite(minutes) || minutes === 0) {
            return fail(400, { missing: true });
        }
        if (!(await canModifyGame(request, id))) return fail(403, { error: '권한이 없습니다.' });

        try {
            // 연장은 "지금부터 더"를 뜻한다. 이미 14분 초과된 게임에 +10분을 눌렀는데
            // 여전히 과거로 남으면 운영자의 의도와 다르다. 그래서 늘릴 때는
            // 이미 지난 종료 시각이 아니라 지금을 기준으로 더한다.
            // 줄일 때만 "지금보다 이전으로는 못 간다"를 지킨다 — 그건 종료이고,
            // 종료에는 승자 기록과 되돌리기가 붙는 별도 경로가 있다.
            const base = minutes > 0 ? sql`GREATEST(end_time, NOW())` : sql`end_time`;
            const rows = await db.execute(sql`
                UPDATE game_sessions
                SET end_time = ${base} + ${minutes + ' minutes'}::INTERVAL
                WHERE id = ${id}
                  AND status = 'playing'
                  AND ${base} + ${minutes + ' minutes'}::INTERVAL > NOW()
                RETURNING game_name, end_time
            `);
            const row = (rows as any[])[0];
            if (!row) {
                const stillPlaying = await db.execute(sql`SELECT 1 FROM game_sessions WHERE id = ${id} AND status = 'playing'`);
                return fail(400, {
                    error: stillPlaying.length === 0
                        ? '이미 종료된 게임입니다.'
                        : '더 줄이면 지금보다 이전이 됩니다. 끝났다면 「게임 종료」를 쓰세요.'
                });
            }
            emitLiveEvent('games');
            return { success: true, gameName: row.game_name as string, endTime: row.end_time, minutes };
        } catch (error) {
            return fail(500, { error: '게임 시간 조정에 실패했습니다.' });
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
            return fail(500, { error: '설정 저장에 실패했습니다.' });
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
            return fail(500, { error: '마감 처리에 실패했습니다.' });
        }
    },
    openDay: async () => {
        try {
            await db.execute(sql`INSERT INTO system_settings (key, value) VALUES ('is_open', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true'`);
            updateSettingsCache(true);
            emitLiveEvent('visitors');
        } catch (error) {
            return fail(500, { error: '오픈 처리에 실패했습니다.' });
        }
    },

    /**
     * 예약 확정 — 승인 대기(pending_approval)면 참가자 편입까지 한다.
     * 게임 소유자의 메인 화면 승인과 결과가 같아야 하므로 같은 트랜잭션을 쓴다.
     */
    confirmReservation: async ({ request }) => {
        const sessionToken = request.headers.get('cookie')?.match(/admin_session=([^;]+)/)?.[1];
        if (!sessionToken || !(await verifyAdminSession(sessionToken))) return fail(403, { error: '권한이 없습니다.' });

        const data = await request.formData();
        const reservationId = data.get('reservationId');
        if (!reservationId) return fail(400, { error: '잘못된 요청입니다.' });

        const info = await db.execute(sql`
            SELECT r.status, r.session_id, r.attendee_id,
                   a.name AS attendee_name, a.is_blacklisted, a.penalty_points,
                   gs.game_name
            FROM reservations r
            JOIN attendees a ON a.id = r.attendee_id
            JOIN game_sessions gs ON gs.id = r.session_id
            WHERE r.id = ${reservationId}
        `);
        const row = (info as any[])[0];
        if (!row) return fail(404, { error: '이미 처리되었거나 없는 예약입니다.' });
        if (row.status === 'confirmed') return fail(400, { error: `${row.attendee_name}님은 이미 확정 상태입니다.` });
        if (row.is_blacklisted)
            return fail(403, { error: `${row.attendee_name}님은 블랙리스트라 확정할 수 없습니다. 먼저 블랙리스트를 해제해주세요.` });

        const thresholdRow = await db.execute(sql`SELECT value FROM system_settings WHERE key = 'penalty_threshold'`);
        const penaltyThreshold = parseInt((thresholdRow as any[])[0]?.value ?? '3');
        if (row.penalty_points >= penaltyThreshold)
            return fail(403, {
                error: `${row.attendee_name}님은 페널티 ${row.penalty_points}점(제한 ${penaltyThreshold}점)이라 확정할 수 없습니다. 페널티를 먼저 조정해주세요.`
            });

        try {
            await db.transaction(async (tx) => {
                await tx.execute(sql`UPDATE reservations SET status = 'confirmed' WHERE id = ${reservationId}`);
                const already = await tx.execute(sql`
                    SELECT 1 FROM session_participants
                    WHERE session_id = ${row.session_id} AND attendee_id = ${row.attendee_id}
                `);
                if ((already as any[]).length === 0) {
                    await tx.execute(sql`
                        INSERT INTO session_participants (session_id, attendee_id)
                        VALUES (${row.session_id}, ${row.attendee_id})
                    `);
                }
            });
        } catch (e) {
            return fail(500, { error: '예약 확정에 실패했습니다. 잠시 후 다시 시도해주세요.' });
        }

        emitLiveEvent('games');
        return { success: true, queue: { name: row.attendee_name as string, game: row.game_name as string, kind: 'confirm' } };
    },

    /**
     * 노쇼 처리 — 예약 취소 + 페널티 1점 + 대기열 승계를 한 번에 한다.
     * 운영자가 큐에서 발견한 것을 큐에서 끝내게 하려는 것이 목적이다.
     */
    /**
     * 방금 한 조치를 되돌린다.
     *
     * 클라이언트는 불투명한 id만 보낸다. 무엇을 어떻게 되돌릴지는 전부 서버에
     * 남겨둔 원상태에서 읽는다 — 그러지 않으면 되돌리기가 "아무 페널티나 지우고
     * 아무나 참가시키는" 임의 변경 수단이 된다. takeUndo가 소비 표시까지
     * 한 번에 하므로 연타해도 반전이 두 번 적용되지 않는다.
     */
    undoAdminAction: async ({ request }) => {
        const sessionToken = request.headers.get('cookie')?.match(/admin_session=([^;]+)/)?.[1];
        if (!sessionToken || !(await verifyAdminSession(sessionToken))) return fail(403, { error: '권한이 없습니다.' });

        const data = await request.formData();
        const undoId = Number(data.get('undoId'));
        if (!undoId) return fail(400, { error: '잘못된 요청입니다.' });

        const taken = await takeUndo(undoId);
        if (!taken.ok) {
            const message =
                taken.reason === 'already_undone'
                    ? '이미 되돌린 조치입니다.'
                    : taken.reason === 'expired'
                      ? '되돌릴 수 있는 시간이 지났습니다.'
                      : '되돌릴 기록을 찾지 못했습니다.';
            return fail(410, { error: message });
        }
        const entry = taken;

        const { applyPenalty } = await import('$lib/server/reservations');

        try {
            if (entry.kind === 'end_game') {
                const { sessionId, prevEndTime } = entry.payload;
                await db.transaction(async (tx) => {
                    await tx.execute(sql`
                        UPDATE game_sessions SET status = 'playing', end_time = ${prevEndTime}
                        WHERE id = ${sessionId}
                    `);
                    await tx.execute(sql`
                        UPDATE session_participants SET is_winner = false, score = NULL
                        WHERE session_id = ${sessionId}
                    `);
                });
            } else if (entry.kind === 'blacklist') {
                const { attendeeId, prev } = entry.payload;
                await db.execute(sql`
                    UPDATE attendees SET is_blacklisted = ${prev} WHERE id = ${attendeeId}
                `);
            } else if (entry.kind === 'no_show') {
                const { sessionId, attendeeId, status, createdAt, hadParticipant, penaltyLogId, promoted } = entry.payload;
                await db.transaction(async (tx) => {
                    // 1. 승계부터 되돌린다. 자리를 비워야 원래 사람이 돌아올 수 있다.
                    if (promoted?.mode === 'joined') {
                        await tx.execute(sql`
                            DELETE FROM session_participants
                            WHERE session_id = ${sessionId} AND attendee_id = ${promoted.attendeeId}
                        `);
                        await tx.execute(sql`
                            INSERT INTO reservations (session_id, attendee_id, status, created_at)
                            VALUES (${sessionId}, ${promoted.attendeeId}, 'waitlisted', ${promoted.createdAt})
                        `);
                    } else if (promoted?.mode === 'confirmed') {
                        await tx.execute(sql`
                            UPDATE reservations SET status = 'waitlisted' WHERE id = ${promoted.reservationId}
                        `);
                    }

                    // 2. 예약을 원래 상태로 되돌린다. 신청 시각까지 살려야 대기 순서가 유지된다.
                    await tx.execute(sql`
                        INSERT INTO reservations (session_id, attendee_id, status, created_at)
                        VALUES (${sessionId}, ${attendeeId}, ${status}, ${createdAt})
                    `);
                    if (hadParticipant) {
                        await tx.execute(sql`
                            INSERT INTO session_participants (session_id, attendee_id)
                            VALUES (${sessionId}, ${attendeeId})
                        `);
                    }

                    // 3. 페널티와 그 기록을 함께 지운다. 기록만 남으면 이력이 거짓이 된다.
                    if (penaltyLogId) {
                        await tx.execute(sql`DELETE FROM penalty_logs WHERE id = ${penaltyLogId}`);
                    }
                });
                await applyPenalty(Number(attendeeId), -1);
            } else {
                return fail(400, { error: '되돌릴 수 없는 조치입니다.' });
            }
        } catch (error) {
            console.error('undoAdminAction failed:', error);
            return fail(500, { error: '되돌리지 못했습니다. 화면을 새로고침해 상태를 확인해주세요.' });
        }

        emitLiveEvent('games');
        return { success: true, undoneLabel: entry.label };
    },

    markNoShow: async ({ request }) => {
        const sessionToken = request.headers.get('cookie')?.match(/admin_session=([^;]+)/)?.[1];
        if (!sessionToken || !(await verifyAdminSession(sessionToken))) return fail(403, { error: '권한이 없습니다.' });

        const data = await request.formData();
        const reservationId = data.get('reservationId');
        if (!reservationId) return fail(400, { error: '잘못된 요청입니다.' });

        const info = await db.execute(sql`
            SELECT r.session_id, r.attendee_id, r.status, r.created_at, a.name AS attendee_name, gs.game_name
            FROM reservations r
            JOIN attendees a ON a.id = r.attendee_id
            JOIN game_sessions gs ON gs.id = r.session_id
            WHERE r.id = ${reservationId}
        `);
        const row = (info as any[])[0];
        if (!row) return fail(404, { error: '이미 처리되었거나 없는 예약입니다.' });

        const { applyPenalty, promoteWaitlist } = await import('$lib/server/reservations');

        // 참가자 행이 원래 있었는지 알아야 되돌릴 때 없던 것을 만들지 않는다
        const hadParticipant = (await db.execute(sql`
            SELECT 1 FROM session_participants
            WHERE session_id = ${row.session_id} AND attendee_id = ${row.attendee_id}
        `)).length > 0;

        await db.transaction(async (tx) => {
            await tx.execute(sql`DELETE FROM reservations WHERE id = ${reservationId}`);
            await tx.execute(sql`
                DELETE FROM session_participants
                WHERE session_id = ${row.session_id} AND attendee_id = ${row.attendee_id}
            `);
        });

        const total = await applyPenalty(Number(row.attendee_id), 1);
        const penaltyLogRows = await db.execute(sql`
            INSERT INTO penalty_logs (attendee_id, points, reason, total_after)
            VALUES (${row.attendee_id}, 1, 'no_show', ${total})
            RETURNING id
        `);
        const promoted = await promoteWaitlist(row.session_id);

        const undo = await recordUndo(
            'no_show',
            {
                sessionId: Number(row.session_id),
                attendeeId: Number(row.attendee_id),
                status: row.status,
                createdAt: row.created_at,
                hadParticipant,
                penaltyLogId: Number((penaltyLogRows as any[])[0]?.id),
                promoted
            },
            `${row.attendee_name}님의 노쇼 처리`
        );

        const thresholdRow = await db.execute(sql`SELECT value FROM system_settings WHERE key = 'penalty_threshold'`);
        const threshold = parseInt((thresholdRow as any[])[0]?.value ?? '3');

        emitLiveEvent('games');
        return {
            success: true,
            undo,
            penalty: {
                name: row.attendee_name as string,
                points: 1,
                total,
                threshold,
                reason: '노쇼',
                blocked: total >= threshold
            }
        };
    },

    /** 예약 강제 취소 — 자리가 비면 대기열 다음 사람이 자동 승계된다. */
    cancelReservationAdmin: async ({ request }) => {
        const sessionToken = request.headers.get('cookie')?.match(/admin_session=([^;]+)/)?.[1];
        if (!sessionToken || !(await verifyAdminSession(sessionToken))) return fail(403, { error: '권한이 없습니다.' });

        const data = await request.formData();
        const reservationId = data.get('reservationId');
        if (!reservationId) return fail(400, { error: '잘못된 요청입니다.' });

        const info = await db.execute(sql`
            SELECT r.session_id, r.attendee_id, r.status, a.name AS attendee_name, gs.game_name
            FROM reservations r
            JOIN attendees a ON a.id = r.attendee_id
            JOIN game_sessions gs ON gs.id = r.session_id
            WHERE r.id = ${reservationId}
        `);
        const row = (info as any[])[0];
        if (!row) return fail(404, { error: '이미 처리되었거나 없는 예약입니다.' });

        await db.transaction(async (tx) => {
            await tx.execute(sql`DELETE FROM reservations WHERE id = ${reservationId}`);
            if (row.status === 'confirmed') {
                await tx.execute(sql`
                    DELETE FROM session_participants
                    WHERE session_id = ${row.session_id} AND attendee_id = ${row.attendee_id}
                `);
            }
        });

        const { promoteWaitlist } = await import('$lib/server/reservations');
        await promoteWaitlist(row.session_id);

        emitLiveEvent('games');
        return { success: true, queue: { name: row.attendee_name as string, game: row.game_name as string, kind: 'cancel' } };
    },

    dissolveScheduledGame: async ({ request }) => {
        const data = await request.formData();
        const sessionId = data.get('sessionId');
        if (!sessionId) return fail(400, { error: '잘못된 요청입니다.' });
        if (!(await canModifyGame(request, sessionId.toString()))) return fail(403, { error: '권한이 없습니다.' });

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
            return fail(500, { error: '게임 폭파에 실패했습니다.' });
        }
    },

    startScheduledGame: async ({ request }) => {
        const data = await request.formData();
        const sessionId = data.get('sessionId');
        const duration = parseInt(data.get('duration')?.toString() || '60');

        if (!sessionId) return fail(400, { error: '잘못된 요청입니다.' });
        if (!(await canModifyGame(request, sessionId.toString()))) return fail(403, { error: '권한이 없습니다.' });

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
            return fail(500, { error: '게임 시작에 실패했습니다.' });
        }
    },

    applyPenaltyAdmin: async ({ request }) => {
        const sessionToken = request.headers.get('cookie')?.match(/admin_session=([^;]+)/)?.[1];
        if (!sessionToken || !(await verifyAdminSession(sessionToken))) return fail(403, { error: '권한이 없습니다.' });

        const data = await request.formData();
        const attendeeId = data.get('attendeeId');
        const points = parseInt(data.get('points')?.toString() || '1');
        const reason = data.get('reason')?.toString() || '';

        if (!attendeeId) return fail(400, { error: '잘못된 요청입니다.' });
        if (points !== 1 && points !== -1) return fail(400, { error: '페널티는 한 번에 1점씩만 조정할 수 있습니다.' });
        if (points === 1 && !PENALTY_REASONS[reason]) return fail(400, { error: '페널티 사유를 선택해주세요.' });

        const targetRows = await db.execute(sql`SELECT name, penalty_points FROM attendees WHERE id = ${attendeeId}`);
        const target = (targetRows as any[])[0];
        if (!target) return fail(404, { error: '해당 인원을 찾을 수 없습니다.' });
        if (points === -1 && target.penalty_points <= 0)
            return fail(400, { error: `${target.name}님은 현재 페널티가 없습니다.` });

        const { applyPenalty } = await import('$lib/server/reservations');
        const total = await applyPenalty(Number(attendeeId), points);

        await db.execute(sql`
            INSERT INTO penalty_logs (attendee_id, points, reason, total_after)
            VALUES (${attendeeId}, ${points}, ${points === 1 ? reason : 'revoke'}, ${total})
        `);

        const thresholdRows = await db.execute(sql`SELECT value FROM system_settings WHERE key = 'penalty_threshold'`);
        const threshold = parseInt((thresholdRows as any[])[0]?.value ?? '3');

        return {
            success: true,
            penalty: {
                name: target.name as string,
                points,
                total,
                threshold,
                reason: points === 1 ? PENALTY_REASONS[reason] : '취소',
                blocked: total >= threshold
            }
        };
    },

    toggleBlacklist: async ({ request }) => {
        const sessionToken = request.headers.get('cookie')?.match(/admin_session=([^;]+)/)?.[1];
        if (!sessionToken || !(await verifyAdminSession(sessionToken))) return fail(403, { error: '권한이 없습니다.' });

        const data = await request.formData();
        const attendeeId = data.get('attendeeId');
        if (!attendeeId) return fail(400, { error: '잘못된 요청입니다.' });

        const beforeRows = await db.execute(sql`SELECT name, is_blacklisted FROM attendees WHERE id = ${attendeeId}`);
        const before = (beforeRows as any[])[0];
        if (!before) return fail(404, { error: '해당 인원을 찾을 수 없습니다.' });

        await db.execute(sql`UPDATE attendees SET is_blacklisted = NOT is_blacklisted WHERE id = ${attendeeId}`);

        // 등록만 되돌릴 거리가 된다 — 해제는 파괴적이지 않고, 다시 등록하면 그만이다.
        // 확인창이 있는데도 남기는 이유는 adminUndo.ts의 UndoKind 주석에 있다.
        const undo = before.is_blacklisted
            ? undefined
            : await recordUndo(
                  'blacklist',
                  { attendeeId: Number(attendeeId), prev: false },
                  `${before.name}님의 블랙리스트 등록`
              );

        return { success: true, undo };
    },

    toggleManager: async ({ request }) => {
        const sessionToken = request.headers.get('cookie')?.match(/admin_session=([^;]+)/)?.[1];
        if (!sessionToken || !(await verifyAdminSession(sessionToken))) return fail(403, { error: '권한이 없습니다.' });

        const data = await request.formData();
        const attendeeId = data.get('attendeeId');
        if (!attendeeId) return fail(400, { error: '잘못된 요청입니다.' });

        await db.execute(sql`UPDATE attendees SET can_manage_games = NOT can_manage_games WHERE id = ${attendeeId}`);
        return { success: true };
    },

    joinGame: async ({ request, cookies }) => {
        const data = await request.formData();
        const sessionId = data.get('sessionId');
        const attendeeId = data.get('attendeeId');

        if (!sessionId || !attendeeId) return fail(400, { error: '잘못된 요청입니다.' });

        const sessionToken = cookies.get('admin_session');
        if (!sessionToken || !(await verifyAdminSession(sessionToken))) return fail(403, { error: '권한이 없습니다.' });

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
            return fail(500, { error: '참여자 추가에 실패했습니다.' });
        }
        return { success: true };
    },
    addGuestToGame: async ({ request, cookies }) => {
        const data = await request.formData();
        const sessionId = data.get('sessionId');
        const customName = data.get('guestName')?.toString().trim();

        if (!sessionId) return fail(400, { error: '잘못된 요청입니다.' });

        const sessionToken = cookies.get('admin_session');
        if (!sessionToken || !(await verifyAdminSession(sessionToken))) return fail(403, { error: '권한이 없습니다.' });

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
        if (!id) return fail(400, { error: '잘못된 요청입니다.' });

        await db.execute(sql`UPDATE tables SET is_active = false WHERE id = ${id}`);
        return { success: true };
    },



    createScheduledGame: async ({ request }) => {
        const data = await request.formData();
        const gameName = data.get('gameName')?.toString();
        const scheduledAt = data.get('scheduledAt')?.toString();
        const minPlayers = parseInt(data.get('minPlayers')?.toString() || '2');
        const maxPlayers = parseInt(data.get('maxPlayers')?.toString() || '4');
        const guestCount = parseInt(data.get('guestCount')?.toString() || '0');
        const showOnMain = data.get('showOnMain') === 'true';

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
            });
            emitLiveEvent('games');
            return { success: true };
        } catch (e) {
            console.error('Failed to create scheduled game:', e);
            return fail(500, { error: '게임 생성에 실패했습니다.' });
        }
    }
};
