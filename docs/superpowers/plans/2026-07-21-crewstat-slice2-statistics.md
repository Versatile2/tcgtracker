# Crew Stat Slice 2: Statistics & Analysis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Statistics page to Crew Stat — overall record/win-rate, per-set performance, and deck matchup analysis (per-opponent records, turn-order split, color breakdown) — as a pure read/aggregation layer over existing Slice 1 data.

**Architecture:** New `src/services/stats.ts` (SQL aggregation, `(db, ownerId)` signatures) → two new REST route handlers (`GET /api/stats`, `GET /api/stats/matchups`) → client DTOs + TanStack Query hooks → a new `/stats` page reached from the home header. No schema changes, no writes.

**Tech Stack:** Next.js 16 App Router · TypeScript · Clerk · Drizzle (node-postgres) · Neon/Postgres · Zod · TanStack Query · shadcn/ui · Tailwind · Vitest.

## Global Constraints

- **Runtime:** route handlers set `export const runtime = 'nodejs'`.
- **Ownership:** every stats query is scoped to the signed-in user via a join to `tournaments.owner_id = <clerk user id>`. No unscoped user-data query.
- **All logged rounds count** (draft or locked). "Total tournaments" counts all of the user's tournaments.
- **Compute on read** — no caching, no new tables, no migration.
- **node-postgres returns aggregate counts as strings** — wrap every `count(...)`/aggregate result with `Number(...)` before returning.
- **Win rate** is a 0–1 number in the API; the UI formats as a percentage. Divide-by-zero guards to `0`.
- **Tests** run against `DATABASE_URL_TEST` (local Postgres) via the existing harness; plain `npm test`. New DB test files add `afterAll(closeTestDb)`.
- **TDD**, pristine test output, one commit per task (unless a task says otherwise).

---

## File Structure

```
src/
  lib/
    validation/stats.ts        # Zod: matchupQuerySchema (leaderId uuid)
    dto.ts                     # + OverallStatsDTO, PerSetStatDTO, PlayedLeaderDTO, StatsDTO, MatchupStatsDTO
    api-client.ts              # + getStats(), getMatchups(leaderId)
  services/
    stats.ts                   # getOverallStats, getPerSetStats, getPlayedLeaders, getMatchupStats
    stats.test.ts              # (overall/per-set/played-leaders)  — Task 1
    stats.matchups.test.ts     # (matchups)                        — Task 2
  app/api/stats/
    route.ts                   # GET /api/stats
    matchups/route.ts          # GET /api/stats/matchups
    stats.route.test.ts        # route tests                        — Task 3
  components/
    query-hooks.ts             # + useStats(), useMatchups(leaderId)
    stats/
      stat-card.tsx            # small presentational card
      overall-stats.tsx       # overall section
      per-set-stats.tsx       # per-set table + win-rate bars
      matchup-stats.tsx       # leader picker + opponent/turn-order/color sections
      stats-view.tsx          # composes the page, data fetching
  app/stats/page.tsx           # /stats route
  components/tournaments/tournament-list.tsx   # + "Stats" link (modify)
```

---

### Task 1: Stats service — overall, per-set, played-leaders

**Files:**
- Create: `src/services/stats.ts`
- Test: `src/services/stats.test.ts`

**Interfaces:**
- Consumes: `db` (NodePgDatabase), tables `tournaments`, `rounds`, `leaders`, `sets` from `@/db/schema`.
- Produces (all `(db, ownerId)`):
  - `getOverallStats(db, ownerId) => Promise<OverallStats>` where
    `OverallStats = { totalTournaments: number; wins: number; losses: number; draws: number; winRate: number; drawRate: number; bestSet: { setId: string | null; name: string; winRate: number; games: number } | null; mostPlayedLeader: { leaderId: string; name: string; tournaments: number } | null }`
  - `getPerSetStats(db, ownerId) => Promise<PerSetStat[]>` where
    `PerSetStat = { setId: string | null; name: string; tournaments: number; wins: number; losses: number; draws: number; winRate: number }`
  - `getPlayedLeaders(db, ownerId) => Promise<{ id: string; name: string }[]>`

- [ ] **Step 1: Write the failing test `src/services/stats.test.ts`**

```ts
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
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/services/stats.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/services/stats.ts`**

