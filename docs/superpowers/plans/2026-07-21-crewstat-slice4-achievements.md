# Crew Stat Slice 4: Achievements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Achievements page unlocking 12 OPTCG badges computed live from existing tournament data, with a client-side "newly unlocked" toast. No schema/migration/write-path changes.

**Architecture:** `src/services/achievements.ts` (definitions + a pure `computeCtx` + a DB-backed `getAchievements(db, ownerId)`) → `GET /api/achievements` → client DTOs/hook → a `/achievements` page reached from the home header. Compute-on-read, exactly like Slice 2's stats.

**Tech Stack:** Next.js 16 · TypeScript · Clerk · Drizzle (node-postgres) · Zod (n/a here) · TanStack Query · shadcn/ui · Vitest.

## Global Constraints

- **Additive only** — no changes to `src/services/{tournaments,rounds,stats}.ts`, the write path, the schema, or existing endpoints.
- **Ownership:** every query is scoped by `tournaments.owner_id = ownerId`.
- **All logged rounds count** (draft or locked), consistent with Slice 2.
- **node-postgres** returns `leaders.colors` as a JS array and enum/text fields as strings — no numeric coercion needed here (aggregation is done in TS over fetched rows).
- The 6 OPTCG colors are exactly `['red','green','blue','purple','black','yellow']`.
- **Tests** run against `DATABASE_URL_TEST`; plain `npm test`; new DB test files add `afterAll(closeTestDb)`. TDD; pristine output; one commit per task.

---

## File Structure

```
src/
  services/achievements.ts          # ACHIEVEMENTS defs, computeCtx (pure), getAchievements
  services/achievements.test.ts     # computeCtx unit + getAchievements integration
  app/api/achievements/route.ts     # GET /api/achievements
  app/api/achievements/route.test.ts
  lib/newly-unlocked.ts             # pure set-difference helper
  lib/newly-unlocked.test.ts
  lib/dto.ts                        # + Achievement DTOs
  lib/api-client.ts                 # + getAchievements()
  components/query-hooks.ts         # + useAchievements()
  components/achievements/achievement-card.tsx
  components/achievements/achievements-view.tsx
  app/achievements/page.tsx
  components/tournaments/tournament-list.tsx   # + Achievements nav link (modify)
```

---

### Task 1: Achievements service (definitions + computeCtx + getAchievements)

**Files:**
- Create: `src/services/achievements.ts`, `src/services/achievements.test.ts`

**Interfaces:**
- Produces:
  - `type Achievement = { key: string; name: string; description: string; unlocked: boolean; progress: { current: number; target: number } | null }`
  - `ACHIEVEMENTS` (the 12 defs), `computeCtx(roundRows, tourneyRows)` (pure), `getAchievements(db, ownerId) => Promise<Achievement[]>`

- [ ] **Step 1: Write the failing test `src/services/achievements.test.ts`**

```ts
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

  it('detects set dominator (75%+ over 10+ games)', () => {
    const rows = Array.from({ length: 10 }, (_, i) => round({ setId: 's1', result: i < 8 ? 'win' : 'loss' }));
    expect(computeCtx(rows, [tourney({})]).hasSetDominator).toBe(true);
  });

  it('is all-zero on empty', () => {
    const c = computeCtx([], []);
    expect(c).toMatchObject({ totalTournaments: 0, totalRounds: 0, maxLeaderTournaments: 0, colorsBeaten: 0, maxWinStreak: 0, distinctSets: 0, hasPerfectRun: false, hasSetDominator: false });
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
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/services/achievements.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/services/achievements.ts`**

