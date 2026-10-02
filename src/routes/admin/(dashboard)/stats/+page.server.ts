import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

/*
    이 페이지는 「지금」을 말하지 않는다 — 그건 어드민 메인의 일이다. 여기는
    운영 판단에 쓰는 통계다: 언제 문을 여는 게 맞나, 누구를 챙겨야 하나,
    무엇을 더 들여야 하나.

    ── 앞선 세 판에서 고친 것들 ──
    ① 「평균」이 28일 합계였다 → 문 연 날 수로 나눈다.
    ② 도착 시각만 세어 방이 가장 꽉 찬 시각에 그래프가 가장 낮았다 → 재실을 센다.
    ③ 하루가 자정에 끊겼다 → DAY_START_HOUR 가 시간축과 날짜 경계의 단일 원본.
    ④ 「지금 방에 N명」의 두 항이 서로 다른 정의로 세어졌다(왼쪽은 status 플래그,
       오른쪽은 재실 평균, 미퇴장자는 도착 한 칸만). 이번엔 왼쪽 항 자체를 뺐다 —
       실시간은 메인이 이미 보여주고, 이 페이지가 그걸 흉내 내면 두 화면이 서로
       다른 수를 말하게 된다.
    ⑤ 값은 세지만 상한이 없어 폭주하던 평균 체류에 MAX_STAY_HOURS 를 건다.
       점유 차트에만 걸려 있던 규칙을 같은 값에 똑같이 적용한다.
*/

/** 최근 4주. 한국 시각 기준, 아래 DAY_START_HOUR 로 자른 하루로 센다. */
const WINDOW_DAYS = 28;

/** 동아리방의 하루는 자정이 아니라 오후에 시작해 새벽에 끝난다. */
const DAY_START_HOUR = 6;

/** 퇴장 기록이 없거나 비정상적으로 긴 방문이 평균을 끌고 가지 않도록 자른다. */
const MAX_STAY_HOURS = 18;

/** 요일 패턴은 표본이 이만큼 쌓이기 전에는 말하지 않는다 — 3일치로 「화요일이 붐빈다」고 하면 거짓말이다. */
const DOW_MIN_OPEN_DAYS = 8;

/** 정기권 만료를 며칠 전부터 챙길 것인가. */
const EXPIRY_SOON_DAYS = 14;

const H = sql.raw(String(DAY_START_HOUR));

const BASE = sql`
    WITH win AS (
        /* 파라미터로 넘기면 date - $1 의 타입을 정하지 못해 질의가 통째로 실패한다 */
        SELECT (((NOW() AT TIME ZONE 'Asia/Seoul') - INTERVAL '${H} hours')::date - ${WINDOW_DAYS - 1}::int) AS from_d,
                ((NOW() AT TIME ZONE 'Asia/Seoul') - INTERVAL '${H} hours')::date AS today_d
    ),
    member AS (
        SELECT id, name, season_pass_expires_at FROM attendees
        WHERE is_admin = false AND is_blacklisted = false
    ),
    v_all AS (
        SELECT v.attendee_id,
               ((v.arrival_time AT TIME ZONE 'Asia/Seoul') - INTERVAL '${H} hours')::date AS d,
               (v.arrival_time   AT TIME ZONE 'Asia/Seoul') AS arr,
               (v.departure_time AT TIME ZONE 'Asia/Seoul') AS dep
        FROM visits v JOIN member m ON m.id = v.attendee_id
    ),
    /* 창 안으로 자른 것. 대부분의 집계가 이걸 쓴다. */
    v_day AS (SELECT va.* FROM v_all va CROSS JOIN win w WHERE va.d BETWEEN w.from_d AND w.today_d),
    open_days AS (SELECT COUNT(DISTINCT d)::int AS n FROM v_day),
    /* 방문 하나를 머문 시각 전체로 펼친다 — 도착이 아니라 재실 */
    occ AS (
        SELECT EXTRACT(HOUR FROM g.ts)::int AS h, vd.attendee_id, vd.d
        FROM v_day vd
        CROSS JOIN LATERAL generate_series(
            date_trunc('hour', vd.arr),
            date_trunc('hour', LEAST(COALESCE(vd.dep, vd.arr), vd.arr + INTERVAL '${sql.raw(String(MAX_STAY_HOURS))} hours')),
            INTERVAL '1 hour'
        ) AS g(ts)
    )
`;