```ts
import { and, eq, desc, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { tournaments, rounds, leaders, sets } from '../db/schema';

type DB = NodePgDatabase<typeof schema>;

const num = (v: unknown): number => Number(v ?? 0);
const rate = (wins: number, total: number): number => (total > 0 ? wins / total : 0);

export type OverallStats = {
  totalTournaments: number;
  wins: number; losses: number; draws: number;
  winRate: number; drawRate: number;
  bestSet: { setId: string | null; name: string; winRate: number; games: number } | null;
  mostPlayedLeader: { leaderId: string; name: string; tournaments: number } | null;
};
export type PerSetStat = {
  setId: string | null; name: string;
  tournaments: number; wins: number; losses: number; draws: number; winRate: number;
};

// Shared per-set aggregation used by both getPerSetStats and getOverallStats (bestSet).
async function aggregateBySet(db: DB, ownerId: string) {
  const rows = await db
    .select({
      setId: tournaments.setId,
      setName: sets.name,
      tournaments: sql<number>`count(distinct ${tournaments.id})`,
      wins: sql<number>`count(*) filter (where ${rounds.result} = 'win')`,
      losses: sql<number>`count(*) filter (where ${rounds.result} = 'loss')`,
      draws: sql<number>`count(*) filter (where ${rounds.result} = 'draw')`,
    })
    .from(rounds)
    .innerJoin(tournaments, eq(rounds.tournamentId, tournaments.id))
    .leftJoin(sets, eq(tournaments.setId, sets.id))
    .where(eq(tournaments.ownerId, ownerId))
    .groupBy(tournaments.setId, sets.name);
  return rows.map((r) => {
    const wins = num(r.wins), losses = num(r.losses), draws = num(r.draws);
    return {
      setId: r.setId ?? null,
      name: r.setName ?? 'No set',
      tournaments: num(r.tournaments),
      wins, losses, draws,
      games: wins + losses + draws,
      winRate: rate(wins, wins + losses + draws),
    };
  });
}

export async function getPerSetStats(db: DB, ownerId: string): Promise<PerSetStat[]> {
  const rows = await aggregateBySet(db, ownerId);
  return rows
    .map(({ games, ...rest }) => rest)
    .sort((a, b) => b.winRate - a.winRate || a.name.localeCompare(b.name));
}

export async function getPlayedLeaders(db: DB, ownerId: string): Promise<{ id: string; name: string }[]> {
  return db
    .selectDistinct({ id: leaders.id, name: leaders.name })
    .from(rounds)
    .innerJoin(tournaments, eq(rounds.tournamentId, tournaments.id))
    .innerJoin(leaders, eq(rounds.myLeaderId, leaders.id))
    .where(eq(tournaments.ownerId, ownerId))
    .orderBy(leaders.name);
}

export async function getOverallStats(db: DB, ownerId: string): Promise<OverallStats> {
  const bySet = await aggregateBySet(db, ownerId);
  const wins = bySet.reduce((s, r) => s + r.wins, 0);
  const losses = bySet.reduce((s, r) => s + r.losses, 0);
  const draws = bySet.reduce((s, r) => s + r.draws, 0);
  const total = wins + losses + draws;

  const [{ count: totalTournaments }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tournaments)
    .where(eq(tournaments.ownerId, ownerId));

  // best set: highest win rate among sets with at least one game
  const withGames = bySet.filter((r) => r.games > 0);
  withGames.sort((a, b) => b.winRate - a.winRate || b.games - a.games || a.name.localeCompare(b.name));
  const best = withGames[0];
  const bestSet = best ? { setId: best.setId, name: best.name, winRate: best.winRate, games: best.games } : null;

  const [mp] = await db
    .select({
      leaderId: rounds.myLeaderId,
      name: leaders.name,
      tournaments: sql<number>`count(distinct ${rounds.tournamentId})`,
    })
    .from(rounds)
    .innerJoin(tournaments, eq(rounds.tournamentId, tournaments.id))
    .innerJoin(leaders, eq(rounds.myLeaderId, leaders.id))
    .where(eq(tournaments.ownerId, ownerId))
    .groupBy(rounds.myLeaderId, leaders.name)
    .orderBy(desc(sql`count(distinct ${rounds.tournamentId})`))
    .limit(1);
  const mostPlayedLeader = mp ? { leaderId: mp.leaderId, name: mp.name, tournaments: num(mp.tournaments) } : null;

  return {
    totalTournaments: num(totalTournaments),
    wins, losses, draws,
    winRate: rate(wins, total),
    drawRate: rate(draws, total),
    bestSet,
    mostPlayedLeader,
  };
}
```

