import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/boardgameclub';

const pool = new pg.Pool({
    connectionString: DATABASE_URL,
});

async function main() {
    try {
        console.log('Testing Ranking Query...');
        const sql = `
            SELECT 
                r.user_id,
                u.username as nickname, 
                r.difficulty,
                r.clear_time,
                r.score,
                r.achieved_at,
                RANK() OVER (ORDER BY r.score DESC) as rank
            FROM minigame_rankings r
            LEFT JOIN users u ON r.user_id = u.id
            WHERE r.game_id = 'sudoku'
            ORDER BY r.score DESC
            LIMIT 10
        `;
        const res = await pool.query(sql);
        console.log('Query success:', res.rows);
    } catch (e) {
        console.error('Query failed:', e);
    } finally {
        await pool.end();
    }
}

main();
