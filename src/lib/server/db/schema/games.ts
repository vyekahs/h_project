import { pgTable, serial, integer, varchar, text, boolean, timestamp, real, primaryKey } from 'drizzle-orm/pg-core';
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
	categories: text('categories'),
	mechanics: text('mechanics'),
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
	cancelledBy: integer('cancelled_by').references(() => attendees.id, { onDelete: 'set null' }),
	cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
});

export const sessionParticipants = pgTable('session_participants', {
	id: serial('id').primaryKey(),
	sessionId: integer('session_id').references(() => gameSessions.id, { onDelete: 'cascade' }),
	attendeeId: integer('attendee_id').references(() => attendees.id, { onDelete: 'cascade' }),
	guestName: varchar('guest_name', { length: 50 }),
	isWinner: boolean('is_winner').default(false),
	score: integer('score').default(0),
});

// 개인이 "이 게임을 내가 소장하고 있다"고 스스로 체크하는 기록.
// 혼놀(동아리)이 그 게임을 보유하고 있는지와는 별개 — 관리자 승인 없이 본인이 직접 토글한다.
export const gameOwnership = pgTable('game_ownership', {
	attendeeId: integer('attendee_id').notNull().references(() => attendees.id, { onDelete: 'cascade' }),
	gameId: integer('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
	primaryKey({ columns: [table.attendeeId, table.gameId] }),
]);

// 본인이 해본 게임에 매기는 10점 만점 평점. 소장 체크(game_ownership)와 달리
// 플레이 기록이 있는 게임에만 의미가 있다 — UI가 그 범위로 노출을 제한한다.
export const gameRatings = pgTable('game_ratings', {
	attendeeId: integer('attendee_id').notNull().references(() => attendees.id, { onDelete: 'cascade' }),
	gameId: integer('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
	rating: integer('rating').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
	primaryKey({ columns: [table.attendeeId, table.gameId] }),
]);

// 게임 추천에서 빼고 싶은 카테고리·난이도. (attendee_id, kind, value) 복합키라
// 같은 값을 두 번 넣어도 조용히 무시된다(ON CONFLICT DO NOTHING으로 토글).
export const gameRecExclusions = pgTable('game_rec_exclusions', {
	attendeeId: integer('attendee_id').notNull().references(() => attendees.id, { onDelete: 'cascade' }),
	kind: varchar('kind', { length: 20 }).notNull(),
	value: text('value').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
	primaryKey({ columns: [table.attendeeId, table.kind, table.value] }),
]);

export const reservations = pgTable('reservations', {
	id: serial('id').primaryKey(),
	sessionId: integer('session_id').references(() => gameSessions.id, { onDelete: 'cascade' }),
	gameId: integer('game_id').references(() => games.id, { onDelete: 'cascade' }),
	tableId: integer('table_id').references(() => tables.id, { onDelete: 'cascade' }),
	attendeeId: integer('attendee_id').references(() => attendees.id, { onDelete: 'cascade' }),
	status: varchar('status', { length: 20 }).default('pending'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