- [ ] **Step 4: Run the test to green**

Run: `npm test -- src/services/stats.test.ts`
Expected: PASS. If a Drizzle SQL API detail differs (e.g. `filter (where …)` interpolation), adjust minimally to a working equivalent and keep behavior; re-run until green.

- [ ] **Step 5: Commit**

```bash
git add src/services/stats.ts src/services/stats.test.ts
git commit -m "feat(stats): overall, per-set, and played-leaders aggregation"
```

---

### Task 2: Stats service — matchups (opponents, turn-order, color breakdown)

**Files:**
- Modify: `src/services/stats.ts` (add `getMatchupStats` + types)
- Test: `src/services/stats.matchups.test.ts`

**Interfaces:**
- Consumes: everything from Task 1's `stats.ts`.
- Produces:
  - `getMatchupStats(db, ownerId, leaderId: string) => Promise<MatchupStats>` where
    ```ts
    type ResultCounts = { wins: number; losses: number; draws: number; games: number; winRate: number };
    type MatchupStats = {
      opponents: (ResultCounts & { leaderId: string; name: string; verdict: 'favored' | 'even' | 'unfavored' })[];
      turnOrder: { first: ResultCounts; second: ResultCounts };
      colorBreakdown: (ResultCounts & { color: string })[];
    };
    ```

- [ ] **Step 1: Write the failing test `src/services/stats.matchups.test.ts`**

```ts
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
async function addRounds(rows: [string, string, 'win' | 'loss' | 'draw', 'first' | 'second' | null][]) {
  const [t] = await db.insert(tournaments).values({ ownerId: USER, type: 'local', setId: null, playedOn: '2026-07-20', status: 'locked' }).returning();
  let n = 1;
  for (const [mine, opp, result, po] of rows) {
    await db.insert(rounds).values({
      tournamentId: t.id, roundNumber: n++,
      myLeaderId: await leaderId(mine), opponentLeaderId: await leaderId(opp),
      result, playOrder: po, notes: null,
    });
  }
}

describe('stats service — matchups', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db); });

  it('aggregates per-opponent records with verdict', async () => {
    // Zoro vs Doflamingo(purple): 2-0 favored; vs Nami(blue): 0-2 unfavored
    await addRounds([
      ['Roronoa Zoro', 'Donquixote Doflamingo', 'win', 'first'],
      ['Roronoa Zoro', 'Donquixote Doflamingo', 'win', 'second'],
      ['Roronoa Zoro', 'Nami', 'loss', 'first'],
      ['Roronoa Zoro', 'Nami', 'loss', 'second'],
    ]);
    const m = await getMatchupStats(db, USER, await leaderId('Roronoa Zoro'));
    const dofla = m.opponents.find((o) => o.name === 'Donquixote Doflamingo')!;
    expect(dofla).toMatchObject({ wins: 2, losses: 0, draws: 0, games: 2, verdict: 'favored' });
    expect(dofla.winRate).toBeCloseTo(1, 5);
    const nami = m.opponents.find((o) => o.name === 'Nami')!;
    expect(nami).toMatchObject({ wins: 0, losses: 2, verdict: 'unfavored' });
  });

  it('splits by turn order and excludes null play-order', async () => {
    await addRounds([
      ['Roronoa Zoro', 'Nami', 'win', 'first'],
      ['Roronoa Zoro', 'Nami', 'loss', 'second'],
      ['Roronoa Zoro', 'Nami', 'win', null], // excluded from turn-order split
    ]);
    const m = await getMatchupStats(db, USER, await leaderId('Roronoa Zoro'));
    expect(m.turnOrder.first).toMatchObject({ wins: 1, losses: 0, games: 1 });
    expect(m.turnOrder.second).toMatchObject({ wins: 0, losses: 1, games: 1 });
  });

  it('breaks down by opponent color (multi-color counts to each; empty => colorless)', async () => {
    // Trafalgar Law is seeded ['red','green']; win vs Law contributes to both red and green
    await addRounds([['Roronoa Zoro', 'Trafalgar Law', 'win', 'first']]);
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
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/services/stats.matchups.test.ts`
Expected: FAIL (`getMatchupStats` not exported).

