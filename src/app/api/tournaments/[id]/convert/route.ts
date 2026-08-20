import { db } from '@/db/client';
import { requireUserId, errorToResponse, json } from '@/lib/api/handler';
import { convertTournamentType } from '@/services/tournaments';
import { convertTournamentSchema } from '@/lib/validation/tournament';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const input = convertTournamentSchema.parse(await req.json());
    return json(await convertTournamentType(db, userId, id, input));
  } catch (err) {
    return errorToResponse(err);
  }
}
