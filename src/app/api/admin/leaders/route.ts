import { db } from '@/db/client';
import { requireAdmin, errorToResponse, json } from '@/lib/api/handler';
import { adminListLeaders, createLeader } from '@/services/admin-catalog';
import { leaderInputSchema } from '@/lib/validation/admin-catalog';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await requireAdmin();
    return json(await adminListLeaders(db));
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const input = leaderInputSchema.parse(await req.json());
    return json(await createLeader(db, input));
  } catch (err) {
    return errorToResponse(err);
  }
}
