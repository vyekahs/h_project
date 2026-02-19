import { pgTable, serial, integer, timestamp, date, unique } from 'drizzle-orm/pg-core';
import { attendees } from './core';

export const visits = pgTable('visits', {
	id: serial('id').primaryKey(),
	attendeeId: integer('attendee_id').references(() => attendees.id, { onDelete: 'cascade' }),
	arrivalTime: timestamp('arrival_time', { withTimezone: true }).defaultNow(),
	departureTime: timestamp('departure_time', { withTimezone: true }),
});

export const dailyVisitPlans = pgTable('daily_visit_plans', {
	id: serial('id').primaryKey(),
	attendeeId: integer('attendee_id').references(() => attendees.id, { onDelete: 'cascade' }),
	planDate: date('plan_date').notNull().defaultNow(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
	unique().on(table.attendeeId, table.planDate),
]);
