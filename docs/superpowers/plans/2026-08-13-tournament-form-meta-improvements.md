# New Tournament Form Part 1 — Field Order & Meta Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the new tournament form, make Name the first input, sort the meta picker newest-first, show metas by their set code alone (`OP01`, not `OP01 Romance Dawn`), and pre-select the newest meta — with the short label and sort applied everywhere metas appear.

**Architecture:** The set code already exists as its own column (`metas.code`) and already reaches the client on `MetaDTO`, so no schema change and no migration. Two pure helpers carry the domain rules (`metaLabel` for display, `pickDefaultMetaId` for the default), sorting moves into the `listMetas` SQL `ORDER BY`, and the stats aggregations shorten at the source because their `name` fields are already presentational.

**Tech Stack:** Next.js 16 (App Router), React 19, Drizzle ORM + Postgres, TanStack Query, vitest, base-ui + cmdk (`ReferenceCombobox`), Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-13-tournament-form-meta-improvements-design.md`

## Global Constraints

- **This is NOT the Next.js you know** (`AGENTS.md`). Read the relevant guide in `node_modules/next/dist/docs/` before writing framework-level code. Heed deprecation notices. Tasks 1–7 touch no framework APIs, so this mainly matters if you deviate from the plan.
- **No schema migration.** `metas.code` is already populated for every seeded meta. Do not add, drop, or alter columns.
- **The database keeps full meta names.** `"OP01 Romance Dawn"` stays in the `name` column. Shortening is presentational only. Never rewrite seed data to `"OP01"`.
- **`metas.releasedAt` is null everywhere** — declared in the schema but never written or read. Do not use it to determine "newest". `code` is the only signal.
- **Custom metas have `code: null`** and render their full name unchanged. They are never auto-selected.
- Run tests with `npm test` (vitest). Integration tests under `src/services/` need the test database, which `tests/setup/global-setup.ts` provisions automatically.
- Commit after every task.

---

### Task 1: `metaLabel` display helper

The pure rule for turning a meta into its display string. Everything else depends on this.

**Files:**
- Modify: `src/lib/labels.ts` (append; file currently ends after `roundKindLabel`)
- Test: `src/lib/labels.test.ts` (append to existing file)

**Interfaces:**
- Consumes: nothing.
- Produces: `metaLabel(meta: { name: string; code?: string | null }): string` — used by Tasks 5, 6, 7.

The parameter is structurally typed rather than taking `MetaDTO`, so it accepts both the client `MetaDTO` (`src/lib/dto.ts:2`) and the server-side `Meta` row type (`src/services/reference.ts:9`) without either importing the other.

**`code` is optional (`code?`), not just nullable.** This matters: Task 5 passes `metaLabel` as the combobox's `getLabel`, whose parameter is the combobox's own `Option` type. Declaring `code: string | null` would make that assignment a type error. Do not tighten it.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/labels.test.ts`:

```ts
describe('metaLabel', () => {
  it('shows an official meta as its set code alone', () => {
    expect(metaLabel({ name: 'OP01 Romance Dawn', code: 'OP01' })).toBe('OP01');
    expect(metaLabel({ name: 'OP16 The Time of Battle', code: 'OP16' })).toBe('OP16');
  });

  it('shows a custom meta as its full name, since it has no code', () => {
    expect(metaLabel({ name: 'Locals house rules', code: null })).toBe('Locals house rules');
  });
});
```

Add `metaLabel` to the existing import at the top of the file:

```ts
import { tournamentTypeLabel, metaLabel } from './labels';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/labels.test.ts`
Expected: FAIL — `metaLabel is not a function` (or a TypeScript "no exported member" error).

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/labels.ts`:

```ts
/**
 * Metas display as their set code alone — "OP01", not "OP01 Romance Dawn".
 * Custom metas have no code, so their full name is the label.
 */
