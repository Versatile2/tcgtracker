import type { CreateTournamentPayload, OutboxEntry, OutboxOp } from './types';
import { isRoundOp } from './types';

/**
 * Enqueue a pending write, collapsing ops that the queue can prove are
 * redundant. Coalescing is not just an optimization: replaying "create round,
 * edit it twice, delete it" against the server does four round trips to reach a
 * state that is simply "nothing happened", and each of those is a chance to
 * fail on a flaky venue connection.
 *
 * Relative order is otherwise preserved — the flusher depends on it (a
 * tournament must be created before its rounds can be attached).
 */
export function enqueue(queue: OutboxEntry[], entry: OutboxEntry): OutboxEntry[] {
  const { op } = entry;

  switch (op.kind) {
    case 'tournament.update':
      return mergeTournamentUpdate(queue, entry, op);
    case 'tournament.delete':
      return applyTournamentDelete(queue, entry, op.tournamentId);
    case 'tournament.finish':
    case 'tournament.reopen':
      // Only the final state matters; drop earlier status flips for this one.
      return [...queue.filter((e) => !(isStatusOp(e.op) && e.op.tournamentId === op.tournamentId)), entry];
    case 'tournament.convert':
      // Deliberately NOT collapsed, unlike finish/reopen above. A convert is not
      // a pure "set this field" op: the server reads the tournament's *current*
      // type and its rounds' *current* leaders to decide what to move where, and
      // it refuses to run at all when the destination is already on the same
      // side of session the tournament is already on. Two converts for the same
      // tournament can only ever alternate sides (session -> non-session ->
      // session, ...), so dropping the earlier one and keeping only the last —
      // the finish/reopen trick — would replay the survivor against a state it
      // was never actually issued against: either its own side-of-session guard
      // rejects it outright (net effect lands back on the side the tournament
      // started on), or, if it doesn't reject, it recomputes the leader move from
      // rounds that the dropped op never touched, silently losing a leader. The
      // queue has no record of what the type was *before* the earlier convert —
      // the op only carries the destination — so there is no way to compute an
      // equivalent single op here even in principle. Every convert is kept and
      // replayed in order; the cost is a few extra round trips for the rare case
      // of repeated offline conversions, not a corrupted or rejected write.
      return [...queue, entry];
    case 'round.update':
      return mergeRoundUpdate(queue, entry, op);
    case 'round.delete':
      return applyRoundDelete(queue, entry, op.roundId);
    default:
      return [...queue, entry];
  }
}

const isStatusOp = (op: OutboxOp) => op.kind === 'tournament.finish' || op.kind === 'tournament.reopen';

const findCreate = (queue: OutboxEntry[], tournamentId: string) =>
  queue.findIndex((e) => e.op.kind === 'tournament.create' && e.op.tournamentId === tournamentId);

const findRoundCreate = (queue: OutboxEntry[], roundId: string) =>
  queue.findIndex((e) => e.op.kind === 'round.create' && e.op.roundId === roundId);

/**
 * True when a queued `tournament.convert` for this tournament sits somewhere
 * after `at` — position-relative, not "anywhere in the queue". `at` is always
 * the index of the create the caller is about to fold into, so what this
 * asks is: does anything between that create and the tail cross the
 * session boundary? A create's payload — or a round create's payload — only
 * makes sense for the leader segment the tournament was in at the point it
 * was authored: a session round carries its own leader, a classic one must
 * not. If a convert sits between the create and the edit being folded, the
 * two were authored on opposite sides of the boundary and folding would carry
 * the edit's leader shape back to a spot that predates the convert that made
 * it valid. If no convert sits between them — e.g. a round created *after* an
 * already-queued convert, then edited again — both were authored on the same
 * (post-convert) side, and folding is exactly as safe as it always was; the
 * round.create not being first for its tournament id doesn't matter, only
 * where it sits relative to the convert. Declining to fold and appending
 * instead keeps every payload's leader shape valid for the segment it was
 * actually written against.
 */
function convertQueuedAfter(queue: OutboxEntry[], at: number, tournamentId: string): boolean {
  return queue
    .slice(at + 1)
    .some((e) => e.op.kind === 'tournament.convert' && e.op.tournamentId === tournamentId);
}

type Defined<T> = { [K in keyof T]?: Exclude<T[K], null> };

/** Drop keys explicitly set to null: patches may clear a field, creates may not. */
function withoutNulls<T extends object>(patch: T): Defined<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== null)) as Defined<T>;
}

function mergeTournamentUpdate(
  queue: OutboxEntry[],
  entry: OutboxEntry,
  op: Extract<OutboxOp, { kind: 'tournament.update' }>
): OutboxEntry[] {
  // Fold into the create that has not been sent yet — the server will never see
  // the intermediate state, so it does not need to be described. Not when a
  // convert for this tournament is already queued after the create, though —
  // see convertQueuedAfter.
  const createAt = findCreate(queue, op.tournamentId);
  if (createAt !== -1 && !convertQueuedAfter(queue, createAt, op.tournamentId)) {
    const create = queue[createAt].op as Extract<OutboxOp, { kind: 'tournament.create' }>;
    const payload: CreateTournamentPayload = { ...create.payload, ...withoutNulls(op.payload) };
    return queue.with(createAt, { ...queue[createAt], op: { ...create, payload } });
  }
  // Otherwise fold into an immediately preceding update, which is the common
  // case when a field is edited a few times in a row.
  const last = queue.at(-1);
  if (last && last.op.kind === 'tournament.update' && last.op.tournamentId === op.tournamentId) {
    const payload = { ...last.op.payload, ...op.payload };
    return queue.with(queue.length - 1, { ...last, op: { ...last.op, payload } });
  }
  return [...queue, entry];
}

function applyTournamentDelete(queue: OutboxEntry[], entry: OutboxEntry, tournamentId: string): OutboxEntry[] {
  const neverSynced = findCreate(queue, tournamentId) !== -1;
  const rest = queue.filter((e) => e.op.tournamentId !== tournamentId);
  // If the create is still queued the tournament only ever existed on this
  // device, so there is nothing on the server to delete.
  return neverSynced ? rest : [...rest, entry];
}

function mergeRoundUpdate(
  queue: OutboxEntry[],
  entry: OutboxEntry,
  op: Extract<OutboxOp, { kind: 'round.update' }>
): OutboxEntry[] {
  const createAt = findRoundCreate(queue, op.roundId);
  // Not when a convert for this round's tournament is already queued after the
  // create — see convertQueuedAfter. The round op carries tournamentId for
  // exactly this check, even though delivery only needs roundId.
  if (createAt !== -1 && !convertQueuedAfter(queue, createAt, op.tournamentId)) {
    const create = queue[createAt].op as Extract<OutboxOp, { kind: 'round.create' }>;
    // A round edit resubmits the whole round, so the patch replaces the queued
    // create's payload outright; only the id has to survive.
    const payload = { ...op.payload, id: create.payload.id };
    return queue.with(createAt, { ...queue[createAt], op: { ...create, payload } });
  }
  const last = queue.at(-1);
  if (last && last.op.kind === 'round.update' && last.op.roundId === op.roundId) {
    return queue.with(queue.length - 1, entry);
  }
  return [...queue, entry];
}

function applyRoundDelete(queue: OutboxEntry[], entry: OutboxEntry, roundId: string): OutboxEntry[] {
  const neverSynced = findRoundCreate(queue, roundId) !== -1;
  const rest = queue.filter((e) => !(isRoundOp(e.op) && e.op.roundId === roundId));
  return neverSynced ? rest : [...rest, entry];
}
