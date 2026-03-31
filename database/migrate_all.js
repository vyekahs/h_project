
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

        // 7. Season Pass
        console.log('[7/7] Checking season_pass_expires_at column...');
        await pool.query('ALTER TABLE attendees ADD COLUMN IF NOT EXISTS season_pass_expires_at TIMESTAMP WITH TIME ZONE;');
        // 11. Add is_admin to Attendees
        console.log('[11/11] Adding is_admin to attendees...');
        await pool.query('ALTER TABLE attendees ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;');

        // 12. Device Registrations (BLE pairing flow)
        console.log('[12] Checking device_registrations table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS device_registrations (
                id SERIAL PRIMARY KEY,
                device_id VARCHAR(50) NOT NULL,
                pin VARCHAR(10) NOT NULL,
                target_attendee_id INTEGER REFERENCES attendees(id) ON DELETE CASCADE,
                step VARCHAR(20) DEFAULT 'pending',
                irk VARCHAR(32),
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // Add columns if table already exists without them
        await pool.query('ALTER TABLE device_registrations ADD COLUMN IF NOT EXISTS irk VARCHAR(32);');
        await pool.query("ALTER TABLE device_registrations ADD COLUMN IF NOT EXISTS device_name VARCHAR(100) DEFAULT 'Phone';");

        // 13. Scanners table (BLE scanner heartbeat)
        console.log('[13] Checking scanners table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS scanners (
                id TEXT PRIMARY KEY,
                name TEXT,
                last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                ip_address TEXT,
                metadata JSONB,
                status TEXT DEFAULT 'active'
            );
            CREATE INDEX IF NOT EXISTS idx_scanners_last_seen ON scanners(last_seen_at);
        `);

        // 14. Guest support in session_participants
        console.log('[14] Adding guest support to session_participants...');
        await pool.query('ALTER TABLE session_participants ALTER COLUMN attendee_id DROP NOT NULL;');
        await pool.query('ALTER TABLE session_participants ADD COLUMN IF NOT EXISTS guest_name VARCHAR(50);');
        await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'chk_participant_identity'
                ) THEN
                    ALTER TABLE session_participants
                        ADD CONSTRAINT chk_participant_identity
                        CHECK (attendee_id IS NOT NULL OR guest_name IS NOT NULL);
                END IF;
            END
            $$;
        `);

        // 15. Game Parties (고정팟)
        console.log('[15] Checking game_parties tables...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS game_parties (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                owner_id INTEGER REFERENCES attendees(id) ON DELETE CASCADE,
                game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
                game_name VARCHAR(100),
                duration INTEGER,
                guest_count INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS game_party_members (
                id SERIAL PRIMARY KEY,
                party_id INTEGER REFERENCES game_parties(id) ON DELETE CASCADE,
                attendee_id INTEGER REFERENCES attendees(id) ON DELETE CASCADE,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                UNIQUE(party_id, attendee_id)
            );
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_game_parties_owner ON game_parties(owner_id);');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_game_party_members_party ON game_party_members(party_id);');
        // status 컬럼 추가 후, 기존 멤버(status 미설정) backfill
        const colCheck = await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name='game_party_members' AND column_name='status'`);
        if (colCheck.rows.length === 0) {
            await pool.query('ALTER TABLE game_party_members ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT \'pending\'');
            await pool.query(`UPDATE game_party_members SET status = 'accepted'`);
            console.log('  → Added status column and backfilled existing members as accepted');
        }

        // 16. Party-linked game sessions (고정팟 전용 게임)
        console.log('[16] Checking party_id on game_sessions...');
        await pool.query('ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS party_id INTEGER REFERENCES game_parties(id) ON DELETE SET NULL;');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_game_sessions_party ON game_sessions(party_id);');

        // 17. WiFi MAC on user_devices (BLE+WiFi 이중 체크인)
        console.log('[17] Adding wifi_mac to user_devices...');
        await pool.query('ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS wifi_mac VARCHAR(17);');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_user_devices_wifi_mac ON user_devices(wifi_mac) WHERE wifi_mac IS NOT NULL;');

        // 18. Daily Visit Plans (오늘 갈예정)
        console.log('[18] Checking daily_visit_plans table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS daily_visit_plans (
                id SERIAL PRIMARY KEY,
                attendee_id INTEGER REFERENCES attendees(id) ON DELETE CASCADE,
                plan_date DATE NOT NULL DEFAULT CURRENT_DATE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(attendee_id, plan_date)
            );
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_daily_visit_plans_date ON daily_visit_plans(plan_date);');
        await pool.query('ALTER TABLE daily_visit_plans ADD COLUMN IF NOT EXISTS planned_time TIME;');

        // 19. Recurring Game Schedules (반복 게임 스케줄)
        console.log('[19] Checking recurring_game_schedules table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS recurring_game_schedules (
                id SERIAL PRIMARY KEY,
                game_name VARCHAR(100) NOT NULL,
                game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
                day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
                scheduled_time TIME NOT NULL,
                min_players INTEGER DEFAULT 2,
                max_players INTEGER DEFAULT 4,
                party_id INTEGER,
                created_by INTEGER,
                show_on_main BOOLEAN DEFAULT false,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 20. Recurring Game Skips (이번주 빼기)
        console.log('[20] Checking recurring_game_skips table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS recurring_game_skips (
                id SERIAL PRIMARY KEY,
                recurring_schedule_id INTEGER REFERENCES recurring_game_schedules(id) ON DELETE CASCADE,
                skip_date DATE NOT NULL,
                UNIQUE(recurring_schedule_id, skip_date)
            );
        `);

        // 21. Show on main + recurring schedule link for game_sessions
        console.log('[21] Adding show_on_main and recurring_schedule_id to game_sessions...');
        await pool.query('ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS show_on_main BOOLEAN DEFAULT false;');
        await pool.query('ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS recurring_schedule_id INTEGER;');

        // 22. Add 'pending_approval' to reservations status check constraint
        console.log('[22] Updating reservations status check constraint...');
        await pool.query('ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_status_check;');
        await pool.query(`ALTER TABLE reservations ADD CONSTRAINT reservations_status_check
            CHECK (status IN ('pending', 'waitlisted', 'confirmed', 'cancelled', 'pending_approval'));`);

        // 23. Minigame Game Comments (게임별 한줄 댓글)
        console.log('[23] Checking minigame_game_comments table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS minigame_game_comments (
                id BIGSERIAL PRIMARY KEY,
                game_id VARCHAR(50) NOT NULL,
                user_id INTEGER REFERENCES attendees(id) ON DELETE CASCADE,
                content VARCHAR(200) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_game_comments_game_created ON minigame_game_comments(game_id, created_at DESC);');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_game_comments_user ON minigame_game_comments(user_id);');

        // 24. Notifications (알림 시스템)
        console.log('[24] Checking notifications table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id BIGSERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
                type VARCHAR(30) NOT NULL,
                message TEXT NOT NULL,
                from_user_id INTEGER REFERENCES attendees(id) ON DELETE SET NULL,
                reference_id VARCHAR(100),
                is_read BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read, created_at DESC);');

        // 25. Notification Preferences (알림 설정)
        console.log('[25] Checking notification_preferences table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notification_preferences (
                id SERIAL PRIMARY KEY,
                attendee_id INTEGER NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
                notification_type VARCHAR(30) NOT NULL,
                enabled BOOLEAN NOT NULL DEFAULT false,
                UNIQUE(attendee_id, notification_type)
            );
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_notif_prefs_attendee ON notification_preferences(attendee_id);');

        // 26. Slow Request Logs (성능 모니터링)
        console.log('[26] Checking slow_request_logs table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS slow_request_logs (
                id SERIAL PRIMARY KEY,
                path VARCHAR(500) NOT NULL,
                method VARCHAR(10) NOT NULL,
                duration INTEGER NOT NULL,
                timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                status_code INTEGER NOT NULL,
                user_agent TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_slow_request_logs_timestamp ON slow_request_logs(timestamp DESC);');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_slow_request_logs_path ON slow_request_logs(path);');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_slow_request_logs_duration ON slow_request_logs(duration DESC);');

        // 27. DB Pool Stats (커넥션 풀 모니터링)
        console.log('[27] Checking db_pool_stats table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS db_pool_stats (
                id SERIAL PRIMARY KEY,
                active_connections INTEGER NOT NULL,
                max_connections INTEGER NOT NULL,
                utilization_percent INTEGER NOT NULL,
                timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_db_pool_stats_timestamp ON db_pool_stats(timestamp DESC);');

        // 28. BLE Report 성능 최적화 인덱스
        console.log('[26] Adding BLE performance indexes...');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_visits_attendee_open ON visits(attendee_id) WHERE departure_time IS NULL;');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_game_sessions_status ON game_sessions(status) WHERE status = \'playing\';');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_session_participants_session_attendee ON session_participants(session_id, attendee_id);');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_user_devices_attendee ON user_devices(attendee_id);');

        // 29. Want to Play (보드게임 같이하기)
        console.log('[29] Checking want_to_play tables...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS want_to_play_posts (
                id SERIAL PRIMARY KEY,
                game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
                game_name VARCHAR(100) NOT NULL,
                message VARCHAR(200) NOT NULL DEFAULT '같이 하실 분!',
                created_by INTEGER NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
                status VARCHAR(20) NOT NULL DEFAULT 'open',
                image_url TEXT,
                min_players INTEGER,
                max_players INTEGER,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                closed_at TIMESTAMP WITH TIME ZONE
            );
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_wtp_status_created ON want_to_play_posts(status, created_at DESC);');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_wtp_created_by ON want_to_play_posts(created_by);');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS want_to_play_participants (
                id SERIAL PRIMARY KEY,
                post_id INTEGER NOT NULL REFERENCES want_to_play_posts(id) ON DELETE CASCADE,
                attendee_id INTEGER NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
                joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(post_id, attendee_id)
            );
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_wtp_participants_post ON want_to_play_participants(post_id);');

        // 30. Minigame play log type (시작/클리어 구분)
        console.log('[30] Adding type column to minigame_play_log...');
        await pool.query("ALTER TABLE minigame_play_log ADD COLUMN IF NOT EXISTS type VARCHAR(10) DEFAULT 'clear';");
        await pool.query('CREATE INDEX IF NOT EXISTS idx_play_log_type_game ON minigame_play_log(game_id, type);');

        // 31. Push Subscriptions (Web Push 알림)
        console.log('[31] Checking push_subscriptions table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
                endpoint TEXT NOT NULL UNIQUE,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);');

    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

migrate();
