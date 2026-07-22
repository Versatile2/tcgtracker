# Opponent Meta + Per-Opponent Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a round optionally record the opponent's meta (OP01–OP16), and add a global Stats breakdown by opponent leader and by opponent leader × opponent meta (meta split only where the opponent meta is set).

**Architecture:** Same thin stack as the rest of the app: Drizzle schema → service functions → route handlers that `json()` the service result → typed `apiClient` → TanStack Query hooks → React components. Additive change, bottom-up.

**Tech Stack:** Next.js 16, TypeScript, Drizzle ORM (node-postgres), Zod, TanStack Query, Vitest (local `crewstat_test` Postgres), Tailwind v4, base-ui/shadcn.

## Global Constraints

- **Additive migration only.** `rounds.opponentMetaId` is a NULLABLE column. Run `drizzle-kit generate` to produce an INCREMENTAL migration (`0001_*.sql` = `ALTER TABLE rounds ADD COLUMN`). Do NOT regenerate migrations from scratch and do NOT reset any database.
- Opponent meta reuses the `metas` reference list; it is **optional** on a round and must not affect round-form validity.
- New stats are **global** and keyed on the **opponent** leader; the per-meta sub-breakdown counts **only rounds where `opponent_meta_id IS NOT NULL`**.
- Existing rounds keep `opponentMetaId = null` and are excluded from the meta split.
- Do not touch the existing per-your-leader Matchups view, achievements, or tournament-level meta.
- Vitest (esbuild) does not typecheck; whole-repo typecheck is validated by `npm run build`.

---

## Task 1: Schema + incremental migration

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0001_*.sql` (generated)

**Interfaces:**
- Produces: `rounds.opponentMetaId` (uuid, nullable, FK → metas).

- [ ] **Step 1: Add the column to the schema**

In `src/db/schema.ts`, in the `rounds` table, add `opponentMetaId` immediately after `opponentLeaderId`:

```ts
  opponentLeaderId: uuid('opponent_leader_id').notNull().references(() => leaders.id),
  opponentMetaId: uuid('opponent_meta_id').references(() => metas.id),
```

- [ ] **Step 2: Generate the incremental migration**

Run: `npm run db:generate`
Expected: a NEW file `drizzle/0001_*.sql` containing `ALTER TABLE "rounds" ADD COLUMN "opponent_meta_id" uuid;` plus the FK constraint. The existing `0000_chief_smasher.sql` must be UNCHANGED, and `drizzle/meta/_journal.json` now has two entries.

Verify the old migration was not rewritten:
```bash
git status --short drizzle/
```
Expected: `0000_*.sql` NOT modified; new `0001_*.sql` and updated `meta/` files.

- [ ] **Step 3: Apply to the local test DB and confirm the column exists**

The test global-setup applies all migrations on run. Confirm by running any round test:

Run: `npm test -- src/services/rounds.test.ts`
Expected: PASS (existing tests unaffected by the additive column).

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat(db): add nullable rounds.opponentMetaId (incremental migration)"
```

---

## Task 2: Validation & DTOs

**Files:**
- Modify: `src/lib/validation/round.ts`
- Modify: `src/lib/dto.ts`
- Modify: `src/lib/validation/validation.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `createRoundSchema`/`updateRoundSchema` accept optional nullable `opponentMetaId`; `RoundDTO.opponentMetaId: string | null`; new `OpponentMetaStatDTO`, `OpponentLeaderStatDTO`; `StatsDTO.opponents`.

- [ ] **Step 1: Add opponentMetaId to the round schemas**

In `src/lib/validation/round.ts`, add to BOTH schemas (place after `opponentLeaderId`):

```ts
  opponentMetaId: z.string().uuid().nullable().optional(),
