import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../tests/setup/db';
import { seedReferenceData } from '../db/seed';
import {
  createTournament, listTournaments, getTournament,
  updateTournament, deleteTournament, finishTournament, reopenTournament,
} from './tournaments';
import { addRound } from './rounds';
import { listLeaders, listMetas } from './reference';
import { NotFoundError, ConflictError } from '../lib/errors';

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
    const { mine } = await anyLeaderIds();
    const t = await createTournament(db, USER, { type: 'local', myLeaderId: mine, playedOn: '2026-07-20' });
    expect(t.status).toBe('draft');
    expect(t.ownerId).toBe(USER);
  });

  it('persists myLeaderId on create', async () => {
    const { mine } = await anyLeaderIds();
    const t = await createTournament(db, USER, { type: 'local', myLeaderId: mine, playedOn: '2026-07-20' });
    expect(t.myLeaderId).toBe(mine);
  });

  it('lists tournaments newest first with computed record', async () => {
    const { mine, opp } = await anyLeaderIds();
    const t = await createTournament(db, USER, { type: 'local', myLeaderId: mine, playedOn: '2026-07-20' });
    await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: opp, result: 'win' });
    await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: opp, result: 'loss' });
    const list = await listTournaments(db, USER);
    expect(list[0].record).toEqual({ wins: 1, losses: 1, draws: 0 });
  });

  it('getTournament throws NotFound for another user tournament', async () => {
    const { mine } = await anyLeaderIds();
    const t = await createTournament(db, USER, { type: 'local', myLeaderId: mine, playedOn: '2026-07-20' });
    await expect(getTournament(db, 'user_b', t.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('finish then reopen toggles status', async () => {
    const { mine } = await anyLeaderIds();
    const t = await createTournament(db, USER, { type: 'local', myLeaderId: mine, playedOn: '2026-07-20' });
    expect((await finishTournament(db, USER, t.id)).status).toBe('locked');
    expect((await reopenTournament(db, USER, t.id)).status).toBe('draft');
  });

  it('deletes a tournament and its rounds', async () => {
    const { mine, opp } = await anyLeaderIds();
    const t = await createTournament(db, USER, { type: 'local', myLeaderId: mine, playedOn: '2026-07-20' });
    await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: opp, result: 'win' });
    await deleteTournament(db, USER, t.id);
    await expect(getTournament(db, USER, t.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('updates editable fields', async () => {
    const { mine } = await anyLeaderIds();
    const t = await createTournament(db, USER, { type: 'local', myLeaderId: mine, playedOn: '2026-07-20' });
    const updated = await updateTournament(db, USER, t.id, { type: 'regionals', name: 'Spring Regional' });
    expect(updated.type).toBe('regionals');
    expect(updated.name).toBe('Spring Regional');
  });

  it('updates myLeaderId and metaId while draft', async () => {
    const ls = await listLeaders(db, USER);
    const metas = await listMetas(db, USER);
    const t = await createTournament(db, USER, { type: 'local', myLeaderId: ls[0].id, playedOn: '2026-07-20' });
    const updated = await updateTournament(db, USER, t.id, { myLeaderId: ls[1].id, metaId: metas[0].id });
    expect(updated.myLeaderId).toBe(ls[1].id);
    expect(updated.metaId).toBe(metas[0].id);
  });

  it('honours a client-supplied id', async () => {
    const { mine } = await anyLeaderIds();
    const id = randomUUID();
    const t = await createTournament(db, USER, { id, type: 'local', myLeaderId: mine, playedOn: '2026-07-20' });
    expect(t.id).toBe(id);
  });

  it('re-creating with the same id returns the existing row instead of duplicating', async () => {
    const { mine } = await anyLeaderIds();
    const id = randomUUID();
    const first = await createTournament(db, USER, { id, type: 'local', myLeaderId: mine, playedOn: '2026-07-20' });
    const replay = await createTournament(db, USER, { id, type: 'regionals', myLeaderId: mine, playedOn: '2026-07-21' });
    expect(replay.id).toBe(first.id);
    // The replay is a no-op, not an update: the stored row is untouched.
    expect(replay.type).toBe('local');
    expect(await listTournaments(db, USER)).toHaveLength(1);
  });

  it('rejects a client id already owned by someone else', async () => {
    const { mine } = await anyLeaderIds();
    const id = randomUUID();
    await createTournament(db, USER, { id, type: 'local', myLeaderId: mine, playedOn: '2026-07-20' });
    await expect(
      createTournament(db, 'user_other', { id, type: 'local', myLeaderId: mine, playedOn: '2026-07-20' })
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
