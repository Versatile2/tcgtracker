import { db } from '@/db/client';
import { requireUserId, errorToResponse, json } from '@/lib/api/handler';
import { listLeaders, addCustomLeader } from '@/services/reference';
import { customLeaderSchema } from '@/lib/validation/reference';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const userId = await requireUserId();
    return json(await listLeaders(db, userId));
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const input = customLeaderSchema.parse(await req.json());
    return json(await addCustomLeader(db, userId, input), { status: 201 });
  } catch (err) {
    return errorToResponse(err);
  }
}
