-- 미니게임 월별 플레이 집계
--
-- minigame_play_log는 하루 237행씩 쌓이는데(실측) 이를 읽는 쿼리는 최대 1개월까지만
-- 본다. 그래서 오래된 원본은 지워야 하는데, 그냥 지우면 "몇 달 전에 얼마나 했는지"를
-- 영영 알 수 없게 된다. 지우기 전에 월별로 압축해서 남긴다.
--
-- 압축률: 원본 46,186행 → 집계 1,004행 (약 46배).
--
-- 이미 있는 minigame_monthly_rankings와는 담는 내용이 다르다.
-- 그쪽은 월별 "점수 합계"(랭킹용)이고, 여기는 "플레이 횟수/최고 기록"이다.
-- 중복해서 들고 있지 않도록 total_score는 넣지 않는다.
--
-- 난이도를 키에 포함한 이유: clear_time은 난이도가 다르면 비교가 무의미하다.
-- easy 30초와 expert 30초를 같은 칸에 넣으면 최단 기록이 왜곡된다.
-- play_log의 difficulty는 NULL일 수 있는데 기본키에는 NULL을 쓸 수 없어 ''로 바꾼다.

CREATE TABLE IF NOT EXISTS minigame_monthly_play_stats (
    month_key       VARCHAR(7)  NOT NULL,   -- 'YYYY-MM'
    game_id         VARCHAR(50) NOT NULL,
    difficulty      VARCHAR(20) NOT NULL DEFAULT '',
    user_id         INTEGER     NOT NULL,
    start_count     INTEGER     NOT NULL DEFAULT 0,
    clear_count     INTEGER     NOT NULL DEFAULT 0,
    best_score      INTEGER,
    best_clear_time INTEGER,
    last_played_at  TIMESTAMP,
    aggregated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (month_key, game_id, difficulty, user_id)
);

-- 기본키가 (month_key, game_id, ...)라 "특정 월/게임" 조회는 이미 커버된다.
-- 개인 기록 조회("내가 몇 월에 얼마나 했나")를 위해 사용자 기준 인덱스를 추가한다.
CREATE INDEX IF NOT EXISTS idx_minigame_monthly_play_stats_user
    ON minigame_monthly_play_stats (user_id, month_key DESC);