export function metaLabel(meta: { name: string; code?: string | null }): string {
  return meta.code ?? meta.name;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/labels.test.ts`
Expected: PASS (both new tests plus the existing `tournamentTypeLabel` test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/labels.ts src/lib/labels.test.ts
git commit -m "feat(metas): add metaLabel helper showing metas by set code"
```

---

### Task 2: `pickDefaultMetaId` selection helper

Which meta the new tournament form pre-selects. This is domain logic, not view logic, so it lives in a pure module where it can be tested without React.

**Files:**
- Create: `src/lib/meta-selection.ts`
- Test: `src/lib/meta-selection.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `pickDefaultMetaId(metas: { id: string; code: string | null; isCustom: boolean }[]): string | null` — used by Task 6.

Deliberately **order-independent**: it computes the max itself rather than trusting the caller to have sorted. Task 3 does sort the list, but a helper that silently returns the wrong meta when handed an unsorted array is a trap.

- [ ] **Step 1: Write the failing test**

Create `src/lib/meta-selection.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pickDefaultMetaId } from './meta-selection';

const official = (id: string, code: string) => ({ id, code, isCustom: false });
const custom = (id: string, name: string) => ({ id, code: null, isCustom: true, name });

describe('pickDefaultMetaId', () => {
  it('picks the highest set code', () => {
    const metas = [official('a', 'OP01'), official('p', 'OP16'), official('c', 'OP09')];
    expect(pickDefaultMetaId(metas)).toBe('p');
  });

  it('does not depend on the input order', () => {
    const metas = [official('p', 'OP16'), official('c', 'OP09'), official('a', 'OP01')];
    expect(pickDefaultMetaId(metas)).toBe('p');
  });

  it('never picks a custom meta, even one sorting above every set code', () => {
    // "Zoro locals" > "OP16" lexically — a naive max would select it.
    const metas = [official('p', 'OP16'), custom('z', 'Zoro locals')];
    expect(pickDefaultMetaId(metas)).toBe('p');
  });

  it('returns null when there is no official meta to pick', () => {
    expect(pickDefaultMetaId([])).toBe(null);
    expect(pickDefaultMetaId([custom('z', 'Zoro locals')])).toBe(null);
  });

  it('picks a newly seeded set automatically', () => {
    // No hardcoded set code: OP17 wins the day it is seeded.
    const metas = [official('p', 'OP16'), official('q', 'OP17')];
    expect(pickDefaultMetaId(metas)).toBe('q');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/meta-selection.test.ts`
Expected: FAIL — cannot resolve module `./meta-selection`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/meta-selection.ts`:

```ts
type Selectable = { id: string; code: string | null; isCustom: boolean };

/**
 * The meta a new tournament defaults to: the newest official set.
 *
 * "Newest" is the highest `code` — codes are zero-padded (OP01…OP16), so a
 * lexical max is correct ordering and stays correct when OP17 is seeded.
 * `releasedAt` exists in the schema but is null for every row, so it cannot
 * be used here.
 *
 * Custom metas are excluded: they have no code, and one named "Zoro locals"
 * would otherwise outrank OP16 and silently become everyone's default.
 */
export function pickDefaultMetaId(metas: Selectable[]): string | null {
  const official = metas.filter((m): m is Selectable & { code: string } => !m.isCustom && m.code !== null);
  if (official.length === 0) return null;
  return official.reduce((best, m) => (m.code > best.code ? m : best)).id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/meta-selection.test.ts`
Expected: PASS — all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/meta-selection.ts src/lib/meta-selection.test.ts
git commit -m "feat(metas): add pickDefaultMetaId for the newest official set"
```

---

### Task 3: Sort `listMetas` newest-first

**Files:**
- Modify: `src/services/reference.ts:32-34` (`listMetas`)
- Test: `src/services/reference.test.ts` (append)

**Interfaces:**
- Consumes: nothing.
- Produces: `listMetas` now returns official metas ordered by code descending, then custom metas alphabetically. Both meta comboboxes (Tasks 6, 7) inherit this order with no client-side sorting.

This is an integration test against the real test database — `beforeEach` resets and reseeds it, exactly like the existing tests in this file.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe('reference service', ...)` block in `src/services/reference.test.ts`:

```ts
it('lists official metas newest-first, with custom ones after', async () => {
  await addCustomMeta(db, USER, { name: 'Zoro locals' });
  const list = await listMetas(db, USER);

  const officialCodes = list.filter((m) => !m.isCustom).map((m) => m.code);
  expect(officialCodes[0]).toBe('OP16');
  expect(officialCodes.at(-1)).toBe('OP01');
  expect([...officialCodes].sort().reverse()).toEqual(officialCodes);

  // "Zoro locals" sorts above "OP16" lexically, so a flat DESC sort by name
  // would put it first and it would become the form's default.
  const customIndex = list.findIndex((m) => m.name === 'Zoro locals');
  const lastOfficialIndex = list.map((m) => m.isCustom).lastIndexOf(false);
  expect(customIndex).toBeGreaterThan(lastOfficialIndex);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/services/reference.test.ts`
Expected: FAIL — `expected 'OP01' to be 'OP16'`, because the current `orderBy(asc(metas.name))` sorts ascending.

- [ ] **Step 3: Write minimal implementation**

In `src/services/reference.ts`, replace the body of `listMetas`:

```ts
export async function listMetas(db: DB, ownerId: string): Promise<Meta[]> {
  // Official sets newest-first (codes are zero-padded, so lexical DESC is
  // correct), then the user's custom metas alphabetically. Keeping customs
  // below the official list means the form's default (the first coded row)
  // can never be hijacked by a custom meta whose name outranks "OP16".
  return db.select().from(metas)
    .where(visibleTo(metas, ownerId))
    .orderBy(asc(metas.isCustom), sql`${metas.code} desc nulls last`, asc(metas.name));
}
```

`sql` and `asc` are both already imported at the top of this file — no import change needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/services/reference.test.ts`
Expected: PASS — the new test plus all existing reference-service tests (the custom-meta dedupe tests must still pass).

- [ ] **Step 5: Commit**

```bash
git add src/services/reference.ts src/services/reference.test.ts
git commit -m "feat(metas): sort metas newest-first, customs last"
```

---

### Task 4: Shorten meta names in the stats aggregations

Three stats surfaces render a meta name that the server produces as a plain string, so they cannot use `metaLabel` on the client. Those `name` fields are **already presentational** — they carry `'No meta'` and `'—'` fallbacks that are not real meta names — so shortening belongs at the source.

Doing it here means `per-meta-stats.tsx`, `overall-stats.tsx`, and `stats-share-card.tsx` need **no changes at all**.

**Files:**
- Modify: `src/services/stats.ts` — `aggregateByMeta` (around line 24) and `getOpponentStats` metaRows query (around line 139)
- Test: `src/services/stats.test.ts:65` (update existing assertion), plus a new assertion

**Interfaces:**
- Consumes: nothing (does not import `metaLabel` — it applies the same `code ?? name` rule in SQL-selected data).
- Produces: `OverallStatsDTO.bestMeta.name`, `PerMetaStatDTO.name`, and `OpponentMetaStatDTO.name` now hold `"OP02"` rather than `"OP02 Paramount War"`. DTO **shapes are unchanged**.

- [ ] **Step 1: Update the existing test and add a new one**

In `src/services/stats.test.ts`, change line 65 from:

```ts
    expect(o.bestMeta?.name).toBe('OP02 Paramount War');
```

to:

```ts
    expect(o.bestMeta?.name).toBe('OP02');
```

Then append this test inside the same top-level `describe` block:

```ts
it('reports per-meta rows by set code, and keeps the no-meta fallback', async () => {
  await makeTournament('OP02 Paramount War', 'Roronoa Zoro', [['Nami', 'win']]);
  await makeTournament(null, 'Roronoa Zoro', [['Nami', 'loss']]);
  const rows = await getPerMetaStats(db, USER);
  expect(rows.map((r) => r.name).sort()).toEqual(['No meta', 'OP02']);
});
```

Note `makeTournament` (defined at the top of this file) takes the meta's **full** name, because it looks the row up by `metas.name` in the database — the database still stores full names. Only the emitted stat string shortens.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/services/stats.test.ts`
Expected: FAIL — `expected 'OP02 Paramount War' to be 'OP02'`.

- [ ] **Step 3: Write the implementation**

In `src/services/stats.ts`, in `aggregateByMeta`, add the code to the `select`:

```ts
      metaId: tournaments.metaId,
      metaName: metas.name,
      metaCode: metas.code,
```

add it to the `groupBy`:

```ts
    .groupBy(tournaments.metaId, metas.name, metas.code);
```

and use it in the mapped result, replacing `name: r.metaName ?? 'No meta',`:

```ts
      // Same rule as metaLabel(): official sets show as their code alone.
      name: r.metaCode ?? r.metaName ?? 'No meta',
```

Then in `getOpponentStats`, in the `metaRows` query, add the code to the `select`:

```ts
      metaId: rounds.opponentMetaId,
      metaName: metas.name,
      metaCode: metas.code,
```

add it to the `groupBy`:

```ts
    .groupBy(rounds.opponentLeaderId, rounds.opponentMetaId, metas.name, metas.code);
```

and in the `for (const r of metaRows)` loop replace `name: r.metaName ?? '—',`:

```ts
      metaId: r.metaId, name: r.metaCode ?? r.metaName ?? '—',
```

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS. Watch `src/services/stats.matchups.test.ts` in particular — it exercises `getOpponentStats`. If it asserts a full meta name anywhere, update that assertion to the code the same way, and note it in your commit message.

- [ ] **Step 5: Commit**

```bash
git add src/services/stats.ts src/services/stats.test.ts
git commit -m "feat(metas): report stats metas by set code"
```

---

### Task 5: Split display from search in `ReferenceCombobox`

The combobox currently uses one string as both the visible label and the search key (`CommandItem value={o.name}`, line 61). Splitting them is what lets a meta show as `OP01` while still being findable by typing `Romance`.

**Files:**
- Modify: `src/components/tournaments/reference-combobox.tsx`

**Interfaces:**
- Consumes: nothing (the component stays generic — it does not import `metaLabel`; callers pass it in).
- Produces: a new optional prop `getLabel?: (option: Option) => string` on `ReferenceCombobox`, and a widened `Option` type. Tasks 6 and 7 pass `getLabel={metaLabel}`. The leader picker does not pass it and is unaffected.

- [ ] **Step 1: Widen the `Option` type**

`getLabel` is typed over `Option`, so for `getLabel={metaLabel}` to typecheck, `Option` must structurally satisfy `metaLabel`'s parameter. Change line 9:

```tsx
type Option = { id: string; name: string; code?: string | null };
```

`code` is optional, so every existing caller — including the leader picker and the `onAddCustom` callbacks that return bare `{ id, name }` objects — still satisfies it with no change.

- [ ] **Step 2: Add the prop to the signature**

In the props destructuring and type, add `getLabel`:

```tsx
export function ReferenceCombobox({
  id, options, value, onChange, onAddCustom, placeholder, disabled, getIcon, getLabel,
}: {
  id?: string;
  options: Option[];
  value: string | null;
  onChange: (id: string) => void;
  /** Resolves to null when the option could not be created (e.g. offline). */
  onAddCustom: (name: string) => Promise<Option | null>;
  placeholder: string;
  disabled?: boolean;
  getIcon?: (id: string) => ReactNode;
  /**
   * Visible text for an option. Search still matches on `option.name`, so a
   * meta can display as "OP01" and still be found by typing "Romance Dawn".
   * Defaults to the name.
   */
  getLabel?: (option: Option) => string;
}) {
```

- [ ] **Step 3: Add a local resolver below the `selected` lookup**

Replace line 26 (`const selected = options.find((o) => o.id === value);`) with:

```tsx
  const selected = options.find((o) => o.id === value);
  const label = (o: Option) => (getLabel ? getLabel(o) : o.name);
```

- [ ] **Step 4: Use it in the trigger**

In the `PopoverTrigger` button, replace `{selected ? selected.name : placeholder}` with:

```tsx
                {selected ? label(selected) : placeholder}
```

- [ ] **Step 5: Use it in the list, keeping `value` on the name**

Replace the `CommandItem` for options (lines 60-66) with:

```tsx
              {options.map((o) => (
                // `value` drives cmdk's filtering, so it stays the full name —
                // that is what keeps "Romance" matching an item that reads "OP01".
                <CommandItem key={o.id} value={o.name} onSelect={() => { onChange(o.id); setOpen(false); }}>
                  <Check className={cn('mr-2 h-4 w-4 shrink-0', value === o.id ? 'opacity-100' : 'opacity-0')} />
                  {getIcon ? <span className="mr-2 shrink-0">{getIcon(o.id)}</span> : null}
                  <span className="truncate">{label(o)}</span>
                </CommandItem>
              ))}
```

Leave the `showAdd` check (line 36) comparing against `o.name` — that is what stops a user typing an existing set's full title from being offered a duplicate.

- [ ] **Step 6: Verify it compiles and nothing regressed**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors. `getLabel` is optional, so the leader picker's existing call sites still typecheck unchanged.

Run: `npm test`
Expected: PASS (unchanged — this component has no automated test; see "Verification gap" below).

- [ ] **Step 7: Commit**

```bash
git add src/components/tournaments/reference-combobox.tsx
git commit -m "feat(combobox): allow a display label distinct from the search key"
```

---

### Task 6: New tournament form — Name first, short meta labels, newest meta pre-selected

The three user-facing changes on the target form.

**Files:**
- Modify: `src/components/tournaments/new-tournament-form.tsx`

**Interfaces:**
- Consumes: `metaLabel` (Task 1), `pickDefaultMetaId` (Task 2), the `getLabel` prop (Task 5), and the new ordering from `listMetas` (Task 3).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the imports**

Add `useEffect` and `useRef` to the React import on line 2, and import the two helpers:

```tsx
import { useState, useEffect, useRef } from 'react';
```

Extend the existing labels import (line 12) and add the selection import:

```tsx
import { tournamentTypeLabel, metaLabel } from '@/lib/labels';
import { pickDefaultMetaId } from '@/lib/meta-selection';
```

- [ ] **Step 2: Pre-select the newest meta once the list arrives**

Add below the `playedOn` state declaration (after line 31):

```tsx
  // Metas load asynchronously, so the default is applied on arrival. The ref
  // makes it fire exactly once: a refetch must never overwrite a choice the
  // user has already made.
  const defaultApplied = useRef(false);
  useEffect(() => {
    if (defaultApplied.current || !metas?.length) return;
    defaultApplied.current = true;
    setMetaId((current) => current ?? pickDefaultMetaId(metas));
  }, [metas]);
```

- [ ] **Step 3: Move the Name field to the top**

Cut the entire Name block (lines 83-86 — the `div` containing the `nt-name` label and `Input`) and paste it directly below the `<h1>New Tournament</h1>` heading, so it becomes the first field, above the Type block. The block itself is unchanged:

```tsx
      <div className="space-y-2">
        <label htmlFor="nt-name" className="text-sm font-medium">Name (optional)</label>
        <Input id="nt-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spring Regional" className="h-12 text-base" />
      </div>
```

The resulting field order is Name → Type → Leader → Meta → Date. Do not reorder anything else, and do not touch the submit button or its `disabled={!myLeaderId}` guard — leader stays the only required field.

- [ ] **Step 4: Show metas by their code**

On the meta `ReferenceCombobox`, add the `getLabel` prop:

```tsx
        <ReferenceCombobox
          id="nt-meta"
          options={metas ?? []} value={metaId} onChange={setMetaId}
          getLabel={metaLabel}
          onAddCustom={async (n) => {
            if (!online) { toast.error('Adding a meta needs a connection — pick one from the list for now'); return null; }
            const m = await addMeta.mutateAsync({ name: n });
            return { id: m.id, name: m.name };
          }}
          placeholder="e.g. OP16" />
```

`metaLabel` takes `{ name, code }` and `options` are `MetaDTO`s, which carry `code` — this typechecks directly.

- [ ] **Step 5: Verify**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: no errors, tests PASS.

Then start the app (`npm run dev`), open `/tournaments/new`, and confirm by eye:
1. Name is the first input.
2. The Meta field already reads `OP16` on load.
3. Opening the meta picker lists `OP16, OP15, … OP01`, then any custom metas.
4. Typing `Romance` in the picker still finds `OP01`.
5. Picking a leader and submitting still creates the tournament and navigates to it.

- [ ] **Step 6: Commit**

```bash
git add src/components/tournaments/new-tournament-form.tsx
git commit -m "feat(tournaments): name first, short meta labels, newest meta preselected"
```

---

### Task 7: Apply the short label to the remaining meta render sites

So a meta reads the same on every screen.

**Files:**
- Modify: `src/components/tournaments/round-form-sheet.tsx` (around line 223)
- Modify: `src/components/tournaments/tournament-detail.tsx:69`
- Modify: `src/components/share/tournament-share-card.tsx` (lines 105 and 119)

**Interfaces:**
- Consumes: `metaLabel` (Task 1), the `getLabel` prop (Task 5).
- Produces: nothing.

- [ ] **Step 1: Round form sheet — opponent meta picker**

Extend the existing labels import on line 11:

```tsx
import { roundKindLabel, ROUND_KIND_SUBTITLES, metaLabel } from '@/lib/labels';
```

Then add the prop to the opponent-meta combobox:

```tsx
          <ReferenceCombobox id="rf-oppmeta"
            options={metas ?? []} value={oppMetaId} onChange={setOppMetaId}
            getLabel={metaLabel}
            onAddCustom={async (n) => { const m = await addMeta.mutateAsync({ name: n }); return { id: m.id, name: m.name }; }}
            placeholder="e.g. OP16" />
```

- [ ] **Step 2: Tournament detail — the `metaName` resolver**

This resolver feeds `round-item.tsx`, which renders the opponent meta next to each round. Replace line 69:

```tsx
  const metaName = (mid: string) => { const m = metas?.find((x) => x.id === mid); return m ? metaLabel(m) : ''; };
```

Extend the existing labels import on line 21:

```tsx
import { tournamentTypeLabel, metaLabel } from '@/lib/labels';
```

`round-item.tsx` itself needs **no change** — it just calls the resolver it is handed.

- [ ] **Step 3: Share card — replace the inlined rule and the round meta**

Line 105 already inlines exactly this rule (`{eventMeta.code ?? eventMeta.name}`). Swap it for the shared helper so there is one definition:

```tsx
            {eventMeta && <Badge variant="outline">{metaLabel(eventMeta)}</Badge>}
```

Then line 119, the per-round opponent meta:

```tsx
            metaName={r.opponentMetaId ? (() => { const m = metaById(r.opponentMetaId!); return m ? metaLabel(m) : null; })() : null}
```

If that reads badly inline, hoist a helper next to `metaById` (around line 83) instead and use it in both places:

```tsx
  const metaLabelFor = (id: string): string | null => { const m = metaById(id); return m ? metaLabel(m) : null; };
```

giving `metaName={r.opponentMetaId ? metaLabelFor(r.opponentMetaId) : null}`. Either is fine; the hoisted version is preferred.

Add `metaLabel` to this file's import from `@/lib/labels` — it already imports `tournamentTypeLabel` from there.

- [ ] **Step 4: Verify**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: no errors, tests PASS.

Then in the running app, confirm by eye:
1. Open a tournament with rounds that have an opponent meta — each round shows e.g. `· OP16`.
2. Open the round sheet — the opponent meta picker shows codes and is sorted newest-first.
3. Open the share card — the event badge and per-round metas show codes.
4. Open the stats screen — "Best meta" and the "By meta" rows show codes (from Task 4; no change was needed in those components).

- [ ] **Step 5: Commit**

```bash
git add src/components/tournaments/round-form-sheet.tsx src/components/tournaments/tournament-detail.tsx src/components/share/tournament-share-card.tsx
git commit -m "feat(metas): show metas by set code across rounds, detail and share card"
```

---

## Verification gap — read before starting

The spec's testing table promised three UI tests: field order, the combobox display/search split, and the form's pre-selection behavior. **Two of those have no infrastructure to run on in this repo:**

- `vitest.config.ts` sets `environment: 'node'` and `include: ['tests/**/*.test.ts', 'src/**/*.test.ts']` — `.tsx` files are not collected, and there is not a single component test in the codebase.
- `@testing-library/react` and `jsdom` are installed but unused. The `e2e` script exists but there is **no Playwright config**, and `tests/smoke.test.ts` is only a vitest sanity check.

The plan resolves this by **extracting the logic rather than testing the view**: `pickDefaultMetaId` (Task 2) carries the entire pre-selection rule — newest official, never custom, no hardcoded code — as a pure function with 5 unit tests. That is the part with real failure modes, and it is fully covered.

What remains genuinely unverified by automation: **field order** and **the combobox display/search split**. Both are covered by the manual checks in Tasks 6 and 7. Task 8 closes the gap properly and is optional — do it only if the user asks.

---

### Task 8 (OPTIONAL — only if requested): Component test infrastructure

Stands up React component testing and adds the two missing tests.

**Files:**
- Modify: `vitest.config.ts`
- Create: `src/components/tournaments/reference-combobox.test.tsx`

**Interfaces:**
- Consumes: `ReferenceCombobox` with `getLabel` (Task 5), `metaLabel` (Task 1).
- Produces: `.tsx` test collection, enabling future component tests.

- [ ] **Step 1: Collect `.tsx` tests**

In `vitest.config.ts`, extend `include`. Leave `environment: 'node'` as the default — the DB integration suites need it — and opt individual component files into jsdom with a docblock:

```ts
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
```

- [ ] **Step 2: Write the test**

Create `src/components/tournaments/reference-combobox.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReferenceCombobox } from './reference-combobox';
import { metaLabel } from '@/lib/labels';

const OPTIONS = [
  { id: 'm16', name: 'OP16 The Time of Battle', code: 'OP16' },
  { id: 'm01', name: 'OP01 Romance Dawn', code: 'OP01' },
];

afterEach(cleanup);

function renderBox(value: string | null = null) {
  const onChange = vi.fn();
  render(
    <ReferenceCombobox
      options={OPTIONS} value={value} onChange={onChange}
      onAddCustom={async () => null}
      getLabel={metaLabel}
      placeholder="e.g. OP16" />,
  );
  return { onChange };
}

describe('ReferenceCombobox getLabel', () => {
  it('shows the selected option by its label, not its full name', () => {
    renderBox('m01');
    expect(screen.getByRole('button')).toHaveTextContent('OP01');
    expect(screen.getByRole('button')).not.toHaveTextContent('Romance Dawn');
  });

  it('finds an option by its full name while displaying only the code', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBox();
    await user.click(screen.getByRole('button'));
    await user.type(screen.getByPlaceholderText('Search…'), 'Romance');
    await user.click(await screen.findByText('OP01'));
    expect(onChange).toHaveBeenCalledWith('m01');
  });
});
```

- [ ] **Step 3: Run and confirm**

Run: `npm test -- src/components/tournaments/reference-combobox.test.tsx`
Expected: PASS.

If `@testing-library/user-event` or `@testing-library/jest-dom` turn out not to be installed, install them as dev dependencies (`npm i -D @testing-library/user-event @testing-library/jest-dom`) and add a setup file importing `@testing-library/jest-dom/vitest` wired via `test.setupFiles` in `vitest.config.ts`. Only `toHaveTextContent` needs jest-dom; if you prefer zero new dependencies, assert with `expect(button.textContent).toContain('OP01')` instead and drop that install.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS — confirm the `.tsx` include did not pull the node-environment DB suites into jsdom.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts src/components/tournaments/reference-combobox.test.tsx
git commit -m "test: add component testing setup and combobox label coverage"
```

---

## Task dependency order

Tasks 1 and 2 are independent pure helpers and can run in parallel. Task 3 and Task 4 are server-only and independent of everything else — they can run in parallel with 1 and 2. Task 5 is independent but gates Tasks 6 and 7. Task 6 needs 1, 2, and 5. Task 7 needs 1 and 5.

```
1 (metaLabel) ─┬─> 6 (form)
2 (pickDefault)┤   ^
5 (combobox) ──┴───┴─> 7 (render sites)
3 (ordering)   [independent]
4 (stats)      [independent]
```
