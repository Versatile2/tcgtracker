import { db } from '@/db/client';
import { requireUserId, errorToResponse, json } from '@/lib/api/handler';
import { createTournament, listTournaments } from '@/services/tournaments';
import { createTournamentSchema } from '@/lib/validation/tournament';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const userId = await requireUserId();
    return json(await listTournaments(db, userId));
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const input = createTournamentSchema.parse(await req.json());
    return json(await createTournament(db, userId, input), { status: 201 });
  } catch (err) {
    return errorToResponse(err);
  }
}
