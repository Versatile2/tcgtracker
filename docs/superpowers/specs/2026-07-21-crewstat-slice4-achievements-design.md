# Crew Stat — Slice 4: Achievements (Design)

**Date:** 2026-07-21
**Status:** Approved design, ready for implementation planning
**Scope:** An Achievements page that unlocks OPTCG-specific badges computed live from existing tournament data, with a client-side "newly unlocked" toast. Additive only — no schema, no migration, no write-path changes.

## 1. Context & Decision

Slices 1–3 are shipped and live. The user chose the **compute-on-read** approach (over persisted unlock records): achievements are derived on demand from the user's tournaments/rounds, exactly like Slice 2's stats. A "newly unlocked!" toast is produced **client-side** by diffing the current unlocked set against what the user has already seen (stored in `localStorage`). No `unlocked_at` timestamps, no server notifications, no DB table.

Covers UC10 (unlock achievements) and UC12 (showcase on a profile/page). UC11 (share-as-photo) is deferred to Slice 6 (export).

## 2. Achievement set (12, all computable from existing data)

Each achievement has a stable `key`, `name`, `description`, and evaluates to `{ unlocked: boolean, progress?: { current, target } }`.

| key | name | unlock condition | progress |
|-----|------|------------------|----------|
| `first_blood` | First Blood | log ≥1 tournament | n/1 |
| `regular` | Regular | log ≥10 tournaments | n/10 |
| `veteran` | Veteran | log ≥25 tournaments | n/25 |
| `century` | Century | play ≥100 rounds | n/100 |
| `perfect_run` | Perfect Run | a tournament with ≥3 rounds, all wins | — |
| `consistent` | Consistent Winner | ≥70% win rate over ≥20 games | games n/20 |
| `deck_master` | Deck Master | ≥10 tournaments with a single leader | max n/10 |
| `set_dominator` | Set Dominator | ≥75% win rate in one set over ≥10 games | — |
| `underdog` | Underdog | win ≥10 rounds going second | n/10 |
| `rainbow` | Rainbow Crusher | beat opponents of all 6 colors | colors n/6 |
| `on_fire` | On Fire | win 3 tournaments in a row (record with more wins than losses), consecutive by date | streak n/3 |
| `well_traveled` | Well Traveled | play in ≥5 different sets | n/5 |

The 6 OPTCG colors: red, green, blue, purple, black, yellow. "Winning tournament" (for `on_fire`) = wins > losses in that tournament.

## 3. Architecture (additive)

```
/achievements page (client)  →  useAchievements() hook  →  apiClient.getAchievements()
      →  GET /api/achievements  →  src/services/achievements.ts (compute from data, (db, ownerId))
      →  Drizzle → Postgres (existing tournaments/rounds/leaders tables)
```

No changes to `src/services/{tournaments,rounds,stats}.ts`, the write path, the schema, or existing endpoints.

## 4. Service — `src/services/achievements.ts`

- **`ACHIEVEMENTS`**: the ordered list of definitions `{ key, name, description, evaluate(ctx) }`.
- **`getAchievements(db, ownerId) => Promise<Achievement[]>`** where `Achievement = { key, name, description, unlocked: boolean, progress: { current: number; target: number } | null }`:
  1. One owner-scoped query fetches each round with its `tournamentId`, the tournament's `setId`, `myLeaderId`, `result`, `playOrder`, and the **opponent leader's `colors`** (join to `leaders` on `opponent_leader_id`).
  2. A second owner-scoped query fetches the user's tournaments (`id`, `setId`, `playedOn`, `createdAt`) for counts + streak ordering.
  3. Compute a `ctx` of derived aggregates in TypeScript: total tournaments, total rounds, overall W/L/D + win rate, per-tournament records, per-leader tournament counts, per-set records, set of colors beaten (colors of won rounds' opponents), count of wins going second, longest consecutive winning-tournament streak (tournaments ordered by `playedOn` then `createdAt`), and count of distinct sets played.
  4. Map each definition's `evaluate(ctx)` to an `Achievement`.
- Helpers: `count(current, target)` → `{ unlocked: current >= target, progress: { current: min(current, target), target } }`; `bool(b)` → `{ unlocked: b, progress: null }`.
- Ownership: both queries filter `tournaments.owner_id = ownerId`; no cross-user data.

## 5. REST API

- **`GET /api/achievements`** (Clerk-scoped, `runtime='nodejs'`, errors via `errorToResponse`) → `{ achievements: Achievement[], unlockedCount: number, total: number }`.

## 6. Client

- **DTOs** (`src/lib/dto.ts`): `AchievementProgressDTO`, `AchievementDTO`, `AchievementsResponseDTO`.
- **`apiClient.getAchievements()`** → `AchievementsResponseDTO`.
- **Hook** `useAchievements()` (`src/components/query-hooks.ts`).
- **Newly-unlocked helper** (`src/lib/newly-unlocked.ts`): `newlyUnlocked(currentUnlockedKeys: string[], seenKeys: string[]) => string[]` (pure; the set difference). Unit-tested. Used with `localStorage` key `crewstat-seen-achievements`.

## 7. UI

- **New route `/achievements`** (`src/app/achievements/page.tsx`) rendering a client `AchievementsView`.
- **Navigation:** an "Achievements" link on the home (tournament list) header, next to the existing "Stats →" link; a "← Home" back link on the page.
- **Grid:** a header showing `unlockedCount / total`, then a responsive grid of cards. Unlocked cards are highlighted with a check/badge; locked cards are muted and show a Tailwind progress bar + `current/target` when the achievement has `progress`. Each card shows name + description.
- **Newly-unlocked toast:** when the achievements data loads on the page, compare the current unlocked keys against `localStorage['crewstat-seen-achievements']` via `newlyUnlocked(...)`; for each new key `toast.success('Achievement unlocked: <name>')`; then write the full current unlocked set back to storage. SSR-safe (only touch `localStorage` in an effect). First-ever load (no stored value) seeds storage silently without toasting the whole set.

## 8. Testing

- **Unit/integration (Vitest, test DB):** `getAchievements` with seeded tournaments/rounds — representative achievements across the categories (count thresholds + progress, `perfect_run`, `consistent` gate, `deck_master`, `set_dominator`, `underdog`, `rainbow` colors, `on_fire` streak, `well_traveled`), plus empty-data (nothing unlocked) and owner-scoping.
- **Unit:** `newlyUnlocked` set-difference helper (new keys, no-new-keys, empty-seen).
- **API route test:** mock Clerk + test DB; assert shape + `unlockedCount`/`total`.
- **UI:** verified by `npm run build`; live behavior optionally covered later.

## 9. Out of Scope (future)

Persisted unlock timestamps + server notifications (the heavier option); share-as-photo (Slice 6); rarity tiers/points; profile pages for other users. The compute-on-read engine here is compatible with adding persistence later without changing the achievement definitions.
