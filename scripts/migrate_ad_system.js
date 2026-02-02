import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/boardgameclub';

console.log(`Connecting to database at ${DATABASE_URL}...`);

const pool = new pg.Pool({
    connectionString: DATABASE_URL,
});

const seedData = `
-- Seed New Shop Items (Ad System & Premium)
INSERT INTO shop_items (item_code, item_name, description, price, item_type, use_limit) VALUES
('ad_remove', '광고 제거권', '30일 동안 모든 배너 광고를 제거합니다.', 3000, 'cosmetic', '{"duration_days": 30}'),
('premium_pass', '프리미엄 패스', '광고 제거 + 보상 2배 (30일)', 5000, 'game_assist', '{"duration_days": 30}')
ON CONFLICT (item_code) DO UPDATE 
SET price = EXCLUDED.price, 
    description = EXCLUDED.description,
    use_limit = EXCLUDED.use_limit;
`;

async function main() {
    try {
        await pool.query('BEGIN');
        
        console.log('Seeding new shop items...');
        await pool.query(seedData);
        
        await pool.query('COMMIT');
        console.log('Ad System Migration completed successfully!');
    } catch (e) {
        await pool.query('ROLLBACK');
        console.error('Migration failed:', e);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
