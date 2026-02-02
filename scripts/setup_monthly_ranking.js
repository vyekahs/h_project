import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/boardgameclub'
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Starting migration for monthly rankings...');

        await client.query('BEGIN');

        // Create table
        await client.query(`
            CREATE TABLE IF NOT EXISTS minigame_monthly_rankings (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                game_id VARCHAR(50) NOT NULL,
                month_key VARCHAR(7) NOT NULL, -- Format: 'YYYY-MM'
                total_score INTEGER DEFAULT 0,
                score_updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id, game_id, month_key)
            );
        `);

        // Index for performance
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_monthly_rankings_score 
            ON minigame_monthly_rankings(game_id, month_key, total_score DESC);
        `);
        
        console.log('Table minigame_monthly_rankings created/verified.');

        await client.query('COMMIT');
        console.log('Migration completed successfully.');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
