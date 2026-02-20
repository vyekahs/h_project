import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/boardgameclub';
const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function main() {
    try {
        await pool.query('BEGIN');

        // 1. 마스터 칭호 추가 (sudoku_master는 이미 존재)
        console.log('Adding master titles...');
        await pool.query(`
            INSERT INTO minigame_titles (title_code, title_name, description, condition_type, condition_value)
            VALUES
                ('tichu_master', '티츄 마스터', '티츄 월간 랭킹 1위', 'ranking', '{"gameId": "tichu", "rank": 1}'),
                ('killer_sudoku_master', '킬러 스도쿠 마스터', '킬러 스도쿠 월간 랭킹 1위', 'ranking', '{"gameId": "killer-sudoku", "rank": 1}'),
                ('unblock_me_master', '언블록미 마스터', '언블록미 월간 랭킹 1위', 'ranking', '{"gameId": "unblock-me", "rank": 1}')
            ON CONFLICT (title_code) DO NOTHING;
        `);

        // 2. 현재 각 게임 월간 랭킹 1위 유저에게 즉시 칭호 수여
        console.log('Assigning master titles to current #1 ranked users...');

        const masterTitles = [
            { titleCode: 'sudoku_master', gameId: 'sudoku' },
            { titleCode: 'tichu_master', gameId: 'tichu' },
            { titleCode: 'killer_sudoku_master', gameId: 'killer-sudoku' },
            { titleCode: 'unblock_me_master', gameId: 'unblock-me' },
        ];

        const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM

        for (const { titleCode, gameId } of masterTitles) {
            // 칭호 ID 조회
            const titleRes = await pool.query(
                'SELECT id FROM minigame_titles WHERE title_code = $1',
                [titleCode]
            );
            if (titleRes.rows.length === 0) {
                console.log(`  Title ${titleCode} not found, skipping.`);
                continue;
            }
            const titleId = titleRes.rows[0].id;

            // 현재 월간 1위 조회
            const rankRes = await pool.query(`
                SELECT user_id FROM minigame_monthly_rankings
                WHERE game_id = $1 AND month_key = $2
                ORDER BY total_score DESC
                LIMIT 1
            `, [gameId, monthKey]);

            if (rankRes.rows.length === 0) {
                console.log(`  No rankings for ${gameId} this month, skipping.`);
                continue;
            }

            const userId = rankRes.rows[0].user_id;

            // 현재 보유자 확인
            const currentHolder = await pool.query(
                'SELECT user_id FROM minigame_user_titles WHERE title_id = $1',
                [titleId]
            );

            if (currentHolder.rows.length > 0 && currentHolder.rows[0].user_id === userId) {
                console.log(`  ${titleCode}: user ${userId} already holds it, skipping.`);
                continue;
            }

            console.log(`  ${titleCode}: transferring to user ${userId}`);

            // 기존 보유자의 장착 해제 후 회수
            await pool.query(
                'UPDATE minigame_user_points SET equipped_title_id = NULL WHERE equipped_title_id = $1',
                [titleId]
            );
            await pool.query(
                'DELETE FROM minigame_user_titles WHERE title_id = $1',
                [titleId]
            );
            await pool.query(`
                INSERT INTO minigame_user_titles (user_id, title_id)
                VALUES ($1, $2)
                ON CONFLICT DO NOTHING
            `, [userId, titleId]);
        }

        await pool.query('COMMIT');
        console.log('Done!');
    } catch (e) {
        await pool.query('ROLLBACK');
        console.error('Error:', e);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
