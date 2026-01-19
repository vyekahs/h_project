
import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/boardgameclub'
});

async function seed() {
    try {
        console.log('Seeding database...');
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Create Test User
            const hashedPassword = await bcrypt.hash('password', 10);


            // Clean up existing test data
            await client.query('DELETE FROM session_participants WHERE attendee_id IN (SELECT id FROM attendees WHERE name = $1)', ['Test User']);
            await client.query('DELETE FROM game_sessions WHERE game_name = $1', ['Test Game']);
            await client.query('DELETE FROM games WHERE name = $1', ['Test Game']);

            // Check if user exists
            const res = await client.query('SELECT id FROM attendees WHERE name = $1', ['Test User']);
            let userId;
            if (res.rows.length === 0) {
                const insertRes = await client.query(`
                    INSERT INTO attendees (name, password, status, arrival_time) 
                    VALUES ($1, $2, 'left', NOW())
                    RETURNING id
                `, ['Test User', hashedPassword]);
                userId = insertRes.rows[0].id;
            } else {
                userId = res.rows[0].id;
                await client.query('UPDATE attendees SET password = $1 WHERE name = $2', [hashedPassword, 'Test User']);
            }


            // Create a Game
            console.log('Creating game...');
            // Check if game exists
            const existingGame = await client.query('SELECT id FROM games WHERE name = $1', ['Test Game']);
            let gameId;
            if (existingGame.rows.length === 0) {
                 const gameRes = await client.query(`
                    INSERT INTO games (name, min_players, max_players, playtime_min, is_active)
                    VALUES ($1, 2, 4, 60, true)
                    RETURNING id
                `, ['Test Game']);
                gameId = gameRes.rows[0].id;
                console.log('Game created:', gameId);
            } else {
                gameId = existingGame.rows[0].id;
                console.log('Game exists:', gameId);
            }

            // Create a Scheduled Game Session (in future)
            console.log('Creating session...');
            const sessionRes = await client.query(`
                INSERT INTO game_sessions (game_name, game_id, status, scheduled_at, min_players, max_players)
                VALUES ($1, $2, 'scheduled', NOW() + interval '1 hour', 2, 4)
                RETURNING id
            `, ['Test Game', gameId]);
            console.log('Session created:', sessionRes.rows[0].id);




            await client.query('COMMIT');
            console.log('Database seeded successfully.');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (e) {
        console.error('Error seeding database:', e);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

seed();