```ts
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { tournaments, rounds, leaders } from '../db/schema';

type DB = NodePgDatabase<typeof schema>;

export type AchievementProgress = { current: number; target: number };
export type Achievement = {
  key: string; name: string; description: string;
  unlocked: boolean; progress: AchievementProgress | null;
};

type Result = 'win' | 'loss' | 'draw';
export type Ctx = {
  totalTournaments: number; totalRounds: number;
  wins: number; losses: number; draws: number; winRate: number;
  hasPerfectRun: boolean; maxLeaderTournaments: number; hasSetDominator: boolean;
  secondWins: number; colorsBeaten: number; maxWinStreak: number; distinctSets: number;
};

const COLORS = ['red', 'green', 'blue', 'purple', 'black', 'yellow'];

function count(current: number, target: number) {
  return { unlocked: current >= target, progress: { current: Math.min(current, target), target } };
}
function bool(b: boolean) {
  return { unlocked: b, progress: null as AchievementProgress | null };
}

type Def = { key: string; name: string; description: string; evaluate: (c: Ctx) => { unlocked: boolean; progress: AchievementProgress | null } };

export const ACHIEVEMENTS: Def[] = [
  { key: 'first_blood', name: 'First Blood', description: 'Log your first tournament.', evaluate: (c) => count(c.totalTournaments, 1) },
  { key: 'regular', name: 'Regular', description: 'Log 10 tournaments.', evaluate: (c) => count(c.totalTournaments, 10) },
  { key: 'veteran', name: 'Veteran', description: 'Log 25 tournaments.', evaluate: (c) => count(c.totalTournaments, 25) },
  { key: 'century', name: 'Century', description: 'Play 100 rounds.', evaluate: (c) => count(c.totalRounds, 100) },
  { key: 'perfect_run', name: 'Perfect Run', description: 'Finish a tournament with an all-win record (3+ rounds).', evaluate: (c) => bool(c.hasPerfectRun) },
  { key: 'consistent', name: 'Consistent Winner', description: 'Reach a 70% win rate over at least 20 games.', evaluate: (c) => ({ unlocked: c.totalRounds >= 20 && c.winRate >= 0.7, progress: { current: Math.min(c.totalRounds, 20), target: 20 } }) },
  { key: 'deck_master', name: 'Deck Master', description: 'Play 10 tournaments with a single leader.', evaluate: (c) => count(c.maxLeaderTournaments, 10) },
  { key: 'set_dominator', name: 'Set Dominator', description: 'Reach a 75% win rate in one set (10+ games).', evaluate: (c) => bool(c.hasSetDominator) },
  { key: 'underdog', name: 'Underdog', description: 'Win 10 rounds going second.', evaluate: (c) => count(c.secondWins, 10) },
  { key: 'rainbow', name: 'Rainbow Crusher', description: 'Beat opponents of all 6 colors.', evaluate: (c) => count(c.colorsBeaten, 6) },
  { key: 'on_fire', name: 'On Fire', description: 'Win 3 tournaments in a row.', evaluate: (c) => count(c.maxWinStreak, 3) },
  { key: 'well_traveled', name: 'Well Traveled', description: 'Play in 5 different sets.', evaluate: (c) => count(c.distinctSets, 5) },
];

type RoundRow = { tournamentId: string; setId: string | null; myLeaderId: string; result: Result; playOrder: 'first' | 'second' | null; opponentColors: string[] };
type TourneyRow = { id: string; setId: string | null; playedOn: string; createdAt: Date };

export function computeCtx(roundRows: RoundRow[], tourneyRows: TourneyRow[]): Ctx {
  let wins = 0, losses = 0, draws = 0, secondWins = 0;
  const perTournament = new Map<string, { wins: number; losses: number; draws: number; count: number }>();
  const perLeaderTournaments = new Map<string, Set<string>>();
  const perSet = new Map<string, { wins: number; games: number }>();
  const colorsBeaten = new Set<string>();
  const distinctSets = new Set<string>();

  for (const r of roundRows) {
    if (r.result === 'win') wins++; else if (r.result === 'loss') losses++; else draws++;
    if (r.playOrder === 'second' && r.result === 'win') secondWins++;

    const pt = perTournament.get(r.tournamentId) ?? { wins: 0, losses: 0, draws: 0, count: 0 };
    pt.count++;
    if (r.result === 'win') pt.wins++; else if (r.result === 'loss') pt.losses++; else pt.draws++;
    perTournament.set(r.tournamentId, pt);

    const ls = perLeaderTournaments.get(r.myLeaderId) ?? new Set<string>();
    ls.add(r.tournamentId);
    perLeaderTournaments.set(r.myLeaderId, ls);

    if (r.setId) {
      distinctSets.add(r.setId);
      const ps = perSet.get(r.setId) ?? { wins: 0, games: 0 };
      ps.games++;
      if (r.result === 'win') ps.wins++;
      perSet.set(r.setId, ps);
    }

    if (r.result === 'win') for (const c of r.opponentColors) if (COLORS.includes(c)) colorsBeaten.add(c);
  }

  const totalRounds = wins + losses + draws;
  const winRate = totalRounds > 0 ? wins / totalRounds : 0;
  const hasPerfectRun = [...perTournament.values()].some((t) => t.count >= 3 && t.losses === 0 && t.draws === 0);
  const maxLeaderTournaments = Math.max(0, ...[...perLeaderTournaments.values()].map((s) => s.size));
  const hasSetDominator = [...perSet.values()].some((s) => s.games >= 10 && s.wins / s.games >= 0.75);

  const ordered = [...tourneyRows].sort((a, b) =>
    a.playedOn < b.playedOn ? -1 : a.playedOn > b.playedOn ? 1 : a.createdAt.getTime() - b.createdAt.getTime()
  );
  let maxWinStreak = 0, cur = 0;
  for (const t of ordered) {
    const pt = perTournament.get(t.id);
    if (pt && pt.wins > pt.losses) { cur++; maxWinStreak = Math.max(maxWinStreak, cur); } else cur = 0;
  }

  return {
    totalTournaments: tourneyRows.length, totalRounds,
    wins, losses, draws, winRate,
    hasPerfectRun, maxLeaderTournaments, hasSetDominator,
    secondWins, colorsBeaten: colorsBeaten.size, maxWinStreak, distinctSets: distinctSets.size,
  };
}

export async function getAchievements(db: DB, ownerId: string): Promise<Achievement[]> {
  const roundRows = await db
    .select({
      tournamentId: rounds.tournamentId,
      setId: tournaments.setId,
      myLeaderId: rounds.myLeaderId,
      result: rounds.result,
      playOrder: rounds.playOrder,
      opponentColors: leaders.colors,
    })
    .from(rounds)
    .innerJoin(tournaments, eq(rounds.tournamentId, tournaments.id))
    .innerJoin(leaders, eq(rounds.opponentLeaderId, leaders.id))
    .where(eq(tournaments.ownerId, ownerId));

  const tourneyRows = await db
    .select({ id: tournaments.id, setId: tournaments.setId, playedOn: tournaments.playedOn, createdAt: tournaments.createdAt })
    .from(tournaments)
    .where(eq(tournaments.ownerId, ownerId));

  const ctx = computeCtx(roundRows as RoundRow[], tourneyRows as TourneyRow[]);
  return ACHIEVEMENTS.map((d) => {
    const r = d.evaluate(ctx);
    return { key: d.key, name: d.name, description: d.description, unlocked: r.unlocked, progress: r.progress };
  });
}
```

