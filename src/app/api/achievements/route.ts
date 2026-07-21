import { db } from '@/db/client';
import { requireUserId, errorToResponse, json } from '@/lib/api/handler';
import { getAchievements } from '@/services/achievements';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const userId = await requireUserId();
    const achievements = await getAchievements(db, userId);
    const unlockedCount = achievements.filter((a) => a.unlocked).length;
    return json({ achievements, unlockedCount, total: achievements.length });
  } catch (err) {
    return errorToResponse(err);
  }
}
