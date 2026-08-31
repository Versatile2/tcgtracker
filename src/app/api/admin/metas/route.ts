import { db } from '@/db/client';
import { requireAdmin, errorToResponse, json } from '@/lib/api/handler';
import { adminListMetas, createMeta } from '@/services/admin-catalog';
import { metaInputSchema } from '@/lib/validation/admin-catalog';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await requireAdmin();
    return json(await adminListMetas(db));
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const input = metaInputSchema.parse(await req.json());
    return json(await createMeta(db, input));
  } catch (err) {
    return errorToResponse(err);
  }
}
