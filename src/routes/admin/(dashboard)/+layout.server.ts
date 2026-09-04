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

    /*
        마감 확인창이 자기가 지울 것의 크기를 말할 수 있어야 한다. 「모든 참가자」
        「진행 중인 게임」이라고만 하면 몇 명 몇 판인지는 운영자가 기억해서
        채워야 한다 — 23시 29분에 한 손으로 누르는 버튼 앞에서.
        마감 버튼은 대시보드가 아닌 하위 페이지에서도 눌리므로 레이아웃이 센다.
    */
    const summaryResult = await db.execute(sql`
        SELECT
            (SELECT COUNT(*) FROM attendees WHERE status = 'present') AS present,
            (SELECT COUNT(*) FROM game_sessions WHERE status = 'playing') AS playing
    `);
    const summaryRow = (summaryResult as any[])[0] ?? {};

    return {
        settings,
        closingDisplay,
        closeDaySummary: {
            present: Number(summaryRow.present ?? 0),
            playing: Number(summaryRow.playing ?? 0)
        }
    };
};
