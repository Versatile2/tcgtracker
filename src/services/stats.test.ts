import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../tests/setup/db';
import { seedReferenceData } from '../db/seed';
import { leaders, metas, tournaments, rounds } from '../db/schema';
import { asc, eq } from 'drizzle-orm';
import { getOverallStats, getPerMetaStats, getPlayedLeaders, getOpponentStats, getMatchupStats } from './stats';
import { afterAll } from 'vitest';

const db = getTestDb();
const USER = 'user_stats';
afterAll(closeTestDb);

async function leaderId(name: string) {
  // Ordered by set code: a leader name maps to several real printings, so an
  // unordered limit(1) would pick a different row from run to run.
  const [l] = await db.select().from(leaders).where(eq(leaders.name, name)).orderBy(asc(leaders.setCode)).limit(1);
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
// Add a single round to an existing tournament, optionally tagged with an opponent meta.
async function addRoundTo(tournamentId: string, roundNumber: number, opp: string, result: 'win' | 'loss' | 'draw', oppMeta?: string) {
  await db.insert(rounds).values({
    tournamentId, roundNumber,
    opponentLeaderId: await leaderId(opp),
    opponentMetaId: oppMeta ? await metaId(oppMeta) : null,
    result, playOrder: null, notes: null,
  });
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
    expect(o.bestMeta?.name).toBe('OP02');
  });

  it('excludes bye / no_show rounds from win-rate stats', async () => {
    const t = await makeTournament('OP02 Paramount War', 'Roronoa Zoro', [['Nami', 'win'], ['Sanji', 'loss']]);
    // A bye and a no-show: opponent-less auto-wins that must NOT inflate win-rate.
    await db.insert(rounds).values({ tournamentId: t.id, roundNumber: 3, kind: 'bye', opponentLeaderId: null, result: 'win', playOrder: null, notes: null });
    await db.insert(rounds).values({ tournamentId: t.id, roundNumber: 4, kind: 'no_show', opponentLeaderId: null, result: 'win', playOrder: null, notes: null });
    const o = await getOverallStats(db, USER);
    expect(o.wins).toBe(1);
    expect(o.losses).toBe(1);
    expect(o.winRate).toBeCloseTo(0.5, 5); // 1 win / 2 real games, byes ignored
  });

  it('returns null best-meta / most-played and zeros with no data', async () => {
    const o = await getOverallStats(db, USER);
    expect(o).toMatchObject({ totalTournaments: 0, wins: 0, losses: 0, draws: 0, winRate: 0, drawRate: 0, bestMeta: null, mostPlayedLeader: null });
  });

  it('groups per-meta with counts and sorts by win rate', async () => {
    await makeTournament('OP02 Paramount War', 'Roronoa Zoro', [['Nami', 'win'], ['Nami', 'win']]);
    await makeTournament('OP01 Romance Dawn', 'Nami', [['Sanji', 'loss']]);
    const per = await getPerMetaStats(db, USER);
    expect(per[0].name).toBe('OP02');
    expect(per[0]).toMatchObject({ tournaments: 1, wins: 2, losses: 0, draws: 0 });
    expect(per[0].winRate).toBeCloseTo(1, 5);
    const romance = per.find((p) => p.name === 'OP01')!;
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

  it('breaks opponents down by leader and by meta, falling back to the tournament meta', async () => {
    const t = await makeTournament('OP02 Paramount War', 'Roronoa Zoro', []);
    await addRoundTo(t.id, 1, 'Nami', 'win', 'OP02 Paramount War');
    await addRoundTo(t.id, 2, 'Nami', 'loss', 'OP02 Paramount War');
    await addRoundTo(t.id, 3, 'Nami', 'win'); // no meta
    await addRoundTo(t.id, 4, 'Sanji', 'win'); // no meta, different opponent leader

    const opp = await getOpponentStats(db, USER);
    const nami = opp.find((o) => o.name === 'Nami')!;
    expect(nami.games).toBe(3); // all rounds counted overall
    expect(nami.wins).toBe(2);
    expect(nami.losses).toBe(1);
    // The untagged round now falls back to its tournament's meta (OP02), so all
    // three Nami rounds land in the same bucket instead of only the tagged two.
    expect(nami.byMeta).toHaveLength(1);
    expect(nami.byMeta[0].name).toBe('OP02');
    expect(nami.byMeta[0].games).toBe(3);
    expect(nami.byMeta[0].wins).toBe(2);
    expect(nami.byMeta[0].losses).toBe(1);

    const sanji = opp.find((o) => o.name === 'Sanji')!;
    expect(sanji.games).toBe(1);
    // Previously empty: an untagged round used to be excluded entirely. It now
    // inherits the tournament's meta.
    expect(sanji.byMeta).toHaveLength(1);
    expect(sanji.byMeta[0].name).toBe('OP02');
  });

  it('prefers a round own meta over its tournament meta, and skips rounds with neither', async () => {
    // Tournament is OP02; one round is explicitly tagged OP01.
    const tagged = await makeTournament('OP02 Paramount War', 'Roronoa Zoro', []);
    await addRoundTo(tagged.id, 1, 'Nami', 'win', 'OP01 Romance Dawn');

    // Tournament with no meta at all, and a round with no meta either.
    const bare = await makeTournament(null, 'Roronoa Zoro', []);
    await addRoundTo(bare.id, 1, 'Sanji', 'win');

    const opp = await getOpponentStats(db, USER);

    // The round's own meta wins over the tournament's — coalesce order matters.
    const nami = opp.find((o) => o.name === 'Nami')!;
    expect(nami.byMeta.map((m) => m.name)).toEqual(['OP01']);

    // Nothing to coalesce to, so the round contributes no meta bucket.
    const sanji = opp.find((o) => o.name === 'Sanji')!;
    expect(sanji.games).toBe(1);
    expect(sanji.byMeta).toHaveLength(0);
  });

  it('excludes byes from opponent stats even when their tournament has a meta', async () => {
    // Tournament has a meta, so a bye's coalesced meta would be non-null if it
    // weren't excluded — it must still contribute nothing to getOpponentStats.
    const t = await makeTournament('OP02 Paramount War', 'Roronoa Zoro', [['Nami', 'win']]);
    await db.insert(rounds).values({ tournamentId: t.id, roundNumber: 2, kind: 'bye', opponentLeaderId: null, result: 'win', playOrder: null, notes: null });

    const opp = await getOpponentStats(db, USER);
    expect(opp).toHaveLength(1);
    const nami = opp.find((o) => o.name === 'Nami')!;
    expect(nami.games).toBe(1);
    expect(nami.byMeta).toHaveLength(1);
    expect(nami.byMeta[0].games).toBe(1);
  });

  it('reports per-meta rows by set code, and keeps the no-meta fallback', async () => {
    await makeTournament('OP02 Paramount War', 'Roronoa Zoro', [['Nami', 'win']]);
    await makeTournament(null, 'Roronoa Zoro', [['Nami', 'loss']]);
    const rows = await getPerMetaStats(db, USER);
    expect(rows.map((r) => r.name).sort()).toEqual(['No meta', 'OP02']);
  });

  it('attributes a freeplay round to the round leader, not the session', async () => {
    const [t] = await db.insert(tournaments).values({
      ownerId: USER, type: 'freeplay', myLeaderId: null, metaId: await metaId('OP02 Paramount War'),
      playedOn: '2026-08-14', status: 'locked',
    }).returning();
    await db.insert(rounds).values({
      tournamentId: t.id, roundNumber: 1,
      myLeaderId: await leaderId('Edward Newgate'),
      opponentLeaderId: await leaderId('Nami'),
      result: 'win', playOrder: null, notes: null,
    });

    // The deck appears in the selector...
    const played = await getPlayedLeaders(db, USER);
    expect(played.some((l) => l.name === 'Edward Newgate')).toBe(true);

    // ...and its matchups are attributed to it.
    const m = await getMatchupStats(db, USER, await leaderId('Edward Newgate'));
    expect(m.opponents.some((o) => o.name === 'Nami')).toBe(true);
  });

  it('keeps freeplay out of the overall record but inside per-meta', async () => {
    const [t] = await db.insert(tournaments).values({
      ownerId: USER, type: 'freeplay', myLeaderId: null, metaId: await metaId('OP02 Paramount War'),
      playedOn: '2026-08-14', status: 'locked',
    }).returning();
    await db.insert(rounds).values({
      tournamentId: t.id, roundNumber: 1,
      myLeaderId: await leaderId('Edward Newgate'),
      opponentLeaderId: await leaderId('Nami'),
      result: 'win', playOrder: null, notes: null,
    });

    const o = await getOverallStats(db, USER);
    expect(o.wins).toBe(0);
    expect(o.totalTournaments).toBe(0);

    const per = await getPerMetaStats(db, USER);
    expect(per.find((p) => p.name === 'OP02')?.wins).toBe(1);

    // By opponent needs no change at all — it is keyed by the opponent's
    // leader, never mine. This pins that it keeps counting freeplay.
    const opp = await getOpponentStats(db, USER);
    expect(opp.find((x) => x.name === 'Nami')?.games).toBe(1);
  });
});
