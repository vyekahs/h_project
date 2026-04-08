import { pgTable, serial, integer, varchar, text, timestamp, unique, index, primaryKey } from 'drizzle-orm/pg-core';
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

export const wtpTags = pgTable('wtp_tags', {
	id: serial('id').primaryKey(),
	name: varchar('name', { length: 30 }).notNull().unique(),
	sortOrder: integer('sort_order').notNull().default(0),
});

export const wtpPostTags = pgTable('wtp_post_tags', {
	postId: integer('post_id').notNull().references(() => wantToPlayPosts.id, { onDelete: 'cascade' }),
	tagId: integer('tag_id').notNull().references(() => wtpTags.id, { onDelete: 'cascade' }),
}, (table) => [
	primaryKey({ columns: [table.postId, table.tagId] }),
	index('idx_wtp_post_tags_post').on(table.postId),
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
