
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

    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

migrate();
