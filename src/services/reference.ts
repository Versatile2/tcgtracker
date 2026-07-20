import { and, or, eq, isNull, sql, asc } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { leaders, sets } from '../db/schema';
import type { CustomLeaderInput, CustomSetInput } from '../lib/validation/reference';

type DB = NodePgDatabase<typeof schema>;
export type Leader = typeof leaders.$inferSelect;
export type Set = typeof sets.$inferSelect;

const visibleTo = (table: typeof leaders | typeof sets, ownerId: string) =>
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
    .values({ name: input.name, colors: input.colors, isCustom: true, ownerId })
    .returning();
  return row;
}

export async function listSets(db: DB, ownerId: string): Promise<Set[]> {
  return db.select().from(sets).where(visibleTo(sets, ownerId)).orderBy(asc(sets.name));
}

export async function addCustomSet(db: DB, ownerId: string, input: CustomSetInput): Promise<Set> {
  const existing = await db.select().from(sets)
    .where(and(visibleTo(sets, ownerId), sql`lower(${sets.name}) = lower(${input.name})`))
    .limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db.insert(sets)
    .values({ name: input.name, isCustom: true, ownerId })
    .returning();
  return row;
}
