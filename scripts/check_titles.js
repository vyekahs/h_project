import pg from 'pg';

const DATABASE_URL = 'postgres://user:password@localhost:5432/boardgameclub';
const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function main() {
    try {
        const res = await pool.query(`
            SELECT t.title_name, t.title_code, ut.acquired_at
            FROM minigame_user_titles ut
            JOIN minigame_titles t ON ut.title_id = t.id
            WHERE ut.user_id = 1
        `);
        console.table(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
main();
