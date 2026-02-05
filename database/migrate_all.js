
import pg from 'pg';
const { Pool } = pg;

// Use DB URL from env or fallback to localhost (for dev/test)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/boardgameclub'
});


const MAX_RETRIES = 10;
const RETRY_DELAY = 2000; // 2 seconds

async function waitForDb() {
    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            await pool.query('SELECT 1');
            console.log('Database connected successfully.');
            return;
        } catch (err) {
            console.log(`Database not ready (attempt ${i + 1}/${MAX_RETRIES}). Retrying in ${RETRY_DELAY}ms...`);
            await new Promise(res => setTimeout(res, RETRY_DELAY));
        }
    }
    throw new Error('Could not connect to database after multiple attempts.');
}

async function migrate() {
    try {
        console.log('Starting DB Migrations...');
        
        await waitForDb();

        // 1. Permission: can_manage_games
        console.log('[1/2] Checking can_manage_games column...');
        await pool.query('ALTER TABLE attendees ADD COLUMN IF NOT EXISTS can_manage_games BOOLEAN DEFAULT FALSE;');

        // 2. Ownership: created_by
        console.log('[2/2] Checking created_by column in game_sessions...');
        await pool.query('ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES attendees(id) ON DELETE SET NULL;');

        // 3. Admin Sessions
        console.log('[3/3] Checking admin_sessions table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS admin_sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                session_token VARCHAR(255) UNIQUE NOT NULL,
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 4. Attendee Sessions
        console.log('[4/4] Checking attendee_sessions table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS attendee_sessions (
                id SERIAL PRIMARY KEY,
                attendee_id INTEGER REFERENCES attendees(id) ON DELETE CASCADE,
                session_token VARCHAR(255) UNIQUE NOT NULL,
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 5. Score in Session Participants
        console.log('[5/5] Checking score column in session_participants...');
        await pool.query('ALTER TABLE session_participants ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0;');

        // 6. User Devices (BLE IRK)
        console.log('[6/6] Checking user_devices table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_devices (
                id SERIAL PRIMARY KEY,
                attendee_id INTEGER REFERENCES attendees(id) ON DELETE CASCADE,
                irk VARCHAR(32) NOT NULL, -- Hex string of 128-bit key
                name VARCHAR(100), -- Friendly name e.g. "Arang's iPhone"
                last_seen_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT unique_irk UNIQUE (irk)
            );
        `);
        // 11. Add is_admin to Attendees
        console.log('[11/11] Adding is_admin to attendees...');
        await pool.query('ALTER TABLE attendees ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;');

        // 12. Game System Tables (Points, Rankings, Titles, Shop)
        console.log('[12/13] Checking Game System tables (Rankings, Titles, Points)...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_points (
                user_id         BIGINT PRIMARY KEY,
                total_points    INT DEFAULT 0,
                daily_earned    INT DEFAULT 0,
                last_earned_at  TIMESTAMP,
                created_at      TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS game_rankings (
                id              BIGSERIAL PRIMARY KEY,
                game_id         VARCHAR(50) NOT NULL,
                difficulty      VARCHAR(20),
                user_id         BIGINT NOT NULL,
                score           INT,
                clear_time      INT,
                achieved_at     TIMESTAMP DEFAULT NOW(),
                CONSTRAINT unique_ranking UNIQUE (game_id, difficulty, user_id)
            );

            CREATE TABLE IF NOT EXISTS titles (
                id              BIGSERIAL PRIMARY KEY,
                title_code      VARCHAR(50) UNIQUE NOT NULL,
                title_name      VARCHAR(100) NOT NULL,
                description     TEXT,
                condition_type  VARCHAR(50),
                condition_value JSON
            );

            CREATE TABLE IF NOT EXISTS user_titles (
                id              BIGSERIAL PRIMARY KEY,
                user_id         BIGINT NOT NULL,
                title_id        BIGINT NOT NULL REFERENCES titles(id),
                acquired_at     TIMESTAMP DEFAULT NOW(),
                is_displayed    BOOLEAN DEFAULT TRUE
            );
            
            -- Helper for constraints in case they don't exist
            DO $$ BEGIN
                ALTER TABLE user_titles ADD CONSTRAINT unique_user_title UNIQUE (title_id, user_id);
            EXCEPTION WHEN duplicate_object THEN null; END $$;

            DO $$ BEGIN
                ALTER TABLE user_titles DROP CONSTRAINT IF EXISTS unique_user_title_holder;
                ALTER TABLE user_titles ADD CONSTRAINT unique_user_title_holder UNIQUE (title_id);
            EXCEPTION WHEN duplicate_object THEN null; END $$;

            CREATE INDEX IF NOT EXISTS idx_ranking_lookup ON game_rankings (game_id, difficulty, clear_time ASC);
            CREATE INDEX IF NOT EXISTS idx_title_condition ON titles (condition_type, id);
        `);

        // 13. Shop System
        console.log('[13/13] Checking Shop System tables (Items, Inventory, Transactions)...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS shop_items (
                id              BIGSERIAL PRIMARY KEY,
                item_code       VARCHAR(50) UNIQUE NOT NULL,
                item_name       VARCHAR(100) NOT NULL,
                description     TEXT,
                price           INT NOT NULL,
                item_type       VARCHAR(20),
                use_limit       JSON,
                is_active       BOOLEAN DEFAULT TRUE
            );

            CREATE TABLE IF NOT EXISTS user_inventory (
                id              BIGSERIAL PRIMARY KEY,
                user_id         BIGINT NOT NULL,
                item_id         BIGINT NOT NULL REFERENCES shop_items(id),
                quantity        INT DEFAULT 0,
                CONSTRAINT unique_inventory UNIQUE (user_id, item_id)
            );

            CREATE TABLE IF NOT EXISTS point_transactions (
                id              BIGSERIAL PRIMARY KEY,
                user_id         BIGINT NOT NULL,
                amount          INT NOT NULL,
                transaction_type VARCHAR(20),
                reference_id    VARCHAR(100),
                created_at      TIMESTAMP DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_daily_points ON point_transactions (user_id, created_at, transaction_type);
            CREATE INDEX IF NOT EXISTS idx_user_date ON point_transactions (user_id, created_at);
        `);
        
        // Seed Basic Data if needed
        console.log('Seeding Game System data if empty...');
        await pool.query(`
            INSERT INTO titles (title_code, title_name, description, condition_type, condition_value) VALUES
            ('sudoku_master', '스도쿠 깎는', '스도쿠(하드) 최단 클리어 1위', 'ranking', '{"gameId": "sudoku", "difficulty": "hard", "rank": 1}'),
            ON CONFLICT (title_code) DO NOTHING;

            INSERT INTO shop_items (item_code, item_name, description, price, item_type, use_limit) VALUES
            ('undo_shield', '실수 방패', '마지막 입력 1회 취소', 30, 'game_assist', '{"per_game": 3}'),
            ('hint_ticket', '힌트권', '정답 힌트 1회 제공', 50, 'game_assist', '{"per_game": 2}'),
            ('time_stop', '타임 스톱', '30초간 타이머 정지', 80, 'game_assist', '{"per_game": 1}'),
            ('refresh_prob', '문제 교체권', '현재 문제 새로고침', 100, 'game_assist', '{"per_game": 1}'),
            ('gift_hint', '선물용 힌트권', '타 유저에게 힌트권 선물', 60, 'community', '{"per_day": 5}'),
            ('vip_badge', 'VIP 배지', '닉네임 옆 VIP 표시 (30일)', 1000, 'cosmetic', null)
            ON CONFLICT (item_code) DO NOTHING;
        `);

        console.log('All migrations completed successfully!');
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

migrate();
