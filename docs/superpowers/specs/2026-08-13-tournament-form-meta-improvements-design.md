# Grand Line TCG — New tournament form, part 1: field order and meta presentation (Design)

**Date:** 2026-08-13
**Status:** Approved, not yet implemented
**Scope:** Four changes to the new-tournament form — move Name to the top, sort the meta picker newest-first, display metas by their code alone (`OP01`, not `OP01 Romance Dawn`), and pre-select the newest meta. The label and sort changes apply everywhere metas are shown, not just this form.

## 1. Context

`src/components/tournaments/new-tournament-form.tsx` currently orders its fields Type → Leader → Meta → Name → Date, with Meta blank by default.

Metas are seeded in `src/db/seed-data.ts` as `{ name: "OP01 Romance Dawn", code: 'OP01' }` — the set code already lives in its own column (`metas.code`, `src/db/schema.ts:25`) and already reaches the client on `MetaDTO` (`src/lib/dto.ts:2`). Nothing needs to be parsed out of the name string, and no migration is required.

`metas.releasedAt` exists in the schema but is **never written or read anywhere in the codebase**, so it is null for every row. It cannot be used to identify "the newest meta"; `code` is the only real signal.

## 2. Requirements

1. Name is the first input on the form.
2. The meta picker is sorted descending — newest set first.
3. Metas display as their code alone: `OP01 Romance Dawn` renders as `OP01`.
4. The newest meta is pre-selected when the form opens.

## 3. Decisions

### 3.1 The short label is presentational, derived from `code`

The database keeps the full name. A pure helper in `src/lib/labels.ts` produces the display string:

```ts
export function metaLabel(meta: { name: string; code: string | null }): string {
  return meta.code ?? meta.name;
}
```

Official metas render as their code. **Custom (user-added) metas have no `code` and render their full name unchanged** — a custom meta's name is its identity, and there is nothing to shorten.

This fits the existing `labels.ts` pattern already used for tournament types and round kinds.

Rejected: renaming the seed rows to `"OP01"`. It is less code, but it destroys the set titles permanently, needs a data migration, and kills search-by-title (§3.4).

### 3.2 The label applies everywhere a meta is shown

A meta must read the same on every screen. Applying the short label only to the new tournament form would leave the same meta reading two ways depending on where you look.

### 3.3 Ordering lives in SQL

`listMetas` (`src/services/reference.ts:32`) changes its `ORDER BY` from `asc(metas.name)` to:

```
ORDER BY is_custom ASC, code DESC NULLS LAST, name ASC
```

Official metas first, newest to oldest; then custom metas alphabetically. Today: OP16, OP15, … OP01, then any custom ones.

Putting this in the service rather than the component means every consumer — the new tournament form and the round sheet's opponent-meta picker — gets the same order for free.

**Why official-before-custom:** with one flat DESC sort, a custom meta named `"Zoro locals"` would outrank `OP16` and silently become the pre-selected default (§3.5). Segregating by `is_custom` makes the default deterministic while keeping custom metas one scroll away.

Codes are zero-padded (`OP01`…`OP16`), so lexical DESC is correct ordering and stays correct when `OP17` is seeded.

### 3.4 Display and search are separated in the combobox

`ReferenceCombobox` (`src/components/tournaments/reference-combobox.tsx`) currently uses one string as both the visible label and the search key (`CommandItem value={o.name}`, line 61). These split:

- **display** → `metaLabel(o)` → `"OP01"`
- **search key** → `o.name` → `"OP01 Romance Dawn"`

So typing either `OP01` or `Romance` finds the set. This is the concrete payoff for keeping the full name in the database.

Implemented as an optional `getLabel?: (option: Option) => string` prop. The leader picker does not pass it and keeps its current behavior unchanged. The `showAdd` duplicate check (line 36) continues to compare against `o.name`, so typing an existing set's full title still will not offer to create a duplicate.

### 3.5 The newest meta is pre-selected, once, without clobbering

"Newest" is defined as **the highest `code` among non-custom metas** — i.e. the first row `listMetas` returns *that has a `code`*. It resolves to OP16 today and to OP17 automatically the day one is seeded. No hardcoded set code anywhere. If no such meta exists (nothing seeded), the field is simply left blank rather than falling back to a custom meta.

The metas list arrives asynchronously via `useMetas()`, so the form pre-selects on arrival, and:

- it fires **only when no meta is currently selected**, so a refetch cannot overwrite a choice the user has already made;
- it is a default, not a constraint — the field stays labeled "Meta (optional)" and remains clearable.