```

- [ ] **Step 2: Extend RoundDTO and add opponent-stat DTOs**

In `src/lib/dto.ts`, add `opponentMetaId` to `RoundDTO`:

```ts
export type RoundDTO = {
  id: string; tournamentId: string; roundNumber: number;
  opponentLeaderId: string; opponentMetaId: string | null;
  result: 'win' | 'loss' | 'draw'; playOrder: 'first' | 'second' | null; notes: string | null;
};
```

Add the new stat DTOs (near `PerMetaStatDTO`):

```ts
export type OpponentMetaStatDTO = {
  metaId: string; name: string;
  wins: number; losses: number; draws: number; games: number; winRate: number;
};
export type OpponentLeaderStatDTO = {
  leaderId: string; name: string;
  wins: number; losses: number; draws: number; games: number; winRate: number;
  byMeta: OpponentMetaStatDTO[];
};
```

Add `opponents` to `StatsDTO`:

```ts
export type StatsDTO = {
  overall: OverallStatsDTO; perMeta: PerMetaStatDTO[]; playedLeaders: PlayedLeaderDTO[];
  opponents: OpponentLeaderStatDTO[];
};
```

- [ ] **Step 3: Update validation.test.ts**

In `src/lib/validation/validation.test.ts`, add a test that `createRoundSchema` accepts a round WITH an `opponentMetaId` (valid uuid) and one WITHOUT it (optional). Reuse the existing valid-uuid literal in the file (the all-zero UUID `00000000-0000-0000-0000-000000000000`). Example:

```ts
it('accepts an optional opponentMetaId on a round', () => {
  const base = { opponentLeaderId: '00000000-0000-0000-0000-000000000000', result: 'win' as const };
  expect(createRoundSchema.parse(base).opponentMetaId).toBeUndefined();
  const withMeta = createRoundSchema.parse({ ...base, opponentMetaId: '00000000-0000-0000-0000-000000000000' });
  expect(withMeta.opponentMetaId).toBe('00000000-0000-0000-0000-000000000000');
});
```

- [ ] **Step 4: Run the validation tests**

Run: `npm test -- src/lib/validation/validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/round.ts src/lib/dto.ts src/lib/validation/validation.test.ts
git commit -m "feat(validation): optional opponentMetaId + opponent-stat DTOs"
```

---

## Task 3: Round service

**Files:**
- Modify: `src/services/rounds.ts`
- Modify: `src/services/rounds.test.ts`

**Interfaces:**
- Consumes: `createRoundSchema`/`updateRoundSchema` with `opponentMetaId`.
- Produces: `addRound`/`updateRound` persist `opponentMetaId`.

- [ ] **Step 1: Persist opponentMetaId in addRound**

In `src/services/rounds.ts`, in `addRound`'s insert `.values({...})`, add after `opponentLeaderId`:

```ts
    opponentLeaderId: input.opponentLeaderId,
    opponentMetaId: input.opponentMetaId ?? null,
```

- [ ] **Step 2: Persist opponentMetaId in updateRound**

In `updateRound`'s patch block, add alongside the other guarded fields:

```ts
  if (input.opponentMetaId !== undefined) patch.opponentMetaId = input.opponentMetaId;
