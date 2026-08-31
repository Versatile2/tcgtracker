import { db } from '@/db/client';
import { requireAdmin, errorToResponse, json } from '@/lib/api/handler';
import { addLeaderImage, MAX_IMAGE_BYTES } from '@/services/admin-images';
import { ValidationError } from '@/lib/errors';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    const { id } = await params;
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof Blob)) throw new ValidationError('No file.');
    if (file.size > MAX_IMAGE_BYTES) throw new ValidationError('Image too large.');
    const label = String(form.get('label') ?? 'Custom').trim().slice(0, 40) || 'Custom';
    const bytes = Buffer.from(await file.arrayBuffer());
    return json(await addLeaderImage(db, id, bytes, label));
  } catch (err) {
    return errorToResponse(err);
  }
}
