import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/boardgameclub';

console.log(`Connecting to database at ${DATABASE_URL}...`);

const pool = new pg.Pool({
    connectionString: DATABASE_URL,
});


const queries = [
    `CREATE TABLE IF NOT EXISTS user_points (
        user_id         BIGINT PRIMARY KEY,
        total_points    INT DEFAULT 0,
        daily_earned    INT DEFAULT 0,
        last_earned_at  TIMESTAMP,
        created_at      TIMESTAMP DEFAULT NOW()
    );`,
    `CREATE TABLE IF NOT EXISTS game_rankings (
        id              BIGSERIAL PRIMARY KEY,
        game_id         VARCHAR(50) NOT NULL,
        difficulty      VARCHAR(20),
        user_id         BIGINT NOT NULL,
        score           INT,
        clear_time      INT,
        achieved_at     TIMESTAMP DEFAULT NOW(),
        CONSTRAINT unique_ranking UNIQUE (game_id, difficulty, user_id)
    );`,
    `CREATE TABLE IF NOT EXISTS titles (
        id              BIGSERIAL PRIMARY KEY,
        title_code      VARCHAR(50) UNIQUE NOT NULL,
        title_name      VARCHAR(100) NOT NULL,
        description     TEXT,
        condition_type  VARCHAR(50),
        condition_value JSON
    );`,
    `CREATE TABLE IF NOT EXISTS user_titles (
        id              BIGSERIAL PRIMARY KEY,
        user_id         BIGINT NOT NULL,
        title_id        BIGINT NOT NULL REFERENCES titles(id),
        acquired_at     TIMESTAMP DEFAULT NOW(),
        is_displayed    BOOLEAN DEFAULT TRUE
    );`,
    `-- Attempt to add constraint if not exists (Postgres doesn't support IF NOT EXISTS for constraints easily, so we catch error)
     DO $$ BEGIN
        ALTER TABLE user_titles ADD CONSTRAINT unique_user_title UNIQUE (title_id, user_id);
     EXCEPTION
        WHEN duplicate_object THEN null;
        WHEN others THEN null; -- Ignore if constraint issues
     END $$;`,
     `DO $$ BEGIN
        ALTER TABLE user_titles DROP CONSTRAINT IF EXISTS unique_user_title_holder;
        ALTER TABLE user_titles ADD CONSTRAINT unique_user_title_holder UNIQUE (title_id);
     EXCEPTION
        WHEN duplicate_object THEN null;
        WHEN others THEN null;
     END $$;`,
    `CREATE TABLE IF NOT EXISTS shop_items (
        id              BIGSERIAL PRIMARY KEY,
        item_code       VARCHAR(50) UNIQUE NOT NULL,
        item_name       VARCHAR(100) NOT NULL,
        description     TEXT,
        price           INT NOT NULL,
        item_type       VARCHAR(20),
        use_limit       JSON,
        is_active       BOOLEAN DEFAULT TRUE
    );`,
    `CREATE TABLE IF NOT EXISTS user_inventory (
        id              BIGSERIAL PRIMARY KEY,
        user_id         BIGINT NOT NULL,
        item_id         BIGINT NOT NULL REFERENCES shop_items(id),
        quantity        INT DEFAULT 0,
        CONSTRAINT unique_inventory UNIQUE (user_id, item_id)
    );`,
    `CREATE TABLE IF NOT EXISTS point_transactions (
        id              BIGSERIAL PRIMARY KEY,
        user_id         BIGINT NOT NULL,
        amount          INT NOT NULL,
        transaction_type VARCHAR(20),
        reference_id    VARCHAR(100),
        created_at      TIMESTAMP DEFAULT NOW()
    );`,
    `CREATE INDEX IF NOT EXISTS idx_ranking_lookup ON game_rankings (game_id, difficulty, clear_time ASC);`,
    `CREATE INDEX IF NOT EXISTS idx_daily_points ON point_transactions (user_id, created_at, transaction_type);`,
    `CREATE INDEX IF NOT EXISTS idx_title_condition ON titles (condition_type, id);`,
    `CREATE INDEX IF NOT EXISTS idx_user_date ON point_transactions (user_id, created_at);`,
    `CREATE TABLE IF NOT EXISTS tutorial_progress (
        id              BIGSERIAL PRIMARY KEY,
        user_id         BIGINT NOT NULL,
        tutorial_id     VARCHAR(50) NOT NULL,
        completed_at    TIMESTAMP DEFAULT NOW(),
        CONSTRAINT unique_user_tutorial UNIQUE (user_id, tutorial_id)
    );`
];

async function main() {
    try {
        console.log('Starting resilient migration...');
        
        for (const query of queries) {
            try {
                await pool.query(query);
            } catch (e) {
                // Log but continue for other tables
                console.warn('Query failed but continuing:', e.message);
            }
        }
        
        console.log('Seeding initial data...');
        try {
            await pool.query(seedData);
        } catch(e) {
            console.warn('Seeding failed (might be duplicates):', e.message);
        }
        
        console.log('Migration completed!');
    } catch (e) {
        console.error('Migration framework error:', e);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

const seedData = `
-- Seed Titles
INSERT INTO titles (title_code, title_name, description, condition_type, condition_value) VALUES
('sudoku_master', '스도쿠 깎는', '스도쿠(하드) 최단 클리어 1위', 'ranking', '{"gameId": "sudoku", "difficulty": "hard", "rank": 1}'),
('monthly_king', '집에 안가는', '월간 최다 플레이 (최소 3회)', 'ranking', '{"type": "monthly_play_count", "rank": 1, "min_count": 3}'),
('beginner', '새내기', '가입 후 30일 이내', 'account', '{"type": "account_age", "value": 30}')
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

main();