```

- [ ] **Step 3: Test persistence**

In `src/services/rounds.test.ts`, add a test that `addRound` with an `opponentMetaId` persists it, and that `updateRound` can set/clear it. You need a valid meta id — fetch it from the seeded metas, e.g.:

```ts
import { listMetas } from './reference';
// ...
it('persists and updates opponentMetaId', async () => {
  const { t, opp } = await setup();
  const metas = await listMetas(db, USER);
  const r = await addRound(db, USER, t.id, { opponentLeaderId: opp, result: 'win', opponentMetaId: metas[0].id });
  expect(r.opponentMetaId).toBe(metas[0].id);
  const updated = await updateRound(db, USER, r.id, { opponentMetaId: null });
  expect(updated.opponentMetaId).toBeNull();
});
```

(Match the existing `setup()` helper's return shape in this file; it already exposes the tournament and an opponent leader id.)

- [ ] **Step 4: Run the round tests**

Run: `npm test -- src/services/rounds.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/rounds.ts src/services/rounds.test.ts
git commit -m "feat(rounds): persist opponentMetaId"
```

---

## Task 4: Opponent stats service & route

**Files:**
- Modify: `src/services/stats.ts`
- Modify: `src/app/api/stats/route.ts`
- Modify: `src/services/stats.test.ts`
- Modify: `src/app/api/stats/stats.route.test.ts`

**Interfaces:**
- Produces: `getOpponentStats(db, ownerId): Promise<OpponentLeaderStat[]>`; stats route returns `opponents`.

- [ ] **Step 1: Add the opponent-stats types and function to stats.ts**

In `src/services/stats.ts`, add near the other exported types:

```ts
export type OpponentMetaStat = {
  metaId: string; name: string;
  wins: number; losses: number; draws: number; games: number; winRate: number;
};
export type OpponentLeaderStat = {
  leaderId: string; name: string;
  wins: number; losses: number; draws: number; games: number; winRate: number;
  byMeta: OpponentMetaStat[];
};
```

Add the function (uses the existing `num`, `rate` helpers and the imported `tournaments`, `rounds`, `leaders`, `metas`):

```ts
export async function getOpponentStats(db: DB, ownerId: string): Promise<OpponentLeaderStat[]> {
  // Overall per opponent leader (all rounds)
  const leaderRows = await db
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
    .where(eq(tournaments.ownerId, ownerId))
    .groupBy(rounds.opponentLeaderId, leaders.name);

  // Per opponent leader x meta (only rounds with an opponent meta set)
  const metaRows = await db
    .select({
      leaderId: rounds.opponentLeaderId,
      metaId: rounds.opponentMetaId,
      metaName: metas.name,
      wins: sql<number>`count(*) filter (where ${rounds.result} = 'win')`,
      losses: sql<number>`count(*) filter (where ${rounds.result} = 'loss')`,
      draws: sql<number>`count(*) filter (where ${rounds.result} = 'draw')`,
    })
    .from(rounds)
    .innerJoin(tournaments, eq(rounds.tournamentId, tournaments.id))
    .innerJoin(metas, eq(rounds.opponentMetaId, metas.id))
    .where(and(eq(tournaments.ownerId, ownerId), sql`${rounds.opponentMetaId} is not null`))
    .groupBy(rounds.opponentLeaderId, rounds.opponentMetaId, metas.name);

  const byLeaderMeta = new Map<string, OpponentMetaStat[]>();
  for (const r of metaRows) {
    if (!r.metaId) continue;
    const wins = num(r.wins), losses = num(r.losses), draws = num(r.draws);
    const list = byLeaderMeta.get(r.leaderId) ?? [];
    list.push({
      metaId: r.metaId, name: r.metaName ?? '—',
      wins, losses, draws, games: wins + losses + draws, winRate: rate(wins, wins + losses + draws),
    });
    byLeaderMeta.set(r.leaderId, list);
  }

  return leaderRows
    .map((r) => {
      const wins = num(r.wins), losses = num(r.losses), draws = num(r.draws);
      const games = wins + losses + draws;
      const byMeta = (byLeaderMeta.get(r.leaderId) ?? []).sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
      return { leaderId: r.leaderId, name: r.name, wins, losses, draws, games, winRate: rate(wins, games), byMeta };
    })
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
}
```

(Confirm `and` is already imported from `drizzle-orm` at the top of `stats.ts` — it is used by `getMatchupStats`. `metas` is imported from `../db/schema` as of the meta rework.)

- [ ] **Step 2: Wire the function into the stats route**

In `src/app/api/stats/route.ts`, import and call it:

```ts
import { getOverallStats, getPerMetaStats, getPlayedLeaders, getOpponentStats } from '@/services/stats';
```

```ts
    const [overall, perMeta, playedLeaders, opponents] = await Promise.all([
      getOverallStats(db, userId),
      getPerMetaStats(db, userId),
      getPlayedLeaders(db, userId),
      getOpponentStats(db, userId),
    ]);
    return json({ overall, perMeta, playedLeaders, opponents });