Custom metas are never auto-selected, even if the user has one.

### 3.6 Stats aggregations shorten at the source, not in the components

Three server-side aggregations emit a meta display string rather than a meta object:

| Location | Field | Existing fallback |
|---|---|---|
| `aggregateByMeta` (`services/stats.ts:24`) | `name` | `'No meta'` |
| `getOverallStats` → `bestMeta.name` | via the above | `'No meta'` |
| `getOpponentStats` metaRows (`services/stats.ts:139`) | `name` | `'—'` |

These `name` fields are **already presentational** — `'No meta'` and `'—'` are not meta names. So the code is selected alongside the name in SQL and the emitted string becomes `code ?? name ?? fallback`, matching `metaLabel`'s rule. Concretely, each query adds `metas.code` to its `select` and its `groupBy`.

The alternative — adding `code` to `OverallStatsDTO`/`PerMetaStatDTO`/`OpponentMetaStatDTO` and calling `metaLabel` in each stats component — changes three DTOs and four components to reach the same rendered output. Shortening at the source touches two queries and **zero stats components**.

Consequence: existing sort tiebreakers in these functions (`a.name.localeCompare(b.name)`) now compare codes rather than full names. This is harmless — for official metas both orderings agree, since the code is the name's prefix.

## 4. Changes by file

**Server**

| File | Change |
|---|---|
| `src/services/reference.ts` | `listMetas` — new `ORDER BY` (§3.3) |
| `src/services/stats.ts` | `aggregateByMeta` and `getOpponentStats` select + group by `metas.code`; emit `code ?? name ?? fallback` (§3.6) |

**Client**

| File | Change |
|---|---|
| `src/lib/labels.ts` | New `metaLabel()` helper |
| `src/components/tournaments/reference-combobox.tsx` | Optional `getLabel` prop; display/search split (§3.4) |
| `src/components/tournaments/new-tournament-form.tsx` | Name first; pass `getLabel={metaLabel}`; pre-select newest meta (§3.5) |
| `src/components/tournaments/round-form-sheet.tsx` | Opponent-meta combobox passes `getLabel={metaLabel}` |
| `src/components/tournaments/tournament-detail.tsx` | `metaName` resolver returns `metaLabel(meta)` |
| `src/components/share/tournament-share-card.tsx` | Event meta and per-round opponent meta use `metaLabel` |

No changes to `per-meta-stats.tsx`, `overall-stats.tsx`, or `stats-share-card.tsx` — §3.6 shortens those upstream.

No schema migration. `code` is already populated for all seeded metas.

### 4.1 Resulting field order

Name (optional) → Type → Leader → Meta (optional, pre-filled) → Date. Only Name moves; every other field keeps its relative position. The submit button and its `disabled={!myLeaderId}` guard are unchanged — leader remains the only required field, and Name stays optional.

## 5. Testing

**Constraint discovered while planning:** this repo has **no component-test infrastructure**. `vitest.config.ts` sets `environment: 'node'` and collects `.ts` only (`include: ['tests/**/*.test.ts', 'src/**/*.test.ts']`); there is not one component test in the codebase. `@testing-library/react` and `jsdom` are installed but unused, and the `e2e` script has no Playwright config behind it.

Rather than expand this change into a test-infrastructure project, the pre-selection rule is **extracted into a pure function** (`pickDefaultMetaId`) and tested directly. That is where the real failure modes live — newest-official, never-custom, no hardcoded set code.

| Test | Asserts |
|---|---|
| `metaLabel` unit tests | Official meta → code; custom meta (`code: null`) → full name |
| `pickDefaultMetaId` unit tests | Highest code wins; order-independent; never a custom meta; `null` when no official meta exists; a newly seeded OP17 wins automatically |
| `listMetas` ordering test | Official metas descend by code; custom metas follow, alphabetical |
| `getPerMetaStats` test | Rows report `"OP02"`; the `'No meta'` fallback survives |
| `src/services/stats.test.ts:65` | **Existing test needs updating** — currently expects `bestMeta?.name === 'OP02 Paramount War'`, becomes `'OP02'` |

**Not covered by automation:** field order, and the combobox display/search split. Both are verified by manual check during implementation. Standing up jsdom component testing to close this gap is specified as an optional task in the plan, to be done only on request.

## 6. Out of scope

Part 1 covers the four items above. Not included: any change to the leader carousel, the tournament type list, validation rules, or which fields are required.
