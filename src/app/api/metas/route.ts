import { db } from '@/db/client';
import { requireUserId, errorToResponse, json } from '@/lib/api/handler';
import { listMetas, addCustomMeta } from '@/services/reference';
import { customMetaSchema } from '@/lib/validation/reference';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const userId = await requireUserId();
    return json(await listMetas(db, userId));
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const input = customMetaSchema.parse(await req.json());
    return json(await addCustomMeta(db, userId, input), { status: 201 });
  } catch (err) {
    return errorToResponse(err);
  }
}
