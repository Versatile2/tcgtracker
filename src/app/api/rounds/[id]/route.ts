import { db } from '@/db/client';
import { requireUserId, errorToResponse, json } from '@/lib/api/handler';
import { updateRound, deleteRound } from '@/services/rounds';
import { updateRoundSchema } from '@/lib/validation/round';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const input = updateRoundSchema.parse(await req.json());
    return json(await updateRound(db, userId, id, input));
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await deleteRound(db, userId, id);
    return json({ ok: true });
  } catch (err) {
    return errorToResponse(err);
  }
}
