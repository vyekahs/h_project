import { query } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
    // 1. KPIs
    const totalVisitsResult = await query('SELECT COUNT(*) as count FROM visits');
    const totalMembersResult = await query('SELECT COUNT(*) as count FROM attendees');
    const avgDurationResult = await query(`
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(departure_time, NOW()) - arrival_time))/60)) as avg_minutes
        FROM visits
    `);

    // 2. Daily Trend (Last 30 Days)
    const dailyTrendResult = await query(`
        SELECT TO_CHAR(arrival_time AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') as date, COUNT(*) as count
        FROM visits
        WHERE arrival_time >= NOW() - INTERVAL '30 days'
        GROUP BY date
        ORDER BY date ASC
    `);

    // 2.5 Monthly Trend (Last 12 Months)
    const monthlyTrendResult = await query(`
        SELECT TO_CHAR(arrival_time AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') as date, COUNT(*) as count
        FROM visits
        WHERE arrival_time >= NOW() - INTERVAL '12 months'
        GROUP BY date
        ORDER BY date ASC
    `);

    // 3. Peak Hours
    const peakHoursResult = await query(`
        SELECT EXTRACT(HOUR FROM arrival_time AT TIME ZONE 'Asia/Seoul') as hour, COUNT(*) as count
        FROM visits
        GROUP BY hour
        ORDER BY hour ASC
    `);

    // 4. Popular Games
    const popularGamesResult = await query(`
        SELECT game_name, COUNT(*) as count
        FROM game_sessions
        GROUP BY game_name
        ORDER BY count DESC
        LIMIT 5
    `);

    // 5. Process Hourly Data (Fill 0-23)
    const hourlyData = Array.from({ length: 24 }, (_, i) => {
        const found = peakHoursResult.rows.find((h: any) => parseInt(h.hour) === i);
        return { hour: i, count: found ? parseInt(found.count) : 0 };
    });

    // 6. User Stats (non-admin users only)
    const avgWeeklyResult = await query(`
        SELECT ROUND(AVG(weekly_count)::numeric, 1) as avg_weekly
        FROM (
            SELECT v.attendee_id,
                COUNT(*)::float / GREATEST(EXTRACT(EPOCH FROM (NOW() - MIN(v.arrival_time))) / 604800, 1) as weekly_count
            FROM visits v
            JOIN attendees a ON a.id = v.attendee_id
            WHERE a.is_admin = false
            GROUP BY v.attendee_id
        ) sub
    `);

    const avgMonthlyResult = await query(`
        SELECT ROUND(AVG(monthly_count)::numeric, 1) as avg_monthly
        FROM (
            SELECT v.attendee_id,
                COUNT(*)::float / GREATEST(EXTRACT(EPOCH FROM (NOW() - MIN(v.arrival_time))) / 2592000, 1) as monthly_count
            FROM visits v
            JOIN attendees a ON a.id = v.attendee_id
            WHERE a.is_admin = false
            GROUP BY v.attendee_id
        ) sub
    `);

    const topVisitorsResult = await query(`
        SELECT a.name, COUNT(*) as visit_count
        FROM visits v
        JOIN attendees a ON a.id = v.attendee_id
        WHERE a.is_admin = false
        GROUP BY a.id, a.name
        ORDER BY visit_count DESC
        LIMIT 10
    `);

    const activeUsersResult = await query(`
        SELECT
            (SELECT COUNT(*) FROM (
                SELECT v.attendee_id FROM visits v JOIN attendees a ON a.id = v.attendee_id
                WHERE a.is_admin = false AND v.arrival_time >= NOW() - INTERVAL '30 days'
                GROUP BY v.attendee_id HAVING COUNT(*) >= 2
            ) sub) as active_users,
            (SELECT COUNT(*) FROM attendees WHERE is_admin = false) as total_users
    `);

    return {
        kpis: {
            totalVisits: totalVisitsResult.rows[0]?.count || 0,
            totalMembers: totalMembersResult.rows[0]?.count || 0,
            avgDuration: avgDurationResult.rows[0]?.avg_minutes || 0
        },
        dailyTrend: dailyTrendResult.rows,
        monthlyTrend: monthlyTrendResult.rows,
        peakHours: hourlyData,
        popularGames: popularGamesResult.rows,
        userStats: {
            avgWeeklyVisits: parseFloat(avgWeeklyResult.rows[0]?.avg_weekly) || 0,
            avgMonthlyVisits: parseFloat(avgMonthlyResult.rows[0]?.avg_monthly) || 0,
            activeUsers: parseInt(activeUsersResult.rows[0]?.active_users) || 0,
            totalUsers: parseInt(activeUsersResult.rows[0]?.total_users) || 0,
            topVisitors: topVisitorsResult.rows
        }
    };
};
