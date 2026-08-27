import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

const connectionString = env.DATABASE_URL || 'postgres://user:password@localhost:5432/boardgameclub';

const sql = postgres(connectionString, {
	max: 20,
	idle_timeout: 30,
	connect_timeout: 10,
	max_lifetime: 60 * 5,
	connection: {
		// 느린 쿼리/락 대기가 커넥션 풀(max 20)을 무기한 붙잡지 않도록 강제 타임아웃.
		// Drizzle 전환 당시 있던 statement_timeout이 max_lifetime 도입 커밋(d8b28d1)에서
		// 실수로 함께 빠졌던 것을 복원 + lock_timeout/idle_in_transaction 추가.
		statement_timeout: 10000,
		lock_timeout: 5000,
		idle_in_transaction_session_timeout: 30000,
	},
});

export const db = drizzle(sql, { schema });
export { sql as pgClient };
