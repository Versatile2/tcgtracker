import { db } from '@/db/client';
import { requireAdmin, errorToResponse, json } from '@/lib/api/handler';
import { adminListMetas } from '@/services/admin-catalog';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await requireAdmin();
    return json(await adminListMetas(db));
  } catch (err) {
    return errorToResponse(err);
  }
}
