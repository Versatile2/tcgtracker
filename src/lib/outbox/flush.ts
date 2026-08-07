import { ApiError, apiClient } from '@/lib/api-client';
import type { OutboxEntry, OutboxOp } from './types';

/** What to do with an op whose delivery threw. */
export type Failure = 'done' | 'retry' | 'permanent';

export type FlushResult = {
  /** Entries still to send, oldest first. */
  remaining: OutboxEntry[];
  sent: number;
  /** Ops the server refused outright; these are gone and the user is told. */
  failed: { entry: OutboxEntry; message: string }[];
};

export type OpExecutor = (op: OutboxOp) => Promise<unknown>;

export function classifyFailure(err: unknown, op: OutboxOp): Failure {
  if (!(err instanceof ApiError)) return 'retry'; // network/parse failure — the write is still valid
  // Deleting something the server no longer has achieves what the op asked for.
  if (err.status === 404 && op.kind.endsWith('.delete')) return 'done';
  // 401 usually means the session lapsed while the app sat in the background.
  // Retrying after Clerk refreshes is right; discarding a logged round is not.
  if (err.status === 401 || err.status === 408 || err.status === 429) return 'retry';
  if (err.status >= 500) return 'retry';
  return 'permanent';
}

/**
 * Drain the queue serially, oldest first, stopping at the first retryable
 * failure. Stopping matters: ops are order-dependent (a tournament must exist
 * before its rounds attach to it), so skipping past a stuck entry would apply
 * later writes on top of a state the server never reached.
 */
export async function flushOutbox(entries: OutboxEntry[], execute: OpExecutor): Promise<FlushResult> {
  const remaining = [...entries];
  const failed: FlushResult['failed'] = [];
  let sent = 0;

  while (remaining.length > 0) {
    const entry = remaining[0];
    try {
      await execute(entry.op);
      remaining.shift();
      sent++;
    } catch (err) {
      const verdict = classifyFailure(err, entry.op);
      if (verdict === 'done') {
        remaining.shift();
        sent++;
      } else if (verdict === 'permanent') {
        remaining.shift();
        failed.push({ entry, message: err instanceof Error ? err.message : 'Could not be saved' });
      } else {
        remaining[0] = { ...entry, attempts: entry.attempts + 1 };
        break;
      }
    }
  }

  return { remaining, sent, failed };
}

/** Deliver a single op to the REST API. */
export const executeOp: OpExecutor = (op) => {
  switch (op.kind) {
    case 'tournament.create': return apiClient.createTournament(op.payload);
    case 'tournament.update': return apiClient.updateTournament(op.tournamentId, op.payload);
    case 'tournament.delete': return apiClient.deleteTournament(op.tournamentId);
    case 'tournament.finish': return apiClient.finishTournament(op.tournamentId);
    case 'tournament.reopen': return apiClient.reopenTournament(op.tournamentId);
    case 'round.create': return apiClient.addRound(op.tournamentId, op.payload);
    case 'round.update': return apiClient.updateRound(op.roundId, op.payload);
    case 'round.delete': return apiClient.deleteRound(op.roundId);
  }
};
