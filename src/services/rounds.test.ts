import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../tests/setup/db';
import { seedReferenceData } from '../db/seed';
import { createTournament, finishTournament, getTournament } from './tournaments';
import { addRound, updateRound, deleteRound } from './rounds';
import { listLeaders } from './reference';
import { ConflictError, NotFoundError } from '../lib/errors';

const db = getTestDb();
const USER = 'user_r';

async function setup() {
  const ls = await listLeaders(db, USER);
  const t = await createTournament(db, USER, { type: 'local', myLeaderId: ls[0].id, playedOn: '2026-07-20' });
  return { t, opp: ls[1].id };
}

describe('round service', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db); });
  afterAll(closeTestDb);

  it('appends rounds with incrementing numbers', async () => {
    const { t, opp } = await setup();
    const r1 = await addRound(db, USER, t.id, { opponentLeaderId: opp, result: 'win', playOrder: 'first' });
    const r2 = await addRound(db, USER, t.id, { opponentLeaderId: opp, result: 'loss' });
    expect(r1.roundNumber).toBe(1);
    expect(r2.roundNumber).toBe(2);
  });

  it('renumbers remaining rounds after a delete', async () => {
    const { t, opp } = await setup();
    await addRound(db, USER, t.id, { opponentLeaderId: opp, result: 'win' });
    const r2 = await addRound(db, USER, t.id, { opponentLeaderId: opp, result: 'loss' });
    await addRound(db, USER, t.id, { opponentLeaderId: opp, result: 'draw' });
    await deleteRound(db, USER, r2.id);
    const detail = await getTournament(db, USER, t.id);
    expect(detail.rounds.map((r) => r.roundNumber)).toEqual([1, 2]);
    expect(detail.rounds.map((r) => r.result)).toEqual(['win', 'draw']);
  });

  it('rejects adding a round to a locked tournament', async () => {
    const { t, opp } = await setup();
    await finishTournament(db, USER, t.id);
    await expect(
      addRound(db, USER, t.id, { opponentLeaderId: opp, result: 'win' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects updating a round in a locked tournament', async () => {
    const { t, opp } = await setup();
    const r = await addRound(db, USER, t.id, { opponentLeaderId: opp, result: 'win' });
    await finishTournament(db, USER, t.id);
    await expect(updateRound(db, USER, r.id, { result: 'loss' })).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws NotFound adding to another user tournament', async () => {
    const { t, opp } = await setup();
    await expect(
      addRound(db, 'intruder', t.id, { opponentLeaderId: opp, result: 'win' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
