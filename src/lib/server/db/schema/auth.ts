import { pgTable, serial, integer, varchar, timestamp } from 'drizzle-orm/pg-core';
import { users, attendees } from './core';

export const adminSessions = pgTable('admin_sessions', {
	id: serial('id').primaryKey(),
	userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
	sessionToken: varchar('session_token', { length: 255 }).unique().notNull(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const attendeeSessions = pgTable('attendee_sessions', {
	id: serial('id').primaryKey(),
	attendeeId: integer('attendee_id').references(() => attendees.id, { onDelete: 'cascade' }),
	sessionToken: varchar('session_token', { length: 255 }).unique().notNull(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
