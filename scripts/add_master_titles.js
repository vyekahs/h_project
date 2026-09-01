import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/boardgameclub';
const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function main() {
    try {
        console.log('Adding master titles...');
        await pool.query(`
            INSERT INTO minigame_titles (title_code, title_name, description, condition_type, condition_value)
            VALUES
                ('tichu_master', '티츄 마스터', '티츄 월간 랭킹 1위', 'ranking', '{"gameId": "tichu", "rank": 1}'),
                ('killer_sudoku_master', '킬러 스도쿠 마스터', '킬러 스도쿠 월간 랭킹 1위', 'ranking', '{"gameId": "killer-sudoku", "rank": 1}'),
                ('unblock_me_master', '언블록미 마스터', '언블록미 월간 랭킹 1위', 'ranking', '{"gameId": "unblock-me", "rank": 1}'),
                ('energy_master', '에너지 서킷 마스터', '에너지 서킷 월간 랭킹 1위', 'ranking', '{"gameId": "energy", "rank": 1}'),
                ('water_sort_master', '워터소트 마스터', '워터소트 월간 랭킹 1위', 'ranking', '{"gameId": "water-sort", "rank": 1}'),
                ('block_blaster_master', '블럭마스터', '블럭블라스터 월간 랭킹 1위', 'ranking', '{"gameId": "block-blaster", "rank": 1}'),
                ('freecell_master', '프리셀 마스터', '프리셀 월간 랭킹 1위', 'ranking', '{"gameId": "freecell", "rank": 1}'),
                ('2048_master', '2048 마스터', '2048 월간 랭킹 1위', 'ranking', '{"gameId": "2048", "rank": 1}')
            ON CONFLICT (title_code) DO NOTHING;
        `);
        console.log('Done!');
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
