import { db } from '@/db/client';
import { requireAdmin, errorToResponse, json } from '@/lib/api/handler';
import { setMetaStatus } from '@/services/admin-catalog';
import { bulkStatusSchema } from '@/lib/validation/admin-catalog';

export const runtime = 'nodejs';

export async function PATCH(req: Request) {
  try {
    // Before the body is parsed, so a non-admin gets 403 rather than a 400 that
    // reveals the schema.
    await requireAdmin();
    const input = bulkStatusSchema.parse(await req.json());
    return json(await setMetaStatus(db, input));
  } catch (err) {
    return errorToResponse(err);
  }
}
