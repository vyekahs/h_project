
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

    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

migrate();
