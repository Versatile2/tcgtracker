import { pgTable, pgEnum, uuid, text, boolean, integer, timestamp, date, jsonb, primaryKey, uniqueIndex, customType } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { GameLog } from '../lib/dto';

/**
 * Postgres bytea. drizzle-orm ships no bytea column and node-postgres already
 * hands one back as a Buffer, so this is a straight pass-through.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() { return 'bytea'; },
});

// 'match' is a single game with no event around it: a tournament row holding
// exactly one round, so it inherits the leader invariant, the outbox and every
// stats query rather than needing a table of its own.
export const tournamentType = pgEnum('tournament_type', [
  'local', 'treasure_cup', 'regionals', 'extra_grand_battle', 'pirates_party', 'testing', 'session', 'match',
  'ranked_sim', 'session_sim',
  'session_sim_casual', 'session_friend', 'session_locals', 'session_gauntlet', 'session_teaching',
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
 * A leader's card art, stored as bytes rather than as a file in public/.
 *
 * Rows are immutable. Correcting a leader's art inserts a new row and moves
 * `isDefault`; it never rewrites `data`. That is what lets /api/leader-images
 * serve these with `immutable` caching — an id names bytes that cannot change,
 * so a correction produces a new URL rather than a stale cache.
 */
export const leaderImages = pgTable('leader_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  leaderId: uuid('leader_id').notNull().references(() => leaders.id, { onDelete: 'cascade' }),
  /** The optcgapi card_image_id this came from ('OP06-022_p2'); null for art added by hand. */
  cardImageId: text('card_image_id'),
  /** Shown in the printing picker: 'Base', 'p1', 'p2', 'pr1'. */
  label: text('label').notNull(),
  data: bytea('data').notNull(),
  mimeType: text('mime_type').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  byteSize: integer('byte_size').notNull(),
  /** sha256 of `data`, hex. Doubles as the ETag and as a dedup key. */
  checksum: text('checksum').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Nulls are distinct in Postgres, so this pins imported printings without
  // blocking several hand-uploaded images on one leader.
  uniqueIndex('leader_images_leader_card_uq').on(t.leaderId, t.cardImageId),
  // "Exactly one default per leader", enforced by Postgres rather than by
  // application code that every future writer would have to remember.
  uniqueIndex('leader_images_one_default_uq').on(t.leaderId).where(sql`${t.isDefault}`),
]);

/**
 * Which printing of a leader this player wants to look at. Most leaders are
 * printed several times — a base card, a Parallel or Alternate Art, sometimes
 * an SPR — and this records the one they picked.
 *
 * A missing row means the leader's default printing, so the table only ever
 * holds genuine deviations from it. Purely presentational: nothing in the
 * statistics reads it, and a leader is one leader however it is drawn.
 *
 * Deleting an image deletes the preferences that chose it, by design — the
 * player falls back to the default rather than to a broken image.
 */
export const leaderArt = pgTable('leader_art', {
  ownerId: text('owner_id').notNull(),
  leaderId: uuid('leader_id').notNull().references(() => leaders.id, { onDelete: 'cascade' }),
  leaderImageId: uuid('leader_image_id').notNull().references(() => leaderImages.id, { onDelete: 'cascade' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.ownerId, t.leaderId] })]);

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
  // Null for session, where the leader is recorded per round instead.
  myLeaderId: uuid('my_leader_id').references(() => leaders.id),
  metaId: uuid('meta_id').references(() => metas.id),
  name: text('name'),
  // About the event as a whole — the venue, who you went with, how it went.
  // Rounds carry their own notes about the game that was played.
  notes: text('notes'),
  // Where you finished, and out of how many. Both optional and independent of
  // each other: standings are often posted after you leave, and "2nd" is worth
  // recording even when you never learn the field size.
  placement: integer('placement'),
  fieldSize: integer('field_size'),
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
  // Set only on session rounds, where the leader changes per round; null
  // otherwise, and null on session byes / no-shows (not games).
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
