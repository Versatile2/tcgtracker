import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../tests/setup/db';
import { seedReferenceData } from '../db/seed';
import { leaders, metas, tournaments, rounds } from '../db/schema';
import { eq } from 'drizzle-orm';
import { getOverallStats, getPerMetaStats, getPlayedLeaders } from './stats';
import { afterAll } from 'vitest';

const db = getTestDb();
const USER = 'user_stats';
afterAll(closeTestDb);

async function leaderId(name: string) {
  const [l] = await db.select().from(leaders).where(eq(leaders.name, name)).limit(1);
  return l.id;
}
async function metaId(name: string) {
  const [m] = await db.select().from(metas).where(eq(metas.name, name)).limit(1);
  return m.id;
}
// Create a tournament with the given meta, leader, and a list of [oppLeader, result] rounds.
async function makeTournament(metaName: string | null, myLeader: string, rows: [string, 'win' | 'loss' | 'draw'][]) {
  const mid = metaName ? await metaId(metaName) : null;
  const [t] = await db.insert(tournaments).values({ ownerId: USER, type: 'local', myLeaderId: await leaderId(myLeader), metaId: mid, playedOn: '2026-07-20', status: 'locked' }).returning();
  let n = 1;
  for (const [opp, result] of rows) {
    await db.insert(rounds).values({
      tournamentId: t.id, roundNumber: n++,
      opponentLeaderId: await leaderId(opp),
      result, playOrder: null, notes: null,
    });
  }
  return t;
}

describe('stats service — overall/per-meta/played-leaders', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db); });

  it('computes overall wins/losses/draws and win rate', async () => {
    await makeTournament('OP02 Paramount War', 'Roronoa Zoro', [
      ['Donquixote Doflamingo', 'win'],
      ['Nami', 'loss'],
      ['Sanji', 'win'],
      ['Shanks', 'draw'],
    ]);
    const o = await getOverallStats(db, USER);
    expect(o.wins).toBe(2);
    expect(o.losses).toBe(1);
    expect(o.draws).toBe(1);
    expect(o.totalTournaments).toBe(1);
    expect(o.winRate).toBeCloseTo(0.5, 5);
    expect(o.drawRate).toBeCloseTo(0.25, 5);
    expect(o.mostPlayedLeader?.name).toBe('Roronoa Zoro');
    expect(o.bestMeta?.name).toBe('OP02 Paramount War');
  });

  it('returns null best-meta / most-played and zeros with no data', async () => {
    const o = await getOverallStats(db, USER);
    expect(o).toMatchObject({ totalTournaments: 0, wins: 0, losses: 0, draws: 0, winRate: 0, drawRate: 0, bestMeta: null, mostPlayedLeader: null });
  });

  it('groups per-meta with counts and sorts by win rate', async () => {
    await makeTournament('OP02 Paramount War', 'Roronoa Zoro', [['Nami', 'win'], ['Nami', 'win']]);
    await makeTournament('OP01 Romance Dawn', 'Nami', [['Sanji', 'loss']]);
    const per = await getPerMetaStats(db, USER);
    expect(per[0].name).toBe('OP02 Paramount War');
    expect(per[0]).toMatchObject({ tournaments: 1, wins: 2, losses: 0, draws: 0 });
    expect(per[0].winRate).toBeCloseTo(1, 5);
    const romance = per.find((p) => p.name === 'OP01 Romance Dawn')!;
    expect(romance.winRate).toBeCloseTo(0, 5);
  });

  it('buckets rounds from tournaments with no meta under "No meta"', async () => {
    await makeTournament(null, 'Nami', [['Sanji', 'win']]);
    const per = await getPerMetaStats(db, USER);
    const noMeta = per.find((p) => p.metaId === null)!;
    expect(noMeta.name).toBe('No meta');
    expect(noMeta.wins).toBe(1);
  });

  it('lists distinct played (my) leaders, name-sorted', async () => {
    await makeTournament('OP02 Paramount War', 'Roronoa Zoro', [['Nami', 'win']]);
    await makeTournament('OP02 Paramount War', 'Nami', [['Sanji', 'loss']]);
    const played = await getPlayedLeaders(db, USER);
    expect(played.map((l) => l.name)).toEqual(['Nami', 'Roronoa Zoro']);
  });

  it('scopes to the owner', async () => {
    await makeTournament('OP02 Paramount War', 'Nami', [['Sanji', 'win']]);
    const other = await getOverallStats(db, 'someone_else');
    expect(other.totalTournaments).toBe(0);
    expect(other.wins).toBe(0);
  });
});
