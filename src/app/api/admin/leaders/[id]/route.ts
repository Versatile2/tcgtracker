import { db } from '@/db/client';
import { requireAdmin, errorToResponse, json } from '@/lib/api/handler';
import { updateLeader } from '@/services/admin-catalog';
import { leaderInputSchema } from '@/lib/validation/admin-catalog';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    const { id } = await params;
    const input = leaderInputSchema.parse(await req.json());
    return json(await updateLeader(db, id, input));
  } catch (err) {
    return errorToResponse(err);
  }
}
