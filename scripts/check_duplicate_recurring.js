import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://hproject:hproject1234@localhost:5432/hproject'
});

async function checkDuplicates() {
    try {
        // 중복된 반복 게임 세션 확인
        const duplicates = await pool.query(`
            SELECT
                recurring_schedule_id,
                game_name,
                DATE(scheduled_at AT TIME ZONE 'Asia/Seoul') as schedule_date,
                (scheduled_at AT TIME ZONE 'Asia/Seoul')::time as schedule_time,
                COUNT(*) as count,
                array_agg(id) as session_ids
            FROM game_sessions
            WHERE recurring_schedule_id IS NOT NULL
              AND status = 'scheduled'
            GROUP BY recurring_schedule_id, game_name, schedule_date, schedule_time
            HAVING COUNT(*) > 1
            ORDER BY schedule_date, schedule_time;
        `);

        console.log('\n=== 중복된 반복 게임 세션 ===');
        if (duplicates.rows.length === 0) {
            console.log('중복 없음');
        } else {
            console.table(duplicates.rows);
            console.log(`\n총 ${duplicates.rows.length}개의 중복 그룹 발견`);
        }

        // 모든 반복 게임 세션 확인
        const all = await pool.query(`
            SELECT
                id,
                recurring_schedule_id,
                game_name,
                scheduled_at AT TIME ZONE 'Asia/Seoul' as kst_time,
                status,
                created_at AT TIME ZONE 'Asia/Seoul' as created_kst
            FROM game_sessions
            WHERE recurring_schedule_id IS NOT NULL
              AND status = 'scheduled'
            ORDER BY recurring_schedule_id, kst_time
            LIMIT 100;
        `);

        console.log('\n=== 모든 반복 게임 세션 (최근 100개) ===');
        console.table(all.rows);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

checkDuplicates();
