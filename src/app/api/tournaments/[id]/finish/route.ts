import { db } from '@/db/client';
import { requireUserId, errorToResponse, json } from '@/lib/api/handler';
import { finishTournament } from '@/services/tournaments';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    return json(await finishTournament(db, userId, id));
  } catch (err) {
    return errorToResponse(err);
  }
}