- [ ] **Step 4: Run the test to green**

Run: `npm test -- src/services/achievements.test.ts`
Expected: PASS. If a Drizzle column type surfaces (e.g. `colors` typing), cast minimally as shown (`as RoundRow[]`) without changing behavior; re-run until green.

- [ ] **Step 5: Run the full suite**

Run: `npm test` → all pass (56 + new), pristine.

- [ ] **Step 6: Commit**

```bash
git add src/services/achievements.ts src/services/achievements.test.ts
git commit -m "feat(achievements): definitions and compute-on-read service"
```

---

### Task 2: REST route handler — `GET /api/achievements`

**Files:**
- Create: `src/app/api/achievements/route.ts`, `src/app/api/achievements/route.test.ts`

**Interfaces:**
- Consumes: `requireUserId`, `errorToResponse`, `json`, `getAchievements`, `db`.
- Produces: `GET /api/achievements` → `{ achievements, unlockedCount, total }`.

- [ ] **Step 1: Write the failing test `src/app/api/achievements/route.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, resetDb, closeTestDb } from '../../../../tests/setup/db';
import { seedReferenceData } from '../../../db/seed';
import { leaders, tournaments, rounds } from '../../../db/schema';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_ach_route' })) }));
vi.mock('@/db/client', () => ({ db: getTestDb(), schema: {} }));

const db = getTestDb();
afterAll(closeTestDb);

async function leaderId(name: string) {
  const [l] = await db.select().from(leaders).where(eq(leaders.name, name)).limit(1);
  return l.id;
}

describe('GET /api/achievements', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db); });

  it('returns achievements with unlockedCount and total', async () => {
    const [t] = await db.insert(tournaments).values({ ownerId: 'user_ach_route', type: 'local', setId: null, playedOn: '2026-07-20', status: 'locked' }).returning();
    await db.insert(rounds).values({ tournamentId: t.id, roundNumber: 1, myLeaderId: await leaderId('Nami'), opponentLeaderId: await leaderId('Sanji'), result: 'win', playOrder: 'first', notes: null });

    const { GET } = await import('./route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(body.achievements.length);
    expect(body.unlockedCount).toBeGreaterThanOrEqual(1); // first_blood
    expect(body.achievements.find((a: { key: string }) => a.key === 'first_blood').unlocked).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- api/achievements/route`
Expected: FAIL.

- [ ] **Step 3: Write `src/app/api/achievements/route.ts`**

