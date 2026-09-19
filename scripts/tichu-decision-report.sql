-- 티츄 선언 판단 기록 분석 리포트.
--
--   psql ... -f scripts/tichu-decision-report.sql
--
-- target_score IS NOT NULL 인 행만 본다. NULL인 행은 2026-09-19 이전 수집분으로,
-- 모든 게임의 마지막 라운드가 빠지고 끝까지 친 게임만 들어 있어 성공률이 부풀려져 있다.
--
-- 읽는 법: 사람(seat 0)과 AI(seat 1~3)는 **같은 라운드, 같은 특징값 축**으로 기록된다.
-- 그래서 "같은 race_prob 구간에서 사람과 AI의 실제 1등률이 얼마나 다른가"가
-- 곧 플레이 실력 차이고, 그걸 걷어낸 뒤에야 선언 기준을 비교할 수 있다.

\pset footer off
CREATE TEMP VIEW d AS
SELECT *, CASE WHEN seat = 0 THEN 'human' WHEN seat = 2 THEN 'ai_partner' ELSE 'ai_opp' END AS who
FROM tichu_decision_log WHERE target_score IS NOT NULL;

\echo '== 0. 수집 상태: 날짜별 라운드 수 / 게임을 친 사람 수 / 시작 대비 기록 비율'
WITH logged AS (
    SELECT created_at::date AS day, count(*) FILTER (WHERE seat = 0) AS rounds,
           count(DISTINCT user_id) AS users,
           count(*) FILTER (WHERE seat = 0 AND round_number = 1) AS games_logged
    FROM d GROUP BY 1
), started AS (
    SELECT played_at::date AS day, count(*) AS game_starts
    FROM minigame_play_log WHERE game_id = 'tichu' AND type = 'start' GROUP BY 1
)
SELECT l.day, l.rounds, l.users, s.game_starts, l.games_logged
FROM logged l LEFT JOIN started s USING (day) ORDER BY 1;

\echo '== 1. 사람 vs AI: 선언율 · 성공률 · 1등률 · 평균 등수'
SELECT who, count(*) AS n,
       round(100.0 * avg((declared = 'small')::int), 1) AS small_pct,
       round(100.0 * avg((declared = 'grand')::int), 1) AS grand_pct,
       round(100.0 * avg(finished_first::int) FILTER (WHERE declared = 'small'), 1) AS small_ok_pct,
       round(100.0 * avg(finished_first::int) FILTER (WHERE declared = 'grand'), 1) AS grand_ok_pct,
       round(100.0 * avg(finished_first::int), 1) AS first_pct,
       round(avg(finish_position), 2) AS avg_pos
FROM d GROUP BY 1 ORDER BY 1;

\echo '== 2. 플레이 실력 차이: 같은 race_prob 구간에서 실제 1등률 (사람 vs AI)'
SELECT width_bucket(race_prob, 0, 1.0001, 5) AS bucket,
       count(*) FILTER (WHERE seat = 0) AS human_n,
       round(100.0 * avg(finished_first::int) FILTER (WHERE seat = 0)) AS human_first_pct,
       count(*) FILTER (WHERE seat <> 0) AS ai_n,
       round(100.0 * avg(finished_first::int) FILTER (WHERE seat <> 0)) AS ai_first_pct
FROM d WHERE race_prob IS NOT NULL GROUP BY 1 ORDER BY 1;

\echo '== 3. 유저별 (과감한 플레이어와 나머지는 선언 기준이 완전히 다르므로 합쳐 보지 말 것)'
SELECT user_id, count(*) AS rounds,
       round(100.0 * avg((declared = 'small')::int)) AS small_pct,
       round(100.0 * avg((declared = 'grand')::int)) AS grand_pct,
       sum((declared = 'small' AND finished_first)::int) || '/' || sum((declared = 'small')::int) AS small_ok,
       sum((declared = 'grand' AND finished_first)::int) || '/' || sum((declared = 'grand')::int) AS grand_ok,
       round(100.0 * avg(finished_first::int)) AS first_pct,
       round(avg(team_score)) AS avg_team_score,
       mode() WITHIN GROUP (ORDER BY target_score) AS usual_target
