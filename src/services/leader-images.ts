import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { leaderImages } from '../db/schema';

type DB = NodePgDatabase<typeof schema>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LeaderImageBytes = { data: Buffer; mimeType: string; checksum: string };

/**
 * The bytes behind one image id, or null if there is none.
 *
 * The shape check comes first because Postgres raises on a malformed uuid
 * comparison rather than returning no rows, and a junk id in a URL is a 404
 * like any other miss, not a 500.
 */
export async function findLeaderImage(db: DB, id: string): Promise<LeaderImageBytes | null> {
  if (!UUID.test(id)) return null;
  const [row] = await db
    .select({ data: leaderImages.data, mimeType: leaderImages.mimeType, checksum: leaderImages.checksum })
    .from(leaderImages)
    .where(eq(leaderImages.id, id))
    .limit(1);
  return row ?? null;
}
