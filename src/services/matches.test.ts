import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { getTestDb, resetDb, closeTestDb } from '../../tests/setup/db';
import { seedReferenceData } from '../db/seed';
import { leaders } from '../db/schema';
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
    // Matches record no meta, so counting them would pile every one into a
    // single "No meta" row — excluded even though freeplay is included here.
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

  it('counts toward matchup statistics for the deck played', async () => {
    const matchups = await getMatchupStats(db, USER, await leaderId('Roronoa Zoro'));
    expect(matchups.opponents.find((o) => o.name === 'Monkey D. Luffy')?.games).toBe(1);
  });
});
