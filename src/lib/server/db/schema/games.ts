import { pgTable, serial, integer, varchar, text, boolean, timestamp, real } from 'drizzle-orm/pg-core';
import { attendees } from './core';

export const games = pgTable('games', {
	id: serial('id').primaryKey(),
	name: varchar('name', { length: 100 }).notNull(),
	minPlayers: integer('min_players'),
	maxPlayers: integer('max_players'),
	playtimeMin: integer('playtime_min'),
	difficulty: varchar('difficulty', { length: 20 }),
	imageUrl: text('image_url'),
	description: text('description'),
	includedDlcs: text('included_dlcs'),
	bggId: integer('bgg_id').unique(),
	maxPlaytime: integer('max_playtime'),
	minAge: integer('min_age'),
	complexity: real('complexity'),
	bestPlayers: text('best_players'),
	isActive: boolean('is_active').default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const tables = pgTable('tables', {
	id: serial('id').primaryKey(),
	name: varchar('name', { length: 50 }).notNull(),
	isActive: boolean('is_active').default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const gameSessions = pgTable('game_sessions', {
	id: serial('id').primaryKey(),
	gameName: varchar('game_name', { length: 100 }).notNull(),
	gameId: integer('game_id').references(() => games.id, { onDelete: 'set null' }),
	startTime: timestamp('start_time', { withTimezone: true }).defaultNow(),
	endTime: timestamp('end_time', { withTimezone: true }),
	status: varchar('status', { length: 20 }).default('playing'),
	scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
	minPlayers: integer('min_players').default(2),
	maxPlayers: integer('max_players').default(4),
	partyId: integer('party_id'),
	createdBy: integer('created_by').references(() => attendees.id, { onDelete: 'set null' }),
	showOnMain: boolean('show_on_main').default(false),
	recurringScheduleId: integer('recurring_schedule_id'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const sessionParticipants = pgTable('session_participants', {
	id: serial('id').primaryKey(),
	sessionId: integer('session_id').references(() => gameSessions.id, { onDelete: 'cascade' }),
	attendeeId: integer('attendee_id').references(() => attendees.id, { onDelete: 'cascade' }),
	guestName: varchar('guest_name', { length: 50 }),
	isWinner: boolean('is_winner').default(false),
	score: integer('score').default(0),
});

export const reservations = pgTable('reservations', {
	id: serial('id').primaryKey(),
	sessionId: integer('session_id').references(() => gameSessions.id, { onDelete: 'cascade' }),
	gameId: integer('game_id').references(() => games.id, { onDelete: 'cascade' }),
	tableId: integer('table_id').references(() => tables.id, { onDelete: 'cascade' }),
	attendeeId: integer('attendee_id').references(() => attendees.id, { onDelete: 'cascade' }),
	status: varchar('status', { length: 20 }).default('pending'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
