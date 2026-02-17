import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

const connectionString = env.DATABASE_URL || 'postgres://user:password@localhost:5432/boardgameclub';

const sql = postgres(connectionString, {
	max: 20,
	idle_timeout: 30,
	connect_timeout: 5,
	connection: {
		statement_timeout: 10000
	}
});

export const db = drizzle(sql, { schema });
export { sql as pgClient };
