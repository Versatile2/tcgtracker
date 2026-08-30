import { db } from '@/db/client';
import { requireAdmin, errorToResponse, json } from '@/lib/api/handler';
import { updateMeta } from '@/services/admin-catalog';
import { metaInputSchema } from '@/lib/validation/admin-catalog';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    const { id } = await params;
    const input = metaInputSchema.parse(await req.json());
    return json(await updateMeta(db, id, input));
  } catch (err) {
    return errorToResponse(err);
  }
}
