import { z } from 'zod';
import { db } from '@/db/client';
import { requireAdmin, errorToResponse, json } from '@/lib/api/handler';
import { updateLeaderImage, deleteLeaderImage } from '@/services/admin-images';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

const imagePatchSchema = z.object({
  label: z.string().trim().min(1).max(40).optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    const { id } = await params;
    const patch = imagePatchSchema.parse(await req.json());
    return json(await updateLeaderImage(db, id, patch));
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    const { id } = await params;
    return json(await deleteLeaderImage(db, id));
  } catch (err) {
    return errorToResponse(err);
  }
}