FROM d WHERE seat = 0 GROUP BY 1 ORDER BY 2 DESC;

\echo '== 4. 사람의 스몰 선언: 시작 직후(0장) vs 판을 보다가 / 상대·파트너 선언 여부별'
SELECT CASE WHEN small_cards_out = 0 THEN '0 (시작 전)' WHEN small_cards_out <= 14 THEN '1~14장' ELSE '15장+' END AS cards_out,
       count(*) AS n, round(100.0 * avg(finished_first::int)) AS ok_pct,
       round(avg(race_prob)::numeric, 2) AS avg_race_prob, round(avg(hand_strength)::numeric) AS avg_strength
FROM d WHERE seat = 0 AND declared = 'small' GROUP BY 1 ORDER BY 1;

SELECT opp_declared, partner_declared, count(*) AS n,
       round(100.0 * avg((declared <> 'none')::int)) AS human_declared_pct,
       round(100.0 * avg(finished_first::int)) AS human_first_pct
FROM d WHERE seat = 0 GROUP BY 1, 2 ORDER BY 3 DESC;

\echo '== 5. 선언자 차단: 사람이 선언했을 때 누가 1등을 가져갔나'
SELECT declared, count(*) AS n,
       round(100.0 * avg((finish_position = 1)::int)) AS success_pct,
       round(100.0 * avg((finish_position = 2)::int)) AS second_pct,
       round(100.0 * avg((finish_position >= 3)::int)) AS third_or_last_pct
FROM d WHERE seat = 0 GROUP BY 1 ORDER BY 1;

\echo '== 6. 특징값 AUC — 실제 1등을 얼마나 가려내는가 (0.5 = 무작위). 사람 / AI 따로'
WITH f AS (
    SELECT (seat = 0) AS human, finished_first AS y, k, v
    FROM d, LATERAL (VALUES ('race_prob', race_prob::float8), ('hand_strength', hand_strength::float8),
        ('exit_rate', exit_rate::float8), ('pure_win_rate', pure_win_rate::float8),
        ('min_turns(-)', -min_turns::float8), ('lead_combos', lead_combos::float8)) AS t(k, v)
    WHERE v IS NOT NULL
), r AS (
    SELECT human, k, y, rank() OVER w + (count(*) OVER (PARTITION BY human, k, v) - 1) / 2.0 AS rk
    FROM f WINDOW w AS (PARTITION BY human, k ORDER BY v)
)
SELECT k AS feature,
       round(((sum(rk) FILTER (WHERE human AND y) - count(*) FILTER (WHERE human AND y) * (count(*) FILTER (WHERE human AND y) + 1) / 2.0)
           / NULLIF(count(*) FILTER (WHERE human AND y) * count(*) FILTER (WHERE human AND NOT y), 0))::numeric, 3) AS auc_human,
       round(((sum(rk) FILTER (WHERE NOT human AND y) - count(*) FILTER (WHERE NOT human AND y) * (count(*) FILTER (WHERE NOT human AND y) + 1) / 2.0)
           / NULLIF(count(*) FILTER (WHERE NOT human AND y) * count(*) FILTER (WHERE NOT human AND NOT y), 0))::numeric, 3) AS auc_ai
FROM r GROUP BY 1 ORDER BY 2 DESC NULLS LAST;

\echo '== 7. 플레이 기록을 뜯어볼 후보: AI가 가망 없다고 봤는데(race_prob < 0.2) 사람이 1등 한 라운드'
SELECT id, user_id, round_number, declared, round(race_prob::numeric, 2) AS race_prob,
       round(hand_strength::numeric) AS strength, team_score, jsonb_array_length(plays) AS play_len
FROM d WHERE seat = 0 AND finished_first AND race_prob < 0.2 AND plays IS NOT NULL
ORDER BY id DESC LIMIT 20;
