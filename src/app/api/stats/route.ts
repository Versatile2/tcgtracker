import { db } from '@/db/client';
import { requireUserId, errorToResponse, json } from '@/lib/api/handler';
import { getOverallStats, getPerMetaStats, getPlayedLeaders } from '@/services/stats';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const userId = await requireUserId();
    const [overall, perMeta, playedLeaders] = await Promise.all([
      getOverallStats(db, userId),
      getPerMetaStats(db, userId),
      getPlayedLeaders(db, userId),
    ]);
    return json({ overall, perMeta, playedLeaders });
  } catch (err) {
    return errorToResponse(err);
  }
}