- [ ] **Step 3: Add `getMatchupStats` (and types) to `src/services/stats.ts`**

Append to `src/services/stats.ts`:

```ts
export type ResultCounts = { wins: number; losses: number; draws: number; games: number; winRate: number };
export type MatchupStats = {
  opponents: (ResultCounts & { leaderId: string; name: string; verdict: 'favored' | 'even' | 'unfavored' })[];
  turnOrder: { first: ResultCounts; second: ResultCounts };
  colorBreakdown: (ResultCounts & { color: string })[];
};

function counts(wins: number, losses: number, draws: number): ResultCounts {
  const games = wins + losses + draws;
  return { wins, losses, draws, games, winRate: rate(wins, games) };
}
function verdictOf(winRate: number): 'favored' | 'even' | 'unfavored' {
  if (winRate >= 0.55) return 'favored';
  if (winRate <= 0.45) return 'unfavored';
  return 'even';
}

export async function getMatchupStats(db: DB, ownerId: string, leaderId: string): Promise<MatchupStats> {
  // Opponents
  const oppRows = await db
    .select({
      leaderId: rounds.opponentLeaderId,
      name: leaders.name,
      wins: sql<number>`count(*) filter (where ${rounds.result} = 'win')`,
      losses: sql<number>`count(*) filter (where ${rounds.result} = 'loss')`,
      draws: sql<number>`count(*) filter (where ${rounds.result} = 'draw')`,
    })
    .from(rounds)
    .innerJoin(tournaments, eq(rounds.tournamentId, tournaments.id))
    .innerJoin(leaders, eq(rounds.opponentLeaderId, leaders.id))
    .where(and(eq(tournaments.ownerId, ownerId), eq(rounds.myLeaderId, leaderId)))
    .groupBy(rounds.opponentLeaderId, leaders.name);
  const opponents = oppRows
    .map((r) => {
      const c = counts(num(r.wins), num(r.losses), num(r.draws));
      return { leaderId: r.leaderId, name: r.name, ...c, verdict: verdictOf(c.winRate) };
    })
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));

  // Turn order (exclude null play_order)
  const toRows = await db
    .select({
      playOrder: rounds.playOrder,
      wins: sql<number>`count(*) filter (where ${rounds.result} = 'win')`,
      losses: sql<number>`count(*) filter (where ${rounds.result} = 'loss')`,
      draws: sql<number>`count(*) filter (where ${rounds.result} = 'draw')`,
    })
    .from(rounds)
    .innerJoin(tournaments, eq(rounds.tournamentId, tournaments.id))
    .where(and(eq(tournaments.ownerId, ownerId), eq(rounds.myLeaderId, leaderId), sql`${rounds.playOrder} is not null`))
    .groupBy(rounds.playOrder);
  const toFor = (po: 'first' | 'second') => {
    const r = toRows.find((x) => x.playOrder === po);
    return r ? counts(num(r.wins), num(r.losses), num(r.draws)) : counts(0, 0, 0);
  };
  const turnOrder = { first: toFor('first'), second: toFor('second') };

  // Color breakdown (unnest opponent colors; empty array => 'colorless')
  const colorResult = await db.execute(sql`
    SELECT color,
      count(*) filter (where r.result = 'win')  as wins,
      count(*) filter (where r.result = 'loss') as losses,
      count(*) filter (where r.result = 'draw') as draws
    FROM rounds r
    JOIN tournaments t ON r.tournament_id = t.id
    JOIN leaders opp ON r.opponent_leader_id = opp.id
    LEFT JOIN LATERAL unnest(
      CASE WHEN cardinality(opp.colors) = 0 THEN ARRAY['colorless'] ELSE opp.colors END
    ) AS color ON true
    WHERE t.owner_id = ${ownerId} AND r.my_leader_id = ${leaderId}
    GROUP BY color
  `);
  const colorBreakdown = (colorResult.rows as { color: string; wins: unknown; losses: unknown; draws: unknown }[])
    .map((r) => ({ color: r.color, ...counts(num(r.wins), num(r.losses), num(r.draws)) }))
    .sort((a, b) => b.games - a.games || a.color.localeCompare(b.color));

  return { opponents, turnOrder, colorBreakdown };
}
```

- [ ] **Step 4: Run the test to green**

