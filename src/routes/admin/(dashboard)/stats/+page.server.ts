import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
    // 1. KPIs
    const totalVisitsResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM (
            SELECT DISTINCT attendee_id, DATE(arrival_time AT TIME ZONE 'Asia/Seoul')
            FROM visits
        ) sub
    `);
    const totalMembersResult = await db.execute(sql`SELECT COUNT(*) as count FROM attendees`);
    const avgDurationResult = await db.execute(sql`
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(departure_time, NOW()) - arrival_time))/60)) as avg_minutes
        FROM visits
    `);

    // 2. Daily Trend (Last 30 Days)
    const dailyTrendResult = await db.execute(sql`
        SELECT TO_CHAR(arrival_time AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') as date,
               COUNT(DISTINCT attendee_id) as count
        FROM visits
        WHERE arrival_time >= NOW() - INTERVAL '30 days'
        GROUP BY date
        ORDER BY date ASC
    `);

    // 2.5 Monthly Trend (Last 12 Months)
    const monthlyTrendResult = await db.execute(sql`
        SELECT TO_CHAR(arrival_time AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') as date,
               COUNT(DISTINCT attendee_id) as count
        FROM visits
        WHERE arrival_time >= NOW() - INTERVAL '12 months'
        GROUP BY date
        ORDER BY date ASC
    `);

    // 3. Peak Hours
    const peakHoursResult = await db.execute(sql`
        SELECT hour, COUNT(*) as count FROM (
            SELECT DISTINCT attendee_id,
                   DATE(arrival_time AT TIME ZONE 'Asia/Seoul'),
                   EXTRACT(HOUR FROM arrival_time AT TIME ZONE 'Asia/Seoul') as hour
            FROM visits
        ) sub
        GROUP BY hour
        ORDER BY hour ASC
    `);

    // 4. Popular Games
    const popularGamesResult = await db.execute(sql`
        SELECT game_name, COUNT(*) as count
        FROM game_sessions
        GROUP BY game_name
        ORDER BY count DESC
        LIMIT 5
    `);

    // 5. Process Hourly Data (Fill 0-23)
    const hourlyData = Array.from({ length: 24 }, (_, i) => {
        const found = (peakHoursResult as any[]).find((h: any) => parseInt(h.hour) === i);
        return { hour: i, count: found ? parseInt(found.count) : 0 };
    });

    // 6. User Stats (non-admin users only)
    const avgWeeklyResult = await db.execute(sql`
        SELECT ROUND(AVG(visit_count)::numeric / GREATEST(30.0 / 7, 1), 1) as avg_weekly
        FROM (
            SELECT v.attendee_id, COUNT(DISTINCT DATE(v.arrival_time AT TIME ZONE 'Asia/Seoul')) as visit_count
            FROM visits v
            JOIN attendees a ON a.id = v.attendee_id
            WHERE a.is_admin = false AND v.arrival_time >= NOW() - INTERVAL '30 days'
            GROUP BY v.attendee_id
        ) sub
    `);

    const avgMonthlyResult = await db.execute(sql`
        SELECT ROUND(AVG(visit_count)::numeric, 1) as avg_monthly
        FROM (
            SELECT v.attendee_id, COUNT(DISTINCT DATE(v.arrival_time AT TIME ZONE 'Asia/Seoul')) as visit_count
            FROM visits v
            JOIN attendees a ON a.id = v.attendee_id
            WHERE a.is_admin = false AND v.arrival_time >= NOW() - INTERVAL '30 days'
            GROUP BY v.attendee_id
        ) sub
    `);

    const topVisitorsResult = await db.execute(sql`
        SELECT a.name, COUNT(DISTINCT DATE(v.arrival_time AT TIME ZONE 'Asia/Seoul')) as visit_count
        FROM visits v
        JOIN attendees a ON a.id = v.attendee_id
        WHERE a.is_admin = false
          AND v.arrival_time >= DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'
        GROUP BY a.id, a.name
        ORDER BY visit_count DESC
        LIMIT 10
    `);

    const activeUsersResult = await db.execute(sql`
        SELECT
            (SELECT COUNT(*) FROM (
                SELECT v.attendee_id FROM visits v JOIN attendees a ON a.id = v.attendee_id
                WHERE a.is_admin = false AND v.arrival_time >= NOW() - INTERVAL '30 days'
                GROUP BY v.attendee_id HAVING COUNT(DISTINCT DATE(v.arrival_time AT TIME ZONE 'Asia/Seoul')) >= 2
            ) sub) as active_users,
            (SELECT COUNT(*) FROM attendees WHERE is_admin = false) as total_users,
            (SELECT COUNT(*) FROM attendees WHERE is_admin = false AND season_pass_expires_at IS NOT NULL AND season_pass_expires_at > NOW()) as season_pass_users
    `);

    return {
        kpis: {
            totalVisits: (totalVisitsResult[0] as any)?.count || 0,
            totalMembers: (totalMembersResult[0] as any)?.count || 0,
            avgDuration: (avgDurationResult[0] as any)?.avg_minutes || 0
        },
        dailyTrend: dailyTrendResult as any[],
        monthlyTrend: monthlyTrendResult as any[],
        peakHours: hourlyData,
        popularGames: popularGamesResult as any[],
        userStats: {
            avgWeeklyVisits: parseFloat((avgWeeklyResult[0] as any)?.avg_weekly) || 0,
            avgMonthlyVisits: parseFloat((avgMonthlyResult[0] as any)?.avg_monthly) || 0,
            activeUsers: parseInt((activeUsersResult[0] as any)?.active_users) || 0,
            totalUsers: parseInt((activeUsersResult[0] as any)?.total_users) || 0,
            seasonPassUsers: parseInt((activeUsersResult[0] as any)?.season_pass_users) || 0,
            topVisitors: topVisitorsResult as any[]
        }
    };
};
