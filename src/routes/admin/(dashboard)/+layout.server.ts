import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
    const settingsResult = await db.execute(sql`SELECT key, value FROM system_settings`);
    const settings = (settingsResult as any[]).reduce((acc: any, row: any) => {
        acc[row.key] = row.value;
        return acc;
    }, { closing_time_weekday: '22:00', closing_time_weekend: '23:00', weekend_days: '5,6' });

    // Calculate Today's Closing Time
    const now = new Date();
    // Convert to KST for day check (UTC+9)
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const currentHour = kstNow.getUTCHours();
    let day = kstNow.getUTCDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat

    // Business day cutoff: 9 AM
    if (currentHour < 9) {
        day = (day + 6) % 7;
    }

    // Check if today is a configured weekend day
    const weekendDays = settings.weekend_days.split(',').map(Number);
    const isWeekend = weekendDays.includes(day);
    const closingTimeStr = isWeekend ? settings.closing_time_weekend : settings.closing_time_weekday;

    // Determine display string (e.g., "다음날 06:00")
    let closingDisplay = closingTimeStr;
    const [hours] = closingTimeStr.split(':').map(Number);
    if (hours < 12) {
        closingDisplay = `다음날 ${closingTimeStr}`;
    } else {
        closingDisplay = `오늘 ${closingTimeStr}`;
    }

    return {
        settings,
        closingDisplay
    };
};
