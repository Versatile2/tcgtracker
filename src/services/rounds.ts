import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { tournaments, rounds } from '../db/schema';
import { NotFoundError, ConflictError, ValidationError } from '../lib/errors';
import type { CreateRoundInput, UpdateRoundInput } from '../lib/validation/round';
import { roundFieldsFromInput as valuesForKind } from '../lib/round-values';

type DB = NodePgDatabase<typeof schema>;
export type Round = typeof rounds.$inferSelect;

async function requireEditableTournament(db: DB, ownerId: string, tournamentId: string) {
  const [t] = await db.select().from(tournaments)
    .where(and(eq(tournaments.id, tournamentId), eq(tournaments.ownerId, ownerId)))
    .limit(1);
  if (!t) throw new NotFoundError('Tournament not found');
  if (t.status === 'locked') throw new ConflictError('Tournament is locked — reopen it to edit');
  return t;
}

async function requireOwnedRound(db: DB, ownerId: string, roundId: string) {
  const [row] = await db.select({ round: rounds, tournament: tournaments })
    .from(rounds)
    .innerJoin(tournaments, eq(rounds.tournamentId, tournaments.id))
    .where(and(eq(rounds.id, roundId), eq(tournaments.ownerId, ownerId)))
    .limit(1);
  if (!row) throw new NotFoundError('Round not found');
  if (row.tournament.status === 'locked') throw new ConflictError('Tournament is locked — reopen it to edit');
  return row;
}

// Exactly one leader source per real game: the session owns it for classic
// tournaments, the round owns it for freeplay. Byes / no-shows are exempt —
// they are not games and feed no statistic.
function assertLeaderInvariant(tournament: typeof tournaments.$inferSelect, input: CreateRoundInput | UpdateRoundInput) {
  if (input.kind === 'swiss' || input.kind === 'top_cut') {
    const isFreeplay = tournament.type === 'freeplay';
    if (isFreeplay && !input.myLeaderId) {
      throw new ValidationError('Choose which deck you played this round.');
    }
    if (!isFreeplay && input.myLeaderId) {
      throw new ValidationError('Only a freeplay round records its own leader.');
    }
  }
}

export async function addRound(db: DB, ownerId: string, tournamentId: string, input: CreateRoundInput): Promise<Round> {
  // A client-supplied id makes the create idempotent, so replaying a queued
  // offline round whose response was lost returns the row already stored rather
  // than logging the match twice. Checked before the editable guard: a replay of
  // an already-applied create must still succeed even if the tournament has
  // since been locked.
  if (input.id) {
    const [existing] = await db.select({ round: rounds, ownerId: tournaments.ownerId })
      .from(rounds)
      .innerJoin(tournaments, eq(rounds.tournamentId, tournaments.id))
      .where(eq(rounds.id, input.id))
      .limit(1);
    if (existing) {
      if (existing.ownerId !== ownerId) throw new ConflictError('That id is already in use');
      return existing.round;
    }
  }
  const tournament = await requireEditableTournament(db, ownerId, tournamentId);
  assertLeaderInvariant(tournament, input);
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${rounds.roundNumber}), 0)` })
    .from(rounds).where(eq(rounds.tournamentId, tournamentId));
  const [row] = await db.insert(rounds).values({
    ...(input.id ? { id: input.id } : {}),
    tournamentId,
    roundNumber: Number(max) + 1,
    ...valuesForKind(input),
  }).returning();
  return row;
}

export async function updateRound(db: DB, ownerId: string, roundId: string, input: UpdateRoundInput): Promise<Round> {
  const { tournament } = await requireOwnedRound(db, ownerId, roundId);
  assertLeaderInvariant(tournament, input);
  // The form resubmits a complete payload, so an edit fully replaces the round's
  // fields for its kind (keeping tournamentId / roundNumber).
  const [row] = await db.update(rounds)
    .set({ ...valuesForKind(input), updatedAt: new Date() })
    .where(eq(rounds.id, roundId))
    .returning();
  return row;
}

export async function deleteRound(db: DB, ownerId: string, roundId: string): Promise<void> {
  const { round } = await requireOwnedRound(db, ownerId, roundId);
  await db.transaction(async (tx) => {
    await tx.delete(rounds).where(eq(rounds.id, roundId));
    const remaining = await tx.select().from(rounds)
      .where(eq(rounds.tournamentId, round.tournamentId))
      .orderBy(rounds.roundNumber);
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].roundNumber !== i + 1) {
        await tx.update(rounds).set({ roundNumber: i + 1 }).where(eq(rounds.id, remaining[i].id));
      }
    }
  });
}
