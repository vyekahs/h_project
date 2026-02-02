import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/boardgameclub';

console.log(`Connecting to database at ${DATABASE_URL}...`);

const pool = new pg.Pool({
    connectionString: DATABASE_URL,
});

const ddl = `
-- 유저 포인트 테이블
CREATE TABLE IF NOT EXISTS user_points (
    user_id         BIGINT PRIMARY KEY, -- Maps to existing users? Or just separate ID? Assuming linked to users table ideally, but standardizing as BIGINT
    total_points    INT DEFAULT 0,
    daily_earned    INT DEFAULT 0,
    last_earned_at  TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- 랭킹 테이블
CREATE TABLE IF NOT EXISTS game_rankings (
    id              BIGSERIAL PRIMARY KEY,
    game_id         VARCHAR(50) NOT NULL,
    difficulty      VARCHAR(20), -- ENUM replacement for flexibility
    user_id         BIGINT NOT NULL,
    score           INT,
    clear_time      INT,  -- 초 단위
    achieved_at     TIMESTAMP DEFAULT NOW(),
    CONSTRAINT unique_ranking UNIQUE (game_id, difficulty, user_id)
);

-- 칭호 테이블
CREATE TABLE IF NOT EXISTS titles (
    id              BIGSERIAL PRIMARY KEY,
    title_code      VARCHAR(50) UNIQUE NOT NULL,
    title_name      VARCHAR(100) NOT NULL,
    description     TEXT,
    condition_type  VARCHAR(50),  -- 'ranking', 'achievement', 'community'
    condition_value JSON
);

-- 유저 칭호 보유 테이블
CREATE TABLE IF NOT EXISTS user_titles (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    title_id        BIGINT NOT NULL REFERENCES titles(id),
    acquired_at     TIMESTAMP DEFAULT NOW(),
    is_displayed    BOOLEAN DEFAULT TRUE,
    CONSTRAINT unique_user_title UNIQUE (title_id, user_id) -- One title per user? No, "칭호당 1명만 보유" logic in doc implies UNIQUE(title_id) for limited titles? 
    -- "동아리 내에서 단 한 명만 보유" -> If the title itself is unique to one person.
    -- Wait, doc says: "칭호는 동아리 내에서 단 한 명만 보유할 수 있는 희소성 있는 보상입니다."
    -- So yes, specific titles like "Sudoku Master" might be held by only one person at a time (Rank 1).
    -- But maybe some are generic? The doc focuses on unique titles.
    -- Let's stick to the doc: UNIQUE KEY unique_user_title (title_id) means ONLY ONE USER can hold a specific title_id row?
    -- No, table user_titles links user_id and title_id. 
    -- If UNIQUE(title_id), it means a specific Title ID can only appear ONCE in this table. So only one user can have it. Correct.
);

-- Note: The unique constraint below enforces "One user per title" (Scarcity).
-- If we want multiple users to have "Newbie", we might need a different table or a flag in titles table like 'is_unique'.
-- For now, following the spec for "Unique Titles".
ALTER TABLE user_titles DROP CONSTRAINT IF EXISTS unique_user_title_holder;
ALTER TABLE user_titles ADD CONSTRAINT unique_user_title_holder UNIQUE (title_id);


-- 상점 아이템 테이블
CREATE TABLE IF NOT EXISTS shop_items (
    id              BIGSERIAL PRIMARY KEY,
    item_code       VARCHAR(50) UNIQUE NOT NULL,
    item_name       VARCHAR(100) NOT NULL,
    description     TEXT,
    price           INT NOT NULL,
    item_type       VARCHAR(20), -- ENUM('game_assist', 'community', 'cosmetic')
    use_limit       JSON,  -- {"per_game": 3, "per_day": 10}
    is_active       BOOLEAN DEFAULT TRUE
);

-- 유저 인벤토리 테이블
CREATE TABLE IF NOT EXISTS user_inventory (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    item_id         BIGINT NOT NULL REFERENCES shop_items(id),
    quantity        INT DEFAULT 0,
    CONSTRAINT unique_inventory UNIQUE (user_id, item_id)
);

-- 포인트 거래 로그
CREATE TABLE IF NOT EXISTS point_transactions (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    amount          INT NOT NULL,  -- 양수: 획득, 음수: 사용
    transaction_type VARCHAR(20), -- ENUM('game_clear', 'bonus', 'purchase', 'gift_sent', 'gift_received')
    reference_id    VARCHAR(100),
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ranking_lookup ON game_rankings (game_id, difficulty, clear_time ASC);
CREATE INDEX IF NOT EXISTS idx_daily_points ON point_transactions (user_id, created_at, transaction_type);
CREATE INDEX IF NOT EXISTS idx_title_condition ON titles (condition_type, id);
CREATE INDEX IF NOT EXISTS idx_user_date ON point_transactions (user_id, created_at);
`;

