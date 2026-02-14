import { query } from './db';
import { applyPenalty, promoteWaitlist } from './reservations';
import { updateSettingsCache, markAllLeft } from './ble';
import { emitLiveEvent } from './liveEvents';

let intervalId: NodeJS.Timeout | null = null;
let isRunning = false;

export function startAutoCloseScheduler() {
    if (intervalId) return; // Already running

    console.log('Starting Auto-Close Scheduler...');

    // Check every minute
    intervalId = setInterval(async () => {
        if (isRunning) return;
        isRunning = true;
        try {
            await checkAndClose();
            await checkReservations();
        } catch (err) {
            console.error('Auto-Close Error:', err);
        } finally {
            isRunning = false;
        }
    }, 60 * 1000);
}

async function checkAndClose() {
    const now = new Date();
    // KST Time
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const currentHour = kstNow.getUTCHours();
    const currentMinute = kstNow.getUTCMinutes();
    
    // Determine "Business Day"
    // If current time is 00:00 ~ 08:59, it belongs to "Yesterday's" business day
    let businessDay = kstNow.getUTCDay(); // 0=Sun, ..., 6=Sat
    let businessDateObj = new Date(kstNow);
    if (currentHour < 9) {
        businessDay = (businessDay + 6) % 7; // Go back 1 day
        businessDateObj.setUTCDate(businessDateObj.getUTCDate() - 1);
    }
    const businessDate = businessDateObj.toISOString().split('T')[0]; // YYYY-MM-DD

    // Fetch Settings
    const settingsResult = await query('SELECT key, value FROM system_settings');
    const settings = settingsResult.rows.reduce((acc: any, row: any) => {
        acc[row.key] = row.value;
        return acc;
    }, { 
        closing_time_weekday: '22:00', 
        closing_time_weekend: '23:00', 
        weekend_days: '5,6', 
        is_open: 'true',
        last_auto_close_date: ''
    });

    // If already closed, do nothing
    if (settings.is_open === 'false') return;

    // If already auto-closed today, do nothing
    if (settings.last_auto_close_date === businessDate) {
        return;
    }

    // Determine Target Closing Time
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

    // Check if current time is past the closing time
    if (currentMinutes >= targetMinutes) {
        console.log(`Auto-Closing Day... (Current: ${currentHour}:${currentMinute}, Target: ${targetTime}, Business Day: ${businessDay}, Date: ${businessDate})`);
        await performCloseDay(businessDate);
    }
}

async function performCloseDay(businessDate: string) {
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
        updateSettingsCache(false);
        markAllLeft();
        // Record the last auto-close date
        await query("INSERT INTO system_settings (key, value) VALUES ('last_auto_close_date', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [businessDate]);
        await query('COMMIT');
        emitLiveEvent('visitors');
        emitLiveEvent('games');
        console.log(`Auto-Close Complete for ${businessDate}.`);
    } catch (error) {
        await query('ROLLBACK');
        console.error('Failed to perform auto-close:', error);
    }
}

async function checkReservations() {
    try {
        // Fetch Settings
        const settingsResult = await query('SELECT key, value FROM system_settings');
        const settings = settingsResult.rows.reduce((acc: any, row: any) => {
            acc[row.key] = row.value;
            return acc;
        }, {
            no_show_limit_minutes: '10'
        });

        const noShowLimit = parseInt(settings.no_show_limit_minutes);

        // 1. Auto-cancel No-shows
        const noShows = await query(`
            SELECT r.id, r.attendee_id, r.session_id
            FROM reservations r
            JOIN game_sessions gs ON r.session_id = gs.id
            WHERE gs.status = 'scheduled' 
              AND gs.scheduled_at < NOW() - ($1 || ' minutes')::interval
              AND r.status IN ('pending', 'confirmed')
        `, [noShowLimit]);
        
        for (const row of noShows.rows) {
            await query("UPDATE reservations SET status = 'cancelled' WHERE id = $1", [row.id]);
            await applyPenalty(row.attendee_id);
            await promoteWaitlist(row.session_id);
            console.log(`Auto-cancelled reservation ${row.id} for attendee ${row.attendee_id} (No-show)`);
        }

        // 2. Auto-start scheduled games that have passed their scheduled time
        const readyToStart = await query(`
            SELECT gs.id, gs.game_id, gs.game_name,
                   COALESCE(g.playtime_min, 60) as playtime_min,
                   COUNT(sp.id) as current_players
            FROM game_sessions gs
            LEFT JOIN session_participants sp ON gs.id = sp.session_id
            LEFT JOIN games g ON gs.game_id = g.id
            WHERE gs.status = 'scheduled'
              AND gs.scheduled_at <= NOW()
            GROUP BY gs.id, gs.game_id, gs.game_name, g.playtime_min
        `);

        for (const row of readyToStart.rows) {
            const duration = row.playtime_min || 60;
            await query(
                "UPDATE game_sessions SET status = 'playing', start_time = NOW(), end_time = NOW() + interval '" + duration + " minutes' WHERE id = $1",
                [row.id]
            );
            await query("UPDATE reservations SET status = 'confirmed' WHERE session_id = $1 AND status = 'pending'", [row.id]);
            emitLiveEvent('games');
            console.log(`Auto-started session ${row.id} (${row.game_name}, ${duration}min, ${row.current_players} players)`);
        }

    } catch (error) {
        console.error('Failed to check reservations:', error);
    }
}
