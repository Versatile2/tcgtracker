/**
 * Clean-restart of the reference catalog.
 *
 *   npx tsx scripts/reset-reference-data.ts --yes
 *
 * The original 25 seed leaders were invented (six of them were not real cards at
 * all), so there is no sane mapping from them onto the real 132-card catalog.
 * This drops all logged data along with the old global reference rows and
 * reseeds from src/db/seed-data.ts.
 *
 * DESTRUCTIVE: deletes every tournament and round. Plain DML — it does not touch
 * the schema or the drizzle migration journal.
 */
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { seedReferenceData } from '../src/db/seed';

async function main() {
  if (!process.argv.includes('--yes')) {
    console.error('Refusing to run without --yes (this deletes all tournaments and rounds).');
    process.exit(1);
  }

  const target = (process.env.DATABASE_URL ?? '').replace(/:[^:@/]+@/, ':***@');
  console.log(`Resetting ${target || '(DATABASE_URL unset)'}`);

  // Rounds and tournaments first so the leader/meta foreign keys are free.
  await db.execute(sql`DELETE FROM rounds`);
  await db.execute(sql`DELETE FROM tournaments`);
  await db.execute(sql`DELETE FROM leaders WHERE owner_id IS NULL`);
  await db.execute(sql`DELETE FROM metas WHERE owner_id IS NULL`);

  const seeded = await seedReferenceData(db);
  console.log(`Seeded ${seeded.leaders} leaders, ${seeded.metas} metas`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
