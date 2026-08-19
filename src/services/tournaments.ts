import { and, eq, desc } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { tournaments, rounds } from '../db/schema';
import { computeRecord, computeDeckCount } from '../lib/record';
import { NotFoundError, ConflictError, ValidationError } from '../lib/errors';
import type { CreateTournamentInput, UpdateTournamentInput } from '../lib/validation/tournament';
import { isFreeplay } from '../lib/tournament-kinds';

type DB = NodePgDatabase<typeof schema>;
export type Tournament = typeof tournaments.$inferSelect;
export type Round = typeof rounds.$inferSelect;
type MatchSummary = { opponentLeaderId: string | null; result: 'win' | 'loss' | 'draw'; kind: Round['kind']; playOrder: Round['playOrder'] };
export type TournamentSummary = Tournament & {
  record: ReturnType<typeof computeRecord>;
  matches: MatchSummary[];
  /** Distinct leaders played across the session's rounds; 0 for classic types. */
  deckCount: number;
};

const owned = (id: string, ownerId: string) =>
  and(eq(tournaments.id, id), eq(tournaments.ownerId, ownerId));

async function requireOwned(db: DB, ownerId: string, id: string): Promise<Tournament> {
  const [row] = await db.select().from(tournaments).where(owned(id, ownerId)).limit(1);
  if (!row) throw new NotFoundError('Tournament not found');
  return row;
}

export async function createTournament(db: DB, ownerId: string, input: CreateTournamentInput): Promise<Tournament> {
  // Exactly one leader source per session: freeplay records the leader per
  // round instead and has none of its own; every other type requires one.
  // The zod schema carries the same rule for callers that go through it (the
  // API route), but this service is also called directly (e.g. from tests),
  // so it must enforce the rule itself too.
  if (isFreeplay(input.type) && input.myLeaderId !== undefined) {
    throw new ValidationError('A freeplay session has no leader of its own.');
  }
  if (!isFreeplay(input.type) && input.myLeaderId === undefined) {
    throw new ValidationError('Choose your leader.');
  }
  // A client-supplied id makes the create idempotent: replaying a queued
  // offline create whose response was lost returns the existing row instead of
  // inserting a duplicate.
  if (input.id) {
    const [existing] = await db.select().from(tournaments).where(eq(tournaments.id, input.id)).limit(1);
    if (existing) {
      if (existing.ownerId !== ownerId) throw new ConflictError('That id is already in use');
      return existing;
    }
  }
  const [row] = await db.insert(tournaments)
    .values({
      ...(input.id ? { id: input.id } : {}),
      ownerId, type: input.type,
      myLeaderId: input.myLeaderId ?? null,
      metaId: input.metaId ?? null,
      name: input.name ?? null, notes: input.notes ?? null,
      placement: input.placement ?? null, fieldSize: input.fieldSize ?? null,
      playedOn: input.playedOn, status: 'draft',
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
    const matches: MatchSummary[] = rs.map((r) => ({ opponentLeaderId: r.opponentLeaderId, result: r.result, kind: r.kind, playOrder: r.playOrder }));
    return { ...t, record: computeRecord(rs), matches, deckCount: computeDeckCount(rs) };
  });
}

export async function getTournament(db: DB, ownerId: string, id: string): Promise<Tournament & { rounds: Round[]; deckCount: number }> {
  const t = await requireOwned(db, ownerId, id);
  const rs = await db.select().from(rounds)
    .where(eq(rounds.tournamentId, id))
    .orderBy(rounds.roundNumber);
  return { ...t, rounds: rs, deckCount: computeDeckCount(rs) };
}

export async function updateTournament(db: DB, ownerId: string, id: string, input: UpdateTournamentInput): Promise<Tournament> {
  const current = await requireOwned(db, ownerId, id);
  // The leader invariant cannot survive a type switch: going to freeplay would
  // orphan the session leader, and leaving it would leave rounds owning leaders
  // the tournament should own.
  if (input.type !== undefined && isFreeplay(input.type) !== isFreeplay(current.type)) {
    throw new ValidationError('A session cannot be changed into or out of freeplay.');
  }
  // Same shape, different invariant: a match holds exactly one round, so a
  // five-round tournament cannot become one without silently orphaning four —
  // and a match becoming a tournament would claim an event that never happened.
  if (input.type !== undefined && (input.type === 'match') !== (current.type === 'match')) {
    throw new ValidationError('A match cannot be changed into a tournament, or a tournament into a match.');
  }
  // Also guard the type-omitted case: a patch that only touches myLeaderId
  // still has to respect an already-freeplay tournament having no leader of
  // its own — this is the same one-leader-per-session rule, just reached
  // without a type change. (A freeplay tournament's own myLeaderId is always
  // already null, so an explicit `null` here is a no-op, not a violation.)
  if (isFreeplay(current.type) && input.myLeaderId !== undefined && input.myLeaderId !== null) {
    throw new ValidationError('A freeplay session has no leader of its own.');
  }
  const patch: Partial<typeof tournaments.$inferInsert> = { updatedAt: new Date() };
  if (input.type !== undefined) patch.type = input.type;
  if (input.myLeaderId !== undefined) patch.myLeaderId = input.myLeaderId;
  if (input.metaId !== undefined) patch.metaId = input.metaId;
  if (input.name !== undefined) patch.name = input.name;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.placement !== undefined) patch.placement = input.placement;
  if (input.fieldSize !== undefined) patch.fieldSize = input.fieldSize;
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
