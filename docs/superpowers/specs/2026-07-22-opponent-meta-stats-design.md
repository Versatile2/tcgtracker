# Opponent Meta + Per-Opponent Stats (Design)

**Date:** 2026-07-22
**Status:** Approved for planning
**Context:** Follow-up to the Grand Line TCG V1 rework. Players want to optionally record
which **meta** (OP-set) the opponent's deck belonged to, and see win/loss stats broken down
by opponent leader and by opponent leader × opponent meta.

## Problem

A round currently records only the opponent's leader. Players also want to note the
opponent's **meta** (the same OP01–OP16 format list already used for tournaments), optionally,
and get a global breakdown of their record against each opponent leader — and, where the
opponent meta is known, against each (opponent leader × opponent meta) pair.

## Decisions (locked)

- **Opponent meta** reuses the existing `metas` reference list (OP01–OP16 + custom); it is
  **optional** per round.
- New stats are **global** (not scoped to one of your leaders) and keyed on the **opponent's**
  leader. The per-meta sub-breakdown counts **only rounds where the opponent meta is set**.
- Schema change is **additive** (nullable column) — a normal incremental migration, **no prod
  DB reset**. Existing rounds keep `opponentMetaId = null` and are excluded from the per-meta
  breakdown.
- The existing per-your-leader Matchups view is unchanged.

## Design

### 1. Schema
`src/db/schema.ts` — `rounds` gains:
```ts
opponentMetaId: uuid('opponent_meta_id').references(() => metas.id),
```
Nullable (no `.notNull()`). Regenerate an **incremental** migration (`drizzle-kit generate`
produces `0001_*.sql` = `ALTER TABLE rounds ADD COLUMN opponent_meta_id ...`). Do NOT
regenerate from scratch — this must apply cleanly on top of the existing prod schema.

### 2. Validation & DTO
- `src/lib/validation/round.ts` — add `opponentMetaId: z.string().uuid().nullable().optional()`
  to `createRoundSchema` and `updateRoundSchema`.
- `src/lib/dto.ts` — `RoundDTO` gains `opponentMetaId: string | null`. New DTOs:
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
  `StatsDTO` gains `opponents: OpponentLeaderStatDTO[]`.

### 3. Round service
- `src/services/rounds.ts` — `addRound` insert and `updateRound` patch handle
  `opponentMetaId` (insert `input.opponentMetaId ?? null`; patch under the usual
  `!== undefined` guard).

### 4. Round form
- `src/components/tournaments/round-form-sheet.tsx` — under "Opponent deck", add an optional
  **"Opponent meta"** `ReferenceCombobox` bound to `useMetas`/`useAddCustomMeta` (placeholder
  "e.g. OP16"), state initialized from `initial?.opponentMetaId`. Include `opponentMetaId` in
  the submit payload (`null` when unset). Result/play-order/notes unchanged; opponent meta does
  NOT affect the form's validity.

### 5. Stats service & route
- `src/services/stats.ts` — new `getOpponentStats(db, ownerId): Promise<OpponentLeaderStat[]>`:
  - **Per opponent leader** (all rounds): group `rounds` (joined to owner's `tournaments`,
    joined to `leaders` on `opponentLeaderId`) by `opponentLeaderId` → win/loss/draw counts.
  - **Per opponent leader × meta** (`WHERE rounds.opponentMetaId IS NOT NULL`): group by
    `opponentLeaderId, opponentMetaId` (join `metas` for name) → counts.
  - Assemble in JS: each opponent leader carries its `byMeta` array (sorted by games desc, then
    name). Leaders sorted by total games desc, then name.
- `src/app/api/stats/route.ts` — call `getOpponentStats` in the `Promise.all` and add
  `opponents` to the JSON response.

### 6. Stats page
- New component `src/components/stats/opponent-stats.tsx` — `OpponentStats({ rows }:
  { rows: OpponentLeaderStatDTO[] })`. Renders nothing when `rows` is empty. Otherwise a
  **"By opponent"** section: per opponent leader a card (name, record, winRate bar, games);
  under it, one indented line per `byMeta` entry (meta name, record, winRate, games). Follow the
  visual pattern of `per-meta-stats.tsx`.
- `src/components/stats/stats-view.tsx` — render `<OpponentStats rows={data.opponents ?? []} />`
  after `PerMetaStats` (defensive `?? []` per the cache-shape lesson).

### 7. Round display (light)
- `src/components/tournaments/round-item.tsx` — when `round.opponentMetaId` is set, show the
  meta code/name next to the opponent (e.g. "vs Nami · OP16"). Needs a meta-name lookup passed
  in from `tournament-detail.tsx` (a `metaName(id)` helper built from `useMetas`, mirroring the
  existing `leaderName`). If plumbing a lookup is disproportionate, showing the opponent meta is
  optional polish — the stats are the deliverable.

## Non-goals
- No change to the per-your-leader Matchups view, achievements, or the tournament-level meta.
- No prod DB reset (additive migration only).
- No backfill of existing rounds in code (existing rounds stay `null`); a one-off data backfill
  of the test data may be done separately after ship.

## Success criteria
- A round can optionally record the opponent's meta from the OP01–OP16 list.
- The Stats page shows a global "By opponent" breakdown: record vs each opponent leader, and —
  for rounds where the opponent meta is set — a per-meta sub-breakdown.
- Existing rounds (no opponent meta) still work and are excluded from the per-meta split.
- The incremental migration applies on top of the current prod schema without data loss.
- `npm test` passes; `npm run build` succeeds.
