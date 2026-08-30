import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { leaderArt, leaderImages } from '../db/schema';
import { ValidationError } from '../lib/errors';
import type { LeaderArtInput } from '../lib/validation/leader-art';

type DB = NodePgDatabase<typeof schema>;

/** Leader id → the image this player chose. Absent means the leader's default. */
export type LeaderArtMap = Record<string, string>;

export async function listLeaderArt(db: DB, ownerId: string): Promise<LeaderArtMap> {
  const rows = await db.select().from(leaderArt).where(eq(leaderArt.ownerId, ownerId));
  return Object.fromEntries(rows.map((r) => [r.leaderId, r.leaderImageId]));
}

/**
 * Records which printing of a leader this player wants to see, and returns the
 * whole map so the client never has to merge a partial response.
 *
 * The image is checked against the leader rather than trusted: an unchecked id
 * would be stored happily and then render as another leader's face, or as a
 * 404, everywhere that leader appears.
 */
export async function setLeaderArt(db: DB, ownerId: string, input: LeaderArtInput): Promise<LeaderArtMap> {
  const [image] = await db
    .select({ id: leaderImages.id, isDefault: leaderImages.isDefault })
    .from(leaderImages)
    .where(and(eq(leaderImages.id, input.imageId), eq(leaderImages.leaderId, input.leaderId)))
    .limit(1);
  if (!image) throw new ValidationError('That art is not a printing of this leader.');

  if (image.isDefault) {
    // The default is what every reader already falls back to, so choosing it is
    // the absence of a preference rather than a preference for the base. The
    // table stays a record of genuine deviations.
    await db.delete(leaderArt)
      .where(and(eq(leaderArt.ownerId, ownerId), eq(leaderArt.leaderId, input.leaderId)));
  } else {
    await db.insert(leaderArt)
      .values({ ownerId, leaderId: input.leaderId, leaderImageId: input.imageId })
      .onConflictDoUpdate({
        target: [leaderArt.ownerId, leaderArt.leaderId],
        set: { leaderImageId: input.imageId, updatedAt: new Date() },
      });
  }
  return listLeaderArt(db, ownerId);
}
