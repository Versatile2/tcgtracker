import { and, eq, desc } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { tournaments, rounds } from '../db/schema';
import { computeRecord } from '../lib/record';
import { NotFoundError } from '../lib/errors';
import type { CreateTournamentInput, UpdateTournamentInput } from '../lib/validation/tournament';

type DB = NodePgDatabase<typeof schema>;
export type Tournament = typeof tournaments.$inferSelect;
export type Round = typeof rounds.$inferSelect;
type MatchSummary = { opponentLeaderId: string | null; result: 'win' | 'loss' | 'draw'; kind: Round['kind'] };
export type TournamentSummary = Tournament & { record: ReturnType<typeof computeRecord>; matches: MatchSummary[] };

const owned = (id: string, ownerId: string) =>
  and(eq(tournaments.id, id), eq(tournaments.ownerId, ownerId));

async function requireOwned(db: DB, ownerId: string, id: string): Promise<Tournament> {
  const [row] = await db.select().from(tournaments).where(owned(id, ownerId)).limit(1);
  if (!row) throw new NotFoundError('Tournament not found');
  return row;
}

export async function createTournament(db: DB, ownerId: string, input: CreateTournamentInput): Promise<Tournament> {
  const [row] = await db.insert(tournaments)
    .values({
      ownerId, type: input.type,
      myLeaderId: input.myLeaderId,
      metaId: input.metaId ?? null,
      name: input.name ?? null, playedOn: input.playedOn, status: 'draft',
    })
    .returning();
  return row;
}

export async function listTournaments(db: DB, ownerId: string): Promise<TournamentSummary[]> {
  const ts = await db.select().from(tournaments)
    .where(eq(tournaments.ownerId, ownerId))
    .orderBy(desc(tournaments.playedOn), desc(tournaments.createdAt));
  const allRounds = await db.select().from(rounds);
  const byTournament = new Map<string, Round[]>();
  for (const r of allRounds) {
    const list = byTournament.get(r.tournamentId) ?? [];
    list.push(r);
    byTournament.set(r.tournamentId, list);
  }
  return ts.map((t) => {
    const rs = (byTournament.get(t.id) ?? []).slice().sort((a, b) => a.roundNumber - b.roundNumber);
    const matches: MatchSummary[] = rs.map((r) => ({ opponentLeaderId: r.opponentLeaderId, result: r.result, kind: r.kind }));
    return { ...t, record: computeRecord(rs), matches };
  });
}

export async function getTournament(db: DB, ownerId: string, id: string): Promise<Tournament & { rounds: Round[] }> {
  const t = await requireOwned(db, ownerId, id);
  const rs = await db.select().from(rounds)
    .where(eq(rounds.tournamentId, id))
    .orderBy(rounds.roundNumber);
  return { ...t, rounds: rs };
}

export async function updateTournament(db: DB, ownerId: string, id: string, input: UpdateTournamentInput): Promise<Tournament> {
  await requireOwned(db, ownerId, id);
  const patch: Partial<typeof tournaments.$inferInsert> = { updatedAt: new Date() };
  if (input.type !== undefined) patch.type = input.type;
  if (input.myLeaderId !== undefined) patch.myLeaderId = input.myLeaderId;
  if (input.metaId !== undefined) patch.metaId = input.metaId;
  if (input.name !== undefined) patch.name = input.name;
  if (input.playedOn !== undefined) patch.playedOn = input.playedOn;
  const [row] = await db.update(tournaments).set(patch).where(owned(id, ownerId)).returning();
  return row;
}

export async function deleteTournament(db: DB, ownerId: string, id: string): Promise<void> {
  await requireOwned(db, ownerId, id);
  await db.delete(tournaments).where(owned(id, ownerId));
}

export async function finishTournament(db: DB, ownerId: string, id: string): Promise<Tournament> {
  await requireOwned(db, ownerId, id);
  const [row] = await db.update(tournaments)
    .set({ status: 'locked', updatedAt: new Date() })
    .where(owned(id, ownerId)).returning();
  return row;
}

export async function reopenTournament(db: DB, ownerId: string, id: string): Promise<Tournament> {
  await requireOwned(db, ownerId, id);
  const [row] = await db.update(tournaments)
    .set({ status: 'draft', updatedAt: new Date() })
    .where(owned(id, ownerId)).returning();
  return row;
}
