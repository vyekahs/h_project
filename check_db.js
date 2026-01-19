
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/boardgameclub'
});

async function check() {
    try {
        const client = await pool.connect();
        try {
            const games = await client.query('SELECT * FROM games WHERE name = $1', ['Test Game']);
            console.log('Games:', games.rows);
            
            const sessions = await client.query('SELECT * FROM game_sessions WHERE game_name = $1', ['Test Game']);
            console.log('Sessions:', sessions.rows);
            
            const users = await client.query('SELECT * FROM attendees WHERE name = $1', ['Test User']);
            console.log('Users:', users.rows);
        } finally {
            client.release();
        }
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

check();