```

- [ ] **Step 3: Test getOpponentStats**

In `src/services/stats.test.ts`, add a test. Create a tournament (with a `myLeaderId`), add rounds against a couple of opponent leaders — some WITH an `opponentMetaId`, some WITHOUT — then assert:
- the opponent leader's overall record counts ALL its rounds;
- its `byMeta` contains only the rounds where `opponentMetaId` was set, with correct counts;
- an opponent leader that never had a meta set has an empty `byMeta`.

Fetch leader/meta ids from `listLeaders`/`listMetas`. Example skeleton (adapt to this file's existing helpers):

```ts
it('breaks opponents down by leader and by opponent meta', async () => {
  const ls = await listLeaders(db, USER);
  const metas = await listMetas(db, USER);
  const t = await createTournament(db, USER, { type: 'local', myLeaderId: ls[0].id, playedOn: '2026-07-20' });
  await addRound(db, USER, t.id, { opponentLeaderId: ls[1].id, result: 'win', opponentMetaId: metas[0].id });
  await addRound(db, USER, t.id, { opponentLeaderId: ls[1].id, result: 'loss', opponentMetaId: metas[0].id });
  await addRound(db, USER, t.id, { opponentLeaderId: ls[1].id, result: 'win' }); // no meta
  await addRound(db, USER, t.id, { opponentLeaderId: ls[2].id, result: 'win' }); // no meta

  const opp = await getOpponentStats(db, USER);
  const l1 = opp.find((o) => o.leaderId === ls[1].id)!;
  expect(l1.games).toBe(3);               // all rounds counted overall
  expect(l1.wins).toBe(2);
  expect(l1.byMeta).toHaveLength(1);       // only the 2 meta-tagged rounds
  expect(l1.byMeta[0].metaId).toBe(metas[0].id);
  expect(l1.byMeta[0].games).toBe(2);
  const l2 = opp.find((o) => o.leaderId === ls[2].id)!;
  expect(l2.byMeta).toHaveLength(0);       // no meta ever set
});
```

- [ ] **Step 4: Update the stats route test**

In `src/app/api/stats/stats.route.test.ts`, extend the existing happy-path assertion to check the response has an `opponents` array (and, if the test seeds rounds, that it is shaped like `OpponentLeaderStatDTO`). At minimum assert `Array.isArray(body.opponents)`.

- [ ] **Step 5: Run the stats tests**

Run: `npm test -- src/services/stats.test.ts src/app/api/stats/stats.route.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/stats.ts src/app/api/stats/route.ts src/services/stats.test.ts src/app/api/stats/stats.route.test.ts
git commit -m "feat(stats): global per-opponent-leader and per-opponent-meta breakdown"
```

---

## Task 5: Round form + round display (capture & show opponent meta)

**Files:**
- Modify: `src/components/tournaments/round-form-sheet.tsx`
- Modify: `src/components/tournaments/round-item.tsx`
- Modify: `src/components/tournaments/tournament-detail.tsx`

**Interfaces:**
- Consumes: `useMetas`/`useAddCustomMeta`, `RoundDTO.opponentMetaId`, `createRoundSchema` with `opponentMetaId`.

- [ ] **Step 1: Add the optional Opponent meta field to the round form**

In `src/components/tournaments/round-form-sheet.tsx`:
- Import the meta hooks:

```ts
import { useLeaders, useAddCustomLeader, useMetas, useAddCustomMeta } from '@/components/query-hooks';
```

- In `RoundFormBody`, add the hooks and state (next to the opponent-leader state):

```ts
  const { data: metas } = useMetas();
  const addMeta = useAddCustomMeta();
  const [oppMetaId, setOppMetaId] = useState<string | null>(initial?.opponentMetaId ?? null);
```

- Include it in the submit payload (validity is unchanged — do NOT add it to `valid`):

```ts
      await onSubmit({ opponentLeaderId: oppLeaderId, opponentMetaId: oppMetaId, result, playOrder, notes: notes.trim() || null });
```

- Add the field UI right after the "Opponent deck" block:

```tsx
        <div className="space-y-2">
          <label className="text-sm font-medium">Opponent meta (optional)</label>
          <ReferenceCombobox
            options={metas ?? []} value={oppMetaId} onChange={setOppMetaId}
            onAddCustom={async (n) => { const m = await addMeta.mutateAsync({ name: n }); return { id: m.id, name: m.name }; }}
            placeholder="e.g. OP16" />
        </div>
```

- [ ] **Step 2: Build a metaName lookup and show opponent meta in round-item**

In `src/components/tournaments/tournament-detail.tsx`:
- Add the metas hook and a `metaName` helper next to the existing `leaderName`:

```ts
  const { data: metas } = useMetas();
```

```ts
  const leaderName = (lid: string) => leaders?.find((l) => l.id === lid)?.name ?? '—';
  const metaName = (mid: string) => metas?.find((m) => m.id === mid)?.name ?? '';
```

- Pass `metaName` to `RoundItem`:

```tsx
          <RoundItem key={r.id} round={r} leaderName={leaderName} metaName={metaName} editable={editable}
            onEdit={() => { setEditing(r); setSheetOpen(true); }}
            onDelete={() => handleDeleteRound(r)} />
