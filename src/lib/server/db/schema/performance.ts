import { pgTable, serial, varchar, integer, timestamp, text, index } from 'drizzle-orm/pg-core';

export const slowRequestLogs = pgTable(
	'slow_request_logs',
	{
		id: serial('id').primaryKey(),
		path: varchar('path', { length: 500 }).notNull(),
		method: varchar('method', { length: 10 }).notNull(),
		duration: integer('duration').notNull(),
		timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
		statusCode: integer('status_code').notNull(),
		userAgent: text('user_agent'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
	},
	(table) => ({
		timestampIdx: index('idx_slow_request_logs_timestamp').on(table.timestamp.desc()),
		pathIdx: index('idx_slow_request_logs_path').on(table.path),
		durationIdx: index('idx_slow_request_logs_duration').on(table.duration.desc())
	})
);

export type SlowRequestLog = typeof slowRequestLogs.$inferSelect;
export type NewSlowRequestLog = typeof slowRequestLogs.$inferInsert;
