import { db } from '@/db/client';
import { requireUserId, errorToResponse, json } from '@/lib/api/handler';
import { getMatchupStats } from '@/services/stats';
import { matchupQuerySchema } from '@/lib/validation/stats';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const { leaderId } = matchupQuerySchema.parse({ leaderId: searchParams.get('leaderId') ?? undefined });
    return json(await getMatchupStats(db, userId, leaderId));
  } catch (err) {
    return errorToResponse(err);
  }
}
