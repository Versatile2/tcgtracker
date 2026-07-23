import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../tests/setup/db';
import { seedReferenceData } from '../db/seed';
import { createTournament, finishTournament, getTournament } from './tournaments';
import { addRound, updateRound, deleteRound } from './rounds';
import { listLeaders, listMetas } from './reference';
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
    const r1 = await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: opp, result: 'win', playOrder: 'first' });
    const r2 = await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: opp, result: 'loss' });
    expect(r1.roundNumber).toBe(1);
    expect(r2.roundNumber).toBe(2);
  });

  it('renumbers remaining rounds after a delete', async () => {
    const { t, opp } = await setup();
    await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: opp, result: 'win' });
    const r2 = await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: opp, result: 'loss' });
    await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: opp, result: 'draw' });
    await deleteRound(db, USER, r2.id);
    const detail = await getTournament(db, USER, t.id);
    expect(detail.rounds.map((r) => r.roundNumber)).toEqual([1, 2]);
    expect(detail.rounds.map((r) => r.result)).toEqual(['win', 'draw']);
  });

  it('rejects adding a round to a locked tournament', async () => {
    const { t, opp } = await setup();
    await finishTournament(db, USER, t.id);
    await expect(
      addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: opp, result: 'win' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects updating a round in a locked tournament', async () => {
    const { t, opp } = await setup();
    const r = await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: opp, result: 'win' });
    await finishTournament(db, USER, t.id);
    await expect(updateRound(db, USER, r.id, { kind: 'swiss', opponentLeaderId: opp, result: 'loss' })).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws NotFound adding to another user tournament', async () => {
    const { t, opp } = await setup();
    await expect(
      addRound(db, 'intruder', t.id, { kind: 'swiss', opponentLeaderId: opp, result: 'win' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('persists and updates opponentMetaId (full-replace edit)', async () => {
    const { t, opp } = await setup();
    const metas = await listMetas(db, USER);
    const r = await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: opp, result: 'win', opponentMetaId: metas[0].id });
    expect(r.opponentMetaId).toBe(metas[0].id);
    const updated = await updateRound(db, USER, r.id, { kind: 'swiss', opponentLeaderId: opp, result: 'win', opponentMetaId: null });
    expect(updated.opponentMetaId).toBeNull();
  });

  it('persists wonDieRoll on a swiss round', async () => {
    const { t, opp } = await setup();
    const won = await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: opp, result: 'win', wonDieRoll: true });
    expect(won.wonDieRoll).toBe(true);
    const lost = await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: opp, result: 'loss', wonDieRoll: false });
    expect(lost.wonDieRoll).toBe(false);
  });

  it('creates a BYE as an opponent-less auto-win', async () => {
    const { t } = await setup();
    const r = await addRound(db, USER, t.id, { kind: 'bye', notes: null });
    expect(r.kind).toBe('bye');
    expect(r.result).toBe('win');
    expect(r.opponentLeaderId).toBeNull();
    expect(r.games).toBeNull();
  });

  it('creates a No Show as an opponent-less forfeit win', async () => {
    const { t } = await setup();
    const r = await addRound(db, USER, t.id, { kind: 'no_show', notes: null });
    expect(r.kind).toBe('no_show');
    expect(r.result).toBe('win');
    expect(r.opponentLeaderId).toBeNull();
  });

  it('derives the Top Cut match result from the game log', async () => {
    const { t, opp } = await setup();
    const won = await addRound(db, USER, t.id, { kind: 'top_cut', opponentLeaderId: opp, games: [{ result: 'win' }, { result: 'loss' }, { result: 'win' }] });
    expect(won.kind).toBe('top_cut');
    expect(won.result).toBe('win');
    expect(won.games).toHaveLength(3);
    const lost = await addRound(db, USER, t.id, { kind: 'top_cut', opponentLeaderId: opp, games: [{ result: 'win' }, { result: 'loss' }, { result: 'loss' }] });
    expect(lost.result).toBe('loss');
  });
});
