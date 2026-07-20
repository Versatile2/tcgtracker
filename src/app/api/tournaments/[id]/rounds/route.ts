import { db } from '@/db/client';
import { requireUserId, errorToResponse, json } from '@/lib/api/handler';
import { addRound } from '@/services/rounds';
import { createRoundSchema } from '@/lib/validation/round';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const input = createRoundSchema.parse(await req.json());
    return json(await addRound(db, userId, id, input), { status: 201 });
  } catch (err) {
    return errorToResponse(err);
  }
}
