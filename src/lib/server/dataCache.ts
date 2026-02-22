import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { getLiveEmitter } from './liveEvents';

interface SharedData {
    attendees: any[];
    games: any[];
    scheduledGames: any[];
    allGames: any[];
    reservations: any[];
    notice: string | null;
    isOpen: boolean;
    dailyVisitPlans: any[];
}

let cache: SharedData | null = null;
let cachePromise: Promise<SharedData> | null = null;
let cacheTime = 0;

const MAX_AGE = 2000; // 2초

function isStale() {
    return !cache || Date.now() - cacheTime > MAX_AGE;
}

async function fetchSharedData(): Promise<SharedData> {
    const [attendeesResult, gamesResult, scheduledGamesResult, allGamesResult, reservationsResult, noticeResult, sysRes, dailyVisitPlansResult] = await Promise.all([
        db.execute(sql`
            SELECT DISTINCT ON (a.id) a.id, a.name, v.arrival_time,
                   t.title_name,
                   EXISTS(SELECT 1 FROM session_participants sp JOIN game_sessions gs ON sp.session_id = gs.id WHERE sp.attendee_id = a.id AND gs.status = 'playing') as is_playing
            FROM visits v
            JOIN attendees a ON v.attendee_id = a.id
            LEFT JOIN minigame_user_points up ON a.id = up.user_id
            LEFT JOIN minigame_titles t ON up.equipped_title_id = t.id
            WHERE v.departure_time IS NULL
            ORDER BY a.id, v.arrival_time DESC
        `),
        db.execute(sql`
            SELECT gs.id, gs.game_name, gs.end_time, gs.created_by, gs.party_id,
                   COALESCE(json_agg(json_build_object(
                       'id', COALESCE(a.id, -sp.id),
                       'name', COALESCE(a.name, sp.guest_name),
                       'title_name', t.title_name,
                       'is_guest', (sp.attendee_id IS NULL)
                   )) FILTER (WHERE sp.id IS NOT NULL), '[]') as players
            FROM game_sessions gs
            LEFT JOIN session_participants sp ON gs.id = sp.session_id
            LEFT JOIN attendees a ON sp.attendee_id = a.id
            LEFT JOIN minigame_user_points up ON a.id = up.user_id
            LEFT JOIN minigame_titles t ON up.equipped_title_id = t.id
            WHERE gs.status = 'playing'
            GROUP BY gs.id, gs.game_name, gs.end_time, gs.created_by, gs.party_id
            ORDER BY gs.end_time ASC
        `),
        db.execute(sql`
            SELECT gs.id, gs.game_name, gs.game_id, gs.min_players, gs.max_players, gs.scheduled_at, gs.created_by, gs.party_id, gs.show_on_main, g.image_url,
                   COALESCE(json_agg(json_build_object(
                       'id', COALESCE(a.id, -sp.id),
                       'name', COALESCE(a.name, sp.guest_name),
                       'title_name', t.title_name,
                       'is_guest', (sp.attendee_id IS NULL)
                   )) FILTER (WHERE sp.id IS NOT NULL), '[]') as participants
            FROM game_sessions gs
            LEFT JOIN session_participants sp ON gs.id = sp.session_id
            LEFT JOIN attendees a ON sp.attendee_id = a.id
            LEFT JOIN games g ON gs.game_id = g.id
            LEFT JOIN minigame_user_points up ON a.id = up.user_id
            LEFT JOIN minigame_titles t ON up.equipped_title_id = t.id
            WHERE gs.status = 'scheduled'
            GROUP BY gs.id, gs.game_name, gs.game_id, gs.min_players, gs.max_players, gs.scheduled_at, gs.created_by, gs.party_id, gs.show_on_main, g.image_url
            ORDER BY gs.scheduled_at ASC
        `),
        db.execute(sql`SELECT id, name, min_players, max_players, playtime_min, image_url FROM games ORDER BY name ASC`),
        db.execute(sql`
            SELECT r.id, r.session_id, r.game_id, r.attendee_id, r.status, a.name as attendee_name,
                   COALESCE(g.name, gs.game_name) as game_name
            FROM reservations r
            JOIN attendees a ON r.attendee_id = a.id
            LEFT JOIN games g ON r.game_id = g.id
            LEFT JOIN game_sessions gs ON r.session_id = gs.id
            WHERE r.status != 'cancelled'
        `),
        db.execute(sql`SELECT content FROM notices WHERE is_active = true ORDER BY created_at DESC LIMIT 1`),
        db.execute(sql`SELECT value FROM system_settings WHERE key = 'is_open'`),
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
    ]);

    return {
        attendees: attendeesResult as any[],
        games: gamesResult as any[],
        scheduledGames: scheduledGamesResult as any[],
        allGames: allGamesResult as any[],
        reservations: reservationsResult as any[],
        notice: (noticeResult[0] as any)?.content || null,
        isOpen: (sysRes[0] as any)?.value !== 'false',
        dailyVisitPlans: dailyVisitPlansResult as any[],
    };
}

export async function getSharedData(): Promise<SharedData> {
    if (!isStale() && cache) return cache;

    if (cachePromise) return cachePromise;

    cachePromise = fetchSharedData().then(data => {
        cache = data;
        cacheTime = Date.now();
        cachePromise = null;
        return data;
    }).catch(err => {
        cachePromise = null;
        if (cache) return cache;
        throw err;
    });

    return cachePromise;
}

export function invalidateSharedCache() {
    cache = null;
    cacheTime = 0;
}

getLiveEmitter().on('change', () => {
    invalidateSharedCache();
});
