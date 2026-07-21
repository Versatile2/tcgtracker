import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../tests/setup/db';
import { seedReferenceData } from '../db/seed';
import { leaders, sets, tournaments, rounds } from '../db/schema';
import { eq } from 'drizzle-orm';
import { getOverallStats, getPerSetStats, getPlayedLeaders } from './stats';
import { afterAll } from 'vitest';

const db = getTestDb();
const USER = 'user_stats';
afterAll(closeTestDb);

async function leaderId(name: string) {
  const [l] = await db.select().from(leaders).where(eq(leaders.name, name)).limit(1);
  return l.id;
}
async function setId(name: string) {
  const [s] = await db.select().from(sets).where(eq(sets.name, name)).limit(1);
  return s.id;
}
// Create a tournament with the given set and a list of [myLeader, oppLeader, result] rounds.
async function makeTournament(setName: string | null, rows: [string, string, 'win' | 'loss' | 'draw'][]) {
  const sid = setName ? await setId(setName) : null;
  const [t] = await db.insert(tournaments).values({ ownerId: USER, type: 'local', setId: sid, playedOn: '2026-07-20', status: 'locked' }).returning();
  let n = 1;
  for (const [mine, opp, result] of rows) {
    await db.insert(rounds).values({
      tournamentId: t.id, roundNumber: n++,
      myLeaderId: await leaderId(mine), opponentLeaderId: await leaderId(opp),
      result, playOrder: null, notes: null,
    });
  }
  return t;
}

describe('stats service — overall/per-set/played-leaders', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db); });

  it('computes overall wins/losses/draws and win rate', async () => {
    await makeTournament('Paramount War', [
      ['Roronoa Zoro', 'Donquixote Doflamingo', 'win'],
      ['Roronoa Zoro', 'Nami', 'loss'],
      ['Roronoa Zoro', 'Sanji', 'win'],
      ['Roronoa Zoro', 'Shanks', 'draw'],
    ]);
    const o = await getOverallStats(db, USER);
    expect(o.wins).toBe(2);
    expect(o.losses).toBe(1);
    expect(o.draws).toBe(1);
    expect(o.totalTournaments).toBe(1);
    expect(o.winRate).toBeCloseTo(0.5, 5);
    expect(o.drawRate).toBeCloseTo(0.25, 5);
    expect(o.mostPlayedLeader?.name).toBe('Roronoa Zoro');
    expect(o.bestSet?.name).toBe('Paramount War');
  });

  it('returns null best-set / most-played and zeros with no data', async () => {
    const o = await getOverallStats(db, USER);
    expect(o).toMatchObject({ totalTournaments: 0, wins: 0, losses: 0, draws: 0, winRate: 0, drawRate: 0, bestSet: null, mostPlayedLeader: null });
  });

  it('groups per-set with counts and sorts by win rate', async () => {
    await makeTournament('Paramount War', [['Roronoa Zoro', 'Nami', 'win'], ['Roronoa Zoro', 'Nami', 'win']]);
    await makeTournament('Romance Dawn', [['Nami', 'Sanji', 'loss']]);
    const per = await getPerSetStats(db, USER);
    expect(per[0].name).toBe('Paramount War');
    expect(per[0]).toMatchObject({ tournaments: 1, wins: 2, losses: 0, draws: 0 });
    expect(per[0].winRate).toBeCloseTo(1, 5);
    const romance = per.find((p) => p.name === 'Romance Dawn')!;
    expect(romance.winRate).toBeCloseTo(0, 5);
  });

  it('buckets rounds from tournaments with no set under "No set"', async () => {
    await makeTournament(null, [['Nami', 'Sanji', 'win']]);
    const per = await getPerSetStats(db, USER);
    const noSet = per.find((p) => p.setId === null)!;
    expect(noSet.name).toBe('No set');
    expect(noSet.wins).toBe(1);
  });

  it('lists distinct played (my) leaders, name-sorted', async () => {
    await makeTournament('Paramount War', [['Roronoa Zoro', 'Nami', 'win'], ['Nami', 'Sanji', 'loss']]);
    const played = await getPlayedLeaders(db, USER);
    expect(played.map((l) => l.name)).toEqual(['Nami', 'Roronoa Zoro']);
  });

  it('scopes to the owner', async () => {
    await makeTournament('Paramount War', [['Nami', 'Sanji', 'win']]);
    const other = await getOverallStats(db, 'someone_else');
    expect(other.totalTournaments).toBe(0);
    expect(other.wins).toBe(0);
  });
});
