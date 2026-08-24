import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { leaderArt } from '../db/schema';
import { printingsOf } from '../lib/printings';
import { ValidationError } from '../lib/errors';
import type { LeaderArtInput } from '../lib/validation/leader-art';

type DB = NodePgDatabase<typeof schema>;

/** Set code → the printing this player chose. Absent means the base printing. */
export type LeaderArtMap = Record<string, string>;

export async function listLeaderArt(db: DB, ownerId: string): Promise<LeaderArtMap> {
  const rows = await db.select().from(leaderArt).where(eq(leaderArt.ownerId, ownerId));
  return Object.fromEntries(rows.map((r) => [r.setCode, r.art]));
}

/**
 * Records which printing of a leader this player wants to see, and returns the
 * whole map so the client never has to merge a partial response.
 *
 * The art is checked against the bundled card data rather than trusted: the
 * column is a bare text field, so an unchecked value would be stored happily and
 * then render as a 404 image everywhere that leader appears.
 */
export async function setLeaderArt(db: DB, ownerId: string, input: LeaderArtInput): Promise<LeaderArtMap> {
  // Both sources of printings, exactly as the picker offers them — a collected
  // printing optcgapi does not list is still a printing the player can choose.
  const printings = printingsOf(input.setCode);
  if (!printings.length) throw new ValidationError('No card art for that leader.');
  if (!printings.includes(input.art)) throw new ValidationError('That art is not a printing of this leader.');

  if (input.art === printings[0]) {
    // The first printing is what every reader already falls back to, so choosing
    // it is the absence of a preference rather than a preference for the base.
    // Deleting keeps the table to genuine deviations, which also means a future
    // set code renumbering strands nothing.
    await db.delete(leaderArt)
      .where(and(eq(leaderArt.ownerId, ownerId), eq(leaderArt.setCode, input.setCode)));
  } else {
    await db.insert(leaderArt)
      .values({ ownerId, setCode: input.setCode, art: input.art })
      .onConflictDoUpdate({
        target: [leaderArt.ownerId, leaderArt.setCode],
        set: { art: input.art, updatedAt: new Date() },
      });
  }
  return listLeaderArt(db, ownerId);
}
