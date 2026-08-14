import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../tests/setup/db';
import { seedReferenceData } from '../db/seed';
import { leaders } from '../db/schema';
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

async function leaderId(name: string) {
  // Ordered by set code: a leader name maps to several real printings, so an
  // unordered limit(1) would pick a different row from run to run.
  const [l] = await db.select().from(leaders).where(eq(leaders.name, name)).orderBy(asc(leaders.setCode)).limit(1);
  return l.id;
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

  it('requires a leader for a non-freeplay tournament', async () => {
    await expect(createTournament(db, USER, {
      type: 'local', playedOn: '2026-08-14',
    } as never)).rejects.toThrow();
  });

  it('rejects a leader on a freeplay tournament', async () => {
    const { mine } = await anyLeaderIds();
    await expect(createTournament(db, USER, {
      type: 'freeplay', myLeaderId: mine, playedOn: '2026-08-14',
    })).rejects.toThrow();
  });

  it('stores a freeplay tournament with no leader', async () => {
    const t = await createTournament(db, USER, { type: 'freeplay', playedOn: '2026-08-14' });
    expect(t.myLeaderId).toBeNull();
  });

  it('refuses to change a tournament into or out of freeplay', async () => {
    const { mine } = await anyLeaderIds();
    const classic = await createTournament(db, USER, {
      type: 'local', myLeaderId: mine, playedOn: '2026-08-14',
    });
    await expect(updateTournament(db, USER, classic.id, { type: 'freeplay' })).rejects.toThrow();

    const free = await createTournament(db, USER, { type: 'freeplay', playedOn: '2026-08-14' });
    await expect(updateTournament(db, USER, free.id, { type: 'local' })).rejects.toThrow();

    // A classic-to-classic change still works.
    const ok = await updateTournament(db, USER, classic.id, { type: 'regionals' });
    expect(ok.type).toBe('regionals');
  });

  it('rejects assigning a leader to a freeplay tournament via a partial patch with no type field', async () => {
    const { mine } = await anyLeaderIds();
    const free = await createTournament(db, USER, { type: 'freeplay', playedOn: '2026-08-14' });
    await expect(updateTournament(db, USER, free.id, { myLeaderId: mine })).rejects.toThrow();
  });

  it('still allows a plain leader change on a non-freeplay tournament', async () => {
    const ls = await listLeaders(db, USER);
    const classic = await createTournament(db, USER, { type: 'local', myLeaderId: ls[0].id, playedOn: '2026-08-14' });
    const updated = await updateTournament(db, USER, classic.id, { myLeaderId: ls[1].id });
    expect(updated.myLeaderId).toBe(ls[1].id);
  });

  it('reports the distinct deck count for a freeplay session', async () => {
    const t = await createTournament(db, USER, { type: 'freeplay', playedOn: '2026-08-14' });
    const zoro = await leaderId('Roronoa Zoro');
    await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: await leaderId('Nami'), result: 'win', myLeaderId: zoro });
    await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: await leaderId('Sanji'), result: 'loss', myLeaderId: zoro });
    await addRound(db, USER, t.id, { kind: 'swiss', opponentLeaderId: await leaderId('Nami'), result: 'win', myLeaderId: await leaderId('Edward Newgate') });

    const list = await listTournaments(db, USER);
    // Two distinct decks across three rounds — a repeat does not double-count.
    expect(list.find((x) => x.id === t.id)?.deckCount).toBe(2);
  });

  it('reports a deck count of zero for a classic tournament', async () => {
    const t = await createTournament(db, USER, {
      type: 'local', myLeaderId: await leaderId('Roronoa Zoro'), playedOn: '2026-08-14',
    });
    const list = await listTournaments(db, USER);
    expect(list.find((x) => x.id === t.id)?.deckCount).toBe(0);
  });
});
