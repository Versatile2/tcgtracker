# Add Round Form Ergonomics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the add-round sheet focused and fast — collapse the leader carousel to the chosen leader, drop the opponent-meta picker, and turn Dice Roll / Start / Result into consistent segmented controls that start with a value.

**Architecture:** The only logic change is one SQL query: opponent stats stop reading the round's own meta and read `coalesce(rounds.opponent_meta_id, tournaments.meta_id)` instead, so removing the picker costs no statistics and rewrites no history. Everything else is component work — collapse state inside `LeaderCarousel`, and replacing two tap-to-cycle buttons with segmented pairs.

**Tech Stack:** Next.js 16 (App Router), React 19, Drizzle ORM + Postgres, TanStack Query, vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-13-add-round-form-ergonomics-design.md`

## Global Constraints

- **This is NOT the Next.js you know** (`AGENTS.md`). Read the relevant guide in `node_modules/next/dist/docs/` before writing framework-level code. No task here touches a framework API, so this matters only if you deviate from the plan.
- **No schema migration.** `rounds.opponent_meta_id` and the `opponentMetaId` DTO field both STAY. Every per-round meta already recorded must be preserved. Do not drop the column, the DTO field, or the CSV column.
- **No API or validation change.** `createRoundSchema` already declares `opponentMetaId` optional and nullable (`src/lib/validation/round.ts:40,51`). The form simply stops sending it; new rounds store `null`.
- **Defaults apply on ADD only.** Editing an existing round shows what was recorded and never overrides it.
- **Defaults are swiss-only.** Top Cut has no die roll and no single result — play order and results live per game in the best-of-3 log, which this plan does not touch.
- Default values, exactly: **Dice Roll = Won**, **Start = 1st**, **Result = Win**.
- **No component-test infrastructure exists.** `vitest.config.ts` sets `environment: 'node'` and collects `.ts` only; `@testing-library/react` and `jsdom` are installed but unused; the `e2e` script has no Playwright config. Do NOT stand any of this up. UI tasks are verified by `npm run lint`, `npx tsc --noEmit`, the existing suite staying green, and the manual pass in Task 5.
- Run tests with `npm test` (vitest). Integration tests under `src/services/` use a real Postgres test database that `tests/setup/global-setup.ts` provisions.
- Commit after every task.

---

### Task 1: Opponent stats coalesce through the tournament's meta

Do this first. It is the only logic change, it is independently testable, and it must be in place before the form stops recording a per-round meta — otherwise the per-opponent breakdown silently stops receiving data.

**Files:**
- Modify: `src/services/stats.ts` — the `metaRows` query inside `getOpponentStats` (around lines 140-155)
- Test: `src/services/stats.test.ts` — update the existing test at line 117, add one new test

**Interfaces:**
- Consumes: nothing.
- Produces: `getOpponentStats` now buckets a round under its own `opponentMetaId` when set, and under its tournament's `metaId` otherwise. `OpponentMetaStat` shape is unchanged.

**Read this before you start.** The existing test `'breaks opponents down by leader and by opponent meta'` (`src/services/stats.test.ts:117`) **will fail after your change, and that is correct**. It builds one tournament whose meta is `OP02 Paramount War` and adds four rounds: two Nami rounds tagged `OP02`, one untagged Nami round, and one untagged Sanji round. It currently asserts that the untagged rounds are excluded from `byMeta`. Under coalescing they fall back to the tournament's `OP02`, so those two assertions change. Update the assertions to the new expected values — do NOT weaken them to `toBeTruthy`, and do NOT "fix" the source to keep the old numbers.

- [ ] **Step 1: Update the existing test's assertions**

In `src/services/stats.test.ts`, inside `it('breaks opponents down by leader and by opponent meta', …)`, replace the assertion block after `const opp = await getOpponentStats(db, USER);` with:

```ts
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
```

Also update that test's title to reflect what it now covers:

```ts
  it('breaks opponents down by leader and by meta, falling back to the tournament meta', async () => {
```

- [ ] **Step 2: Add a test pinning the two branches that matter**

Append this test inside the same `describe` block:

```ts
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
```

`makeTournament` and `addRoundTo` are existing helpers at the top of this file. `makeTournament(null, …)` creates a tournament with no meta; `addRoundTo(id, n, opp, result)` with no fifth argument creates a round with `opponentMetaId: null`.

- [ ] **Step 3: Run the tests and watch them fail**

Run: `npm test -- src/services/stats.test.ts`
Expected: FAIL. The updated test fails on `expected 2 to be 3` (or the Sanji length assertion), and the new test fails on `expected [] to equal [ 'OP01' ]` — both because the source still joins on `rounds.opponentMetaId` alone.

- [ ] **Step 4: Change the query to coalesce**

In `src/services/stats.ts`, inside `getOpponentStats`, replace the `metaRows` query. Define the coalesce expression once and reuse it so the `select`, `innerJoin`, and `groupBy` can never drift apart:

```ts
  // A round's meta is its own when set, otherwise its tournament's — every round
  // is played in its tournament's meta, so the form no longer asks. Coalescing
  // rather than always using the tournament's meta preserves rounds recorded
  // under a different meta before the picker was removed.
  const effectiveMetaId = sql<string>`coalesce(${rounds.opponentMetaId}, ${tournaments.metaId})`;

  const metaRows = await db
    .select({
      leaderId: sql<string>`${rounds.opponentLeaderId}`,
      metaId: effectiveMetaId,
      metaName: metas.name,
      metaCode: metas.code,
      wins: sql<number>`count(*) filter (where ${rounds.result} = 'win')`,
      losses: sql<number>`count(*) filter (where ${rounds.result} = 'loss')`,
      draws: sql<number>`count(*) filter (where ${rounds.result} = 'draw')`,
    })
    .from(rounds)
    .innerJoin(tournaments, eq(rounds.tournamentId, tournaments.id))
    .innerJoin(metas, eq(metas.id, effectiveMetaId))
    .where(eq(tournaments.ownerId, ownerId))
    .groupBy(rounds.opponentLeaderId, effectiveMetaId, metas.name, metas.code);
```

Two notes on what changed and why:
- The old `where` carried `sql\`${rounds.opponentMetaId} is not null\``. Drop it. The `innerJoin` on `metas` already excludes rows whose coalesced meta is null, and keeping the old clause would filter out exactly the rounds this change exists to include.
- `groupBy` must use the same `effectiveMetaId` expression, not `rounds.opponentMetaId`, or Postgres will reject the query for selecting an ungrouped expression.

Leave the `for (const r of metaRows)` loop below it alone — it already guards `if (!r.metaId) continue;` and builds `name: r.metaCode ?? r.metaName ?? '—'`.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npm test -- src/services/stats.test.ts`
Expected: PASS, all tests in the file.

Then run the full suite: `npm test`
Expected: PASS. `src/services/stats.matchups.test.ts` also exercises stats — if anything there asserts on `byMeta`, update it the same way and say so in your report.

- [ ] **Step 6: Commit**

```bash
git add src/services/stats.ts src/services/stats.test.ts
git commit -m "feat(stats): fall back to the tournament meta for opponent breakdowns"
```

---

### Task 2: Collapse the leader carousel to the selection

**Files:**
- Modify: `src/components/leaders/leader-carousel.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: no prop changes. `LeaderCarousel`'s public interface is identical — **neither call site changes**, in this task or any later one.

The two call sites are `src/components/tournaments/round-form-sheet.tsx:219` ("Opponent's Deck") and `src/components/tournaments/new-tournament-form.tsx` (the leader field). Both get the new behaviour for free. Do not edit either file in this task.

- [ ] **Step 1: Add the expanded state and the collapse rule**

In `src/components/leaders/leader-carousel.tsx`, add `expanded` state next to the existing `search` state (currently line 30):

```tsx
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(false);
  const selected = options.find((o) => o.id === value);
  // Collapsed once a leader is chosen: the point of the row is choosing, and
  // 132 equal-sized cards make the chosen one easy to lose.
  const collapsed = Boolean(selected) && !expanded;
```

- [ ] **Step 2: Collapse when a selection is made**

Both selection paths must collapse. Replace the card's `onClick={() => onChange(o.id)}` with a handler that also collapses, and do the same in `add()`:

```tsx
  function choose(id: string) {
    onChange(id);
    setExpanded(false);
    setSearch('');
  }

  async function add() {
    if (!onAddCustom) return;
    const created = await onAddCustom(search.trim());
    if (!created) return;
    choose(created.id);
  }
```

Then the card button uses `onClick={() => choose(o.id)}`. Note `add()` previously called `onChange(created.id)` and `setSearch('')` itself — `choose` now does both, so don't duplicate them.

- [ ] **Step 3: Render the collapsed view**

Add this early return before the existing `return (`, so the collapsed state is a distinct, simple render rather than a pile of conditionals inside the full one:

```tsx
  if (collapsed && selected) {
    const src = getLeaderImage(selected.setCode);
    return (
      <div className="flex items-start gap-3">
        <div className="w-24 shrink-0 overflow-hidden rounded-xl ring-2 ring-primary">
          <div
            className="flex h-[8.4rem] items-center justify-center text-3xl font-bold"
            style={src ? undefined : { background: leaderBackground(selected.colors), color: leaderTextColor(selected.colors) }}
          >
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt="" loading="lazy" className="size-full object-cover" />
            ) : (
              leaderInitial(selected.name)
            )}
          </div>
          <div className="bg-white px-1.5 py-1 text-left text-black">
            <div className="truncate text-xs font-bold leading-tight">{selected.name}</div>
            <div className="truncate text-[0.625rem] text-neutral-500">{selected.setCode ?? '—'}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          disabled={disabled}
          className="rounded-md px-2 py-1 text-sm font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          Change
        </button>
      </div>
    );
  }
```

The card markup mirrors the expanded card exactly (same `w-24`, same `h-[8.4rem]` 5:7 aspect, same caption) so the card does not visually jump when it collapses. `getLeaderImage`, `leaderBackground`, `leaderTextColor`, and `leaderInitial` are already imported at the top of this file.

- [ ] **Step 4: Verify**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: no errors; suite green (unchanged — this component has no automated test, per the Global Constraints).

- [ ] **Step 5: Commit**

```bash
git add src/components/leaders/leader-carousel.tsx
git commit -m "feat(leaders): collapse the carousel to the chosen leader"
```

---

### Task 3: Remove the opponent-meta picker from the round sheet

**Files:**
- Modify: `src/components/tournaments/round-form-sheet.tsx`

**Interfaces:**
- Consumes: Task 1's coalescing stats (nothing to import — the payload simply stops carrying a meta).
- Produces: `CreateRoundInput` payloads from this form no longer include `opponentMetaId`.

- [ ] **Step 1: Delete the field and its state**

Remove the entire meta block from the JSX (currently lines 222-229):

```tsx
        <div className="space-y-2">
          <label htmlFor="rf-oppmeta" className="text-sm font-medium">Opponent meta (optional)</label>
          <ReferenceCombobox id="rf-oppmeta" … />
        </div>
```

Remove the `oppMetaId` state declaration (line 156):

```tsx
  const [oppMetaId, setOppMetaId] = useState<string | null>(initial?.opponentMetaId ?? null);
```

And remove the two meta hooks from `RoundFormBody` (lines 152-153):

```tsx
  const { data: metas } = useMetas();
  const addMeta = useAddCustomMeta();
```

- [ ] **Step 2: Drop `opponentMetaId` from the payload**

In `save()`, both branches currently pass `opponentMetaId: oppMetaId`. Remove that property from each:

```tsx
      const payload: CreateRoundInput = kind === 'swiss'
        ? { kind: 'swiss', opponentLeaderId: oppLeaderId, result: result!, playOrder, wonDieRoll, notes: notes.trim() || null }
        : { kind: 'top_cut', opponentLeaderId: oppLeaderId, games, notes: notes.trim() || null };
```

`createRoundSchema` declares `opponentMetaId` optional, so omitting it is valid and stores `null`. Do not pass `opponentMetaId: null` explicitly — omitting is the same result with less noise.

- [ ] **Step 3: Clean up the now-unused imports**

`ReferenceCombobox` and `metaLabel` were used only by the block you deleted, and `useMetas` / `useAddCustomMeta` only by the hooks you deleted. Update the imports at the top of the file:

```tsx
import { useLeaders, useAddCustomLeader } from '@/components/query-hooks';
import { roundKindLabel, ROUND_KIND_SUBTITLES } from '@/lib/labels';
```

and delete the line `import { ReferenceCombobox } from './reference-combobox';` entirely.

Do NOT remove `ReferenceCombobox` from the codebase — `tournament-detail.tsx` and `new-tournament-form.tsx` still use it.

- [ ] **Step 4: Verify**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: no errors, suite green. `npm run lint` is what catches a missed unused import here, so do not skip it.

- [ ] **Step 5: Commit**

```bash
git add src/components/tournaments/round-form-sheet.tsx
git commit -m "feat(rounds): drop the opponent meta picker from the round sheet"
```

---

### Task 4: Segmented Dice Roll / Start / Result, with defaults

**Files:**
- Modify: `src/components/tournaments/round-form-sheet.tsx`

**Interfaces:**
- Consumes: Task 3's cleaned-up form body.
- Produces: nothing.

- [ ] **Step 1: Default the three values on add only**

Replace the three state declarations (currently lines 157-161). Each keeps `initial`'s value when editing and falls back to the default only when adding:

```tsx
  // Defaults apply when adding; editing shows what was recorded. Swiss only —
  // top cut has no die roll and derives its result from the game log.
  const [result, setResult] = useState<WinLoss | null>(
    kind === 'swiss'
      ? (initial ? (initial.result === 'win' || initial.result === 'loss' ? initial.result : null) : 'win')
      : null,
  );
  const [playOrder, setPlayOrder] = useState<PlayOrder | null>(
    kind === 'swiss' ? (initial ? initial.playOrder : 'first') : null,
  );
  const [wonDieRoll, setWonDieRoll] = useState<boolean | null>(
    kind === 'swiss' ? (initial ? initial.wonDieRoll : true) : null,
  );
```

Note the `initial ? … : default` shape rather than `initial?.x ?? default`. That distinction is the whole requirement: `??` would replace a *recorded* `null` on an old round with the default, silently rewriting history on edit. `initial ? initial.playOrder : 'first'` preserves a recorded `null`.

- [ ] **Step 2: Add a small segmented-pair component**

Add this above `RoundFormBody` (below the `cycle` helper you are about to delete). One component serves all three controls, so the three cannot drift apart:

```tsx
/** Two mutually exclusive options, both always visible. `null` renders neither as active. */
function Segmented<T extends string | boolean>({
  value, options, onChange, activeClass = 'bg-primary text-primary-foreground',
}: {
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  activeClass?: string;
}) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-9 flex-1 rounded-lg px-3 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
            value === o.value ? activeClass : 'text-muted-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Replace the two cycle buttons**

Replace the whole `<div className="grid grid-cols-2 gap-2">` block (currently lines 233-248, the two tap-to-cycle buttons) with:

```tsx
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-border/60 p-2">
                <span className="mb-1 flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
                  <Dices className="size-3.5" /> Dice Roll
                </span>
                <Segmented
                  value={wonDieRoll}
                  onChange={setWonDieRoll}
                  activeClass="bg-emerald-600 text-white"
                  options={[{ value: true, label: 'Won' }, { value: false, label: 'Lost' }]}
                />
              </div>
              <div className="rounded-xl border border-border/60 p-2">
                <span className="mb-1 block px-1 text-xs font-medium text-muted-foreground">Start</span>
                <Segmented
                  value={playOrder}
                  onChange={setPlayOrder}
                  options={[{ value: 'first' as PlayOrder, label: '1st' }, { value: 'second' as PlayOrder, label: '2nd' }]}
                />
              </div>
            </div>
```

Leave the Result block below it exactly as it is — it is already a segmented pair with the right styling, and the spec keeps it unchanged.

- [ ] **Step 4: Delete the now-unused cycle helper**

Remove this line (currently line 174):

```tsx
  const cycle = <T,>(cur: T | null, a: T, b: T): T | null => (cur === null ? a : cur === a ? b : null);
```

It had exactly two callers, both of which you just replaced.

- [ ] **Step 5: Verify**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: no errors, suite green. Lint catches the unused `cycle` if you missed it.

- [ ] **Step 6: Commit**

```bash
git add src/components/tournaments/round-form-sheet.tsx
git commit -m "feat(rounds): segmented dice roll / start / result with defaults"
```

---

### Task 5: Drop the per-round meta tag from round lines and the share card

Last task, because it is the cleanup that follows from Task 3: with new rounds carrying no meta, these tags would render for old rounds and vanish for new ones.

**Files:**
- Modify: `src/components/tournaments/round-item.tsx`
- Modify: `src/components/tournaments/tournament-detail.tsx`
- Modify: `src/components/share/tournament-share-card.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `RoundItem` no longer takes a `metaName` prop; `MatchRow` (inside the share card) no longer takes a `metaName` prop.

- [ ] **Step 1: `round-item.tsx` — remove the tag and its prop**

Delete the meta span (line 61):

```tsx
            {round.opponentMetaId && <span className="text-muted-foreground"> · {metaName(round.opponentMetaId)}</span>}
```

Then remove `metaName` from both the destructured params (line 26) and the props type (line 31). The remaining props are unchanged.

- [ ] **Step 2: `tournament-detail.tsx` — delete the dead resolver**

Delete the `metaName` resolver (line 69):

```tsx
  const metaName = (mid: string) => { const m = metas?.find((x) => x.id === mid); return m ? metaLabel(m) : ''; };
```

and remove `metaName={metaName}` from the `RoundItem` usage (line 125).

Then fix the import on line 21 — `metaLabel` is now unused here:

```tsx
import { tournamentTypeLabel } from '@/lib/labels';
```

**Keep `useMetas` and the `metas` variable.** They are still passed to `TournamentShareCard` on line 181. Removing them will break the build.

- [ ] **Step 3: `tournament-share-card.tsx` — remove the per-round meta**

Delete the `metaName` span from `MatchRow` (line 58):

```tsx
          {!condensed && metaName && <span className="font-normal text-muted-foreground"> · {metaName}</span>}
```

Remove `metaName` from `MatchRow`'s destructured params (line 34) and its props type (line 39), and remove the `metaName={…}` line from where `MatchRow` is rendered (line 120).

Then delete the now-dead helper (line 84):

```tsx
  const metaLabelFor = (id: string): string | null => { const m = metaById(id); return m ? metaLabel(m) : null; };
```

**Keep `metaById`, `eventMeta`, and the `metaLabel` import.** The event badge (line 105, `{eventMeta && <Badge variant="outline">{metaLabel(eventMeta)}</Badge>}`) still uses all three, and the spec explicitly keeps that badge — it is the one place a meta appears on a shared card.

- [ ] **Step 4: Verify**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: no errors, suite green.

- [ ] **Step 5: Manual pass**

Start the app (`npm run dev`) and walk these. The app sits behind a Clerk dev auth wall, so if you cannot get past sign-in, **say so explicitly in your report and do not claim visual confirmation you did not obtain** — report what you verified by code inspection instead.

1. Add a round → Dice Roll reads Won, Start reads 1st, Result reads Win, both options visible on each.
2. Save is disabled until an opponent leader is chosen.
3. Choosing a leader collapses the carousel to that one card with a "Change" button; "Change" reopens the full row with the selection still ringed.
4. No meta field appears anywhere in the sheet.
5. Edit an existing round → recorded values show, not the defaults; the carousel opens collapsed.
6. Edit a round saved before this change with no play order → neither Start button is highlighted.
7. Round lines and the share card's match rows show no `· OP16` tag; the share card's event badge still does.
8. Stats → the per-opponent meta breakdown still lists metas, including for rounds added after this change.

- [ ] **Step 6: Commit**

```bash
git add src/components/tournaments/round-item.tsx src/components/tournaments/tournament-detail.tsx src/components/share/tournament-share-card.tsx
git commit -m "feat(rounds): drop the per-round meta tag from round lines and share card"
```

---

## Task dependency order

Strictly sequential: 1 → 2 → 3 → 4 → 5. Tasks 3 and 4 touch the same file, and Task 5 cleans up after Task 3. Task 1 must land before Task 3 so the stats fallback exists before the form stops recording a meta. Task 2 is independent in principle but touches a file no other task does, so running it second keeps the sequence simple.
