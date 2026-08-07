import { describe, it, expect } from 'vitest';
import { enqueue } from './coalesce';
import type { OutboxEntry, OutboxOp } from './types';

const T = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';
const R = '33333333-3333-4333-8333-333333333333';
const R2 = '44444444-4444-4444-8444-444444444444';
const LEADER = '55555555-5555-4555-8555-555555555555';

let seq = 0;
function entry(op: OutboxOp): OutboxEntry {
  return { opId: `op-${++seq}`, createdAt: seq, attempts: 0, op };
}

const createT = (id = T): OutboxOp => ({
  kind: 'tournament.create',
  tournamentId: id,
  payload: { id, type: 'local', myLeaderId: LEADER, playedOn: '2026-08-07' },
});

const createR = (roundId = R, tournamentId = T): OutboxOp => ({
  kind: 'round.create',
  tournamentId,
  roundId,
  payload: { id: roundId, kind: 'swiss', opponentLeaderId: LEADER, result: 'win' },
});

/** Build a queue by enqueuing each op in order, the way the app does. */
function queueOf(...ops: OutboxOp[]): OutboxEntry[] {
  return ops.reduce<OutboxEntry[]>((q, op) => enqueue(q, entry(op)), []);
}

const kinds = (q: OutboxEntry[]) => q.map((e) => e.op.kind);

describe('outbox coalescing', () => {
  it('appends unrelated ops in order', () => {
    const q = queueOf(createT(), createR(), createT(T2));
    expect(kinds(q)).toEqual(['tournament.create', 'round.create', 'tournament.create']);
  });

  it('merges a tournament update into a still-queued create', () => {
    const q = queueOf(createT(), { kind: 'tournament.update', tournamentId: T, payload: { name: 'Locals' } });
    expect(kinds(q)).toEqual(['tournament.create']);
    expect(q[0].op).toMatchObject({ payload: { name: 'Locals', type: 'local', id: T } });
  });

  it('normalizes a null patch value when merging into a create', () => {
    // updateTournamentSchema allows null to clear a field; createTournamentSchema
    // does not accept null, so the merge has to drop it rather than store an
    // op the server would reject.
    const q = queueOf(createT(), { kind: 'tournament.update', tournamentId: T, payload: { name: null, metaId: null } });
    expect(kinds(q)).toEqual(['tournament.create']);
    expect(q[0].op).toMatchObject({ payload: { id: T } });
    const payload = (q[0].op as Extract<OutboxOp, { kind: 'tournament.create' }>).payload;
    expect(payload.name).toBeUndefined();
    expect(payload.metaId).toBeUndefined();
  });

  it('merges consecutive tournament updates for the same tournament', () => {
    const q = queueOf(
      { kind: 'tournament.update', tournamentId: T, payload: { name: 'First' } },
      { kind: 'tournament.update', tournamentId: T, payload: { playedOn: '2026-08-08' } },
    );
    expect(kinds(q)).toEqual(['tournament.update']);
    expect(q[0].op).toMatchObject({ payload: { name: 'First', playedOn: '2026-08-08' } });
  });

  it('does not merge updates separated by another op for the same tournament', () => {
    const q = queueOf(
      { kind: 'tournament.update', tournamentId: T, payload: { name: 'First' } },
      createR(),
      { kind: 'tournament.update', tournamentId: T, payload: { name: 'Second' } },
    );
    expect(kinds(q)).toEqual(['tournament.update', 'round.create', 'tournament.update']);
  });

  it('deleting a never-synced tournament drops the whole tournament from the queue', () => {
    const q = queueOf(
      createT(),
      createR(),
      { kind: 'tournament.finish', tournamentId: T },
      createT(T2),
      { kind: 'tournament.delete', tournamentId: T },
    );
    // Nothing for T ever reached the server, so neither the work nor the delete
    // needs to be sent. T2 is untouched.
    expect(kinds(q)).toEqual(['tournament.create']);
    expect(q[0].op.tournamentId).toBe(T2);
  });

  it('deleting a synced tournament drops its queued ops but keeps the delete', () => {
    const q = queueOf(
      { kind: 'tournament.update', tournamentId: T, payload: { name: 'x' } },
      createR(),
      { kind: 'tournament.delete', tournamentId: T },
    );
    expect(kinds(q)).toEqual(['tournament.delete']);
  });

  it('collapses finish/reopen churn to the last one', () => {
    const q = queueOf(
      { kind: 'tournament.finish', tournamentId: T },
      { kind: 'tournament.reopen', tournamentId: T },
      { kind: 'tournament.finish', tournamentId: T },
    );
    expect(kinds(q)).toEqual(['tournament.finish']);
  });

  it('merges a round update into a still-queued round create', () => {
    const q = queueOf(createR(), {
      kind: 'round.update',
      tournamentId: T,
      roundId: R,
      payload: { kind: 'swiss', opponentLeaderId: LEADER, result: 'loss', notes: 'mulliganed' },
    });
    expect(kinds(q)).toEqual(['round.create']);
    expect(q[0].op).toMatchObject({ payload: { id: R, result: 'loss', notes: 'mulliganed' } });
  });

  it('deleting a never-synced round removes both the create and its updates', () => {
    const q = queueOf(
      createR(),
      { kind: 'round.update', tournamentId: T, roundId: R, payload: { kind: 'swiss', opponentLeaderId: LEADER, result: 'loss' } },
      createR(R2),
      { kind: 'round.delete', tournamentId: T, roundId: R },
    );
    expect(kinds(q)).toEqual(['round.create']);
    expect(q[0].op).toMatchObject({ roundId: R2 });
  });

  it('deleting a synced round drops its queued updates and keeps the delete', () => {
    const q = queueOf(
      { kind: 'round.update', tournamentId: T, roundId: R, payload: { kind: 'swiss', opponentLeaderId: LEADER, result: 'loss' } },
      { kind: 'round.delete', tournamentId: T, roundId: R },
    );
    expect(kinds(q)).toEqual(['round.delete']);
  });

  it('leaves other tournaments untouched when coalescing', () => {
    const q = queueOf(createT(T2), createR(R2, T2), createT(), { kind: 'tournament.delete', tournamentId: T });
    expect(kinds(q)).toEqual(['tournament.create', 'round.create']);
    expect(q.every((e) => e.op.tournamentId === T2)).toBe(true);
  });
});
