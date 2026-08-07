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
  // the intermediate state, so it does not need to be described.
  const createAt = findCreate(queue, op.tournamentId);
  if (createAt !== -1) {
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
  if (createAt !== -1) {
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
