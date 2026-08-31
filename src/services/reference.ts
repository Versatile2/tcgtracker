import { or, and, eq, isNull, sql, asc, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { leaders, leaderImages, metas, tournaments, rounds } from '../db/schema';
import type { LeaderDTO, LeaderImageDTO } from '../lib/dto';

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

/*
 * The second half of "what this player may see".
 *
 * Published rows, plus any row their own matches already reference whatever its
 * status. That second half is not a nicety: the client fetches this list once
 * and resolves leader names by id, so without it, hiding a leader would blank
 * every past match that used it. "Offerable" is a display filter the pickers
 * apply to `status`, not a narrower query.
 */
const inMyMatches = (leaderId: typeof leaders.id, ownerId: string) => sql`EXISTS (
  SELECT 1 FROM ${tournaments} t
  LEFT JOIN ${rounds} r ON r.tournament_id = t.id
  WHERE t.owner_id = ${ownerId}
    AND (t.my_leader_id = ${leaderId} OR r.my_leader_id = ${leaderId} OR r.opponent_leader_id = ${leaderId})
)`;

const metaInMyMatches = (metaId: typeof metas.id, ownerId: string) => sql`EXISTS (
  SELECT 1 FROM ${tournaments} t
  LEFT JOIN ${rounds} r ON r.tournament_id = t.id
  WHERE t.owner_id = ${ownerId}
    AND (t.meta_id = ${metaId} OR r.opponent_meta_id = ${metaId})
)`;

export async function listLeaders(db: DB, ownerId: string): Promise<LeaderDTO[]> {
  const rows = await db.select().from(leaders)
    .where(and(
      visibleTo(leaders, ownerId),
      or(eq(leaders.status, 'published'), inMyMatches(leaders.id, ownerId)),
    ))
    .orderBy(asc(leaders.name));
  if (!rows.length) return [];

  // Two queries rather than a join: a join multiplies leader rows by their
  // printings, and the regrouping costs more than the extra round trip.
  const imgs = await db
    .select({
      id: leaderImages.id, leaderId: leaderImages.leaderId,
      label: leaderImages.label, isDefault: leaderImages.isDefault,
    })
    .from(leaderImages)
    .where(inArray(leaderImages.leaderId, rows.map((r) => r.id)))
    .orderBy(asc(leaderImages.sortOrder));

  const byLeader = new Map<string, LeaderImageDTO[]>();
  const defaultOf = new Map<string, string>();
  for (const img of imgs) {
    const list = byLeader.get(img.leaderId);
    if (list) list.push({ id: img.id, label: img.label });
    else byLeader.set(img.leaderId, [{ id: img.id, label: img.label }]);
    if (img.isDefault) defaultOf.set(img.leaderId, img.id);
  }

  return rows.map((l) => ({
    ...l,
    images: byLeader.get(l.id) ?? [],
    defaultImageId: defaultOf.get(l.id) ?? null,
  }));
}


export async function listMetas(db: DB, ownerId: string): Promise<Meta[]> {
  // Official sets newest-first (codes are zero-padded, so lexical DESC is
  // correct), then the user's custom metas alphabetically. The form's
  // default is picked by `pickDefaultMetaId`, which already excludes custom
  // metas and doesn't rely on this ordering; keeping customs below the
  // official list here is belt-and-braces plus good UX in its own right.
  return db.select().from(metas)
    .where(and(
      visibleTo(metas, ownerId),
      or(eq(metas.status, 'published'), metaInMyMatches(metas.id, ownerId)),
    ))
    .orderBy(asc(metas.isCustom), sql`${metas.code} desc nulls last`, asc(metas.name));
}

