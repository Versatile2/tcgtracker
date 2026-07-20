import { db } from '@/db/client';
import { requireUserId, errorToResponse, json } from '@/lib/api/handler';
import { getTournament, updateTournament, deleteTournament } from '@/services/tournaments';
import { updateTournamentSchema } from '@/lib/validation/tournament';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    return json(await getTournament(db, userId, id));
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const input = updateTournamentSchema.parse(await req.json());
    return json(await updateTournament(db, userId, id, input));
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await deleteTournament(db, userId, id);
    return json({ ok: true });
  } catch (err) {
    return errorToResponse(err);
  }
}
