import { db } from '@/db/client';
import { requireUserId, errorToResponse, json } from '@/lib/api/handler';
import { getOverallStats, getPerSetStats, getPlayedLeaders } from '@/services/stats';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const userId = await requireUserId();
    const [overall, perSet, playedLeaders] = await Promise.all([
      getOverallStats(db, userId),
      getPerSetStats(db, userId),
      getPlayedLeaders(db, userId),
    ]);
    return json({ overall, perSet, playedLeaders });
  } catch (err) {
    return errorToResponse(err);
  }
}
