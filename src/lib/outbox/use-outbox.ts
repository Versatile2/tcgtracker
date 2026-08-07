'use client';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { isOnline, useOnlineStatus } from '@/lib/use-online-status';
import { enqueue } from './coalesce';
import { executeOp, flushOutbox } from './flush';
import {
  getOutboxServerSnapshot, getOutboxSnapshot, readOutbox, subscribeOutbox, writeOutbox,
} from './storage';
import { MAX_QUIET_ATTEMPTS, type OutboxEntry, type OutboxOp } from './types';

export type SyncPhase = 'idle' | 'syncing' | 'synced';

let phase: SyncPhase = 'idle';
const phaseListeners = new Set<() => void>();
let syncedTimer: ReturnType<typeof setTimeout> | undefined;

function setPhase(next: SyncPhase) {
  if (phase === next) return;
  phase = next;
  for (const notify of phaseListeners) notify();
}

const subscribePhase = (notify: () => void) => {
  phaseListeners.add(notify);
  return () => {
    phaseListeners.delete(notify);
  };
};
const getPhase = () => phase;
const getServerPhase = (): SyncPhase => 'idle';

// One drain at a time, process-wide: every screen mounts the hook, and parallel
// drains would race on the same queue.
let draining = false;
let drainAgain = false;

/**
 * Remove the entries this drain settled while preserving anything the user
 * enqueued mid-flight — a player keeps logging rounds while the queue is
 * catching up, and those writes must not be clobbered by a stale snapshot.
 */
function reconcile(attempted: OutboxEntry[], remaining: OutboxEntry[]): OutboxEntry[] {
  const stillQueued = new Map(remaining.map((e) => [e.opId, e]));
  const attemptedIds = new Set(attempted.map((e) => e.opId));
  return readOutbox()
    .filter((e) => !attemptedIds.has(e.opId) || stillQueued.has(e.opId))
    .map((e) => stillQueued.get(e.opId) ?? e);
}

export async function runFlush(qc: QueryClient): Promise<void> {
  if (draining) {
    drainAgain = true;
    return;
  }
  if (!isOnline() || readOutbox().length === 0) return;

  draining = true;
  setPhase('syncing');
  let sentTotal = 0;
  const failures: string[] = [];

  try {
    do {
      drainAgain = false;
      const attempted = readOutbox();
      if (attempted.length === 0) break;
      const result = await flushOutbox(attempted, executeOp);
      writeOutbox(reconcile(attempted, result.remaining));
      sentTotal += result.sent;
      failures.push(...result.failed.map((f) => f.message));
      if (result.remaining.length > 0) break; // stuck on a retryable failure
    } while (drainAgain);
  } finally {
    draining = false;
  }

  if (sentTotal > 0) {
    // Refetch only after the queue has drained, so a server response can never
    // overwrite an optimistic change that has not been sent yet.
    await qc.invalidateQueries();
    setPhase('synced');
    clearTimeout(syncedTimer);
    syncedTimer = setTimeout(() => setPhase('idle'), 2500);
  } else {
    setPhase('idle');
  }

  if (failures.length > 0) {
    toast.error(
      failures.length === 1
        ? `A change couldn't be saved: ${failures[0]}`
        : `${failures.length} changes couldn't be saved`
    );
  }
}

export function useOutbox() {
  const qc = useQueryClient();
  const entries = useSyncExternalStore(subscribeOutbox, getOutboxSnapshot, getOutboxServerSnapshot);
  const syncPhase = useSyncExternalStore(subscribePhase, getPhase, getServerPhase);
  const online = useOnlineStatus();

  const flush = useCallback(() => runFlush(qc), [qc]);

  // Drains on mount and whenever connectivity returns.
  useEffect(() => {
    if (online) void flush();
  }, [online, flush]);

  const push = useCallback(
    (op: OutboxOp) => {
      const entry: OutboxEntry = {
        opId: crypto.randomUUID(),
        createdAt: Date.now(),
        attempts: 0,
        op,
      };
      writeOutbox(enqueue(readOutbox(), entry));
      void flush();
    },
    [flush]
  );

  return {
    entries,
    pending: entries.length,
    stuck: entries.length > 0 && entries[0].attempts >= MAX_QUIET_ATTEMPTS,
    phase: syncPhase,
    online,
    push,
    flush,
  };
}

/** Ids of rounds that have not reached the server yet. */
export function pendingRoundIds(entries: OutboxEntry[]): Set<string> {
  const ids = new Set<string>();
  for (const e of entries) if (e.op.kind === 'round.create') ids.add(e.op.roundId);
  return ids;
}

/** Ids of tournaments with any unsynced change. */
export function pendingTournamentIds(entries: OutboxEntry[]): Set<string> {
  return new Set(entries.map((e) => e.op.tournamentId));
}