const seedData = `
-- Seed Titles
INSERT INTO titles (title_code, title_name, description, condition_type, condition_value) VALUES
('sudoku_master', '스도쿠 깎는', '스도쿠(하드) 최단 클리어 1위', 'ranking', '{"gameId": "sudoku", "difficulty": "hard", "rank": 1}'),
('speed_demon', '번개손', '스도쿠(이지) 최단 클리어 1위', 'ranking', '{"gameId": "sudoku", "difficulty": "easy", "rank": 1}'),
('puzzle_god', '퍼즐의 신', '퍼즐게임 종합 점수 1위', 'ranking', '{"gameId": "puzzle", "rank": 1}'),
('challenger', '불굴의 도전자', '최다 게임 클리어 1위', 'achievement', '{"type": "clear_count", "rank": 1}'),
('rich_person', '포인트 부자', '누적 포인트 획득 1위', 'achievement', '{"type": "total_points", "rank": 1}'),
('giver', '나눔의 손길', '선물 횟수 1위', 'community', '{"type": "gift_count", "rank": 1}')
ON CONFLICT (title_code) DO NOTHING;

-- Seed Shop Items
INSERT INTO shop_items (item_code, item_name, description, price, item_type, use_limit) VALUES
('undo_shield', '실수 방패', '마지막 입력 1회 취소', 30, 'game_assist', '{"per_game": 3}'),
('hint_ticket', '힌트권', '정답 힌트 1회 제공', 50, 'game_assist', '{"per_game": 2}'),
('time_stop', '타임 스톱', '30초간 타이머 정지', 80, 'game_assist', '{"per_game": 1}'),
('refresh_prob', '문제 교체권', '현재 문제 새로고침', 100, 'game_assist', '{"per_game": 1}'),
('peek_answer', '정답 미리보기', '5초간 정답 표시', 150, 'game_assist', '{"per_game": 1}'),
('gift_hint', '선물용 힌트권', '타 유저에게 힌트권 선물', 60, 'community', '{"per_day": 5}'),
('cheer_msg', '응원 메시지', '랭킹 보드에 응원 메시지', 20, 'community', '{"per_day": 10}'),
('celebration', '축하 이펙트', '신기록 달성 시 특수 효과 (24시간)', 100, 'community', null),
('nickname_color', '닉네임 꾸미기', '닉네임 색상 변경 (7일)', 200, 'cosmetic', null),
('detailed_stats', '상세 통계', '개인 플레이 분석 리포트', 300, 'game_assist', null),
('profile_border', '프로필 테두리', '프로필 테두리 장식', 500, 'cosmetic', null),
('vip_badge', 'VIP 배지', '닉네임 옆 VIP 표시 (30일)', 1000, 'cosmetic', null)
ON CONFLICT (item_code) DO NOTHING;
`;

async function main() {
    try {
        await pool.query('BEGIN');
        
        console.log('Creating tables...');
        await pool.query(ddl);
        
        console.log('Seeding initial data...');
        await pool.query(seedData);
        
        await pool.query('COMMIT');
        console.log('Migration completed successfully!');
    } catch (e) {
        await pool.query('ROLLBACK');
        console.error('Migration failed:', e);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