```ts
import { db } from '@/db/client';
import { requireUserId, errorToResponse, json } from '@/lib/api/handler';
import { getAchievements } from '@/services/achievements';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const userId = await requireUserId();
    const achievements = await getAchievements(db, userId);
    const unlockedCount = achievements.filter((a) => a.unlocked).length;
    return json({ achievements, unlockedCount, total: achievements.length });
  } catch (err) {
    return errorToResponse(err);
  }
}
```

- [ ] **Step 4: Run the test to green**

Run: `npm test -- api/achievements/route`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/achievements
git commit -m "feat(api): achievements route handler"
```

---

### Task 3: Client — DTOs, api-client, hook, and the newly-unlocked helper

**Files:**
- Modify: `src/lib/dto.ts`, `src/lib/api-client.ts`, `src/components/query-hooks.ts`
- Create: `src/lib/newly-unlocked.ts`, `src/lib/newly-unlocked.test.ts`

**Interfaces:**
- Produces: `AchievementProgressDTO`, `AchievementDTO`, `AchievementsResponseDTO`; `apiClient.getAchievements()`; `useAchievements()`; `newlyUnlocked(current, seen)`.

- [ ] **Step 1: Write the failing test `src/lib/newly-unlocked.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { newlyUnlocked } from './newly-unlocked';

