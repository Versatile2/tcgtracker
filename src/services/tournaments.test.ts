import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../tests/setup/db';
import { seedReferenceData } from '../db/seed';
import {
  createTournament, listTournaments, getTournament,
  updateTournament, deleteTournament, finishTournament, reopenTournament,
} from './tournaments';
import { addRound } from './rounds';
import { listLeaders } from './reference';
import { NotFoundError } from '../lib/errors';

const db = getTestDb();
const USER = 'user_a';

async function anyLeaderIds() {
  const ls = await listLeaders(db, USER);
  return { mine: ls[0].id, opp: ls[1].id };
}

describe('tournament service', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db); });
  afterAll(closeTestDb);

  it('creates a draft tournament', async () => {
    const t = await createTournament(db, USER, { type: 'local', playedOn: '2026-07-20' });
    expect(t.status).toBe('draft');
    expect(t.ownerId).toBe(USER);
  });

  it('lists tournaments newest first with computed record', async () => {
    const { mine, opp } = await anyLeaderIds();
    const t = await createTournament(db, USER, { type: 'local', playedOn: '2026-07-20' });
    await addRound(db, USER, t.id, { myLeaderId: mine, opponentLeaderId: opp, result: 'win' });
    await addRound(db, USER, t.id, { myLeaderId: mine, opponentLeaderId: opp, result: 'loss' });
    const list = await listTournaments(db, USER);
    expect(list[0].record).toEqual({ wins: 1, losses: 1, draws: 0 });
  });

  it('getTournament throws NotFound for another user tournament', async () => {
    const t = await createTournament(db, USER, { type: 'local', playedOn: '2026-07-20' });
    await expect(getTournament(db, 'user_b', t.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('finish then reopen toggles status', async () => {
    const t = await createTournament(db, USER, { type: 'local', playedOn: '2026-07-20' });
    expect((await finishTournament(db, USER, t.id)).status).toBe('locked');
    expect((await reopenTournament(db, USER, t.id)).status).toBe('draft');
  });

  it('deletes a tournament and its rounds', async () => {
    const { mine, opp } = await anyLeaderIds();
    const t = await createTournament(db, USER, { type: 'local', playedOn: '2026-07-20' });
    await addRound(db, USER, t.id, { myLeaderId: mine, opponentLeaderId: opp, result: 'win' });
    await deleteTournament(db, USER, t.id);
    await expect(getTournament(db, USER, t.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('updates editable fields', async () => {
    const t = await createTournament(db, USER, { type: 'local', playedOn: '2026-07-20' });
    const updated = await updateTournament(db, USER, t.id, { type: 'regionals', name: 'Spring Regional' });
    expect(updated.type).toBe('regionals');
    expect(updated.name).toBe('Spring Regional');
  });
});
