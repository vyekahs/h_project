import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/boardgameclub';

console.log(`Connecting to database at ${DATABASE_URL}...`);

const pool = new pg.Pool({
    connectionString: DATABASE_URL,
});


const queries = [
    `CREATE TABLE IF NOT EXISTS minigame_user_points (
        user_id         INTEGER PRIMARY KEY REFERENCES attendees(id) ON DELETE CASCADE,
        total_points    INT DEFAULT 0,
        daily_earned    INT DEFAULT 0,
        last_earned_at  TIMESTAMP,
        equipped_title_id BIGINT,
        created_at      TIMESTAMP DEFAULT NOW()
    );`,
    `ALTER TABLE minigame_user_points ADD COLUMN IF NOT EXISTS equipped_title_id BIGINT;`,
    `DO $$ BEGIN
        ALTER TABLE minigame_user_points DROP CONSTRAINT IF EXISTS fk_user_points_attendees;
        ALTER TABLE minigame_user_points ADD CONSTRAINT fk_user_points_attendees FOREIGN KEY (user_id) REFERENCES attendees(id) ON DELETE CASCADE;
     EXCEPTION WHEN others THEN null; END $$;`,

    `CREATE TABLE IF NOT EXISTS minigame_rankings (
        id              BIGSERIAL PRIMARY KEY,
        game_id         VARCHAR(50) NOT NULL,
        difficulty      VARCHAR(20),
        user_id         INTEGER NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
        score           INT,
        clear_time      INT,
        achieved_at     TIMESTAMP DEFAULT NOW(),
        CONSTRAINT unique_ranking UNIQUE (game_id, difficulty, user_id)
    );`,
    `DO $$ BEGIN
        ALTER TABLE minigame_rankings DROP CONSTRAINT IF EXISTS fk_rankings_attendees;
        ALTER TABLE minigame_rankings ADD CONSTRAINT fk_rankings_attendees FOREIGN KEY (user_id) REFERENCES attendees(id) ON DELETE CASCADE;
     EXCEPTION WHEN others THEN null; END $$;`,

    `CREATE TABLE IF NOT EXISTS minigame_monthly_rankings (
        id              SERIAL PRIMARY KEY,
        user_id         INTEGER NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
        game_id         VARCHAR(50) NOT NULL,
        month_key       VARCHAR(7) NOT NULL,
        total_score     INTEGER DEFAULT 0,
        score_updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, game_id, month_key)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_monthly_rankings_score ON minigame_monthly_rankings(game_id, month_key, total_score DESC);`,

    `CREATE TABLE IF NOT EXISTS minigame_titles (
        id              BIGSERIAL PRIMARY KEY,
        title_code      VARCHAR(50) UNIQUE NOT NULL,
        title_name      VARCHAR(100) NOT NULL,
        description     TEXT,
        condition_type  VARCHAR(50),
        condition_value JSON
    );`,
    `CREATE TABLE IF NOT EXISTS minigame_user_titles (
        id              BIGSERIAL PRIMARY KEY,
        user_id         INTEGER NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
        title_id        BIGINT NOT NULL REFERENCES minigame_titles(id),
        acquired_at     TIMESTAMP DEFAULT NOW(),
        is_displayed    BOOLEAN DEFAULT TRUE
    );`,
    `DO $$ BEGIN
        ALTER TABLE minigame_user_titles DROP CONSTRAINT IF EXISTS fk_user_titles_attendees;
        ALTER TABLE minigame_user_titles ADD CONSTRAINT fk_user_titles_attendees FOREIGN KEY (user_id) REFERENCES attendees(id) ON DELETE CASCADE;
     EXCEPTION WHEN others THEN null; END $$;`,

    `-- Attempt to add constraint if not exists (Postgres doesn't support IF NOT EXISTS for constraints easily, so we catch error)
     DO $$ BEGIN
        ALTER TABLE minigame_user_titles ADD CONSTRAINT unique_user_title UNIQUE (title_id, user_id);
     EXCEPTION
        WHEN duplicate_object THEN null;
        WHEN others THEN null; -- Ignore if constraint issues
     END $$;`,
     `DO $$ BEGIN
        ALTER TABLE minigame_user_titles DROP CONSTRAINT IF EXISTS unique_user_title_holder;
        ALTER TABLE minigame_user_titles ADD CONSTRAINT unique_user_title_holder UNIQUE (title_id);
     EXCEPTION
        WHEN duplicate_object THEN null;
        WHEN others THEN null;
     END $$;`,
    `CREATE TABLE IF NOT EXISTS minigame_shop_items (
        id              BIGSERIAL PRIMARY KEY,
        item_code       VARCHAR(50) UNIQUE NOT NULL,
        item_name       VARCHAR(100) NOT NULL,
        description     TEXT,
        price           INT NOT NULL,
        item_type       VARCHAR(20),
        use_limit       JSON,
        is_active       BOOLEAN DEFAULT TRUE
    );`,
    `CREATE TABLE IF NOT EXISTS minigame_user_inventory (
        id              BIGSERIAL PRIMARY KEY,
        user_id         INTEGER NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
        item_id         BIGINT NOT NULL REFERENCES minigame_shop_items(id),
        quantity        INT DEFAULT 0,
        CONSTRAINT unique_inventory UNIQUE (user_id, item_id)
    );`,
    `DO $$ BEGIN
        ALTER TABLE minigame_user_inventory DROP CONSTRAINT IF EXISTS fk_inventory_attendees;
        ALTER TABLE minigame_user_inventory ADD CONSTRAINT fk_inventory_attendees FOREIGN KEY (user_id) REFERENCES attendees(id) ON DELETE CASCADE;
     EXCEPTION WHEN others THEN null; END $$;`,

    `CREATE TABLE IF NOT EXISTS point_transactions (
        id              BIGSERIAL PRIMARY KEY,
        user_id         INTEGER NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
        amount          INT NOT NULL,
        transaction_type VARCHAR(20),
        reference_id    VARCHAR(100),
        created_at      TIMESTAMP DEFAULT NOW()
    );`,
    `DO $$ BEGIN
        ALTER TABLE point_transactions DROP CONSTRAINT IF EXISTS fk_transactions_attendees;
        ALTER TABLE point_transactions ADD CONSTRAINT fk_transactions_attendees FOREIGN KEY (user_id) REFERENCES attendees(id) ON DELETE CASCADE;
     EXCEPTION WHEN others THEN null; END $$;`,

    `ALTER TABLE minigame_rankings ADD COLUMN IF NOT EXISTS mistakes INT DEFAULT 0;`,
    `CREATE INDEX IF NOT EXISTS idx_ranking_lookup ON minigame_rankings (game_id, difficulty, clear_time ASC);`,
    `CREATE INDEX IF NOT EXISTS idx_daily_points ON point_transactions (user_id, created_at, transaction_type);`,
    `CREATE INDEX IF NOT EXISTS idx_title_condition ON minigame_titles (condition_type, id);`,
    `CREATE INDEX IF NOT EXISTS idx_user_date ON point_transactions (user_id, created_at);`,
    `CREATE TABLE IF NOT EXISTS tutorial_progress (
        id              BIGSERIAL PRIMARY KEY,
        user_id         INTEGER NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
        tutorial_id     VARCHAR(50) NOT NULL,
        completed_at    TIMESTAMP DEFAULT NOW(),
        CONSTRAINT unique_user_tutorial UNIQUE (user_id, tutorial_id)
    );`,
    `DO $$ BEGIN
        ALTER TABLE tutorial_progress DROP CONSTRAINT IF EXISTS fk_tutorial_attendees;
        ALTER TABLE tutorial_progress ADD CONSTRAINT fk_tutorial_attendees FOREIGN KEY (user_id) REFERENCES attendees(id) ON DELETE CASCADE;
     EXCEPTION WHEN others THEN null; END $$;`,

    `-- Recalculate sudoku scores from cumulative to single-game best (one-time fix)
     UPDATE minigame_rankings
     SET score = CASE difficulty
            WHEN 'easy'   THEN 10
            WHEN 'medium' THEN 50
            WHEN 'hard'   THEN 120
            WHEN 'expert' THEN 250
            ELSE 400
        END
        + GREATEST(0, (
            CASE difficulty
                WHEN 'easy'   THEN 300
                WHEN 'medium' THEN 600
                WHEN 'hard'   THEN 900
                WHEN 'expert' THEN 1200
                ELSE 1500
            END - clear_time
        ) * CASE difficulty
                WHEN 'easy'   THEN 1
                WHEN 'medium' THEN 2
                WHEN 'hard'   THEN 3
                WHEN 'expert' THEN 4
                ELSE 5
            END)
     WHERE game_id = 'sudoku';`
];

