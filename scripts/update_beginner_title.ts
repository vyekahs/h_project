import { query } from '../src/lib/server/db';
import pg from 'pg';

const DATABASE_URL = 'postgres://user:password@localhost:5432/boardgameclub';

// Mocking query function since we can't easily import from $lib outside SvelteKit in this env sometimes
// But let's try to use the pg client directly for simplicity like before
const pool = new pg.Pool({
    connectionString: DATABASE_URL,
});

async function main() {
    try {
        console.log('Updating "beginner" title condition...');
        
        const res = await pool.query(`
            UPDATE minigame_titles 
            SET condition_type = 'achievement',
                condition_value = $1,
                description = '가입 후 1달 이내'
            WHERE title_code = 'beginner'
            RETURNING *;
        `, [JSON.stringify({ type: 'account_age', value: 30 })]);
        
        console.log('Update result:', res.rows[0]);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

main();
