import pg from 'pg';

const DATABASE_URL = 'postgres://user:password@localhost:5432/boardgameclub';
const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function main() {
    try {
        // Check for minigame_shop_items
        const res = await pool.query('SELECT item_code, item_name, item_type FROM minigame_shop_items');
        console.log('--- minigame_shop_items ---');
        console.table(res.rows);
    } catch (e) {
        console.log('minigame_shop_items error:', e.message);
        try {
             // Fallback: list all tables
            const res = await pool.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
            `);
            console.log('--- All Tables ---');
            console.table(res.rows);
        } catch (e2) {
            console.error(e2);
        }
    } finally {
        await pool.end();
    }
}
main();
