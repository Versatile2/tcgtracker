import { sql } from 'drizzle-orm';
import { db as defaultDb } from './client';
import { leaders, sets } from './schema';
import { SEED_LEADERS, SEED_SETS } from './seed-data';

type DB = typeof defaultDb;

export async function seedReferenceData(db: DB) {
  let leaderCount = 0;
  for (const l of SEED_LEADERS) {
    const res = await db.insert(leaders)
      .values({ name: l.name, colors: l.colors, isCustom: false, ownerId: null })
      .onConflictDoNothing()
      .returning();
    leaderCount += res.length;
  }
  let setCount = 0;
  for (const s of SEED_SETS) {
    const res = await db.insert(sets)
      .values({ name: s.name, code: s.code, isCustom: false, ownerId: null })
      .onConflictDoNothing()
      .returning();
    setCount += res.length;
  }
  return { leaders: leaderCount, sets: setCount };
}

// Allow `npm run db:seed`
if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  seedReferenceData(defaultDb)
    .then((r) => { console.log('Seeded', r); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
