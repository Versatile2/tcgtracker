// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-client';
import { enqueue } from './coalesce';
import { readOutbox, writeOutbox, resetOutboxCache } from './storage';
import { runFlush } from './use-outbox';
import type { OutboxEntry, OutboxOp } from './types';

const calls: string[] = [];
let createTournament = vi.fn(async () => {});
let addRound = vi.fn(async () => {});

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    apiClient: {
      createTournament: (...a: unknown[]) => { calls.push('createTournament'); return createTournament(...(a as [])); },
      addRound: (...a: unknown[]) => { calls.push('addRound'); return addRound(...(a as [])); },
      finishTournament: async () => { calls.push('finishTournament'); },
    },
  };
});

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const T = '11111111-1111-4111-8111-111111111111';
const LEADER = '55555555-5555-4555-8555-555555555555';
const roundId = (n: number) => `3333333${n}-3333-4333-8333-333333333333`;

const createTournamentOp: OutboxOp = {
  kind: 'tournament.create',
  tournamentId: T,
  payload: { id: T, type: 'local', myLeaderId: LEADER, playedOn: '2026-08-07' },
};
const addRoundOp = (n: number): OutboxOp => ({
  kind: 'round.create',
  tournamentId: T,
  roundId: roundId(n),
  payload: { id: roundId(n), kind: 'swiss', opponentLeaderId: LEADER, result: 'win' },
});

let seq = 0;
function push(op: OutboxOp) {
  const entry: OutboxEntry = { opId: `op-${++seq}`, createdAt: Date.now(), attempts: 0, op };
  writeOutbox(enqueue(readOutbox(), entry));
}

/** What a player does at a venue with no signal: start an event, log rounds, lock it. */
function logAnEventOffline() {
  push(createTournamentOp);
  push(addRoundOp(1));
  push(addRoundOp(2));
  push({ kind: 'tournament.finish', tournamentId: T });
}

let qc: QueryClient;

beforeEach(() => {
  window.localStorage.clear();
  resetOutboxCache();
  calls.length = 0;
  seq = 0;
  createTournament = vi.fn(async () => {});
  addRound = vi.fn(async () => {});
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});

describe('offline logging round trip', () => {
  it('holds a whole event in the queue while offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    logAnEventOffline();
    expect(readOutbox()).toHaveLength(4);
    // Persisted, so backgrounding the PWA between matches cannot lose it.
    resetOutboxCache();
    expect(readOutbox()).toHaveLength(4);
  });

  it('sends nothing while offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    logAnEventOffline();
    await runFlush(qc);
    expect(calls).toEqual([]);
    expect(readOutbox()).toHaveLength(4);
  });

  it('delivers the event in order once back online, exactly once', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    logAnEventOffline();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);

    await runFlush(qc);

    expect(calls).toEqual(['createTournament', 'addRound', 'addRound', 'finishTournament']);
    expect(readOutbox()).toEqual([]);
  });

  it('refetches only after the queue has drained', async () => {
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    createTournament = vi.fn(async () => {
      // A refetch here would overwrite optimistic rounds not yet sent.
      expect(invalidate).not.toHaveBeenCalled();
    });
    logAnEventOffline();
    await runFlush(qc);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('keeps the tournament queued when its create cannot be delivered', async () => {
    createTournament = vi.fn(async () => { throw new ApiError(503, 'down'); });
    logAnEventOffline();
    await runFlush(qc);
    // The rounds must not be sent ahead of the tournament they belong to.
    expect(calls).toEqual(['createTournament']);
    expect(readOutbox()).toHaveLength(4);
    expect(readOutbox()[0].attempts).toBe(1);
  });

  it('resumes from where it stopped on the next attempt', async () => {
    createTournament = vi.fn(async () => { throw new ApiError(503, 'down'); });
    logAnEventOffline();
    await runFlush(qc);

    createTournament = vi.fn(async () => {});
    await runFlush(qc);
    expect(calls).toEqual(['createTournament', 'createTournament', 'addRound', 'addRound', 'finishTournament']);
    expect(readOutbox()).toEqual([]);
  });

  it('does not lose a round logged while the queue is draining', async () => {
    let resolveCreate!: () => void;
    createTournament = vi.fn(() => new Promise<void>((r) => { resolveCreate = () => r(); }));
    push(createTournamentOp);

    const flushing = runFlush(qc);
    await Promise.resolve();
    push(addRoundOp(9)); // player logs the next match mid-sync
    resolveCreate();
    await flushing;

    expect(calls).toContain('addRound');
    expect(readOutbox()).toEqual([]);
  });

  it('is a no-op when there is nothing queued', async () => {
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    await runFlush(qc);
    expect(calls).toEqual([]);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
