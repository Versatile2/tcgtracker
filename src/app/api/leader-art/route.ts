import { db } from '@/db/client';
import { requireUserId, errorToResponse, json } from '@/lib/api/handler';
import { listLeaderArt, setLeaderArt } from '@/services/leader-art';
import { leaderArtSchema } from '@/lib/validation/leader-art';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const userId = await requireUserId();
    return json(await listLeaderArt(db, userId));
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function PUT(req: Request) {
  try {
    const userId = await requireUserId();
    const input = leaderArtSchema.parse(await req.json());
    return json(await setLeaderArt(db, userId, input));
  } catch (err) {
    return errorToResponse(err);
  }
}
