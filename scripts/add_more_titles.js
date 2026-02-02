import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/boardgameclub';
const pool = new pg.Pool({ connectionString: DATABASE_URL });

const seedMoreTitles = `
INSERT INTO titles (title_code, title_name, description, condition_type, condition_value) VALUES
('beginner', '새내기', '첫 게임 플레이', 'achievement', '{"type": "play_count", "value": 1}'),
('point_collector', '적립왕', '포인트 1000점 달성', 'achievement', '{"type": "total_points", "value": 1000}'),
('high_scorer', '랭커', '랭킹 10위 진입', 'ranking', '{"rank": 10}')
ON CONFLICT (title_code) DO NOTHING;
`;

async function main() {
    try {
        await pool.query('BEGIN');
        console.log('Seeding more titles...');
        await pool.query(seedMoreTitles);
        await pool.query('COMMIT');
        console.log('Done!');
    } catch (e) {
        await pool.query('ROLLBACK');
        console.error(e);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
