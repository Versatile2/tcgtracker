import { and, eq, isNull, sql } from 'drizzle-orm';
import { db as defaultDb } from './client';
import { leaders, metas } from './schema';
import { SEED_LEADERS, SEED_METAS } from './seed-data';

type DB = typeof defaultDb;

/*
 * Seeded rows are `published`: this is the curated catalog the app ships with,
 * not something the importer proposed. The column defaults to `draft` so that
 * everything arriving from optcgapi waits for review, which would otherwise
 * leave a freshly seeded database with an empty picker.
 */
export async function seedReferenceData(db: DB) {
  let leaderCount = 0;
  for (const l of SEED_LEADERS) {
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
  for (const m of SEED_METAS) {
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

// Allow `npm run db:seed`
if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  seedReferenceData(defaultDb)
    .then((r) => { console.log('Seeded', r); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
