import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { getTestDb, resetDb, closeTestDb } from '../../tests/setup/db';
import { seedReferenceData } from '../db/seed';
import { leaders, metas } from '../db/schema';
import { createTournament, updateTournament } from './tournaments';
import { addRound } from './rounds';
import { getOverallStats, getPerMetaStats, getOpponentStats, getMatchupStats } from './stats';
import { getAchievements } from './achievements';
import { ConflictError, ValidationError } from '../lib/errors';

const db = getTestDb();
const USER = 'user_match';
afterAll(closeTestDb);

async function leaderId(name: string) {
  // Ordered by set code: a name maps to several printings, so an unordered
  // limit(1) would pick a different row from run to run.
  const [l] = await db.select().from(leaders).where(eq(leaders.name, name)).orderBy(asc(leaders.setCode)).limit(1);
  return l.id;
}

/** A match as the form creates one: a tournament row plus its single round. */
async function logMatch(mine: string, theirs: string, result: 'win' | 'loss' | 'draw' = 'win') {
  const t = await createTournament(db, USER, {
    type: 'match', myLeaderId: await leaderId(mine), playedOn: '2026-08-18',
  });
  await addRound(db, USER, t.id, {
    kind: 'swiss', opponentLeaderId: await leaderId(theirs), result, playOrder: 'first',
  });
  return t;
}

beforeEach(async () => { await resetDb(); await seedReferenceData(db); });

describe('a match', () => {
  it('is a tournament row holding one round', async () => {
    const t = await logMatch('Roronoa Zoro', 'Monkey D. Luffy');
    expect(t.type).toBe('match');
    expect(t.myLeaderId).not.toBeNull();
  });

  it('needs a leader of its own, like any non-freeplay session', async () => {
    await expect(createTournament(db, USER, { type: 'match', playedOn: '2026-08-18' }))
      .rejects.toThrow(ValidationError);
  });

  it('refuses a second round', async () => {
    // Without this a match quietly becomes a session while the Matches list
    // goes on presenting it as a single game.
    const t = await logMatch('Roronoa Zoro', 'Monkey D. Luffy');
    await expect(addRound(db, USER, t.id, {
      kind: 'swiss', opponentLeaderId: await leaderId('Kaido'), result: 'loss', playOrder: 'second',
    })).rejects.toThrow(ConflictError);
  });

  it('cannot be turned into a tournament, nor a tournament into one', async () => {
    const match = await logMatch('Roronoa Zoro', 'Monkey D. Luffy');
    await expect(updateTournament(db, USER, match.id, { type: 'local' })).rejects.toThrow(ValidationError);

    const local = await createTournament(db, USER, {
      type: 'local', myLeaderId: await leaderId('Roronoa Zoro'), playedOn: '2026-08-18',
    });
    await expect(updateTournament(db, USER, local.id, { type: 'match' })).rejects.toThrow(ValidationError);
  });

  it('still accepts edits that do not touch its type', async () => {
    const t = await logMatch('Roronoa Zoro', 'Monkey D. Luffy');
    const row = await updateTournament(db, USER, t.id, { playedOn: '2026-08-19' });
    expect(row.playedOn).toBe('2026-08-19');
  });
});

describe('a match and the competitive record', () => {
  beforeEach(async () => { await logMatch('Roronoa Zoro', 'Monkey D. Luffy'); });

  it('is absent from the overall record and tournament count', async () => {
    const overall = await getOverallStats(db, USER);
    expect(overall.totalTournaments).toBe(0);
    expect(overall.wins + overall.losses + overall.draws).toBe(0);
    expect(overall.mostPlayedLeader).toBeNull();
  });

  it('is absent from the per-meta breakdown', async () => {
    // Excluded even though freeplay is included here: the per-meta breakdown
    // reports the competitive record, and a casual game is not part of it —
    // regardless of whether a meta was recorded on it.
    const perMeta = await getPerMetaStats(db, USER);
    expect(perMeta.reduce((n, r) => n + r.wins + r.losses + r.draws, 0)).toBe(0);
  });

  it('is absent from achievements', async () => {
    const unlocked = (await getAchievements(db, USER)).filter((a) => a.unlocked).map((a) => a.key);
    expect(unlocked).not.toContain('first_blood');
  });

  it('counts toward opponent statistics', async () => {
    const opponents = await getOpponentStats(db, USER);
    expect(opponents.map((o) => o.name)).toContain('Monkey D. Luffy');
    expect(opponents.find((o) => o.name === 'Monkey D. Luffy')?.wins).toBe(1);
  });

  it('carries its meta into the per-opponent breakdown', async () => {
    // The reason the form asks for a meta at all: without one a match counts
    // toward an opponent's overall win rate but vanishes from the per-meta
    // split, which is the matchup intelligence the product exists for.
    const [meta] = await db.select().from(metas).where(eq(metas.code, 'OP16')).limit(1);
    const t = await createTournament(db, USER, {
      type: 'match', myLeaderId: await leaderId('Roronoa Zoro'), metaId: meta.id, playedOn: '2026-08-19',
    });
    await addRound(db, USER, t.id, {
      kind: 'swiss', opponentLeaderId: await leaderId('Kaido'), result: 'win', playOrder: 'first',
    });
    const kaido = (await getOpponentStats(db, USER)).find((o) => o.name === 'Kaido');
    expect(kaido?.byMeta.map((m) => m.name)).toContain('OP16');
  });

  it('counts toward matchup statistics for the deck played', async () => {
    const matchups = await getMatchupStats(db, USER, await leaderId('Roronoa Zoro'));
    expect(matchups.opponents.find((o) => o.name === 'Monkey D. Luffy')?.games).toBe(1);
  });
});

describe('a tournament note', () => {
  it('is null until one is written', async () => {
    const t = await createTournament(db, USER, {
      type: 'local', myLeaderId: await leaderId('Roronoa Zoro'), playedOn: '2026-08-18',
    });
    expect(t.notes).toBeNull();
  });

  it('can be set at creation and changed later', async () => {
    const t = await createTournament(db, USER, {
      type: 'local', myLeaderId: await leaderId('Roronoa Zoro'), playedOn: '2026-08-18',
      notes: 'Went with Ben',
    });
    expect(t.notes).toBe('Went with Ben');
    const edited = await updateTournament(db, USER, t.id, { notes: 'Went with Ben, top 8' });
    expect(edited.notes).toBe('Went with Ben, top 8');
  });

  it('can be cleared', async () => {
    const t = await createTournament(db, USER, {
      type: 'local', myLeaderId: await leaderId('Roronoa Zoro'), playedOn: '2026-08-18', notes: 'x',
    });
    expect((await updateTournament(db, USER, t.id, { notes: null })).notes).toBeNull();
  });

  it('is left alone by an edit that does not mention it', async () => {
    const t = await createTournament(db, USER, {
      type: 'local', myLeaderId: await leaderId('Roronoa Zoro'), playedOn: '2026-08-18', notes: 'keep me',
    });
    expect((await updateTournament(db, USER, t.id, { name: 'Locals' })).notes).toBe('keep me');
  });
});
