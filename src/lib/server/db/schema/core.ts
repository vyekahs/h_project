import { pgTable, serial, varchar, text, boolean, timestamp, integer, real } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
	id: serial('id').primaryKey(),
	username: varchar('username', { length: 50 }).unique().notNull(),
	passwordHash: varchar('password_hash', { length: 255 }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const attendees = pgTable('attendees', {
	id: serial('id').primaryKey(),
	name: varchar('name', { length: 50 }).notNull(),
	password: varchar('password', { length: 255 }),
	arrivalTime: timestamp('arrival_time', { withTimezone: true }).defaultNow(),
	status: varchar('status', { length: 20 }).default('present'),
	penaltyPoints: integer('penalty_points').default(0),
	isBlacklisted: boolean('is_blacklisted').default(false),
	canManageGames: boolean('can_manage_games').default(false),
	isAdmin: boolean('is_admin').default(false),
	seasonPassExpiresAt: timestamp('season_pass_expires_at', { withTimezone: true }),
	lastPenaltyAt: timestamp('last_penalty_at', { withTimezone: true }),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const notices = pgTable('notices', {
	id: serial('id').primaryKey(),
	content: text('content').notNull(),
	isActive: boolean('is_active').default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const systemSettings = pgTable('system_settings', {
	key: varchar('key', { length: 50 }).primaryKey(),
	value: text('value').notNull(),
});

export const feedback = pgTable('feedback', {
	id: serial('id').primaryKey(),
	userId: integer('user_id').references(() => attendees.id, { onDelete: 'set null' }),
	message: text('message').notNull(),
	status: varchar('status', { length: 20 }).default('pending'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	sentAt: timestamp('sent_at', { withTimezone: true }),
});

export const qrTokens = pgTable('qr_tokens', {
	token: varchar('token', { length: 64 }).primaryKey(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