describe('newlyUnlocked', () => {
  it('returns keys not present in seen', () => {
    expect(newlyUnlocked(['a', 'b', 'c'], ['a'])).toEqual(['b', 'c']);
  });
  it('returns empty when nothing new', () => {
    expect(newlyUnlocked(['a', 'b'], ['a', 'b', 'c'])).toEqual([]);
  });
  it('returns all when seen is empty', () => {
    expect(newlyUnlocked(['a', 'b'], [])).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- newly-unlocked`
Expected: FAIL.

- [ ] **Step 3: Write `src/lib/newly-unlocked.ts`**

```ts
export function newlyUnlocked(currentUnlockedKeys: string[], seenKeys: string[]): string[] {
  const seen = new Set(seenKeys);
  return currentUnlockedKeys.filter((k) => !seen.has(k));
}
```

- [ ] **Step 4: Run the test to green**

Run: `npm test -- newly-unlocked`
Expected: PASS.

- [ ] **Step 5: Append DTOs to `src/lib/dto.ts`**

```ts
export type AchievementProgressDTO = { current: number; target: number };
export type AchievementDTO = { key: string; name: string; description: string; unlocked: boolean; progress: AchievementProgressDTO | null };
export type AchievementsResponseDTO = { achievements: AchievementDTO[]; unlockedCount: number; total: number };
```

- [ ] **Step 6: Add the api-client method** — extend the existing dto import with `AchievementsResponseDTO` and add inside `apiClient`:

```ts
  getAchievements: () => request<AchievementsResponseDTO>('/api/achievements'),
```

- [ ] **Step 7: Add the hook to `src/components/query-hooks.ts`** — add to `keys` and export:

```ts
// in keys:  achievements: ['achievements'] as const,
export const useAchievements = () => useQuery({ queryKey: keys.achievements, queryFn: apiClient.getAchievements });
```

- [ ] **Step 8: Build + full test**

Run: `npm run build` → succeeds.
Run: `npm test` → all pass (incl. newly-unlocked).

- [ ] **Step 9: Commit**

```bash
git add src/lib/newly-unlocked.ts src/lib/newly-unlocked.test.ts src/lib/dto.ts src/lib/api-client.ts src/components/query-hooks.ts
git commit -m "feat(client): achievements DTOs, api-client, hook, and newly-unlocked helper"
```

---

### Task 4: Achievements UI — page, grid, nav link, and unlock toast

**Files:**
- Create: `src/components/achievements/achievement-card.tsx`, `src/components/achievements/achievements-view.tsx`, `src/app/achievements/page.tsx`
- Modify: `src/components/tournaments/tournament-list.tsx` (add an Achievements nav link)
- Test: none (build gate)

**Interfaces:**
- Consumes: `useAchievements`, `newlyUnlocked`, DTOs, shadcn `card`/`skeleton`, `toast` (sonner), `lucide-react`.

- [ ] **Step 1: Write `src/components/achievements/achievement-card.tsx`**

```tsx
import { Check } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { AchievementDTO } from '@/lib/dto';

export function AchievementCard({ a }: { a: AchievementDTO }) {
  return (
    <Card className={`p-4 ${a.unlocked ? 'border-primary' : 'opacity-70'}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold leading-tight">{a.name}</p>
        {a.unlocked && (
          <span className="shrink-0 rounded-full bg-primary p-1 text-primary-foreground"><Check className="h-3 w-3" /></span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{a.description}</p>
      {!a.unlocked && a.progress && (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((a.progress.current / a.progress.target) * 100)}%` }} />
          </div>
          <p className="mt-1 text-right text-xs tabular-nums text-muted-foreground">{a.progress.current}/{a.progress.target}</p>
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Write `src/components/achievements/achievements-view.tsx`**

```tsx
'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { useAchievements } from '@/components/query-hooks';
import { AchievementCard } from './achievement-card';
import { newlyUnlocked } from '@/lib/newly-unlocked';

const SEEN_KEY = 'crewstat-seen-achievements';

export function AchievementsView() {
  const { data, isLoading, isError } = useAchievements();
  const handled = useRef(false);

  useEffect(() => {
    if (!data || handled.current || typeof window === 'undefined') return;
    handled.current = true;
    const unlocked = data.achievements.filter((a) => a.unlocked).map((a) => a.key);
    const raw = window.localStorage.getItem(SEEN_KEY);
    if (raw === null) {
      window.localStorage.setItem(SEEN_KEY, JSON.stringify(unlocked)); // first load: seed silently
      return;
    }
    let seen: string[] = [];
    try { seen = JSON.parse(raw) as string[]; } catch { seen = []; }
    for (const key of newlyUnlocked(unlocked, seen)) {
      const a = data.achievements.find((x) => x.key === key);
      if (a) toast.success(`Achievement unlocked: ${a.name}`);
    }
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(unlocked));
  }, [data]);

  return (
    <main className="mx-auto max-w-xl space-y-4 p-4 pb-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Achievements</h1>
        <Link href="/" className="text-sm text-muted-foreground">← Home</Link>
      </div>
      {isLoading && <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>}
      {isError && <p className="text-destructive">Couldn’t load achievements.</p>}
      {data && (
        <>
          <p className="text-sm text-muted-foreground">{data.unlockedCount} of {data.total} unlocked</p>
          <div className="grid grid-cols-2 gap-3">
            {data.achievements.map((a) => <AchievementCard key={a.key} a={a} />)}
          </div>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Write `src/app/achievements/page.tsx`**

```tsx
import { AchievementsView } from '@/components/achievements/achievements-view';

export default function AchievementsPage() {
  return <AchievementsView />;
}
```

- [ ] **Step 4: Add an Achievements nav link in `src/components/tournaments/tournament-list.tsx`**

Find the home header block (it currently renders `<h1>Crew Stat</h1>` and a `Stats →` link). Add an Achievements link beside the Stats link, e.g. wrap the two links in a flex:

```tsx
<div className="flex items-center gap-3">
  <Link href="/achievements" className="text-sm font-medium text-muted-foreground">Achievements</Link>
  <Link href="/stats" className="text-sm font-medium text-muted-foreground">Stats →</Link>
</div>
```

(Keep the existing `<h1>` on the left; `Link` is already imported.)

- [ ] **Step 5: Build + full test**

Run: `npm run build` → succeeds; `/achievements` route generated.
Run: `npm test` → all pass, pristine.

- [ ] **Step 6: Commit**

```bash
git add src/components/achievements src/app/achievements/page.tsx src/components/tournaments/tournament-list.tsx
git commit -m "feat(ui): achievements page, grid, nav link, and unlock toast"
```

---

## Self-Review

**Spec coverage:**

| Spec item | Task |
|-----------|------|
| 12 achievement definitions | 1 |
| Compute-on-read engine (computeCtx, owner-scoped getAchievements) | 1 |
| All categories (counts, perfect_run, consistent, deck_master, set_dominator, underdog, rainbow, on_fire, well_traveled) | 1 |
| `GET /api/achievements` (unlockedCount/total) | 2 |
| DTOs + api-client + hook | 3 |
| newly-unlocked helper (pure, tested) | 3 |
| Achievements page + grid + progress bars | 4 |
| Home nav link | 4 |
| Newly-unlocked localStorage toast (SSR-safe, silent first seed) | 4 |
| Empty-data + owner-scoping tests | 1, 2 |

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** service `Achievement`/`AchievementProgress` match client `AchievementDTO`/`AchievementProgressDTO` field-for-field; the route's `{ achievements, unlockedCount, total }` matches `AchievementsResponseDTO`; `useAchievements` and `newlyUnlocked` names match their Task-4 consumers; the 6-color list is defined once in the service.

**Note for implementers:** `computeCtx` is pure and takes plain arrays, so most achievement logic is unit-tested without a DB; `getAchievements` only wires the two owner-scoped queries into it. The `on_fire` streak orders tournaments by `playedOn` then `createdAt`; a tournament with no rounds counts as non-winning and breaks the streak.
