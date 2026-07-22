import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, resetDb, closeTestDb } from '../../tests/setup/db';
import { seedReferenceData } from '../db/seed';
import { leaders, tournaments, rounds } from '../db/schema';
import { getMatchupStats } from './stats';

const db = getTestDb();
const USER = 'user_matchup';
afterAll(closeTestDb);

async function leaderId(name: string) {
  const [l] = await db.select().from(leaders).where(eq(leaders.name, name)).limit(1);
  return l.id;
}
async function addRounds(myLeader: string, rows: [string, 'win' | 'loss' | 'draw', 'first' | 'second' | null][]) {
  const [t] = await db.insert(tournaments).values({ ownerId: USER, type: 'local', myLeaderId: await leaderId(myLeader), metaId: null, playedOn: '2026-07-20', status: 'locked' }).returning();
  let n = 1;
  for (const [opp, result, po] of rows) {
    await db.insert(rounds).values({
      tournamentId: t.id, roundNumber: n++,
      opponentLeaderId: await leaderId(opp),
      result, playOrder: po, notes: null,
    });
  }
}

describe('stats service — matchups', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db); });

  it('aggregates per-opponent records with verdict', async () => {
    // Zoro vs Doflamingo(purple): 2-0 favored; vs Nami(blue): 0-2 unfavored
    await addRounds('Roronoa Zoro', [
      ['Donquixote Doflamingo', 'win', 'first'],
      ['Donquixote Doflamingo', 'win', 'second'],
      ['Nami', 'loss', 'first'],
      ['Nami', 'loss', 'second'],
    ]);
    const m = await getMatchupStats(db, USER, await leaderId('Roronoa Zoro'));
    const dofla = m.opponents.find((o) => o.name === 'Donquixote Doflamingo')!;
    expect(dofla).toMatchObject({ wins: 2, losses: 0, draws: 0, games: 2, verdict: 'favored' });
    expect(dofla.winRate).toBeCloseTo(1, 5);
    const nami = m.opponents.find((o) => o.name === 'Nami')!;
    expect(nami).toMatchObject({ wins: 0, losses: 2, verdict: 'unfavored' });
  });

  it('splits by turn order and excludes null play-order', async () => {
    await addRounds('Roronoa Zoro', [
      ['Nami', 'win', 'first'],
      ['Nami', 'loss', 'second'],
      ['Nami', 'win', null], // excluded from turn-order split
    ]);
    const m = await getMatchupStats(db, USER, await leaderId('Roronoa Zoro'));
    expect(m.turnOrder.first).toMatchObject({ wins: 1, losses: 0, games: 1 });
    expect(m.turnOrder.second).toMatchObject({ wins: 0, losses: 1, games: 1 });
  });

  it('breaks down by opponent color (multi-color counts to each; empty => colorless)', async () => {
    // Trafalgar Law is seeded ['red','green']; win vs Law contributes to both red and green
    await addRounds('Roronoa Zoro', [['Trafalgar Law', 'win', 'first']]);
    const m = await getMatchupStats(db, USER, await leaderId('Roronoa Zoro'));
    const red = m.colorBreakdown.find((c) => c.color === 'red')!;
    const green = m.colorBreakdown.find((c) => c.color === 'green')!;
    expect(red.wins).toBe(1);
    expect(green.wins).toBe(1);
  });

  it('returns empty structures for a leader with no rounds', async () => {
    const m = await getMatchupStats(db, USER, await leaderId('Nami'));
    expect(m.opponents).toEqual([]);
    expect(m.turnOrder.first.games).toBe(0);
    expect(m.turnOrder.second.games).toBe(0);
    expect(m.colorBreakdown).toEqual([]);
  });
});
