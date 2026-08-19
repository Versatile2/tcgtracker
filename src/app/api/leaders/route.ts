import { db } from '@/db/client';
import { requireUserId, errorToResponse, json } from '@/lib/api/handler';
import { listLeaders } from '@/services/reference';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const userId = await requireUserId();
    return json(await listLeaders(db, userId));
  } catch (err) {
    return errorToResponse(err);
  }
}