Run: `npm test -- src/services/stats.matchups.test.ts`
Expected: PASS. If `db.execute` result shape differs (rows access), adjust the row extraction minimally and keep behavior; re-run until green.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all pass (Slice 1 + new stats tests), pristine.

- [ ] **Step 6: Commit**

```bash
git add src/services/stats.ts src/services/stats.matchups.test.ts
git commit -m "feat(stats): matchup analysis — opponents, turn-order, color breakdown"
```

---

### Task 3: Stats DTOs (server), validation, and REST route handlers

**Files:**
- Create: `src/lib/validation/stats.ts`, `src/app/api/stats/route.ts`, `src/app/api/stats/matchups/route.ts`, `src/app/api/stats/stats.route.test.ts`

**Interfaces:**
- Consumes: `requireUserId`, `errorToResponse`, `json` (`@/lib/api/handler`); `db` (`@/db/client`); stats service functions.
- Produces:
  - `matchupQuerySchema` (Zod) validating `{ leaderId: string uuid }`.
  - `GET /api/stats` → `{ overall, perSet, playedLeaders }`.
  - `GET /api/stats/matchups?leaderId=<uuid>` → `MatchupStats`; 400 on missing/invalid `leaderId`.

- [ ] **Step 1: Write `src/lib/validation/stats.ts`**

```ts
import { z } from 'zod';
export const matchupQuerySchema = z.object({ leaderId: z.string().uuid() });
export type MatchupQuery = z.infer<typeof matchupQuerySchema>;
```

- [ ] **Step 2: Write the failing test `src/app/api/stats/stats.route.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, resetDb, closeTestDb } from '../../../../tests/setup/db';
import { seedReferenceData } from '../../../db/seed';
import { leaders, tournaments, rounds } from '../../../db/schema';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_route_stats' })) }));
vi.mock('@/db/client', () => ({ db: getTestDb(), schema: {} }));

const db = getTestDb();
afterAll(closeTestDb);

async function leaderId(name: string) {
  const [l] = await db.select().from(leaders).where(eq(leaders.name, name)).limit(1);
  return l.id;
}

describe('stats routes', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db); });

  it('GET /api/stats returns overall, perSet, playedLeaders', async () => {
    const [t] = await db.insert(tournaments).values({ ownerId: 'user_route_stats', type: 'local', setId: null, playedOn: '2026-07-20', status: 'locked' }).returning();
    await db.insert(rounds).values({ tournamentId: t.id, roundNumber: 1, myLeaderId: await leaderId('Nami'), opponentLeaderId: await leaderId('Sanji'), result: 'win', playOrder: 'first', notes: null });

    const { GET } = await import('./route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.overall.wins).toBe(1);
    expect(Array.isArray(body.perSet)).toBe(true);
    expect(body.playedLeaders.some((l: { name: string }) => l.name === 'Nami')).toBe(true);
  });

  it('GET matchups requires a valid leaderId (400)', async () => {
    const { GET } = await import('./matchups/route');
    const res = await GET(new Request('http://test/api/stats/matchups'));
    expect(res.status).toBe(400);
  });

  it('GET matchups returns the matchup structure', async () => {
    const zoro = await leaderId('Roronoa Zoro');
    const [t] = await db.insert(tournaments).values({ ownerId: 'user_route_stats', type: 'local', setId: null, playedOn: '2026-07-20', status: 'locked' }).returning();
    await db.insert(rounds).values({ tournamentId: t.id, roundNumber: 1, myLeaderId: zoro, opponentLeaderId: await leaderId('Nami'), result: 'win', playOrder: 'first', notes: null });

    const { GET } = await import('./matchups/route');
    const res = await GET(new Request(`http://test/api/stats/matchups?leaderId=${zoro}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.opponents[0].name).toBe('Nami');
    expect(body.turnOrder.first.wins).toBe(1);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npm test -- stats.route`
Expected: FAIL (route modules not found).

- [ ] **Step 4: Write `src/app/api/stats/route.ts`**

```ts
import { db } from '@/db/client';
import { requireUserId, errorToResponse, json } from '@/lib/api/handler';
import { getOverallStats, getPerSetStats, getPlayedLeaders } from '@/services/stats';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const userId = await requireUserId();
    const [overall, perSet, playedLeaders] = await Promise.all([
      getOverallStats(db, userId),
      getPerSetStats(db, userId),
      getPlayedLeaders(db, userId),
    ]);
    return json({ overall, perSet, playedLeaders });
  } catch (err) {
    return errorToResponse(err);
  }
}
```

- [ ] **Step 5: Write `src/app/api/stats/matchups/route.ts`**

```ts
import { db } from '@/db/client';
import { requireUserId, errorToResponse, json } from '@/lib/api/handler';
import { getMatchupStats } from '@/services/stats';
import { matchupQuerySchema } from '@/lib/validation/stats';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const { leaderId } = matchupQuerySchema.parse({ leaderId: searchParams.get('leaderId') ?? undefined });
    return json(await getMatchupStats(db, userId, leaderId));
  } catch (err) {
    return errorToResponse(err);
  }
}
```

- [ ] **Step 6: Run the test to green**

Run: `npm test -- stats.route`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/validation/stats.ts src/app/api/stats
git commit -m "feat(api): stats and matchups route handlers"
```

