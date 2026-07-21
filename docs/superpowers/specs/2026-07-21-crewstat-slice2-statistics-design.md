# Crew Stat — Slice 2: Statistics & Analysis (Design)

**Date:** 2026-07-21
**Status:** Approved design, ready for implementation planning
**Scope:** Second vertical slice — a read/aggregation layer over Slice 1 data. Web-first, mobile-friendly. No changes to existing tables or endpoints.

## 1. Context

Slice 1 (tournament tracking) is shipped and live. Its schema was deliberately shaped to feed statistics: matchups from `rounds.my_leader_id` / `rounds.opponent_leader_id`, per-set performance from `tournaments.set_id`, turn-order from `rounds.play_order`, and colors from `leaders.colors`. Slice 2 adds statistics as a pure read layer — no schema migration, no writes.

Covers use cases UC6 (all-time stats), UC7 (per-set/season performance), and UC8 (deck matchup analysis). UC9 ("refetch statistics") is intentionally dropped: because stats are computed on read via SQL aggregation, they are always live — there is nothing to refetch.

## 2. Product Decisions (confirmed)

- **Full scope:** overall + per-set + matchup analysis (UC6–8).
- **Lean presentation:** stat cards, tables, and Tailwind win-rate bars. No charting dependency.
- **Compute on read** via SQL aggregation in the service layer (fast, correct, always current).
- **All logged rounds count**, whether the tournament is `draft` or `locked` — a logged game result is real data. "Total tournaments" counts all of the user's tournaments.
- Ownership scoping identical to Slice 1: every stat query is scoped to the signed-in user; a user only ever sees their own aggregates.

## 3. Architecture

Same layers as Slice 1, additively:

```
Stats UI (/stats page, client components)
      │  fetch (TanStack Query)
      ▼
REST API  —  GET /api/stats, GET /api/stats/matchups
      │
      ▼
Service layer  —  src/services/stats.ts (SQL aggregation, takes (db, ownerId))
      │
      ▼
Drizzle  →  Neon Postgres  (existing tournaments/rounds/leaders/sets tables)
```

No new tables, no migration. Reuses Clerk auth, `requireUserId`, `errorToResponse`, the existing DB client, and the `computeRecord`/`formatRecord` helpers where useful.

## 4. Service Layer — `src/services/stats.ts`

All functions take `(db, ownerId)` and are ownership-scoped. Types are exported for the API/DTO layers.

- **`getOverallStats(db, ownerId)`** → `{ totalTournaments, wins, losses, draws, winRate, drawRate, bestSet: { setId, name, winRate, games } | null, mostPlayedLeader: { leaderId, name, tournaments } | null }`
  - `winRate` = wins / (wins + losses + draws) as a 0–1 number (UI formats as %). Guard divide-by-zero → 0.
  - `bestSet` = set with the highest win rate among sets the user has rounds in (ties broken by more games, then name). Null if no data.
  - `mostPlayedLeader` = the `my_leader` appearing in the most tournaments.

- **`getPerSetStats(db, ownerId)`** → `Array<{ setId, name, tournaments, wins, losses, draws, winRate }>`, sorted by win rate desc then name. Rounds whose tournament has a null `set_id` are grouped under a synthetic "No set" bucket (`setId: null`).

- **`getPlayedLeaders(db, ownerId)`** → `Array<{ id, name }>` — distinct leaders the user has used as `my_leader`, name-sorted. Populates the matchup picker. Empty array if none.

- **`getMatchupStats(db, ownerId, leaderId)`** → for the given "my" leader:
  - `opponents`: `Array<{ leaderId, name, wins, losses, draws, winRate, verdict: 'favored' | 'even' | 'unfavored' }>` sorted by games desc. `verdict` from win rate: ≥0.55 favored, ≤0.45 unfavored, else even (only meaningful with ≥1 game; still shown).
  - `turnOrder`: `{ first: { wins, losses, draws, winRate, games }, second: { …} }` — rounds with null `play_order` are excluded from these splits.
  - `colorBreakdown`: `Array<{ color, wins, losses, draws, winRate, games }>` — the user's results grouped by each color of the OPPONENT leader (a two-color opponent contributes to both colors). Opponents with no colors contribute to a `"colorless"` bucket. Sorted by games desc.
  - Ownership: `leaderId` is only used as a filter on the user's own rounds; no cross-user leakage.

## 5. REST API

Both require a Clerk session; scoped to the user; Zod-validated query params.

- **`GET /api/stats`** → `{ overall, perSet, playedLeaders }` (one call powers the whole page shell).
- **`GET /api/stats/matchups?leaderId=<uuid>`** → the `getMatchupStats` result. `leaderId` validated as a uuid → 400 if missing/malformed.

`export const runtime = 'nodejs'` on both; errors routed through `errorToResponse`.

## 6. Client

- **DTOs** in `src/lib/dto.ts`: `OverallStatsDTO`, `PerSetStatDTO`, `PlayedLeaderDTO`, `StatsDTO` (`{ overall, perSet, playedLeaders }`), `MatchupStatsDTO` (opponents, turnOrder, colorBreakdown).
- **`apiClient`** methods: `getStats()`, `getMatchups(leaderId)`.
- **Hooks** in `src/components/query-hooks.ts`: `useStats()` and `useMatchups(leaderId)` (the latter enabled only when a leader is selected).

## 7. UI

- **New route `/stats`** (`src/app/stats/page.tsx`) rendering a client `StatsView`.
- **Navigation:** a "Stats" link/button on the tournament list (home) header; a "← Home" back link on the stats page. (A bottom tab bar is a possible later enhancement, out of scope here.)
- **Sections:**
  1. **Overall** — stat cards: total tournaments, overall record (`W-L`/`W-L-D`), win rate %, draw rate %; plus "Best set" and "Most-played leader" highlights.
  2. **By set** — rows of set name + record + a Tailwind win-rate bar + %, sorted best-first.
  3. **Matchups** — a leader picker (from `playedLeaders`); on select, shows opponent rows (name, record, win %, favored/even/unfavored chip), a turn-order split (1st vs 2nd win %), and the color breakdown (per color: record + win %).
- Mobile-first shadcn cards + Tailwind bars. Explicit empty states: whole-page empty state when the user has no rounds yet; matchup empty state before a leader is picked / when a leader has no rounds.

## 8. Testing

- **Unit/integration (Vitest, test DB):** `stats.ts` functions with seeded tournaments/rounds — win-rate math, per-set grouping and sort, best-set/most-played selection, matchup opponent aggregation, turn-order splits (including null-play-order exclusion), color breakdown (including multi-color and colorless), and empty-data / all-draws edge cases.
- **API route tests:** mock Clerk + hit the test DB; assert shape, the one-call `/api/stats` payload, and `matchups` 400 on missing/invalid `leaderId`.
- **UI:** verified by `npm run build`; live behavior optionally covered by a later E2E.

## 9. Out of Scope (future slices)

Filtering stats by tournament format/type; charts and win-rate-over-time trend lines; shareable stat images (Slice 6); achievements (Slice 4). The aggregation layer here is shaped so those can build on top without rework.
