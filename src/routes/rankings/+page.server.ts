import { query } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
    // 1. Overall Rankings (Most Wins)
    const overallRankings = await query(`
        SELECT a.name, COUNT(*) as wins
        FROM session_participants sp
        JOIN attendees a ON sp.attendee_id = a.id
        JOIN game_sessions gs ON sp.session_id = gs.id
        JOIN games g ON gs.game_id = g.id
        WHERE sp.is_winner = true AND g.playtime_min > 0
        GROUP BY a.name
        ORDER BY wins DESC
        LIMIT 10
    `);

    // 2. Win Rate Rankings (Min 5 games)
    const winRateRankings = await query(`
        SELECT 
            a.name, 
            COUNT(*) as total_games,
            SUM(CASE WHEN sp.is_winner THEN 1 ELSE 0 END) as wins,
            ROUND((SUM(CASE WHEN sp.is_winner THEN 1 ELSE 0 END)::decimal / COUNT(*)) * 100, 1) as win_rate
        FROM session_participants sp
        JOIN attendees a ON sp.attendee_id = a.id
        JOIN game_sessions gs ON sp.session_id = gs.id
        JOIN games g ON gs.game_id = g.id
        WHERE gs.status = 'finished' AND g.playtime_min > 0
        GROUP BY a.name
        HAVING COUNT(*) >= 5
        ORDER BY win_rate DESC, wins DESC
        LIMIT 10
    `);

    // 3. Game Titles (Most wins per game)
    const gameTitles = await query(`
        SELECT DISTINCT ON (gs.game_name)
            gs.game_name,
            a.name as holder_name,
            COUNT(*) as wins
        FROM session_participants sp
        JOIN game_sessions gs ON sp.session_id = gs.id
        JOIN games g ON gs.game_id = g.id
        JOIN attendees a ON sp.attendee_id = a.id
        WHERE sp.is_winner = true AND g.playtime_min > 0
        GROUP BY gs.game_name, a.name
        ORDER BY gs.game_name, wins DESC
    `);

    return {
        overallRankings: overallRankings.rows,
        winRateRankings: winRateRankings.rows,
        gameTitles: gameTitles.rows
    };
};
