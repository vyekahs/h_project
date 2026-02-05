import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/boardgameclub';
const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function main() {
    try {
        await pool.query('BEGIN');
        console.log('Dropping strict unique constraint on user_titles...');
        
        // Remove the constraint that restricts a title to a single user
        await pool.query('ALTER TABLE user_titles DROP CONSTRAINT IF EXISTS unique_user_title_holder');
        
        // Add a constraint to ensure a user only has a title once (which is reasonable)
        // Actually, schema already had: CONSTRAINT unique_user_title UNIQUE (title_id, user_id) 
        // effectively: UNIQUE(title_id, user_id) was there but I should check.
        // The migration script said: CONSTRAINT unique_user_title UNIQUE (title_id, user_id)
        // So we just need to drop the extra one.
        
        await pool.query('COMMIT');
        console.log('Done!');
    } catch (e) {
        await pool.query('ROLLBACK');
        console.error(e);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
