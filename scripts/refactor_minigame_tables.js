import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/boardgameclub';

const pool = new pg.Pool({
    connectionString: DATABASE_URL,
});

const migrationSQL = `
    BEGIN;

    -- 1. Game Rankings -> Minigame Rankings
    ALTER TABLE IF EXISTS game_rankings RENAME TO minigame_rankings;
    ALTER TABLE IF EXISTS minigame_rankings RENAME CONSTRAINT unique_ranking TO unique_minigame_ranking;
    
    -- 2. User Points -> Minigame User Points
    ALTER TABLE IF EXISTS user_points RENAME TO minigame_user_points;
    
    -- 3. Shop Items -> Minigame Shop Items
    ALTER TABLE IF EXISTS shop_items RENAME TO minigame_shop_items;
    
    -- 4. User Inventory -> Minigame User Inventory
    ALTER TABLE IF EXISTS user_inventory RENAME TO minigame_user_inventory;
    ALTER TABLE IF EXISTS minigame_user_inventory RENAME CONSTRAINT unique_inventory TO unique_minigame_inventory;

    -- 5. Titles -> Minigame Titles
    ALTER TABLE IF EXISTS titles RENAME TO minigame_titles;

    -- 6. User Titles -> Minigame User Titles
    ALTER TABLE IF EXISTS user_titles RENAME TO minigame_user_titles;
    
    COMMIT;
`;

async function main() {
    try {
        console.log('Renaming tables to minigame_* ...');
        await pool.query(migrationSQL);
        console.log('Tables renamed successfully.');
    } catch (e) {
        console.error('Migration failed', e);
        await pool.query('ROLLBACK');
    } finally {
        await pool.end();
    }
}

main();