---

### Task 4: Client — DTOs, api-client methods, query hooks

**Files:**
- Modify: `src/lib/dto.ts`, `src/lib/api-client.ts`, `src/components/query-hooks.ts`

**Interfaces:**
- Produces:
  - DTOs in `dto.ts`: `OverallStatsDTO`, `PerSetStatDTO`, `PlayedLeaderDTO`, `StatsDTO`, `MatchupResultCountsDTO`, `MatchupOpponentDTO`, `MatchupStatsDTO`.
  - `apiClient.getStats()` → `StatsDTO`; `apiClient.getMatchups(leaderId)` → `MatchupStatsDTO`.
  - Hooks `useStats()` and `useMatchups(leaderId: string | null)` (the latter disabled when `leaderId` is null).

- [ ] **Step 1: Append DTOs to `src/lib/dto.ts`**

```ts
export type OverallStatsDTO = {
  totalTournaments: number;
  wins: number; losses: number; draws: number;
  winRate: number; drawRate: number;
  bestSet: { setId: string | null; name: string; winRate: number; games: number } | null;
  mostPlayedLeader: { leaderId: string; name: string; tournaments: number } | null;
};
export type PerSetStatDTO = {
  setId: string | null; name: string;
  tournaments: number; wins: number; losses: number; draws: number; winRate: number;
};
export type PlayedLeaderDTO = { id: string; name: string };
export type StatsDTO = { overall: OverallStatsDTO; perSet: PerSetStatDTO[]; playedLeaders: PlayedLeaderDTO[] };
export type MatchupResultCountsDTO = { wins: number; losses: number; draws: number; games: number; winRate: number };
export type MatchupOpponentDTO = MatchupResultCountsDTO & { leaderId: string; name: string; verdict: 'favored' | 'even' | 'unfavored' };
export type MatchupStatsDTO = {
  opponents: MatchupOpponentDTO[];
  turnOrder: { first: MatchupResultCountsDTO; second: MatchupResultCountsDTO };
  colorBreakdown: (MatchupResultCountsDTO & { color: string })[];
};
```

- [ ] **Step 2: Add methods to `src/lib/api-client.ts`**

Add these imports at the top (extend the existing dto import) and methods inside the `apiClient` object:

```ts
// add to the existing `import type { ... } from './dto';`
//   StatsDTO, MatchupStatsDTO
```

```ts
  getStats: () => request<StatsDTO>('/api/stats'),
  getMatchups: (leaderId: string) => request<MatchupStatsDTO>(`/api/stats/matchups?leaderId=${encodeURIComponent(leaderId)}`),
```

- [ ] **Step 3: Add hooks to `src/components/query-hooks.ts`**

Add to the `keys` object and export the hooks:

```ts
// in keys:
//   stats: ['stats'] as const,
//   matchups: (leaderId: string) => ['matchups', leaderId] as const,

export const useStats = () => useQuery({ queryKey: keys.stats, queryFn: apiClient.getStats });
export const useMatchups = (leaderId: string | null) =>
  useQuery({
    queryKey: keys.matchups(leaderId ?? ''),
    queryFn: () => apiClient.getMatchups(leaderId as string),
    enabled: !!leaderId,
  });
```

- [ ] **Step 4: Typecheck / build**

