/**
 * One-shot backfill: bundled leader art files -> the leader_images table.
 *
 *   npm run db:migrate-leader-images
 *
 * Idempotent and re-runnable. It keys on (leader_id, card_image_id) and skips
 * what is already there, so an interrupted run is resumed by running it again.
 *
 * Ordering matters. This reads src/lib/printings.ts, src/lib/clean-art.ts and
 * both image folders, so none of them may be deleted until this has run against
 * production and been verified. See the spec's "Sequencing matters here".
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { and, eq, isNull, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { db } from '../src/db/client';
import { leaders, leaderImages, leaderArt } from '../src/db/schema';
import { printingsOf } from '../src/lib/printings';
import { CLEAN_ART } from '../src/lib/clean-art';
import { labelForPrinting, imagePathForPrinting } from '../src/lib/leader-image-import';

const ROOT = path.resolve(import.meta.dirname, '..');

async function backfillImages() {
  const rows = await db.select().from(leaders).where(isNull(leaders.ownerId));
  let inserted = 0, skipped = 0, missing = 0;

  for (const leader of rows) {
    if (!leader.setCode) continue;
    const printings = printingsOf(leader.setCode);
    for (const [i, printing] of printings.entries()) {
      const existing = await db.select({ id: leaderImages.id }).from(leaderImages)
        .where(and(eq(leaderImages.leaderId, leader.id), eq(leaderImages.cardImageId, printing)))
        .limit(1);
      if (existing[0]) { skipped++; continue; }

      const file = path.join(ROOT, imagePathForPrinting(printing, CLEAN_ART.has(printing)));
      let data: Buffer;
      try {
        data = await readFile(file);
      } catch {
        console.warn(`missing file for ${printing}: ${file}`);
        missing++;
        continue;
      }
      const meta = await sharp(data).metadata();
      await db.insert(leaderImages).values({
        leaderId: leader.id,
        cardImageId: printing,
        label: labelForPrinting(leader.setCode, printing),
        data,
        mimeType: 'image/webp',
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        byteSize: data.byteLength,
        checksum: createHash('sha256').update(data).digest('hex'),
        // The base printing is the default, always. A clean scan changes where
        // a printing's bytes come from, never which printing is the default —
        // that is exactly what getLeaderImage does today.
        isDefault: i === 0,
        sortOrder: i,
      });
      inserted++;
    }
  }
  return { inserted, skipped, missing };
}

async function backfillArtPreferences() {
  const prefs = await db.select().from(leaderArt);
  let linked = 0, dropped = 0;

  for (const pref of prefs) {
    if (pref.leaderImageId) { linked++; continue; }
    const [leader] = await db.select({ id: leaders.id }).from(leaders)
      .where(and(isNull(leaders.ownerId), eq(leaders.setCode, pref.setCode)))
      .limit(1);
    const image = leader
      ? (await db.select({ id: leaderImages.id }).from(leaderImages)
          .where(and(eq(leaderImages.leaderId, leader.id), eq(leaderImages.cardImageId, pref.art)))
          .limit(1))[0]
      : undefined;

    if (!leader || !image) {
      // Cosmetic only: a preference that finds no target is deleted, and the
      // player falls back to the leader's default art.
      await db.delete(leaderArt)
        .where(and(eq(leaderArt.ownerId, pref.ownerId), eq(leaderArt.setCode, pref.setCode)));
      dropped++;
      continue;
    }
    await db.update(leaderArt)
      .set({ leaderId: leader.id, leaderImageId: image.id })
      .where(and(eq(leaderArt.ownerId, pref.ownerId), eq(leaderArt.setCode, pref.setCode)));
    linked++;
  }
  return { linked, dropped };
}

async function verify() {
  const [{ count: withoutDefault }] = await db.execute<{ count: number }>(sql`
    SELECT count(*)::int AS count FROM leaders l
    WHERE l.owner_id IS NULL AND l.set_code IS NOT NULL
      AND EXISTS (SELECT 1 FROM leader_images i WHERE i.leader_id = l.id)
      AND NOT EXISTS (SELECT 1 FROM leader_images i WHERE i.leader_id = l.id AND i.is_default)
  `).then((r) => r.rows);
  const [{ count: unlinked }] = await db.execute<{ count: number }>(sql`
    SELECT count(*)::int AS count FROM leader_art WHERE leader_image_id IS NULL
  `).then((r) => r.rows);
  return { leadersWithoutDefault: withoutDefault, unlinkedPreferences: unlinked };
}

async function main() {
  const target = (process.env.DATABASE_URL ?? '').replace(/:[^:@/]+@/, ':***@');
  console.log(`Backfilling ${target || '(DATABASE_URL unset)'}`);
  console.log('images:', await backfillImages());
  console.log('art preferences:', await backfillArtPreferences());
  const checks = await verify();
  console.log('verify:', checks);
  if (checks.leadersWithoutDefault > 0 || checks.unlinkedPreferences > 0) {
    console.error('Backfill incomplete — do not run the contract migration.');
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
