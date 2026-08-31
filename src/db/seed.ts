import { and, eq, isNull, sql } from 'drizzle-orm';
import { db as defaultDb } from './client';
import { leaders, metas } from './schema';

type DB = typeof defaultDb;

export type SeedLeader = { name: string; colors: string[]; setCode: string };
export type SeedMeta = { name: string; code: string };

/*
 * Seeded rows are `published`: this is the curated catalog the app ships with,
 * not something the importer proposed. The column defaults to `draft` so that
 * everything arriving from optcgapi waits for review, which would otherwise
 * leave a freshly seeded database with an empty picker.
 */
export async function seedReferenceData(
  db: DB,
  data: { leaders: SeedLeader[]; metas: SeedMeta[] },
) {
  let leaderCount = 0;
  for (const l of data.leaders) {
    // Keyed on the set code, not the name: a leader name is not unique (there
    // are 15 distinct Monkey D. Luffy printings), but a card's set code is.
    const existing = await db.select().from(leaders)
      .where(and(isNull(leaders.ownerId), eq(leaders.setCode, l.setCode)))
      .limit(1);
    if (existing[0]) continue;
    const res = await db.insert(leaders)
      .values({ name: l.name, colors: l.colors, setCode: l.setCode, isCustom: false, ownerId: null, status: 'published' })
      .returning();
    leaderCount += res.length;
  }
  let metaCount = 0;
  for (const m of data.metas) {
    const existing = await db.select().from(metas)
      .where(and(isNull(metas.ownerId), sql`lower(${metas.name}) = lower(${m.name})`))
      .limit(1);
    if (existing[0]) continue;
    const res = await db.insert(metas)
      .values({ name: m.name, code: m.code, isCustom: false, ownerId: null, status: 'published' })
      .returning();
    metaCount += res.length;
  }
  return { leaders: leaderCount, metas: metaCount };
}
