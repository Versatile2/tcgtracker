import { db } from '@/db/client';
import { requireAdmin, errorToResponse, json } from '@/lib/api/handler';
import { adminListLeaders } from '@/services/admin-catalog';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await requireAdmin();
    return json(await adminListLeaders(db));
  } catch (err) {
    return errorToResponse(err);
  }
}
