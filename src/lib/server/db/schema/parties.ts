import { pgTable, serial, integer, varchar, timestamp, unique } from 'drizzle-orm/pg-core';
import { attendees } from './core';
import { games } from './games';

export const gameParties = pgTable('game_parties', {
	id: serial('id').primaryKey(),
	name: varchar('name', { length: 100 }).notNull(),
	ownerId: integer('owner_id').references(() => attendees.id, { onDelete: 'cascade' }),
	gameId: integer('game_id').references(() => games.id, { onDelete: 'set null' }),
	gameName: varchar('game_name', { length: 100 }),
	duration: integer('duration'),
	guestCount: integer('guest_count').default(0),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const gamePartyMembers = pgTable('game_party_members', {
	id: serial('id').primaryKey(),
	partyId: integer('party_id').references(() => gameParties.id, { onDelete: 'cascade' }),
	attendeeId: integer('attendee_id').references(() => attendees.id, { onDelete: 'cascade' }),
	status: varchar('status', { length: 20 }).default('pending').notNull(),
}, (table) => [
	unique().on(table.partyId, table.attendeeId),
]);
