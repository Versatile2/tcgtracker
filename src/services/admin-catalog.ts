import { asc, eq, sql, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { leaders, metas, leaderImages } from '../db/schema';
import type { LeaderDTO, LeaderImageDTO, MetaDTO } from '../lib/dto';
import type { BulkStatusInput, LeaderInput, MetaInput } from '../lib/validation/admin-catalog';
import { NotFoundError } from '../lib/errors';

type DB = NodePgDatabase<typeof schema>;

/**
 * The whole catalog, status and all.
 *
 * Separate from listLeaders rather than a flag on it. A `?all=true` that only an
 * admin may pass is one forgotten check away from serving the draft catalog to
 * every player; a separate path under /api/admin cannot be reached by accident.
 *
 * Drafts sort first: they are the work waiting to be done, and work you have to
 * search for is work that does not get done.
 */
export async function adminListLeaders(db: DB): Promise<LeaderDTO[]> {
  const rows = await db.select().from(leaders).orderBy(
    sql`case ${leaders.status} when 'draft' then 0 when 'published' then 1 else 2 end`,
    // Newest set first, which is where the work is after a release. Lexical, so
    // an ST- or PRB-coded card outranks OP16 — the codes are not a timeline and
    // pretending otherwise would need a table nobody maintains.
    sql`${leaders.setCode} desc nulls last`,
    asc(leaders.name),
  );
  if (!rows.length) return [];

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

export async function adminListMetas(db: DB): Promise<MetaDTO[]> {
  return db.select().from(metas).orderBy(
    sql`case ${metas.status} when 'draft' then 0 when 'published' then 1 else 2 end`,
    // By release date, because the codes are not a timeline — OP14 and OP15
    // shipped out of code order, and an EB or PRB code outranks OP16 lexically.
    // A meta with no date yet falls back to its code and sorts below the dated
    // ones, which is also the rule pickDefaultMetaId follows.
    sql`${metas.releasedAt} desc nulls last`,
    sql`${metas.code} desc nulls last`,
    asc(metas.name),
  );
}

/**
 * Move a set of catalog rows to one status.
 *
 * Returns how many rows actually changed, which is not always how many ids were
 * sent — an id that no longer exists changes nothing, and the caller deserves to
 * know that rather than being told "done".
 */
export async function setLeaderStatus(db: DB, input: BulkStatusInput): Promise<{ changed: number }> {
  const rows = await db.update(leaders)
    .set({ status: input.status })
    .where(inArray(leaders.id, input.ids))
    .returning({ id: leaders.id });
  return { changed: rows.length };
}

export async function setMetaStatus(db: DB, input: BulkStatusInput): Promise<{ changed: number }> {
  const rows = await db.update(metas)
    .set({ status: input.status })
    .where(inArray(metas.id, input.ids))
    .returning({ id: metas.id });
  return { changed: rows.length };
}

/*
 * There is deliberately no delete. A leader referenced by a round cannot be
 * removed without either cascading away real match history or failing on a
 * foreign key; `hidden` is the delete, and it leaves the history intact.
 */
export async function createLeader(db: DB, input: LeaderInput): Promise<LeaderDTO> {
  const [row] = await db.insert(leaders).values(input).returning();
  return { ...row, images: [], defaultImageId: null };
}

export async function updateLeader(db: DB, id: string, input: LeaderInput): Promise<LeaderDTO> {
  const [row] = await db.update(leaders).set(input).where(eq(leaders.id, id)).returning();
  if (!row) throw new NotFoundError('No such leader.');
  const imgs = await db
    .select({ id: leaderImages.id, label: leaderImages.label, isDefault: leaderImages.isDefault })
    .from(leaderImages).where(eq(leaderImages.leaderId, id)).orderBy(asc(leaderImages.sortOrder));
  return {
    ...row,
    images: imgs.map((i) => ({ id: i.id, label: i.label })),
    defaultImageId: imgs.find((i) => i.isDefault)?.id ?? null,
  };
}

export async function createMeta(db: DB, input: MetaInput): Promise<MetaDTO> {
  const [row] = await db.insert(metas).values(input).returning();
  return row;
}

export async function updateMeta(db: DB, id: string, input: MetaInput): Promise<MetaDTO> {
  const [row] = await db.update(metas).set(input).where(eq(metas.id, id)).returning();
  if (!row) throw new NotFoundError('No such meta.');
  return row;
}
