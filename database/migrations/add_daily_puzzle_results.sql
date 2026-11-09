-- 오늘의 퍼즐 기록
--
-- 하루에 하나, 모두에게 같은 문제를 낸다(문제는 날짜로 정해지므로 저장하지 않는다).
-- 같은 문제를 푼 기록끼리만 비교해야 순위가 의미 있으므로 월간 랭킹과 따로 둔다.
-- 그날 첫 클리어만 인정한다 — 기본 키가 (날짜, 게임, 사용자)라 두 번째부터는 무시된다.
CREATE TABLE IF NOT EXISTS daily_puzzle_results (
    puzzle_date DATE NOT NULL,
    game_id VARCHAR(50) NOT NULL,
    user_id INTEGER NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    clear_time INTEGER NOT NULL,   -- 초
    moves INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (puzzle_date, game_id, user_id)
);

-- 연속 참여 일수 계산용
CREATE INDEX IF NOT EXISTS idx_daily_puzzle_results_user
    ON daily_puzzle_results (user_id, game_id, puzzle_date DESC);
