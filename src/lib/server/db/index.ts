import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import os from 'node:os';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

const connectionString = env.DATABASE_URL || 'postgres://user:password@localhost:5432/boardgameclub';

export const MAX_POOL_CONNECTIONS = 20;

/**
 * 이 앱 인스턴스를 DB 쪽에서 식별하기 위한 이름.
 *
 * 블루/그린 배포에서는 app_blue와 app_green이 같은 DB에 각자 풀(max 20)을 열기 때문에,
 * pg_stat_activity를 datname으로만 집계하면 두 인스턴스의 커넥션이 합산된다.
 * 실제로 모니터링 기록에 상한(20)의 두 배인 40이 남아 있었다.
 * application_name으로 자기 커넥션만 구분해서 셀 수 있게 한다.
 */
export const APP_INSTANCE_NAME = `hproject:${os.hostname()}`;

const sql = postgres(connectionString, {
	max: MAX_POOL_CONNECTIONS,
	idle_timeout: 30,
	connect_timeout: 10,
	max_lifetime: 60 * 5,
	connection: {
		application_name: APP_INSTANCE_NAME,
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
