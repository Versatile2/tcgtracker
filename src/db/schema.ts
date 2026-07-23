import { pgTable, pgEnum, uuid, text, boolean, integer, timestamp, date, jsonb } from 'drizzle-orm/pg-core';
import type { GameLog } from '../lib/dto';

export const tournamentType = pgEnum('tournament_type', [
  'local', 'treasure_cup', 'regionals', 'extra_grand_battle', 'pirates_party', 'testing',
]);
export const tournamentStatus = pgEnum('tournament_status', ['draft', 'locked']);
export const roundResult = pgEnum('round_result', ['win', 'loss', 'draw']);
export const playOrder = pgEnum('play_order', ['first', 'second']);
export const roundKind = pgEnum('round_kind', ['swiss', 'top_cut', 'bye', 'no_show']);

export const leaders = pgTable('leaders', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  colors: text('colors').array().notNull().default([]),
  isCustom: boolean('is_custom').notNull().default(false),
  ownerId: text('owner_id'), // null = global seed
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const metas = pgTable('metas', {
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
  myLeaderId: uuid('my_leader_id').notNull().references(() => leaders.id),
  metaId: uuid('meta_id').references(() => metas.id),
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
  kind: roundKind('round_kind').notNull().default('swiss'),
  // Null for bye / no_show (no opponent).
  opponentLeaderId: uuid('opponent_leader_id').references(() => leaders.id),
  opponentMetaId: uuid('opponent_meta_id').references(() => metas.id),
  result: roundResult('result').notNull(),
  playOrder: playOrder('play_order'),
  // Per-game log for top_cut (best-of-3); null otherwise.
  games: jsonb('games').$type<GameLog[]>(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