Run: `npm run build`
Expected: succeeds (types line up). Run `npm test` to confirm no regression.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dto.ts src/lib/api-client.ts src/components/query-hooks.ts
git commit -m "feat(client): stats DTOs, api-client methods, and query hooks"
```

---

### Task 5: Stats UI — page, sections, and home nav link

**Files:**
- Create: `src/components/stats/stat-card.tsx`, `src/components/stats/overall-stats.tsx`, `src/components/stats/per-set-stats.tsx`, `src/components/stats/matchup-stats.tsx`, `src/components/stats/stats-view.tsx`, `src/app/stats/page.tsx`
- Modify: `src/components/tournaments/tournament-list.tsx` (add a "Stats" link)
- Test: none (UI; verified by build — matches Slice 1's convention)

**Interfaces:**
- Consumes: `useStats`, `useMatchups`, DTOs, `formatRecord` (`@/lib/record`), shadcn `card`/`select`/`badge`/`skeleton`, `ReferenceCombobox` is NOT reused (use a simple shadcn `Select` for the leader picker).

- [ ] **Step 1: Write `src/components/stats/stat-card.tsx`**

```tsx
import { Card } from '@/components/ui/card';

export function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
```

- [ ] **Step 2: Write `src/components/stats/overall-stats.tsx`**

```tsx
import { StatCard, pct } from './stat-card';
import { formatRecord } from '@/lib/record';
import type { OverallStatsDTO } from '@/lib/dto';

