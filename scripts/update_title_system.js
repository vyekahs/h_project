import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/boardgameclub';

const pool = new pg.Pool({
    connectionString: DATABASE_URL,
});

async function main() {
    try {
        await pool.query('BEGIN');
        console.log('Starting Title System Migration...');

        // 1. Add equipped_title_id to minigame_user_points
        // This table serves as the user's "Minigame Profile"
        console.log('Adding equipped_title_id to minigame_user_points...');
        await pool.query(`
            ALTER TABLE minigame_user_points 
            ADD COLUMN IF NOT EXISTS equipped_title_id BIGINT REFERENCES minigame_titles(id);
        `);

        // 2. Drop the restrictive constraint that allowed only 1 user per title
        // "unique_user_title_holder" was UNIQUE(title_id)
        console.log('Dropping restrictive unique constraint on minigame_user_titles...');
        await pool.query(`
            ALTER TABLE minigame_user_titles 
            DROP CONSTRAINT IF EXISTS unique_user_title_holder;
        `);

        // 3. Ensure we still have a constraint that prevents a user from having the SAME title twice
        // "unique_minigame_user_title" check (or create if missing)
        // Previous script named it "unique_user_title" but table was renamed?
        // Let's create a safe unique constraint for (user_id, title_id)
        console.log('Ensuring unique(user_id, title_id) constraint...');
        await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_minigame_user_title_ownership') THEN
                    ALTER TABLE minigame_user_titles 
                    ADD CONSTRAINT unique_minigame_user_title_ownership UNIQUE (user_id, title_id);
                END IF;
            END$$;
        `);

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
