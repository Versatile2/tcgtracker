import { and, or, eq, isNull, sql, asc } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { leaders, metas } from '../db/schema';
import type { CustomLeaderInput, CustomMetaInput } from '../lib/validation/reference';

type DB = NodePgDatabase<typeof schema>;
export type Leader = typeof leaders.$inferSelect;
export type Meta = typeof metas.$inferSelect;

const visibleTo = (table: typeof leaders | typeof metas, ownerId: string) =>
  or(isNull(table.ownerId), eq(table.ownerId, ownerId));

export async function listLeaders(db: DB, ownerId: string): Promise<Leader[]> {
  return db.select().from(leaders).where(visibleTo(leaders, ownerId)).orderBy(asc(leaders.name));
}

export async function addCustomLeader(db: DB, ownerId: string, input: CustomLeaderInput): Promise<Leader> {
  const existing = await db.select().from(leaders)
    .where(and(visibleTo(leaders, ownerId), sql`lower(${leaders.name}) = lower(${input.name})`))
    .limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db.insert(leaders)
    .values({ name: input.name, colors: input.colors, setCode: input.setCode ?? null, isCustom: true, ownerId })
    .returning();
  return row;
}

export async function listMetas(db: DB, ownerId: string): Promise<Meta[]> {
  return db.select().from(metas).where(visibleTo(metas, ownerId)).orderBy(asc(metas.name));
}

export async function addCustomMeta(db: DB, ownerId: string, input: CustomMetaInput): Promise<Meta> {
  const existing = await db.select().from(metas)
    .where(and(visibleTo(metas, ownerId), sql`lower(${metas.name}) = lower(${input.name})`))
    .limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db.insert(metas)
    .values({ name: input.name, isCustom: true, ownerId })
    .returning();
  return row;
}
