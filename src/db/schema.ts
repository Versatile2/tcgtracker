import { pgTable, pgEnum, uuid, text, boolean, integer, timestamp, date } from 'drizzle-orm/pg-core';

export const tournamentType = pgEnum('tournament_type', [
  'local', 'treasure_cup', 'regionals', 'extra_grand_battle', 'pirates_party', 'testing',
]);
export const tournamentStatus = pgEnum('tournament_status', ['draft', 'locked']);
export const roundResult = pgEnum('round_result', ['win', 'loss', 'draw']);
export const playOrder = pgEnum('play_order', ['first', 'second']);

export const leaders = pgTable('leaders', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  colors: text('colors').array().notNull().default([]),
  isCustom: boolean('is_custom').notNull().default(false),
  ownerId: text('owner_id'), // null = global seed
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sets = pgTable('sets', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  code: text('code'),
  releasedAt: date('released_at'),
  isCustom: boolean('is_custom').notNull().default(false),
  ownerId: text('owner_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tournaments = pgTable('tournaments', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: text('owner_id').notNull(),
  type: tournamentType('type').notNull(),
  setId: uuid('set_id').references(() => sets.id),
  name: text('name'),
  playedOn: date('played_on').notNull(),
  status: tournamentStatus('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rounds = pgTable('rounds', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  roundNumber: integer('round_number').notNull(),
  myLeaderId: uuid('my_leader_id').notNull().references(() => leaders.id),
  opponentLeaderId: uuid('opponent_leader_id').notNull().references(() => leaders.id),
  result: roundResult('result').notNull(),
  playOrder: playOrder('play_order'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
