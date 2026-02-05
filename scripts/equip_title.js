import pg from 'pg';

const DATABASE_URL = 'postgres://user:password@localhost:5432/boardgameclub';
const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function main() {
    try {
        // Find ID for sudoku_master
        const res = await pool.query("SELECT id FROM minigame_titles WHERE title_code = 'sudoku_master'");
        const titleId = res.rows[0].id;
        
        console.log(`Equipping title ${titleId}...`);
        
        await pool.query('UPDATE minigame_user_points SET equipped_title_id = $1 WHERE user_id = 1', [titleId]);
        
        console.log('Done.');
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
main();
