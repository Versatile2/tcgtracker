import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, resetDb, closeTestDb } from '../../tests/setup/db';
import { seedReferenceData } from '../db/seed';
import { leaders, tournaments, rounds } from '../db/schema';
import { computeCtx, getAchievements, ACHIEVEMENTS } from './achievements';

const db = getTestDb();
const USER = 'user_ach';
afterAll(closeTestDb);

// --- pure computeCtx tests (synthetic rows) ---
type R = Parameters<typeof computeCtx>[0][number];
type T = Parameters<typeof computeCtx>[1][number];
const round = (o: Partial<R>): R => ({ tournamentId: 't1', setId: 's1', myLeaderId: 'L1', result: 'win', playOrder: null, opponentColors: [], ...o });
const tourney = (o: Partial<T>): T => ({ id: 't1', setId: 's1', playedOn: '2026-07-20', createdAt: new Date(), ...o });

describe('computeCtx', () => {
  it('counts totals and win rate', () => {
    const c = computeCtx(
      [round({ result: 'win' }), round({ result: 'loss' }), round({ result: 'draw' })],
      [tourney({})]
    );
    expect(c.totalTournaments).toBe(1);
    expect(c.totalRounds).toBe(3);
    expect(c.wins).toBe(1); expect(c.losses).toBe(1); expect(c.draws).toBe(1);
    expect(c.winRate).toBeCloseTo(1 / 3, 5);
  });

  it('detects a perfect run (3+ rounds, all wins)', () => {
    const rows = [round({ result: 'win' }), round({ result: 'win' }), round({ result: 'win' })];
    expect(computeCtx(rows, [tourney({})]).hasPerfectRun).toBe(true);
    const notPerfect = [round({ result: 'win' }), round({ result: 'win' })]; // only 2
    expect(computeCtx(notPerfect, [tourney({})]).hasPerfectRun).toBe(false);
  });

  it('counts second-wins, colors beaten, and distinct sets', () => {
    const c = computeCtx(
      [
        round({ result: 'win', playOrder: 'second', opponentColors: ['red', 'green'], setId: 's1' }),
        round({ result: 'win', playOrder: 'second', opponentColors: ['blue'], setId: 's2' }),
        round({ result: 'loss', playOrder: 'second', opponentColors: ['purple'], setId: 's2' }),
      ],
      [tourney({})]
    );
    expect(c.secondWins).toBe(2);
    expect(c.colorsBeaten).toBe(3); // red, green, blue (loss vs purple doesn't count)
    expect(c.distinctSets).toBe(2);
  });

  it('computes max leader-tournament count', () => {
    const c = computeCtx(
      [round({ tournamentId: 'a', myLeaderId: 'L1' }), round({ tournamentId: 'b', myLeaderId: 'L1' }), round({ tournamentId: 'c', myLeaderId: 'L2' })],
      [tourney({ id: 'a' }), tourney({ id: 'b' }), tourney({ id: 'c' })]
    );
    expect(c.maxLeaderTournaments).toBe(2);
  });

  it('computes longest winning-tournament streak by date order', () => {
    // t1 win(2-0), t2 loss(0-1), t3 win(1-0), t4 win(1-0)
    const rows = [
      round({ tournamentId: 't1', result: 'win' }), round({ tournamentId: 't1', result: 'win' }),
      round({ tournamentId: 't2', result: 'loss' }),
      round({ tournamentId: 't3', result: 'win' }),
      round({ tournamentId: 't4', result: 'win' }),
    ];
    const ts = [
      tourney({ id: 't1', playedOn: '2026-07-01' }), tourney({ id: 't2', playedOn: '2026-07-02' }),
      tourney({ id: 't3', playedOn: '2026-07-03' }), tourney({ id: 't4', playedOn: '2026-07-04' }),
    ];
    expect(computeCtx(rows, ts).maxWinStreak).toBe(2);
  });

  it('breaks the win streak on a tournament with no rounds played', () => {
    // t1 win(1-0), t2 has NO rounds at all, t3 win(1-0), t4 win(1-0)
    const rows = [
      round({ tournamentId: 't1', result: 'win' }),
      round({ tournamentId: 't3', result: 'win' }),
      round({ tournamentId: 't4', result: 'win' }),
    ];
    const ts = [
      tourney({ id: 't1', playedOn: '2026-07-01' }), tourney({ id: 't2', playedOn: '2026-07-02' }),
      tourney({ id: 't3', playedOn: '2026-07-03' }), tourney({ id: 't4', playedOn: '2026-07-04' }),
    ];
    expect(computeCtx(rows, ts).maxWinStreak).toBe(2);
  });

  it('detects set dominator (75%+ over 10+ games)', () => {
    const rows = Array.from({ length: 10 }, (_, i) => round({ setId: 's1', result: i < 8 ? 'win' : 'loss' }));
    expect(computeCtx(rows, [tourney({})]).hasSetDominator).toBe(true);
  });

  it('is all-zero on empty', () => {
    const c = computeCtx([], []);
    expect(c).toMatchObject({ totalTournaments: 0, totalRounds: 0, maxLeaderTournaments: 0, colorsBeaten: 0, maxWinStreak: 0, distinctSets: 0, hasPerfectRun: false, hasSetDominator: false });
  });
});

describe('consistent achievement progress', () => {
  const consistent = ACHIEVEMENTS.find((a) => a.key === 'consistent')!;

  it('shows games-toward-eligibility progress below 20 rounds', () => {
    const r = consistent.evaluate({ totalRounds: 12, winRate: 1 } as Parameters<typeof consistent.evaluate>[0]);
    expect(r.unlocked).toBe(false);
    expect(r.progress).toEqual({ current: 12, target: 20 });
  });

  it('has no misleading progress bar once eligible but under the win-rate bar', () => {
    const r = consistent.evaluate({ totalRounds: 20, winRate: 0.5 } as Parameters<typeof consistent.evaluate>[0]);
    expect(r.unlocked).toBe(false);
    expect(r.progress).toBeNull();
  });

  it('unlocks with null progress once both eligibility and win-rate are met', () => {
    const r = consistent.evaluate({ totalRounds: 25, winRate: 0.72 } as Parameters<typeof consistent.evaluate>[0]);
    expect(r.unlocked).toBe(true);
    expect(r.progress).toBeNull();
  });
});

// --- getAchievements integration (DB) ---
async function leaderId(name: string) {
  const [l] = await db.select().from(leaders).where(eq(leaders.name, name)).limit(1);
  return l.id;
}

describe('getAchievements', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db); });

  it('unlocks first_blood after one tournament and is owner-scoped', async () => {
    const [t] = await db.insert(tournaments).values({ ownerId: USER, type: 'local', setId: null, playedOn: '2026-07-20', status: 'locked' }).returning();
    await db.insert(rounds).values({ tournamentId: t.id, roundNumber: 1, myLeaderId: await leaderId('Nami'), opponentLeaderId: await leaderId('Sanji'), result: 'win', playOrder: 'first', notes: null });

    const mine = await getAchievements(db, USER);
    expect(mine.find((a) => a.key === 'first_blood')!.unlocked).toBe(true);
    expect(mine.length).toBe(ACHIEVEMENTS.length);

    const other = await getAchievements(db, 'someone_else');
    expect(other.find((a) => a.key === 'first_blood')!.unlocked).toBe(false);
  });

  it('reports locked achievements with progress', async () => {
    const mine = await getAchievements(db, 'empty_user');
    const veteran = mine.find((a) => a.key === 'veteran')!;
    expect(veteran.unlocked).toBe(false);
    expect(veteran.progress).toEqual({ current: 0, target: 25 });
  });
});