```

(`useMetas` is already imported here if you added it; if not, extend the existing `@/components/query-hooks` import to include `useMetas`.)

- [ ] **Step 3: Render the opponent meta in round-item**

In `src/components/tournaments/round-item.tsx`, add `metaName` to the props and show it when set:

```tsx
export function RoundItem({
  round, leaderName, metaName, onEdit, onDelete, editable,
}: {
  round: RoundDTO;
  leaderName: (id: string) => string;
  metaName: (id: string) => string;
  onEdit: () => void;
  onDelete: () => void;
  editable: boolean;
}) {
```

Update the match line:

```tsx
        <p className="truncate text-sm">
          vs <span className="text-foreground">{leaderName(round.opponentLeaderId)}</span>
          {round.opponentMetaId && <span className="text-muted-foreground"> · {metaName(round.opponentMetaId)}</span>}
        </p>
```

- [ ] **Step 4: Keep the Undo re-add payload intact**

In `tournament-detail.tsx`, the Undo handler re-adds a round from a `RoundDTO`. Add `opponentMetaId` so undo preserves it:

```tsx
        onClick: () => addRound.mutate({
          opponentLeaderId: r.opponentLeaderId, opponentMetaId: r.opponentMetaId,
          result: r.result, playOrder: r.playOrder, notes: r.notes,
        }),
```

- [ ] **Step 5: Lint the changed files**

Run: `npm run lint`
Expected: no NEW errors in the three changed files. (Two pre-existing `react-hooks/set-state-in-effect` errors in `src/lib/use-online-status.ts` and `src/components/theme/mode-toggle.tsx` are unrelated and out of scope.)

- [ ] **Step 6: Commit**

```bash
git add src/components/tournaments/round-form-sheet.tsx src/components/tournaments/round-item.tsx src/components/tournaments/tournament-detail.tsx
git commit -m "feat(ui): capture and display optional opponent meta on rounds"
```

---

## Task 6: Stats page — "By opponent" section

**Files:**
- Create: `src/components/stats/opponent-stats.tsx`
- Modify: `src/components/stats/stats-view.tsx`

**Interfaces:**
- Consumes: `StatsDTO.opponents`, `OpponentLeaderStatDTO`.

- [ ] **Step 1: Create the OpponentStats component**

Create `src/components/stats/opponent-stats.tsx`:

```tsx
import { pct } from './stat-card';
import { formatRecord } from '@/lib/record';
import type { OpponentLeaderStatDTO } from '@/lib/dto';

export function OpponentStats({ rows }: { rows: OpponentLeaderStatDTO[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">By opponent</h2>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.leaderId} className="rounded-lg border p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{r.name}</span>
              <span className="text-muted-foreground tabular-nums">
                {formatRecord({ wins: r.wins, losses: r.losses, draws: r.draws })} · {pct(r.winRate)} · {r.games} {r.games === 1 ? 'game' : 'games'}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: pct(r.winRate) }} />
            </div>
            {r.byMeta.length > 0 && (
              <div className="mt-2 space-y-1 border-l pl-3">
                {r.byMeta.map((m) => (
                  <div key={m.metaId} className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{m.name}</span>
                    <span className="tabular-nums">
                      {formatRecord({ wins: m.wins, losses: m.losses, draws: m.draws })} · {pct(m.winRate)} · {m.games} {m.games === 1 ? 'game' : 'games'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Render it in the stats view**

In `src/components/stats/stats-view.tsx`, import and render after `PerMetaStats` (defensive `?? []`):

```tsx
import { OpponentStats } from './opponent-stats';
```

```tsx
          <OverallStats o={data.overall} />
          <PerMetaStats rows={data.perMeta ?? []} />
          <OpponentStats rows={data.opponents ?? []} />
          <MatchupStats leaders={data.playedLeaders ?? []} />
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds (whole-repo typecheck clean).

- [ ] **Step 4: Commit**

```bash
git add src/components/stats/opponent-stats.tsx src/components/stats/stats-view.tsx
git commit -m "feat(ui): By opponent stats section (per opponent leader and meta)"
```

---

## Task 7: Full verification

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all suites PASS (including the new opponent-meta round and stats tests).

- [ ] **Step 2: Build + lint**

Run: `npm run build`
Expected: succeeds. (`npm run lint` still shows the 2 known pre-existing errors, unrelated.)

- [ ] **Step 3: Manual smoke (optional, if a browser/login is available)**

Add a round with an opponent meta, confirm it shows "vs <leader> · <meta>" in the tournament, and that the Stats page shows a "By opponent" section with a per-meta sub-line for that opponent.

---

## Self-Review

- **Spec coverage:** opponent meta field → Tasks 1,2,3,5; per-opponent global stats + per-meta split → Task 4; stats page section → Task 6; round display → Task 5. Additive migration constraint → Task 1 Step 2. ✓
- **Placeholder scan:** every code step has concrete code; test steps give real assertions. ✓
- **Type consistency:** `opponentMetaId`, `OpponentLeaderStat(DTO)`, `OpponentMetaStat(DTO)`, `getOpponentStats`, `StatsDTO.opponents`, `metaName` used consistently across schema → validation/DTO → service → route → components. ✓
