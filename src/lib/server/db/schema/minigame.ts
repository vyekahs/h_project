import { pgTable, serial, integer, varchar, text, boolean, timestamp, json, bigserial, unique, index, real } from 'drizzle-orm/pg-core';
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

export const minigamePlayLog = pgTable('minigame_play_log', {
	id: bigserial('id', { mode: 'number' }).primaryKey(),
	gameId: varchar('game_id', { length: 50 }).notNull(),
	difficulty: varchar('difficulty', { length: 20 }),
	userId: integer('user_id').notNull().references(() => attendees.id, { onDelete: 'cascade' }),
	score: integer('score'),
	clearTime: integer('clear_time'),
	playedAt: timestamp('played_at').defaultNow(),
	type: varchar('type', { length: 10 }).default('clear'),
});

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
	// 아직 사용자에게 알리지 않은 획득이면 NULL. 오락실 마스터처럼 게임 결과창이
	// 아닌 곳에서 알리는 칭호가 중복으로 뜨지 않게 하는 표시다.
	announcedAt: timestamp('announced_at', { withTimezone: true }),
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

export const minigameGameComments = pgTable('minigame_game_comments', {
	id: bigserial('id', { mode: 'number' }).primaryKey(),
	gameId: varchar('game_id', { length: 50 }).notNull(),
	userId: integer('user_id').notNull().references(() => attendees.id, { onDelete: 'cascade' }),
	content: varchar('content', { length: 200 }).notNull(),
	createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
	index('idx_game_comments_game_created').on(table.gameId, table.createdAt),
	index('idx_game_comments_user').on(table.userId),
]);

/**
 * 티츄 선언 판단 기록.
 *
 * AI의 선언 기준을 실제 플레이어와 **같은 조건에서** 비교/보정하기 위한 것이다.
 * 선언한 판만이 아니라 매 라운드를 남긴다 — "이 손패에서 안 불렀다"도 기준을
 * 학습하는 데 똑같이 중요하다.
 */
export const tichuDecisionLog = pgTable('tichu_decision_log', {
	id: bigserial('id', { mode: 'number' }).primaryKey(),
	userId: integer('user_id').notNull().references(() => attendees.id, { onDelete: 'cascade' }),
	roundNumber: integer('round_number').notNull(),

	// 판단 시점 특징값 (AI와 같은 축)
	pureWinRate: real('pure_win_rate'),
	exitRate: real('exit_rate'),
	minTurns: integer('min_turns'),
	leadCombos: integer('lead_combos'),
	handStrength: real('hand_strength'),
	raceProb: real('race_prob'),

	/** 'none' | 'small' | 'grand' */
	declared: varchar('declared', { length: 10 }).notNull(),

	finishedFirst: boolean('finished_first').notNull(),
	teamScore: integer('team_score'),

	/** 카드 id 배열 */
	hand8: json('hand_8'),
	hand14: json('hand_14'),

	partnerStrategy: varchar('partner_strategy', { length: 20 }),
	createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
	index('idx_tichu_decision_user').on(table.userId, table.createdAt),
]);
