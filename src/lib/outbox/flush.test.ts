import { describe, it, expect, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { classifyFailure, flushOutbox } from './flush';
import type { OutboxEntry, OutboxOp } from './types';

const T = '11111111-1111-4111-8111-111111111111';
const R = '33333333-3333-4333-8333-333333333333';
const LEADER = '55555555-5555-4555-8555-555555555555';

const createT: OutboxOp = {
  kind: 'tournament.create',
  tournamentId: T,
  payload: { id: T, type: 'local', myLeaderId: LEADER, playedOn: '2026-08-07' },
};
const finishT: OutboxOp = { kind: 'tournament.finish', tournamentId: T };
const deleteR: OutboxOp = { kind: 'round.delete', tournamentId: T, roundId: R };

let seq = 0;
const entry = (op: OutboxOp): OutboxEntry => ({ opId: `op-${++seq}`, createdAt: seq, attempts: 0, op });

describe('classifyFailure', () => {
  it('retries network errors', () => {
    expect(classifyFailure(new TypeError('Failed to fetch'), createT)).toBe('retry');
  });

  it('retries server errors', () => {
    expect(classifyFailure(new ApiError(500, 'boom'), createT)).toBe('retry');
    expect(classifyFailure(new ApiError(503, 'nope'), createT)).toBe('retry');
  });

  it('retries auth failures rather than discarding the write', () => {
    // A session that lapsed while the phone was in a pocket must not cost the
    // player the rounds they logged.
    expect(classifyFailure(new ApiError(401, 'Unauthorized'), createT)).toBe('retry');
  });

  it('gives up on requests the server will never accept', () => {
    expect(classifyFailure(new ApiError(400, 'Invalid input'), createT)).toBe('permanent');
    expect(classifyFailure(new ApiError(409, 'locked'), createT)).toBe('permanent');
  });

  it('treats a missing target as success when deleting', () => {
    expect(classifyFailure(new ApiError(404, 'Round not found'), deleteR)).toBe('done');
  });

  it('treats a missing target as permanent when not deleting', () => {
    expect(classifyFailure(new ApiError(404, 'Tournament not found'), finishT)).toBe('permanent');
  });
});

describe('flushOutbox', () => {
  it('sends entries oldest first and empties the queue', async () => {
    const seen: string[] = [];
    const execute = vi.fn(async (op: OutboxOp) => { seen.push(op.kind); });
    const result = await flushOutbox([entry(createT), entry(deleteR), entry(finishT)], execute);
    expect(seen).toEqual(['tournament.create', 'round.delete', 'tournament.finish']);
    expect(result.remaining).toEqual([]);
    expect(result.sent).toBe(3);
    expect(result.failed).toEqual([]);
  });

  it('waits for each op before starting the next', async () => {
    let inFlight = 0;
    let overlapped = false;
    const execute = async () => {
      if (inFlight > 0) overlapped = true;
      inFlight++;
      await Promise.resolve();
      inFlight--;
    };
    await flushOutbox([entry(createT), entry(deleteR), entry(finishT)], execute);
    expect(overlapped).toBe(false);
  });

  it('stops at the first retryable failure so ordering is never violated', async () => {
    const execute = vi.fn(async (op: OutboxOp) => {
      if (op.kind === 'round.delete') throw new ApiError(500, 'boom');
    });
    const result = await flushOutbox([entry(createT), entry(deleteR), entry(finishT)], execute);
    // The create landed; the finish must not jump ahead of the failed delete.
    expect(execute).toHaveBeenCalledTimes(2);
    expect(result.sent).toBe(1);
    expect(result.remaining.map((e) => e.op.kind)).toEqual(['round.delete', 'tournament.finish']);
    expect(result.remaining[0].attempts).toBe(1);
  });

  it('drops a permanently rejected op and keeps draining', async () => {
    const execute = vi.fn(async (op: OutboxOp) => {
      if (op.kind === 'round.delete') throw new ApiError(400, 'Invalid input');
    });
    const result = await flushOutbox([entry(createT), entry(deleteR), entry(finishT)], execute);
    expect(result.remaining).toEqual([]);
    expect(result.sent).toBe(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].message).toBe('Invalid input');
  });

  it('counts a delete of something already gone as sent', async () => {
    const execute = async () => { throw new ApiError(404, 'Round not found'); };
    const result = await flushOutbox([entry(deleteR)], execute);
    expect(result.sent).toBe(1);
    expect(result.failed).toEqual([]);
    expect(result.remaining).toEqual([]);
  });

  it('accumulates attempts across successive flushes', async () => {
    const execute = async () => { throw new ApiError(500, 'boom'); };
    const first = await flushOutbox([entry(createT)], execute);
    const second = await flushOutbox(first.remaining, execute);
    expect(second.remaining[0].attempts).toBe(2);
  });

  it('does nothing with an empty queue', async () => {
    const execute = vi.fn();
    const result = await flushOutbox([], execute);
    expect(execute).not.toHaveBeenCalled();
    expect(result).toEqual({ remaining: [], sent: 0, failed: [] });
  });
});