export function OverallStats({ o }: { o: OverallStatsDTO }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Overall</h2>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Tournaments" value={String(o.totalTournaments)} />
        <StatCard label="Record" value={formatRecord({ wins: o.wins, losses: o.losses, draws: o.draws })} />
        <StatCard label="Win rate" value={pct(o.winRate)} />
        <StatCard label="Draw rate" value={pct(o.drawRate)} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard label="Best set" value={o.bestSet ? o.bestSet.name : '—'} sub={o.bestSet ? `${pct(o.bestSet.winRate)} over ${o.bestSet.games} games` : undefined} />
        <StatCard label="Most-played leader" value={o.mostPlayedLeader ? o.mostPlayedLeader.name : '—'} sub={o.mostPlayedLeader ? `${o.mostPlayedLeader.tournaments} tournaments` : undefined} />
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Write `src/components/stats/per-set-stats.tsx`**

```tsx
import { pct } from './stat-card';
import { formatRecord } from '@/lib/record';
import type { PerSetStatDTO } from '@/lib/dto';

export function PerSetStats({ rows }: { rows: PerSetStatDTO[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">By set</h2>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.setId ?? 'none'} className="rounded-lg border p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{r.name}</span>
              <span className="text-muted-foreground tabular-nums">
                {formatRecord({ wins: r.wins, losses: r.losses, draws: r.draws })} · {pct(r.winRate)} · {r.tournaments} {r.tournaments === 1 ? 'tournament' : 'tournaments'}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: pct(r.winRate) }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Write `src/components/stats/matchup-stats.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { pct } from './stat-card';
import { formatRecord } from '@/lib/record';
import { useMatchups } from '@/components/query-hooks';
import type { PlayedLeaderDTO, MatchupResultCountsDTO } from '@/lib/dto';

const verdictStyle: Record<'favored' | 'even' | 'unfavored', string> = {
  favored: 'bg-green-600 text-white',
  even: 'bg-yellow-500 text-black',
  unfavored: 'bg-red-600 text-white',
};

function CountsLine({ c }: { c: MatchupResultCountsDTO }) {
  return <span className="text-muted-foreground tabular-nums">{formatRecord(c)} · {pct(c.winRate)} · {c.games} {c.games === 1 ? 'game' : 'games'}</span>;
}

export function MatchupStats({ leaders }: { leaders: PlayedLeaderDTO[] }) {
  const [leaderId, setLeaderId] = useState<string | null>(null);
  const { data, isLoading } = useMatchups(leaderId);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Matchups</h2>
      {leaders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Log some rounds to see matchup analysis.</p>
      ) : (
        <Select value={leaderId ?? undefined} onValueChange={setLeaderId}>
          <SelectTrigger className="h-12"><SelectValue placeholder="Pick one of your leaders" /></SelectTrigger>
          <SelectContent>
            {leaders.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {leaderId && isLoading && <Skeleton className="h-24 w-full" />}
      {leaderId && data && (
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Opponents</h3>
            {data.opponents.length === 0 && <p className="text-sm text-muted-foreground">No rounds with this leader yet.</p>}
            {data.opponents.map((o) => (
              <div key={o.leaderId} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <span className="flex items-center gap-2"><Badge className={verdictStyle[o.verdict]}>{o.verdict}</Badge>{o.name}</span>
                <CountsLine c={o} />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Turn order</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3 text-sm"><p className="font-medium">Went 1st</p><CountsLine c={data.turnOrder.first} /></div>
              <div className="rounded-lg border p-3 text-sm"><p className="font-medium">Went 2nd</p><CountsLine c={data.turnOrder.second} /></div>
            </div>
          </div>
          {data.colorBreakdown.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Vs color</h3>
              {data.colorBreakdown.map((c) => (
                <div key={c.color} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <span className="capitalize">{c.color}</span>
                  <CountsLine c={c} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Write `src/components/stats/stats-view.tsx`**

```tsx
'use client';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { useStats } from '@/components/query-hooks';
import { OverallStats } from './overall-stats';
import { PerSetStats } from './per-set-stats';
import { MatchupStats } from './matchup-stats';

export function StatsView() {
  const { data, isLoading, isError } = useStats();

  return (
    <main className="mx-auto max-w-xl space-y-6 p-4 pb-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Statistics</h1>
        <Link href="/" className="text-sm text-muted-foreground">← Home</Link>
      </div>

      {isLoading && <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>}
      {isError && <p className="text-destructive">Couldn’t load statistics.</p>}
      {data && data.overall.totalTournaments === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          No stats yet — log a tournament to get started.
        </div>
      )}
      {data && data.overall.totalTournaments > 0 && (
        <>
          <OverallStats o={data.overall} />
          <PerSetStats rows={data.perSet} />
          <MatchupStats leaders={data.playedLeaders} />
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 6: Write `src/app/stats/page.tsx`**

```tsx
import { StatsView } from '@/components/stats/stats-view';

export default function StatsPage() {
  return <StatsView />;
}
```

- [ ] **Step 7: Add a "Stats" link to the home header in `src/components/tournaments/tournament-list.tsx`**

Find the header row that renders the `<h1>Crew Stat</h1>` and add a link beside it, e.g.:

```tsx
// change the header block to include a Stats link:
<div className="flex items-center justify-between">
  <h1 className="text-2xl font-bold">Crew Stat</h1>
  <Link href="/stats" className="text-sm font-medium text-muted-foreground">Stats →</Link>
</div>
```

Ensure `import Link from 'next/link';` is present (it already is for the Add-Tournament link).

- [ ] **Step 8: Build + full test**

Run: `npm run build` → must succeed.
Run: `npm test` → all pass, pristine.

- [ ] **Step 9: Commit**

```bash
git add src/components/stats src/app/stats/page.tsx src/components/tournaments/tournament-list.tsx
git commit -m "feat(ui): statistics page with overall, per-set, and matchup sections"
```

---

## Self-Review

**Spec coverage:**

| Spec item | Task |
|-----------|------|
| Overall stats (UC6) | 1, 3, 5 |
| Per-set stats (UC7) | 1, 3, 5 |
| Played-leaders picker source | 1, 3, 4, 5 |
| Matchup analysis: opponents (UC8) | 2, 3, 5 |
| Turn-order split (UC8) | 2, 3, 5 |
| Color breakdown (UC8) | 2, 3, 5 |
| SQL aggregation, owner-scoped | 1, 2 |
| All logged rounds count; total tournaments = all | 1 |
| One-call `/api/stats` + matchups endpoint | 3 |
| DTOs + hooks | 4 |
| Stats page + home nav link, empty states | 5 |
| Edge cases (0-div, null play-order, colorless) | 1, 2 |

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** service return types (`OverallStats`, `PerSetStat`, `MatchupStats`, `ResultCounts`) match the client DTOs (`OverallStatsDTO`, `PerSetStatDTO`, `MatchupStatsDTO`, `MatchupResultCountsDTO`) field-for-field; `winRate`/`drawRate` are 0–1 numbers everywhere and only formatted with `pct()` in the UI; `verdict` union identical in service and DTO; hook names (`useStats`, `useMatchups`) match their consumers in Task 5.

**Note for implementers:** the SQL in Tasks 1–2 uses `count(*) filter (where …)`, `unnest`, and `db.execute` — if a Drizzle/node-postgres API detail differs at runtime, the TDD loop will surface it; adjust the query minimally to a working equivalent that satisfies the test assertions, without changing the returned shape.
