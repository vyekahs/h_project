import pg from 'pg';
import { env } from 'process';

const DATABASE_URL = env.DATABASE_URL || 'postgres://user:password@localhost:5432/boardgameclub';

console.log(`Connecting to database at ${DATABASE_URL}...`);

const pool = new pg.Pool({
    connectionString: DATABASE_URL,
});

const queries = [
    `CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES attendees(id) ON DELETE SET NULL,
        message TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        sent_at TIMESTAMP WITH TIME ZONE
    );`,
    `CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);`
];

async function main() {
    try {
        console.log('Starting migration for Feedback System...');
        
        for (const query of queries) {
            await pool.query(query);
        }
        
        console.log('Migration completed successfully!');
    } catch (e) {
        console.error('Migration error:', e);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
