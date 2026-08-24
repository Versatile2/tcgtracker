import { and, eq, inArray, desc } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { tournaments, rounds } from '../db/schema';
import { computeRecord, computeDeckCount } from '../lib/record';
import { NotFoundError, ConflictError, ValidationError } from '../lib/errors';
import type { CreateTournamentInput, UpdateTournamentInput, ConvertTournamentInput } from '../lib/validation/tournament';
import { isSession, MATCH_TYPE } from '../lib/tournament-kinds';

// Byes and no-shows are not games and carry no leader in either segment —
// only these two kinds are ever candidates to gain or lose one.
const GAME_KINDS = ['swiss', 'top_cut'] as const;

type DB = NodePgDatabase<typeof schema>;
export type Tournament = typeof tournaments.$inferSelect;
export type Round = typeof rounds.$inferSelect;
/**
 * The per-round facts the client needs without fetching each tournament.
 *
 * `myLeaderId` and `opponentMetaId` are here for the statistics module, which
 * computes every breakdown from this list rather than from the server: a session
 * records its deck per round, so its colours cannot be attributed without the
 * first, and the meta resolves as coalesce(round, tournament), so a session or a
 * free play carrying its own meta needs the second.
 */
type MatchSummary = {
  opponentLeaderId: string | null;
  myLeaderId: string | null;
  opponentMetaId: string | null;
  result: 'win' | 'loss' | 'draw';
  kind: Round['kind'];
  playOrder: Round['playOrder'];
};
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
  // Exactly one leader source per session: session records the leader per
  // round instead and has none of its own; every other type requires one.
  // The zod schema carries the same rule for callers that go through it (the
  // API route), but this service is also called directly (e.g. from tests),
  // so it must enforce the rule itself too.
  if (isSession(input.type) && input.myLeaderId !== undefined) {
    throw new ValidationError('A session has no leader of its own.');
  }
  if (!isSession(input.type) && input.myLeaderId === undefined) {
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
    const matches: MatchSummary[] = rs.map((r) => ({
      opponentLeaderId: r.opponentLeaderId,
      myLeaderId: r.myLeaderId,
      opponentMetaId: r.opponentMetaId,
      result: r.result,
      kind: r.kind,
      playOrder: r.playOrder,
    }));
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
  // The leader invariant cannot survive a type switch: going to session would
  // orphan the session leader, and leaving it would leave rounds owning leaders
  // the tournament should own.
  if (input.type !== undefined && isSession(input.type) !== isSession(current.type)) {
    throw new ValidationError('A session cannot be changed into or out of session.');
  }
  // Same shape, different invariant: a match holds exactly one round, so a
  // five-round tournament cannot become one without silently orphaning four —
  // and a match becoming a tournament would claim an event that never happened.
  if (input.type !== undefined && (input.type === 'match') !== (current.type === 'match')) {
    throw new ValidationError('A match cannot be changed into a tournament, or a tournament into a match.');
  }
  // Also guard the type-omitted case: a patch that only touches myLeaderId
  // still has to respect an already-session tournament having no leader of
  // its own — this is the same one-leader-per-session rule, just reached
  // without a type change. (A session tournament's own myLeaderId is always
  // already null, so an explicit `null` here is a no-op, not a violation.)
  if (isSession(current.type) && input.myLeaderId !== undefined && input.myLeaderId !== null) {
    throw new ValidationError('A session has no leader of its own.');
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

/**
 * Moves an event across the session boundary, carrying its leader with it.
 *
 * This is the reshape migration 0011 performs in SQL, as an action: a
 * tournament owns one leader for the whole event, a session owns one per round,
 * and changing the type without moving the leader would leave the row in a
 * shape no query can read. That is why `updateTournament` refuses the same
 * change — a field edit must not silently rewrite two tables.
 *
 * The reverse direction is only offered when it is lossless. Two different
 * decks cannot collapse into one leader without discarding what was played, so
 * the caller is refused rather than asked to choose which round to lose.
 */
export async function convertTournamentType(
  db: DB, ownerId: string, id: string, input: ConvertTournamentInput,
): Promise<Tournament> {
  const current = await requireOwned(db, ownerId, id);
  if (current.type === MATCH_TYPE || input.type === MATCH_TYPE) {
    throw new ValidationError('A match cannot be converted.');
  }
  // A replayed offline convert whose response never made it back: the POST
  // already committed, the outbox retries on the lost response, and the
  // replay lands here with the row already on the destination type. Every
  // other op in this service treats that as success (see createTournament,
  // addRound) rather than a caller error, so convert has to as well — the
  // alternative is classifyFailure treating the 400 as permanent and
  // discarding the entry while the screen already shows the conversion done.
  if (current.type === input.type) {
    return current;
  }
  // Not a conversion at all — the caller wants updateTournament.
  if (isSession(input.type) === isSession(current.type)) {
    throw new ValidationError('That type is already on the same side of session.');
  }

  // The leader lives in exactly one of two places — the tournament row or its
  // rounds — for the length of this function, and the two writes below move it
  // from one to the other. A crash between them (or a replayed outbox op that
  // reads a half-applied state) would leave it in neither: rounds cleared, row
  // still reading as the old segment, with nothing left to promote or push
  // back down. One transaction makes that state unreachable — a replay always
  // sees either the pre- or the post-conversion row, never a state in between.
  return db.transaction(async (tx) => {
    const rs = await tx.select().from(rounds).where(eq(rounds.tournamentId, id));
    const games = rs.filter((r) => r.kind === 'swiss' || r.kind === 'top_cut');
    const patch: Partial<typeof tournaments.$inferInsert> = { type: input.type, updatedAt: new Date() };

    if (isSession(input.type)) {
      // Down onto the games, off the session. `current.myLeaderId` is always set
      // here — a non-session tournament cannot exist without one — but the guard
      // keeps this branch honest if that ever stops being true.
      if (current.myLeaderId) {
        await tx.update(rounds)
          .set({ myLeaderId: current.myLeaderId, updatedAt: new Date() })
          .where(and(eq(rounds.tournamentId, id), inArray(rounds.kind, GAME_KINDS)));
      }
      patch.myLeaderId = null;
    } else {
      const decks = computeDeckCount(games);
      if (decks > 1) {
        throw new ValidationError('This session played more than one deck, so it cannot become a tournament.');
      }
      // Zero decks means no games to promote from — either no rounds at all, or
      // every round is a bye/no-show — so the offered leader is the only source.
      const promoted = games.find((r) => r.myLeaderId !== null)?.myLeaderId ?? input.myLeaderId ?? null;
      if (!promoted) throw new ValidationError('Choose the leader this tournament was played with.');
      patch.myLeaderId = promoted;
      await tx.update(rounds)
        .set({ myLeaderId: null, updatedAt: new Date() })
        .where(and(eq(rounds.tournamentId, id), inArray(rounds.kind, GAME_KINDS)));
    }

    const [row] = await tx.update(tournaments).set(patch).where(owned(id, ownerId)).returning();
    return row;
  });
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
