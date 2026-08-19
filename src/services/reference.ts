import { or, eq, isNull, sql, asc } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { leaders, metas } from '../db/schema';

type DB = NodePgDatabase<typeof schema>;
export type Leader = typeof leaders.$inferSelect;
export type Meta = typeof metas.$inferSelect;

/*
 * Global seed rows, plus this owner's own.
 *
 * Custom leaders and metas can no longer be created — the catalog ships the
 * real 132 leaders and OP01–OP16, and the daily refresh adds new sets as they
 * release, so a hand-typed row was a duplicate waiting to split someone's
 * statistics. Ones already recorded stay visible and keep working: the games
 * logged against them are real games.
 */
const visibleTo = (table: typeof leaders | typeof metas, ownerId: string) =>
  or(isNull(table.ownerId), eq(table.ownerId, ownerId));

export async function listLeaders(db: DB, ownerId: string): Promise<Leader[]> {
  return db.select().from(leaders).where(visibleTo(leaders, ownerId)).orderBy(asc(leaders.name));
}


export async function listMetas(db: DB, ownerId: string): Promise<Meta[]> {
  // Official sets newest-first (codes are zero-padded, so lexical DESC is
  // correct), then the user's custom metas alphabetically. The form's
  // default is picked by `pickDefaultMetaId`, which already excludes custom
  // metas and doesn't rely on this ordering; keeping customs below the
  // official list here is belt-and-braces plus good UX in its own right.
  return db.select().from(metas)
    .where(visibleTo(metas, ownerId))
    .orderBy(asc(metas.isCustom), sql`${metas.code} desc nulls last`, asc(metas.name));
}

