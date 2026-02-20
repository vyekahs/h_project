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

        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        console.log(`  Current time: ${now.toISOString()}, monthKey: ${monthKey}`);

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
                SELECT user_id, total_score FROM minigame_monthly_rankings
                WHERE game_id = $1 AND month_key = $2
                ORDER BY total_score DESC
                LIMIT 1
            `, [gameId, monthKey]);

            // 기존 보유자 전원 회수 (중복 보유 정리 포함)
            const unequipRes = await pool.query(
                'UPDATE minigame_user_points SET equipped_title_id = NULL WHERE equipped_title_id = $1 RETURNING user_id',
                [titleId]
            );
            const deleteRes = await pool.query(
                'DELETE FROM minigame_user_titles WHERE title_id = $1 RETURNING user_id',
                [titleId]
            );
            if (unequipRes.rowCount > 0 || deleteRes.rowCount > 0) {
                console.log(`  ${titleCode}: revoked from ${deleteRes.rowCount} user(s), unequipped from ${unequipRes.rowCount} user(s)`);
            }

            if (rankRes.rows.length === 0) {
                console.log(`  ${titleCode}: no rankings for game_id=${gameId}, month_key=${monthKey}`);
                continue;
            }

            const userId = rankRes.rows[0].user_id;
            const topScore = rankRes.rows[0].total_score;
            console.log(`  ${titleCode}: #1 is user ${userId} (score: ${topScore}), assigning title_id=${titleId}`);

            const insertRes = await pool.query(`
                INSERT INTO minigame_user_titles (user_id, title_id)
                VALUES ($1, $2)
                ON CONFLICT DO NOTHING
                RETURNING id
            `, [userId, titleId]);

            if (insertRes.rowCount === 0) {
                console.log(`  ${titleCode}: INSERT conflict — user ${userId} may already have this title`);
            } else {
                console.log(`  ${titleCode}: assigned successfully (id=${insertRes.rows[0].id})`);
            }
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
