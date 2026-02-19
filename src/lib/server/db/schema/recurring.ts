import { pgTable, serial, integer, varchar, boolean, timestamp, date, time, unique } from 'drizzle-orm/pg-core';
import { games } from './games';

export const recurringGameSchedules = pgTable('recurring_game_schedules', {
	id: serial('id').primaryKey(),
	gameName: varchar('game_name', { length: 100 }).notNull(),
	gameId: integer('game_id').references(() => games.id, { onDelete: 'set null' }),
	dayOfWeek: integer('day_of_week').notNull(),
	scheduledTime: time('scheduled_time').notNull(),
	minPlayers: integer('min_players').default(2),
	maxPlayers: integer('max_players').default(4),
	partyId: integer('party_id'),
	createdBy: integer('created_by'),
	showOnMain: boolean('show_on_main').default(false),
	isActive: boolean('is_active').default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const recurringGameSkips = pgTable('recurring_game_skips', {
	id: serial('id').primaryKey(),
	recurringScheduleId: integer('recurring_schedule_id').references(() => recurringGameSchedules.id, { onDelete: 'cascade' }),
	skipDate: date('skip_date').notNull(),
}, (table) => [
	unique().on(table.recurringScheduleId, table.skipDate),
]);
