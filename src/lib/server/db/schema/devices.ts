import { pgTable, serial, integer, varchar, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { attendees } from './core';

export const userDevices = pgTable('user_devices', {
	id: serial('id').primaryKey(),
	attendeeId: integer('attendee_id').references(() => attendees.id, { onDelete: 'cascade' }),
	irk: varchar('irk', { length: 32 }).notNull().unique(),
	name: varchar('name', { length: 100 }),
	wifiMac: varchar('wifi_mac', { length: 17 }),
	lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const deviceRegistrations = pgTable('device_registrations', {
	id: serial('id').primaryKey(),
	deviceId: varchar('device_id', { length: 50 }).notNull(),
	pin: varchar('pin', { length: 10 }).notNull(),
	targetAttendeeId: integer('target_attendee_id').references(() => attendees.id, { onDelete: 'cascade' }),
	step: varchar('step', { length: 20 }).default('pending'),
	irk: varchar('irk', { length: 32 }),
	deviceName: varchar('device_name', { length: 100 }).default('Phone'),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const scanners = pgTable('scanners', {
	id: text('id').primaryKey(),
	name: text('name'),
	lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow(),
	ipAddress: text('ip_address'),
	metadata: jsonb('metadata'),
	status: text('status').default('active'),
});
