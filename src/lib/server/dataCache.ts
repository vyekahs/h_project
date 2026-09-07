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
    todayScheduledParticipants: any[];
    todayPlayingMainGames: any[];
}

let cache: SharedData | null = null;
let cachePromise: Promise<SharedData> | null = null;
let cacheTime = 0;

const MAX_AGE = 2000; // 2초

function isStale() {
    return !cache || Date.now() - cacheTime > MAX_AGE;
}

async function fetchSharedData(): Promise<SharedData> {
    const [attendeesResult, gamesResult, scheduledGamesResult, allGamesResult, reservationsResult, noticeResult, sysRes, dailyVisitPlansResult, todayScheduledParticipantsResult, todayPlayingMainGamesResult] = await Promise.all([
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
            SELECT gs.id, gs.game_name, gs.game_id, gs.min_players, gs.max_players, gs.scheduled_at, gs.created_by, gs.party_id, gs.show_on_main, gs.recurring_schedule_id, g.image_url,
                   gs.status, gs.cancelled_at, canceller.name as cancelled_by_name,
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
            LEFT JOIN attendees canceller ON gs.cancelled_by = canceller.id
            -- 취소된 건 카드가 사라지지 않고 회색으로 표시되게, 취소 후 24시간까지는
            -- 계속 이 목록에 포함시킨다 (화면에서 status로 취소 처리를 구분한다)
            WHERE gs.status = 'scheduled'
               OR (gs.status = 'cancelled' AND gs.cancelled_at > NOW() - INTERVAL '24 hours')
            GROUP BY gs.id, gs.game_name, gs.game_id, gs.min_players, gs.max_players, gs.scheduled_at, gs.created_by, gs.party_id, gs.show_on_main, gs.recurring_schedule_id, g.image_url, gs.status, gs.cancelled_at, canceller.name
            ORDER BY gs.status = 'cancelled', gs.scheduled_at ASC
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
        db.execute(sql`
            SELECT DISTINCT ON (sp.attendee_id) sp.attendee_id, a.name, t.title_name,
                   gs.party_id IS NOT NULL as is_party,
                   TO_CHAR(gs.scheduled_at AT TIME ZONE 'Asia/Seoul', 'HH24:MI') as planned_time
            FROM session_participants sp
            JOIN game_sessions gs ON sp.session_id = gs.id
            JOIN attendees a ON sp.attendee_id = a.id
            LEFT JOIN minigame_user_points up ON a.id = up.user_id
            LEFT JOIN minigame_titles t ON up.equipped_title_id = t.id
            WHERE gs.status = 'scheduled'
              AND gs.scheduled_at::date = (NOW() AT TIME ZONE 'Asia/Seoul')::date
              AND sp.attendee_id IS NOT NULL
            ORDER BY sp.attendee_id, gs.scheduled_at ASC
        `),
        db.execute(sql`
            SELECT gs.id, gs.game_name, gs.game_id, gs.start_time, gs.end_time, gs.created_by, gs.party_id, gs.show_on_main, g.image_url,
                   gs.min_players, gs.max_players, gs.status,
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
            WHERE gs.status = 'playing'
              AND gs.show_on_main = true
            GROUP BY gs.id, gs.game_name, gs.game_id, gs.start_time, gs.end_time, gs.created_by, gs.party_id, gs.show_on_main, g.image_url, gs.min_players, gs.max_players, gs.status
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
        todayScheduledParticipants: todayScheduledParticipantsResult as any[],
        todayPlayingMainGames: todayPlayingMainGamesResult as any[],
    };
}

// fetchSharedData()는 커넥션 10개를 동시에 사용하므로, staleness 갱신과
// change 이벤트 갱신이 동시에 들어와도 항상 하나의 in-flight 요청만 공유한다.
// (분리되어 있으면 두 트리거가 겹칠 때 커넥션 풀(max 20)이 순간적으로 바닥날 수 있음)
function refreshSharedData(): Promise<SharedData> {
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

export async function getSharedData(): Promise<SharedData> {
    if (!isStale() && cache) return cache;
    return refreshSharedData();
}

export function invalidateSharedCache() {
    cache = null;
    cacheTime = 0;
}

// change 이벤트: 캐시를 null로 날리지 않고 백그라운드에서 새 데이터로 교체
// → 갱신 중 들어오는 요청도 stale 캐시로 즉시 응답
getLiveEmitter().on('change', () => {
    refreshSharedData().catch(() => {});
});