async function main() {
    try {
        console.log('Starting resilient migration (Minigame System)...');
        
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
INSERT INTO minigame_titles (title_code, title_name, description, condition_type, condition_value) VALUES
('sudoku_master', '스도쿠 깎는', '스도쿠 총점 1위', 'ranking', '{"gameId": "sudoku", "rank": 1}'),
('monthly_king', '집에 안가는', '월간 최다 플레이 (최소 3회)', 'ranking', '{"type": "monthly_play_count", "rank": 1, "min_count": 3}'),
('beginner', '새내기', '가입 후 30일 이내', 'account', '{"type": "account_age", "value": 30}')
ON CONFLICT (title_code) DO UPDATE SET
    description = EXCLUDED.description,
    condition_value = EXCLUDED.condition_value;

-- Seed Shop Items
INSERT INTO minigame_shop_items (item_code, item_name, description, price, item_type, use_limit) VALUES
('undo_shield', '실수 방패', '마지막 입력 1회 취소', 30, 'game_assist', '{"per_game": 3}'),
('hint_ticket', '힌트권', '정답 힌트 1회 제공', 50, 'game_assist', '{"per_game": 2}'),
('time_stop', '타임 스톱', '30초간 타이머 정지', 80, 'game_assist', '{"per_game": 1}'),
('refresh_prob', '문제 교체권', '현재 문제 새로고침', 100, 'game_assist', '{"per_game": 1}'),
('gift_hint', '선물용 힌트권', '타 유저에게 힌트권 선물', 60, 'community', '{"per_day": 5}'),
('vip_badge', 'VIP 배지', '닉네임 옆 VIP 표시 (30일)', 1000, 'cosmetic', null)
ON CONFLICT (item_code) DO NOTHING;
`;

main();
