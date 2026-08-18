import { pgTable, pgEnum, uuid, text, boolean, integer, timestamp, date, jsonb, primaryKey } from 'drizzle-orm/pg-core';
import type { GameLog } from '../lib/dto';

// 'match' is a single game with no event around it: a tournament row holding
// exactly one round, so it inherits the leader invariant, the outbox and every
// stats query rather than needing a table of its own.
export const tournamentType = pgEnum('tournament_type', [
  'local', 'treasure_cup', 'regionals', 'extra_grand_battle', 'pirates_party', 'testing', 'freeplay', 'match',
]);
export const tournamentStatus = pgEnum('tournament_status', ['draft', 'locked']);
export const roundResult = pgEnum('round_result', ['win', 'loss', 'draw']);
export const playOrder = pgEnum('play_order', ['first', 'second']);
export const roundKind = pgEnum('round_kind', ['swiss', 'top_cut', 'bye', 'no_show']);

export const leaders = pgTable('leaders', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  colors: text('colors').array().notNull().default([]),
  setCode: text('set_code'),
  isCustom: boolean('is_custom').notNull().default(false),
  ownerId: text('owner_id'), // null = global seed
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Which printing of a leader this player wants to look at. Most leaders are
 * printed several times — a base card, a Parallel or Alternate Art, sometimes an
 * SPR — and this records the one they picked.
 *
 * Keyed on the card's set code rather than a leaders.id, for the same reason
 * getLeaderImage is: row ids are reassigned by a reseed, set codes are not. It
 * carries no foreign key for that reason, and custom leaders — which have no
 * card art at all — never appear here.
 *
 * A missing row means the base printing, so the table only ever holds genuine
 * deviations from the default. Purely presentational: nothing in the statistics
 * reads it, and a leader is one leader however it is drawn.
 */
export const leaderArt = pgTable('leader_art', {
  ownerId: text('owner_id').notNull(),
  setCode: text('set_code').notNull(),
  /** A card_image_id from LEADER_ART[setCode], e.g. 'OP06-022_p2'. */
  art: text('art').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.ownerId, t.setCode] })]);

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
  // Null for freeplay, where the leader is recorded per round instead.
  myLeaderId: uuid('my_leader_id').references(() => leaders.id),
  metaId: uuid('meta_id').references(() => metas.id),
  name: text('name'),
  // About the event as a whole — the venue, who you went with, how it went.
  // Rounds carry their own notes about the game that was played.
  notes: text('notes'),
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
  // Set only on freeplay rounds, where the leader changes per round; null
  // otherwise, and null on freeplay byes / no-shows (not games).
  myLeaderId: uuid('my_leader_id').references(() => leaders.id),
  opponentMetaId: uuid('opponent_meta_id').references(() => metas.id),
  result: roundResult('result').notNull(),
  playOrder: playOrder('play_order'),
  // Whether the player won the pre-game die roll (Swiss); null when unknown.
  wonDieRoll: boolean('won_die_roll'),
  // Per-game log for top_cut (best-of-3); null otherwise.
  games: jsonb('games').$type<GameLog[]>(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
