import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { updateSettingsCache } from '$lib/server/ble';
import { emitLiveEvent } from '$lib/server/liveEvents';
import { verifyAdminSession } from '$lib/server/auth';

async function requireAdmin(request: Request) {
    const token = request.headers.get('cookie')?.match(/admin_session=([^;]+)/)?.[1];
    return !!token && (await verifyAdminSession(token));
}

export const load: PageServerLoad = async () => {
    const [settingsResult, noticeResult, recurringResult, allGamesResult] = await Promise.all([
        db.execute(sql`SELECT key, value FROM system_settings`),
        db.execute(sql`SELECT content FROM notices WHERE is_active = true ORDER BY created_at DESC LIMIT 1`),
        db.execute(sql`
            SELECT rs.*,
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
        db.execute(sql`SELECT id, name, min_players, max_players FROM games WHERE is_active = true ORDER BY name ASC`)
    ]);
    const settings = (settingsResult as any[]).reduce((acc: any, row: any) => {
        acc[row.key] = row.value;
        return acc;
    }, {
        closing_time_weekday: '22:00',
        closing_time_weekend: '23:00',
        weekend_days: '5,6',
        is_open: 'true',
        opening_time: '09:00',
        no_show_limit_minutes: '10',
        auto_dissolve_limit_minutes: '10',
        penalty_threshold: '3'
    });

    return {
        settings,
        notice: (noticeResult[0] as any)?.content || null,
        recurringSchedules: recurringResult as any[],
        allGames: allGamesResult as any[]
    };
};

export const actions: Actions = {
    updateSettings: async ({ request }) => {
        const data = await request.formData();
        const updates = [
            'closing_time_weekday',
            'closing_time_weekend',
            'opening_time',
            'weekend_days',
            'no_show_limit_minutes',
            'auto_dissolve_limit_minutes',
            'penalty_threshold'
        ];

        try {
            await db.transaction(async (tx) => {
                for (const key of updates) {
                    const value = data.get(key)?.toString();
                    if (value !== undefined) {
                        await tx.execute(
                            sql`INSERT INTO system_settings (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO UPDATE SET value = ${value}`
                        );
                    }
                }
            });
            // BLE 설정 캐시 동기화
            const openingTime = data.get('opening_time')?.toString();
            if (openingTime) updateSettingsCache(true, openingTime);
            return { success: true };
        } catch (e) {
            return fail(500, { error: '설정 저장 실패' });
        }
    },

    /* ── 공지 ── 대시보드에서 옮겨 왔다. 며칠 단위로 유지되는 정책성 항목이라
       "지금 방 상태"를 보는 화면에 있을 이유가 없다. */
    updateNotice: async ({ request }) => {
        if (!(await requireAdmin(request))) return fail(403, { error: '권한이 없습니다.' });
        const data = await request.formData();
        const content = data.get('content')?.toString()?.trim();
        if (!content) return fail(400, { error: '공지 내용을 입력해주세요.' });

        try {
            await db.transaction(async (tx) => {
                await tx.execute(sql`UPDATE notices SET is_active = false`);
                await tx.execute(sql`INSERT INTO notices (content) VALUES (${content})`);
            });
            return { success: true };
        } catch (error) {
            return fail(500, { error: '공지 등록에 실패했습니다.' });
        }
    },

    clearNotice: async ({ request }) => {
        if (!(await requireAdmin(request))) return fail(403, { error: '권한이 없습니다.' });
        try {
            await db.execute(sql`UPDATE notices SET is_active = false`);
            return { success: true };
        } catch (error) {
            return fail(500, { error: '공지 숨김 처리에 실패했습니다.' });
        }
    },

    /* ── 반복 게임 일정 ──
       만드는 곳과 관리하는 곳을 한 화면에 모았다. 이전에는 대시보드의
       「게임 일정 등록」 모달 체크박스로 만들고 목록은 다른 곳에서 봐야 했다. */
    createRecurringSchedule: async ({ request }) => {
        if (!(await requireAdmin(request))) return fail(403, { error: '권한이 없습니다.' });
        const data = await request.formData();
        const gameName = data.get('gameName')?.toString()?.trim();
        const dayOfWeek = parseInt(data.get('dayOfWeek')?.toString() ?? '');
        const scheduledTime = data.get('scheduledTime')?.toString();
        const minPlayers = parseInt(data.get('minPlayers')?.toString() || '2');
        const maxPlayers = parseInt(data.get('maxPlayers')?.toString() || '4');
        const showOnMain = data.get('showOnMain') === 'true';

        if (!gameName) return fail(400, { error: '게임 이름을 입력해주세요.' });
        if (!(dayOfWeek >= 0 && dayOfWeek <= 6)) return fail(400, { error: '요일을 선택해주세요.' });
        if (!scheduledTime) return fail(400, { error: '시간을 입력해주세요.' });
        if (minPlayers > maxPlayers) return fail(400, { error: '최소 인원이 최대 인원보다 클 수 없습니다.' });

        try {
            const gameIdResult = await db.execute(sql`SELECT id FROM games WHERE name = ${gameName} LIMIT 1`);
            const gameIdVal = (gameIdResult[0] as any)?.id ?? null;
            await db.execute(sql`
                INSERT INTO recurring_game_schedules (game_name, game_id, day_of_week, scheduled_time, min_players, max_players, show_on_main)
                VALUES (${gameName}, ${gameIdVal}, ${dayOfWeek}, ${scheduledTime}, ${minPlayers}, ${maxPlayers}, ${showOnMain})
            `);
            emitLiveEvent('games');
            return { success: true, created: gameName };
        } catch (e) {
            return fail(500, { error: '반복 일정 등록에 실패했습니다.' });
        }
    },

    skipRecurringWeek: async ({ request }) => {
        if (!(await requireAdmin(request))) return fail(403, { error: '권한이 없습니다.' });
        const data = await request.formData();
        const scheduleId = data.get('scheduleId');
        if (!scheduleId) return fail(400, { error: '잘못된 요청입니다.' });

        try {
            const schedule = await db.execute(sql`SELECT day_of_week FROM recurring_game_schedules WHERE id = ${scheduleId}`);
            if (schedule.length === 0) return fail(404, { error: '스케줄을 찾을 수 없습니다.' });

            const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
            const today = kstNow.getUTCDay();
            const targetDay = (schedule[0] as any).day_of_week;
            let diff = targetDay - today;
            if (diff < 0) diff += 7;
            const skipDate = new Date(kstNow);
            skipDate.setUTCDate(skipDate.getUTCDate() + diff);
            const skipDateStr = skipDate.toISOString().split('T')[0];

            const existing = await db.execute(sql`
                SELECT id FROM recurring_game_skips WHERE recurring_schedule_id = ${scheduleId} AND skip_date = ${skipDateStr}::date
            `);

            if (existing.length > 0) {
                await db.execute(sql`
                    DELETE FROM recurring_game_skips WHERE recurring_schedule_id = ${scheduleId} AND skip_date = ${skipDateStr}::date
                `);
                emitLiveEvent('games');
                return { success: true, message: '이번주 스킵을 해제했습니다.' };
            }

            await db.transaction(async (tx) => {
                await tx.execute(sql`
                    INSERT INTO recurring_game_skips (recurring_schedule_id, skip_date) VALUES (${scheduleId}, ${skipDateStr}) ON CONFLICT DO NOTHING
                `);
                await tx.execute(sql`
                    DELETE FROM game_sessions WHERE recurring_schedule_id = ${scheduleId} AND status = 'scheduled' AND scheduled_at::date = ${skipDateStr}::date
                `);
            });
            emitLiveEvent('games');
            return { success: true, message: '이번주를 건너뜁니다.' };
        } catch (e) {
            return fail(500, { error: '처리 중 오류가 발생했습니다.' });
        }
    },

    toggleRecurringActive: async ({ request }) => {
        if (!(await requireAdmin(request))) return fail(403, { error: '권한이 없습니다.' });
        const data = await request.formData();
        const scheduleId = data.get('scheduleId');
        if (!scheduleId) return fail(400, { error: '잘못된 요청입니다.' });
        try {
            await db.execute(sql`UPDATE recurring_game_schedules SET is_active = NOT is_active WHERE id = ${scheduleId}`);
            return { success: true };
        } catch (e) {
            return fail(500, { error: '처리 중 오류가 발생했습니다.' });
        }
    },

    deleteRecurringSchedule: async ({ request }) => {
        if (!(await requireAdmin(request))) return fail(403, { error: '권한이 없습니다.' });
        const data = await request.formData();
        const scheduleId = data.get('scheduleId');
        if (!scheduleId) return fail(400, { error: '잘못된 요청입니다.' });
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
