import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { updateSettingsCache, markAllLeft } from './ble';
import { emitLiveEvent } from './liveEvents';

let intervalId: NodeJS.Timeout | null = null;
let isRunning = false;

export function startAutoCloseScheduler() {
    if (intervalId) return;

    console.log('Starting Auto-Close Scheduler...');

    intervalId = setInterval(async () => {
        if (isRunning) return;
        isRunning = true;
        try {
            await checkAndClose();
            await checkReservations();
            await checkRecurringGames();
        } catch (err) {
            console.error('Auto-Close Error:', err);
        } finally {
            isRunning = false;
        }
    }, 60 * 1000);
}

async function checkAndClose() {
    const now = new Date();
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const currentHour = kstNow.getUTCHours();
    const currentMinute = kstNow.getUTCMinutes();

    let businessDay = kstNow.getUTCDay();
    let businessDateObj = new Date(kstNow);
    if (currentHour < 9) {
        businessDay = (businessDay + 6) % 7;
        businessDateObj.setUTCDate(businessDateObj.getUTCDate() - 1);
    }
    const businessDate = businessDateObj.toISOString().split('T')[0];

    const settingsResult = await db.execute(sql`SELECT key, value FROM system_settings`);
    const settings = (settingsResult as any[]).reduce((acc: any, row: any) => {
        acc[row.key] = row.value;
        return acc;
    }, {
        closing_time_weekday: '22:00',
        closing_time_weekend: '23:00',
        weekend_days: '5,6',
        is_open: 'true',
        last_auto_close_date: ''
    });

    if (settings.is_open === 'false') return;
    if (settings.last_auto_close_date === businessDate) return;

    const weekendDays = settings.weekend_days.split(',').map(Number);
    const isWeekend = weekendDays.includes(businessDay);
    const targetTime = isWeekend ? settings.closing_time_weekend : settings.closing_time_weekday;

    const getMinutesSince9AM = (hour: number, minute: number) => {
        const adjustedHour = hour < 9 ? hour + 24 : hour;
        return (adjustedHour - 9) * 60 + minute;
    };

    const [targetHour, targetMinute] = targetTime.split(':').map(Number);

    const currentMinutes = getMinutesSince9AM(currentHour, currentMinute);
    const targetMinutes = getMinutesSince9AM(targetHour, targetMinute);

    if (currentMinutes >= targetMinutes) {
        console.log(`Auto-Closing Day... (Current: ${currentHour}:${currentMinute}, Target: ${targetTime}, Business Day: ${businessDay}, Date: ${businessDate})`);
        await performCloseDay(businessDate);
    }
}

async function performCloseDay(businessDate: string) {
    try {
        await db.transaction(async (tx) => {
            await tx.execute(sql`UPDATE visits SET departure_time = NOW() WHERE departure_time IS NULL`);
            await tx.execute(sql`UPDATE attendees SET status = 'left' WHERE status = 'present'`);
            await tx.execute(sql`UPDATE game_sessions SET status = 'finished', end_time = NOW() WHERE status = 'playing'`);
            await tx.execute(sql`INSERT INTO system_settings (key, value) VALUES ('is_open', 'false') ON CONFLICT (key) DO UPDATE SET value = 'false'`);
            updateSettingsCache(false);
            markAllLeft();
            await tx.execute(sql`DELETE FROM daily_visit_plans WHERE plan_date < CURRENT_DATE`);
            // 시간이 지난 예정 게임만 정리 (미래 일정은 유지)
            await tx.execute(sql`
                INSERT INTO recurring_game_skips (recurring_schedule_id, skip_date)
                SELECT recurring_schedule_id, ${businessDate}::date
                FROM game_sessions
                WHERE status = 'scheduled' AND recurring_schedule_id IS NOT NULL
                  AND scheduled_at <= NOW()
                ON CONFLICT DO NOTHING
            `);
            await tx.execute(sql`DELETE FROM game_sessions WHERE status = 'scheduled' AND scheduled_at <= NOW()`);
            await tx.execute(sql`INSERT INTO system_settings (key, value) VALUES ('last_auto_close_date', ${businessDate}) ON CONFLICT (key) DO UPDATE SET value = ${businessDate}`);
        });
        emitLiveEvent('visitors');
        emitLiveEvent('games');
        console.log(`Auto-Close Complete for ${businessDate}.`);
    } catch (error) {
        console.error('Failed to perform auto-close:', error);
    }
}

async function checkReservations() {
    // 노쇼 처리 및 자동 시작 제거됨 — 예약 게임은 수동으로 관리
}

async function checkRecurringGames() {
    try {
        const now = new Date();
        const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        const currentHour = kstNow.getUTCHours();

        let businessDateObj = new Date(kstNow);
        if (currentHour < 9) {
            businessDateObj.setUTCDate(businessDateObj.getUTCDate() - 1);
        }
        const businessDate = businessDateObj.toISOString().split('T')[0];
        const dayOfWeek = businessDateObj.getUTCDay();

        // 현재 KST 시간 (HH:MM 형식) - 이미 지난 시간의 일정은 생성하지 않음
        const currentTime = `${String(currentHour).padStart(2, '0')}:${String(kstNow.getUTCMinutes()).padStart(2, '0')}`;

        const schedules = await db.execute(sql`
            SELECT rs.*
            FROM recurring_game_schedules rs
            WHERE rs.is_active = true
              AND rs.day_of_week = ${dayOfWeek}
              AND rs.scheduled_time > ${currentTime}::time
              AND NOT EXISTS (
                  SELECT 1 FROM recurring_game_skips rsk
                  WHERE rsk.recurring_schedule_id = rs.id
                    AND rsk.skip_date = ${businessDate}::date
              )
              AND NOT EXISTS (
                  SELECT 1 FROM game_sessions gs
                  WHERE gs.recurring_schedule_id = rs.id
                    AND gs.scheduled_at::date = ${businessDate}::date
              )
        `);

        for (const schedule of schedules) {
            const s = schedule as any;
            const scheduledAt = `${businessDate} ${s.scheduled_time}`;
            const result = await db.execute(sql`
                INSERT INTO game_sessions (game_id, game_name, status, scheduled_at, max_players, show_on_main, recurring_schedule_id, party_id)
                VALUES (${s.game_id}, ${s.game_name}, 'scheduled', ${scheduledAt}::timestamp AT TIME ZONE 'Asia/Seoul', ${s.max_players}, ${s.show_on_main}, ${s.id}, ${s.party_id})
                RETURNING id
            `);

            console.log(`Auto-created recurring game session ${(result[0] as any).id} (${s.game_name}, schedule ${s.id})`);
        }

        if (schedules.length > 0) {
            emitLiveEvent('games');
        }
    } catch (error) {
        console.error('Failed to check recurring games:', error);
    }
}
