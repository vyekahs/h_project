import { pgTable, serial, integer, varchar, text, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { attendees } from './core';
import { games } from './games';

export const wantToPlayPosts = pgTable('want_to_play_posts', {
	id: serial('id').primaryKey(),
	gameId: integer('game_id').references(() => games.id, { onDelete: 'set null' }),
	gameName: varchar('game_name', { length: 100 }).notNull(),
	message: varchar('message', { length: 200 }).notNull().default('같이 하실 분!'),
	createdBy: integer('created_by').notNull().references(() => attendees.id, { onDelete: 'cascade' }),
	status: varchar('status', { length: 20 }).notNull().default('open'),
	imageUrl: text('image_url'),
	minPlayers: integer('min_players'),
	maxPlayers: integer('max_players'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	closedAt: timestamp('closed_at', { withTimezone: true }),
}, (table) => [
	index('idx_wtp_status_created').on(table.status, table.createdAt),
	index('idx_wtp_created_by').on(table.createdBy),
]);

export const wantToPlayParticipants = pgTable('want_to_play_participants', {
	id: serial('id').primaryKey(),
	postId: integer('post_id').notNull().references(() => wantToPlayPosts.id, { onDelete: 'cascade' }),
	attendeeId: integer('attendee_id').notNull().references(() => attendees.id, { onDelete: 'cascade' }),
	joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
}, (table) => [
	unique('unique_wtp_participant').on(table.postId, table.attendeeId),
	index('idx_wtp_participants_post').on(table.postId),
]);
