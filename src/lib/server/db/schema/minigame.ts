import { pgTable, serial, integer, varchar, text, boolean, timestamp, json, bigserial, unique } from 'drizzle-orm/pg-core';
import { attendees } from './core';

export const minigameUserPoints = pgTable('minigame_user_points', {
	userId: integer('user_id').primaryKey().references(() => attendees.id, { onDelete: 'cascade' }),
	totalPoints: integer('total_points').default(0),
	dailyEarned: integer('daily_earned').default(0),
	lastEarnedAt: timestamp('last_earned_at'),
	equippedTitleId: integer('equipped_title_id'),
	createdAt: timestamp('created_at').defaultNow(),
});

export const minigameRankings = pgTable('minigame_rankings', {
	id: bigserial('id', { mode: 'number' }).primaryKey(),
	gameId: varchar('game_id', { length: 50 }).notNull(),
	difficulty: varchar('difficulty', { length: 20 }),
	userId: integer('user_id').notNull().references(() => attendees.id, { onDelete: 'cascade' }),
	score: integer('score'),
	clearTime: integer('clear_time'),
	mistakes: integer('mistakes').default(0),
	achievedAt: timestamp('achieved_at').defaultNow(),
}, (table) => [
	unique('unique_ranking').on(table.gameId, table.difficulty, table.userId),
]);

export const minigameMonthlyRankings = pgTable('minigame_monthly_rankings', {
	id: serial('id').primaryKey(),
	userId: integer('user_id').notNull().references(() => attendees.id, { onDelete: 'cascade' }),
	gameId: varchar('game_id', { length: 50 }).notNull(),
	monthKey: varchar('month_key', { length: 7 }).notNull(),
	totalScore: integer('total_score').default(0),
	scoreUpdatedAt: timestamp('score_updated_at').defaultNow(),
}, (table) => [
	unique().on(table.userId, table.gameId, table.monthKey),
]);

export const minigameTitles = pgTable('minigame_titles', {
	id: bigserial('id', { mode: 'number' }).primaryKey(),
	titleCode: varchar('title_code', { length: 50 }).unique().notNull(),
	titleName: varchar('title_name', { length: 100 }).notNull(),
	description: text('description'),
	conditionType: varchar('condition_type', { length: 50 }),
	conditionValue: json('condition_value'),
});

export const minigameUserTitles = pgTable('minigame_user_titles', {
	id: bigserial('id', { mode: 'number' }).primaryKey(),
	userId: integer('user_id').notNull().references(() => attendees.id, { onDelete: 'cascade' }),
	titleId: integer('title_id').notNull().references(() => minigameTitles.id),
	acquiredAt: timestamp('acquired_at').defaultNow(),
	isDisplayed: boolean('is_displayed').default(true),
}, (table) => [
	unique('unique_user_title_holder').on(table.titleId),
]);

export const minigameShopItems = pgTable('minigame_shop_items', {
	id: bigserial('id', { mode: 'number' }).primaryKey(),
	itemCode: varchar('item_code', { length: 50 }).unique().notNull(),
	itemName: varchar('item_name', { length: 100 }).notNull(),
	description: text('description'),
	price: integer('price').notNull(),
	itemType: varchar('item_type', { length: 20 }),
	useLimit: json('use_limit'),
	isActive: boolean('is_active').default(true),
});

export const minigameUserInventory = pgTable('minigame_user_inventory', {
	id: bigserial('id', { mode: 'number' }).primaryKey(),
	userId: integer('user_id').notNull().references(() => attendees.id, { onDelete: 'cascade' }),
	itemId: integer('item_id').notNull().references(() => minigameShopItems.id),
	quantity: integer('quantity').default(0),
}, (table) => [
	unique('unique_inventory').on(table.userId, table.itemId),
]);

export const pointTransactions = pgTable('point_transactions', {
	id: bigserial('id', { mode: 'number' }).primaryKey(),
	userId: integer('user_id').notNull().references(() => attendees.id, { onDelete: 'cascade' }),
	amount: integer('amount').notNull(),
	transactionType: varchar('transaction_type', { length: 20 }),
	referenceId: varchar('reference_id', { length: 100 }),
	createdAt: timestamp('created_at').defaultNow(),
});

export const tutorialProgress = pgTable('tutorial_progress', {
	id: bigserial('id', { mode: 'number' }).primaryKey(),
	userId: integer('user_id').notNull().references(() => attendees.id, { onDelete: 'cascade' }),
	tutorialId: varchar('tutorial_id', { length: 50 }).notNull(),
	completedAt: timestamp('completed_at').defaultNow(),
}, (table) => [
	unique('unique_user_tutorial').on(table.userId, table.tutorialId),
]);
