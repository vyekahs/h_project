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
    // 예전에는 10개 쿼리를 Promise.all로 동시에 던졌다. 그러면 이 함수 한 번이
    // 커넥션 10개를 동시에 점유하는데, 이 캐시는 change 이벤트마다(호출 지점 43곳)
    // 갱신되므로 메인 페이지 로드와 겹치면 풀(max 20)을 크게 잠식했다.
    //
    // 논리적으로 묶어 3개로 줄였다. 한 번에 몰아 실행해도 각 부분은 원래 쿼리
    // 그대로라 읽기 어렵지 않고, 나중에 한 덩어리만 고칠 수 있다.
    const [sessionsRes, peopleRes, miscRes] = await Promise.all([
        // ① 게임 세션 3종 — 조인 구조가 같아 참가자 집계(players)를 공유한다
        db.execute(sql`
            WITH players AS (
                SELECT sp.session_id,
                       json_agg(json_build_object(
                           'id', COALESCE(a.id, -sp.id),
                           'name', COALESCE(a.name, sp.guest_name),
                           'title_name', t.title_name,
                           'is_guest', (sp.attendee_id IS NULL)
                       ) ORDER BY sp.id) AS list
                FROM session_participants sp
                LEFT JOIN attendees a ON sp.attendee_id = a.id
                LEFT JOIN minigame_user_points up ON a.id = up.user_id
                LEFT JOIN minigame_titles t ON up.equipped_title_id = t.id
                GROUP BY sp.session_id
            ),
            playing AS (
                SELECT gs.id, gs.game_name, gs.end_time, gs.created_by, gs.party_id,
                       COALESCE(p.list, '[]') AS players
                FROM game_sessions gs
                LEFT JOIN players p ON p.session_id = gs.id
                WHERE gs.status = 'playing'
            ),
            scheduled AS (
                SELECT gs.id, gs.game_name, gs.game_id, gs.min_players, gs.max_players,
                       gs.scheduled_at, gs.created_by, gs.party_id, gs.show_on_main,
                       gs.recurring_schedule_id, g.image_url,
                       COALESCE(p.list, '[]') AS participants
                FROM game_sessions gs
                LEFT JOIN games g ON gs.game_id = g.id
                LEFT JOIN players p ON p.session_id = gs.id
                WHERE gs.status = 'scheduled'
            ),
            main_playing AS (
                SELECT gs.id, gs.game_name, gs.game_id, gs.start_time, gs.end_time,
                       gs.created_by, gs.party_id, gs.show_on_main, g.image_url,
                       gs.min_players, gs.max_players, gs.status,
                       COALESCE(p.list, '[]') AS participants
                FROM game_sessions gs
                LEFT JOIN games g ON gs.game_id = g.id
                LEFT JOIN players p ON p.session_id = gs.id
                WHERE gs.status = 'playing' AND gs.show_on_main = true
            )
            SELECT
                COALESCE((SELECT json_agg(row_to_json(x) ORDER BY x.end_time ASC) FROM playing x), '[]') AS playing_games,
                COALESCE((SELECT json_agg(row_to_json(x) ORDER BY x.scheduled_at ASC) FROM scheduled x), '[]') AS scheduled_games,
                COALESCE((SELECT json_agg(row_to_json(x)) FROM main_playing x), '[]') AS main_playing_games
        `),

        // ② 사람 3종 — 지금 와 있는 사람 / 올 예정인 사람
        db.execute(sql`
            WITH present AS (
                SELECT DISTINCT ON (a.id) a.id, a.name, v.arrival_time, t.title_name,
                       EXISTS(SELECT 1 FROM session_participants sp
                              JOIN game_sessions gs ON sp.session_id = gs.id
                              WHERE sp.attendee_id = a.id AND gs.status = 'playing') AS is_playing
                FROM visits v
                JOIN attendees a ON v.attendee_id = a.id
                LEFT JOIN minigame_user_points up ON a.id = up.user_id
                LEFT JOIN minigame_titles t ON up.equipped_title_id = t.id
                WHERE v.departure_time IS NULL
                ORDER BY a.id, v.arrival_time DESC
            ),
            visit_plans AS (
                SELECT dvp.id, dvp.attendee_id, a.name, dvp.planned_time, t.title_name, dvp.created_at
                FROM daily_visit_plans dvp
                JOIN attendees a ON dvp.attendee_id = a.id
                LEFT JOIN minigame_user_points up ON a.id = up.user_id
                LEFT JOIN minigame_titles t ON up.equipped_title_id = t.id
                WHERE dvp.plan_date = CURRENT_DATE
                  -- 이미 와 있는 사람은 "갈 예정"에 보이면 안 된다.
                  -- 체크인 시 행을 지우는 경로가 여러 곳(자동/QR/관리자)이라 하나만
                  -- 빠져도 남은 행이 그대로 노출됐다(실제로 자동 체크인 경로에서
                  -- 누락된 적이 있다). 쓰기 경로가 전부 완벽하기를 기대하는 대신
                  -- 보여줄 때 한 번 더 거른다.
                  AND a.status <> 'present'
                  AND NOT EXISTS (
                      SELECT 1 FROM visits v
                      WHERE v.attendee_id = a.id
                        AND v.departure_time IS NULL
                        AND v.arrival_time::date = (NOW() AT TIME ZONE 'Asia/Seoul')::date
                  )
            ),
            today_scheduled AS (
                SELECT DISTINCT ON (sp.attendee_id) sp.attendee_id, a.name, t.title_name,
                       gs.party_id IS NOT NULL AS is_party,
                       TO_CHAR(gs.scheduled_at AT TIME ZONE 'Asia/Seoul', 'HH24:MI') AS planned_time
                FROM session_participants sp
                JOIN game_sessions gs ON sp.session_id = gs.id
                JOIN attendees a ON sp.attendee_id = a.id
                LEFT JOIN minigame_user_points up ON a.id = up.user_id
                LEFT JOIN minigame_titles t ON up.equipped_title_id = t.id
                WHERE gs.status = 'scheduled'
                  AND gs.scheduled_at::date = (NOW() AT TIME ZONE 'Asia/Seoul')::date
                  AND sp.attendee_id IS NOT NULL
                ORDER BY sp.attendee_id, gs.scheduled_at ASC
            )
            SELECT
                COALESCE((SELECT json_agg(row_to_json(x) ORDER BY x.id) FROM present x), '[]') AS attendees,
                COALESCE((SELECT json_agg(row_to_json(x) ORDER BY x.created_at ASC) FROM visit_plans x), '[]') AS daily_visit_plans,
                COALESCE((SELECT json_agg(row_to_json(x)) FROM today_scheduled x), '[]') AS today_scheduled_participants
        `),

        // ③ 나머지 — 전체 게임 목록 / 예약 / 공지 / 오픈 여부
        db.execute(sql`
            WITH all_games AS (
                SELECT id, name, min_players, max_players, playtime_min, image_url FROM games
            ),
            res AS (
                SELECT r.id, r.session_id, r.game_id, r.attendee_id, r.status,
                       a.name AS attendee_name,
                       COALESCE(g.name, gs.game_name) AS game_name
                FROM reservations r
                JOIN attendees a ON r.attendee_id = a.id
                LEFT JOIN games g ON r.game_id = g.id
                LEFT JOIN game_sessions gs ON r.session_id = gs.id
                WHERE r.status != 'cancelled'
            )
            SELECT
                COALESCE((SELECT json_agg(row_to_json(x) ORDER BY x.name ASC) FROM all_games x), '[]') AS all_games,
                COALESCE((SELECT json_agg(row_to_json(x)) FROM res x), '[]') AS reservations,
                (SELECT content FROM notices WHERE is_active = true ORDER BY created_at DESC LIMIT 1) AS notice,
                (SELECT value FROM system_settings WHERE key = 'is_open') AS is_open_value
        `),
    ]);

    const sessions = (sessionsRes as any[])[0] ?? {};
    const people = (peopleRes as any[])[0] ?? {};
    const misc = (miscRes as any[])[0] ?? {};

    return {
        attendees: people.attendees ?? [],
        games: sessions.playing_games ?? [],
        scheduledGames: sessions.scheduled_games ?? [],
        allGames: misc.all_games ?? [],
        reservations: misc.reservations ?? [],
        notice: misc.notice ?? null,
        isOpen: misc.is_open_value !== 'false',
        dailyVisitPlans: people.daily_visit_plans ?? [],
        todayScheduledParticipants: people.today_scheduled_participants ?? [],
        todayPlayingMainGames: sessions.main_playing_games ?? [],
    };
}

// fetchSharedData()는 커넥션을 여러 개 동시에 사용하므로, staleness 갱신과
// change 이벤트 갱신이 동시에 들어와도 항상 하나의 in-flight 요청만 공유한다.
// (분리되어 있으면 두 트리거가 겹칠 때 커넥션 풀을 이중으로 잠식한다)
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
