import { query } from './db';

let intervalId: NodeJS.Timeout | null = null;

export function startAutoCloseScheduler() {
    if (intervalId) return; // Already running

    console.log('Starting Auto-Close Scheduler...');

    // Check every minute
    intervalId = setInterval(async () => {
        try {
            await checkAndClose();
        } catch (err) {
            console.error('Auto-Close Error:', err);
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
    // If current time is 00:00 ~ 05:59, it belongs to "Yesterday's" business day
    let businessDay = kstNow.getUTCDay(); // 0=Sun, ..., 6=Sat
    if (currentHour < 6) {
        businessDay = (businessDay + 6) % 7; // Go back 1 day
    }

    // Fetch Settings
    const settingsResult = await query('SELECT key, value FROM system_settings');
    const settings = settingsResult.rows.reduce((acc: any, row: any) => {
        acc[row.key] = row.value;
        return acc;
    }, { closing_time_weekday: '22:00', closing_time_weekend: '23:00', weekend_days: '5,6', is_open: 'true' });

    // If already closed, do nothing
    if (settings.is_open === 'false') return;

    // Determine Target Closing Time
    const weekendDays = settings.weekend_days.split(',').map(Number);
    const isWeekend = weekendDays.includes(businessDay);
    const targetTime = isWeekend ? settings.closing_time_weekend : settings.closing_time_weekday;

    // Convert times to "minutes from 06:00" to handle late night closing safely
    // 06:00 -> 0
    // 12:00 -> 360
    // 22:00 -> 960
    // 00:00 -> 1080
    // 02:00 -> 1200
    // 05:59 -> 1439
    
    const getMinutesSince6AM = (hour: number, minute: number) => {
        const adjustedHour = hour < 6 ? hour + 24 : hour;
        return (adjustedHour - 6) * 60 + minute;
    };

    const [targetHour, targetMinute] = targetTime.split(':').map(Number);
    
    const currentMinutes = getMinutesSince6AM(currentHour, currentMinute);
    const targetMinutes = getMinutesSince6AM(targetHour, targetMinute);

    console.log(`[AutoClose Debug] Now(UTC): ${now.toISOString()}, KST_Shifted: ${kstNow.toISOString()}`);
    console.log(`[AutoClose Debug] Current: ${currentHour}:${currentMinute} (${currentMinutes}m), Target: ${targetTime} (${targetMinutes}m), Day: ${businessDay}`);

    // Check if current time is past the closing time
    if (currentMinutes >= targetMinutes) {
        console.log(`Auto-Closing Day... (Current: ${currentHour}:${currentMinute}, Target: ${targetTime}, Business Day: ${businessDay})`);
        await performCloseDay();
    }
}

async function performCloseDay() {
    try {
        await query('BEGIN');
        // Checkout all active visits
        await query('UPDATE visits SET departure_time = NOW() WHERE departure_time IS NULL');
        // End all active games
        await query('UPDATE game_sessions SET end_time = NOW() WHERE end_time > NOW()');
        // Set is_open to false
        await query("INSERT INTO system_settings (key, value) VALUES ('is_open', 'false') ON CONFLICT (key) DO UPDATE SET value = 'false'");
        await query('COMMIT');
        console.log('Auto-Close Complete.');
    } catch (error) {
        await query('ROLLBACK');
        console.error('Failed to perform auto-close:', error);
    }
}
