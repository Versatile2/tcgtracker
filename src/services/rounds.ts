import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { tournaments, rounds } from '../db/schema';
import { NotFoundError, ConflictError } from '../lib/errors';
import type { CreateRoundInput, UpdateRoundInput } from '../lib/validation/round';

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
  const [row] = await db.select({ round: rounds, status: tournaments.status })
    .from(rounds)
    .innerJoin(tournaments, eq(rounds.tournamentId, tournaments.id))
    .where(and(eq(rounds.id, roundId), eq(tournaments.ownerId, ownerId)))
    .limit(1);
  if (!row) throw new NotFoundError('Round not found');
  if (row.status === 'locked') throw new ConflictError('Tournament is locked — reopen it to edit');
  return row.round;
}

export async function addRound(db: DB, ownerId: string, tournamentId: string, input: CreateRoundInput): Promise<Round> {
  await requireEditableTournament(db, ownerId, tournamentId);
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${rounds.roundNumber}), 0)` })
    .from(rounds).where(eq(rounds.tournamentId, tournamentId));
  const [row] = await db.insert(rounds).values({
    tournamentId,
    roundNumber: Number(max) + 1,
    opponentLeaderId: input.opponentLeaderId,
    result: input.result,
    playOrder: input.playOrder ?? null,
    notes: input.notes ?? null,
  }).returning();
  return row;
}

export async function updateRound(db: DB, ownerId: string, roundId: string, input: UpdateRoundInput): Promise<Round> {
  await requireOwnedRound(db, ownerId, roundId);
  const patch: Partial<typeof rounds.$inferInsert> = { updatedAt: new Date() };
  if (input.opponentLeaderId !== undefined) patch.opponentLeaderId = input.opponentLeaderId;
  if (input.result !== undefined) patch.result = input.result;
  if (input.playOrder !== undefined) patch.playOrder = input.playOrder;
  if (input.notes !== undefined) patch.notes = input.notes;
  const [row] = await db.update(rounds).set(patch).where(eq(rounds.id, roundId)).returning();
  return row;
}

export async function deleteRound(db: DB, ownerId: string, roundId: string): Promise<void> {
  const round = await requireOwnedRound(db, ownerId, roundId);
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
