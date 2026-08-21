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

// The mirror of createT/createR: a session (session) tournament whose round
// carries its own leader, the shape that only makes sense on that side of the
// boundary.
const createSessionT = (id = T): OutboxOp => ({
  kind: 'tournament.create',
  tournamentId: id,
  payload: { id, type: 'session_gauntlet', playedOn: '2026-08-07' },
});

const createSessionR = (roundId = R, tournamentId = T): OutboxOp => ({
  kind: 'round.create',
  tournamentId,
  roundId,
  payload: { id: roundId, kind: 'swiss', opponentLeaderId: LEADER, result: 'win', myLeaderId: LEADER },
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

  it('does not collapse consecutive converts of the same tournament', () => {
    // Unlike finish/reopen, a convert reads the tournament's *current* type and
    // its rounds' *current* leaders to decide what to move where, and it
    // refuses to run when the destination is already on the current side of
    // session. Dropping the earlier convert and keeping only the last one (the
    // finish/reopen trick) would replay the survivor against a state it was
    // never actually issued against — see the WHY comment in coalesce.ts.
    const q = queueOf(
      { kind: 'tournament.convert', tournamentId: T, payload: { type: 'session_gauntlet' } },
      { kind: 'tournament.convert', tournamentId: T, payload: { type: 'local', myLeaderId: LEADER } },
    );
    expect(kinds(q)).toEqual(['tournament.convert', 'tournament.convert']);
  });

  it('leaves a convert for a different tournament alone', () => {
    const q = queueOf(
      { kind: 'tournament.convert', tournamentId: T, payload: { type: 'session_gauntlet' } },
      { kind: 'tournament.convert', tournamentId: T2, payload: { type: 'session_gauntlet' } },
    );
    expect(kinds(q)).toEqual(['tournament.convert', 'tournament.convert']);
    expect(q.map((e) => e.op.tournamentId)).toEqual([T, T2]);
  });

  it('leaves a convert appended after an unsent create rather than folding into it', () => {
    // A convert's effect depends on rounds already queued between the create and
    // the convert (which decks were logged, what leader they carry); folding it
    // into the create's payload would skip the very state it reads. Replaying
    // create, then rounds, then convert, in order, reaches the same place a
    // truly instantaneous offline conversion would.
    const q = queueOf(
      createT(),
      createR(),
      { kind: 'tournament.convert', tournamentId: T, payload: { type: 'session_gauntlet' } },
    );
    expect(kinds(q)).toEqual(['tournament.create', 'round.create', 'tournament.convert']);
    // The create still carries the pre-conversion type; only the trailing
    // convert op carries the destination.
    expect(q[0].op).toMatchObject({ payload: { type: 'local' } });
  });

  it('does not reorder a convert around an intervening tournament update', () => {
    const q = queueOf(
      { kind: 'tournament.convert', tournamentId: T, payload: { type: 'session_gauntlet' } },
      { kind: 'tournament.update', tournamentId: T, payload: { name: 'Renamed' } },
      { kind: 'tournament.convert', tournamentId: T, payload: { type: 'local', myLeaderId: LEADER } },
    );
    expect(kinds(q)).toEqual(['tournament.convert', 'tournament.update', 'tournament.convert']);
  });

  it('deleting a never-synced tournament drops its queued convert too', () => {
    const q = queueOf(
      createT(),
      { kind: 'tournament.convert', tournamentId: T, payload: { type: 'session_gauntlet' } },
      createT(T2),
      { kind: 'tournament.delete', tournamentId: T },
    );
    expect(kinds(q)).toEqual(['tournament.create']);
    expect(q[0].op.tournamentId).toBe(T2);
  });

  it('deleting a synced tournament drops its queued convert but keeps the delete', () => {
    const q = queueOf(
      { kind: 'tournament.convert', tournamentId: T, payload: { type: 'session_gauntlet' } },
      { kind: 'tournament.delete', tournamentId: T },
    );
    expect(kinds(q)).toEqual(['tournament.delete']);
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

  describe('folding across a queued convert', () => {
    // A create's payload is only valid for the leader segment the tournament
    // was in when it was authored. Folding a later edit back into it would
    // carry a payload written for whichever side of the boundary the edit was
    // made on to a spot in the queue that predates the convert that put the
    // tournament there — see convertQueuedAfter's comment in coalesce.ts.

    it('declines to fold a tournament update into its create when a convert is queued between them', () => {
      const q = queueOf(
        createT(),
        { kind: 'tournament.convert', tournamentId: T, payload: { type: 'session_gauntlet' } },
        { kind: 'tournament.update', tournamentId: T, payload: { name: 'Renamed' } },
      );
      expect(kinds(q)).toEqual(['tournament.create', 'tournament.convert', 'tournament.update']);
      // The create keeps its original, pre-convert payload untouched.
      expect(q[0].op).toMatchObject({ payload: { type: 'local', id: T } });
      const createPayload = (q[0].op as Extract<OutboxOp, { kind: 'tournament.create' }>).payload;
      expect(createPayload.name).toBeUndefined();
    });

    it('declines to fold the mirror case: an update after a queued convert to classic', () => {
      const q = queueOf(
        createSessionT(),
        { kind: 'tournament.convert', tournamentId: T, payload: { type: 'local', myLeaderId: LEADER } },
        { kind: 'tournament.update', tournamentId: T, payload: { name: 'Renamed' } },
      );
      expect(kinds(q)).toEqual(['tournament.create', 'tournament.convert', 'tournament.update']);
      expect(q[0].op).toMatchObject({ payload: { type: 'session_gauntlet', id: T } });
      const createPayload = (q[0].op as Extract<OutboxOp, { kind: 'tournament.create' }>).payload;
      expect(createPayload.name).toBeUndefined();
    });

    it('still folds a tournament update into its create when the intervening convert is for a different tournament', () => {
      const q = queueOf(
        createT(),
        createT(T2),
        { kind: 'tournament.convert', tournamentId: T2, payload: { type: 'session_gauntlet' } },
        { kind: 'tournament.update', tournamentId: T, payload: { name: 'Renamed' } },
      );
      expect(kinds(q)).toEqual(['tournament.create', 'tournament.create', 'tournament.convert']);
      const tCreate = q.find((e) => e.op.tournamentId === T)!.op as Extract<OutboxOp, { kind: 'tournament.create' }>;
      expect(tCreate.payload.name).toBe('Renamed');
    });

    it('declines to fold a round update into its create when a convert for the round\'s tournament is queued between them', () => {
      const q = queueOf(
        createT(),
        createR(),
        { kind: 'tournament.convert', tournamentId: T, payload: { type: 'session_gauntlet' } },
        { kind: 'round.update', tournamentId: T, roundId: R, payload: { kind: 'swiss', opponentLeaderId: LEADER, result: 'loss' } },
      );
      expect(kinds(q)).toEqual(['tournament.create', 'round.create', 'tournament.convert', 'round.update']);
      // The queued round create still carries its original, leaderless payload —
      // not the leaderless edit re-encoded as though it were still valid, and not
      // a leader added that the edit never sent either.
      expect(q[1].op).toMatchObject({ payload: { id: R, result: 'win' } });
      const roundPayload = (q[1].op as Extract<OutboxOp, { kind: 'round.create' }>).payload;
      expect('myLeaderId' in roundPayload).toBe(false);
    });

    it('declines to fold the mirror case: a round update after a queued convert to classic', () => {
      const q = queueOf(
        createSessionT(),
        createSessionR(),
        { kind: 'tournament.convert', tournamentId: T, payload: { type: 'local', myLeaderId: LEADER } },
        { kind: 'round.update', tournamentId: T, roundId: R, payload: { kind: 'swiss', opponentLeaderId: LEADER, result: 'loss' } },
      );
      expect(kinds(q)).toEqual(['tournament.create', 'round.create', 'tournament.convert', 'round.update']);
      // The queued round create still carries its own leader — not silently
      // dropped by an edit authored after the tournament stopped needing it.
      expect(q[1].op).toMatchObject({ payload: { id: R, myLeaderId: LEADER, result: 'win' } });
    });

    it('still folds a round update into its create when the intervening convert is for a different tournament', () => {
      const q = queueOf(
        createT(),
        createR(),
        createT(T2),
        { kind: 'tournament.convert', tournamentId: T2, payload: { type: 'session_gauntlet' } },
        { kind: 'round.update', tournamentId: T, roundId: R, payload: { kind: 'swiss', opponentLeaderId: LEADER, result: 'loss' } },
      );
      expect(kinds(q)).toEqual(['tournament.create', 'round.create', 'tournament.create', 'tournament.convert']);
      const rCreate = q.find((e) => e.op.kind === 'round.create')!.op as Extract<OutboxOp, { kind: 'round.create' }>;
      expect(rCreate.payload).toMatchObject({ result: 'loss' });
    });
  });
});