export const load: PageServerLoad = async () => {
    let summaryRows: any[] = [];
    let seriesRows: any[] = [];
    let peopleRows: any[] = [];
    let loadError = false;

    try {
        [summaryRows, seriesRows, peopleRows] = (await Promise.all([
            db.execute(sql`
                ${BASE}
                SELECT
                  to_char((SELECT from_d FROM win), 'YYYY-MM-DD')  AS from_d,
                  to_char((SELECT today_d FROM win), 'YYYY-MM-DD') AS today_d,
                  (SELECT n FROM open_days) AS open_days,
                  (SELECT COUNT(*) FROM (SELECT DISTINCT attendee_id, d FROM v_day) s1)::int AS window_visits,
                  /* 상한을 건다. 퇴장 처리를 잊은 기록 하나가 평균을 8시간대로 끌고 갔다. */
                  (SELECT ROUND(AVG(LEAST(EXTRACT(EPOCH FROM (dep - arr))/60, ${MAX_STAY_HOURS * 60}::numeric)))
                     FROM v_day WHERE dep IS NOT NULL AND dep > arr)::int AS avg_stay,
                  (SELECT COUNT(*) FROM v_day WHERE dep IS NOT NULL AND dep > arr)::int AS stay_samples,
                  (SELECT COUNT(*) FROM (
                      SELECT attendee_id FROM v_day GROUP BY attendee_id HAVING COUNT(DISTINCT d) >= 2
                  ) s2)::int AS active_users,
                  (SELECT COUNT(*) FROM member)::int AS total_members,
                  (SELECT COUNT(*) FROM member
                    WHERE season_pass_expires_at IS NOT NULL AND season_pass_expires_at > NOW())::int AS season_pass_users,
                  (SELECT COUNT(*) FROM (SELECT DISTINCT attendee_id, d FROM v_all) s3)::int AS total_visits_all,
                  (SELECT to_char(d, 'YYYY-MM-DD') FROM (
                      SELECT d, COUNT(DISTINCT attendee_id) c FROM v_day GROUP BY d ORDER BY c DESC, d DESC LIMIT 1
                  ) s4) AS peak_day,
                  (SELECT c FROM (
                      SELECT d, COUNT(DISTINCT attendee_id) c FROM v_day GROUP BY d ORDER BY c DESC, d DESC LIMIT 1
                  ) s5)::int AS peak_day_count
            `),

            /* 시간대별 재실 + 요일별. 둘 다 (종류, 키, 수, 평균) 한 모양. */
            db.execute(sql`
                ${BASE}
                SELECT 'hour' AS kind, o.h::text AS k,
                       COUNT(DISTINCT (o.attendee_id, o.d))::int AS n,
                       ROUND(COUNT(DISTINCT (o.attendee_id, o.d))::numeric
                             / NULLIF((SELECT n FROM open_days), 0), 1)::text AS avg
                FROM occ o GROUP BY o.h
                UNION ALL
                SELECT 'dow', EXTRACT(DOW FROM g.d)::int::text,
                       COUNT(DISTINCT (vd.attendee_id, vd.d)) FILTER (WHERE vd.attendee_id IS NOT NULL)::int,
                       ROUND(
                         COUNT(DISTINCT (vd.attendee_id, vd.d)) FILTER (WHERE vd.attendee_id IS NOT NULL)::numeric
                         / NULLIF(COUNT(DISTINCT vd.d) FILTER (WHERE vd.attendee_id IS NOT NULL), 0), 1
                       )::text
                FROM win w
                CROSS JOIN generate_series(w.from_d, w.today_d, INTERVAL '1 day') AS g(d)
                LEFT JOIN v_day vd ON vd.d = g.d::date
                GROUP BY EXTRACT(DOW FROM g.d)
            `),

            /*
                사람과 게임. 40명짜리 동아리에서 운영을 바꾸는 건 평균이 아니라 이름이다 —
                누가 뜸해졌나, 누구 정기권이 곧 끝나나.
            */
            db.execute(sql`
                ${BASE}
                (
                  SELECT 'game' AS kind, gs.game_name AS name, COUNT(*)::int AS n, NULL::text AS meta
                  FROM game_sessions gs CROSS JOIN win w
                  WHERE gs.start_time IS NOT NULL
                    AND ((gs.start_time AT TIME ZONE 'Asia/Seoul') - INTERVAL '${H} hours')::date
                        BETWEEN w.from_d AND w.today_d
                  GROUP BY gs.game_name
                  /* 동점 순서가 실행마다 바뀌면 서수가 없는 서열을 약속하게 된다 */
                  ORDER BY n DESC, name ASC LIMIT 5
                )
                UNION ALL
                (
                  SELECT 'visitor', m.name, COUNT(DISTINCT vd.d)::int, NULL::text
                  FROM v_day vd JOIN member m ON m.id = vd.attendee_id
                  GROUP BY m.id, m.name ORDER BY 3 DESC, 2 ASC LIMIT 10
                )
                UNION ALL
                (
                  /* 예전엔 왔는데 창 안에는 한 번도 안 온 사람. 최근에 끊긴 순 —
                     되돌리기 쉬운 쪽이 위로 온다. */
                  SELECT 'lapsed', m.name,
                         ((SELECT today_d FROM win) - MAX(va.d))::int,
                         to_char(MAX(va.d), 'YYYY-MM-DD')
                  FROM member m JOIN v_all va ON va.attendee_id = m.id
                  WHERE NOT EXISTS (SELECT 1 FROM v_day vd WHERE vd.attendee_id = m.id)
                  GROUP BY m.id, m.name
                  ORDER BY 3 ASC, 2 ASC LIMIT 8
                )
                UNION ALL
                (
                  SELECT 'expiring', m.name,
                         GREATEST(0, EXTRACT(DAY FROM (m.season_pass_expires_at - NOW()))::int),
                         to_char(m.season_pass_expires_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')
                  FROM member m
                  WHERE m.season_pass_expires_at IS NOT NULL
                    AND m.season_pass_expires_at > NOW()
                    AND m.season_pass_expires_at <= NOW() + INTERVAL '${sql.raw(String(EXPIRY_SOON_DAYS))} days'
                  ORDER BY 3 ASC, 2 ASC LIMIT 8
                )
            `)
        ])) as any[];
    } catch (e) {
        console.error('stats load failed:', e);
        loadError = true;
    }

    const s = summaryRows[0] ?? {};
    const openDays = Number(s.open_days) || 0;

    const hourly = seriesRows
        .filter((r) => r.kind === 'hour')
        .map((r) => ({ hour: Number(r.k), count: Number(r.n), avg: Number(r.avg) || 0 }))
        .sort((a, b) => b.avg - a.avg);

    const byDow = Array.from({ length: 7 }, (_, dow) => {
        const r = seriesRows.find((x) => x.kind === 'dow' && Number(x.k) === dow);
        return { dow, count: Number(r?.n) || 0, avg: Number(r?.avg) || 0 };
    });

    const pick = (kind: string) =>
        peopleRows
            .filter((r) => r.kind === kind)
            .map((r) => ({ name: String(r.name), n: Number(r.n), meta: r.meta as string | null }));

    return {
        loadError,
        window: {
            from: (s.from_d as string) ?? '',
            to: (s.today_d as string) ?? '',
            days: WINDOW_DAYS,
            openDays,
            dayStartHour: DAY_START_HOUR,
            maxStayHours: MAX_STAY_HOURS,
            dowReady: openDays >= DOW_MIN_OPEN_DAYS,
            expirySoonDays: EXPIRY_SOON_DAYS
        },
        /* 붐비는 순으로 정렬해 보낸다 — 화면은 차트가 아니라 상위 몇 개의 문장이다 */
        hourly,
        byDow,
        popularGames: pick('game'),
        topVisitors: pick('visitor'),
        lapsed: pick('lapsed'),
        expiring: pick('expiring'),
        summary: {
            windowVisits: Number(s.window_visits) || 0,
            avgStay: Number(s.avg_stay) || 0,
            staySamples: Number(s.stay_samples) || 0,
            activeUsers: Number(s.active_users) || 0,
            totalMembers: Number(s.total_members) || 0,
            seasonPassUsers: Number(s.season_pass_users) || 0,
            totalVisitsAllTime: Number(s.total_visits_all) || 0,
            peakDay: (s.peak_day as string) ?? null,
            peakDayCount: Number(s.peak_day_count) || 0
        }
    };
};
