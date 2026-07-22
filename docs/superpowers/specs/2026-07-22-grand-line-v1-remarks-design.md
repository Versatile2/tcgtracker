# Grand Line TCG — V1 Feedback Rework (Design)

**Date:** 2026-07-22
**Status:** Approved for planning
**Context:** Three remarks after testing the live V1 of the OPTCG tracker (formerly "Crew Stat").

## Problem

The V1 shipped, but three things don't match how real OPTCG tournaments work / how the
product should be positioned:

1. **Leader is per-round.** The app currently lets you pick "My leader" on every round
   (`rounds.myLeaderId`), so you can play a different leader each game. In a real
   tournament you register one deck and play the same leader all day — the leader belongs
   to the *tournament*, not the round.
2. **We ask for a "Set" instead of a "Meta".** Choosing a booster set is the wrong mental
   model. What matters is the **meta** the tournament was played in (OP16, OP15, …), which
   situates the event in time and tells you which cards were legal at that moment.
3. **The product name is wrong.** It should be renamed to **Grand Line TCG** with the
   tagline **Track your OPTCG Games**.

## Decisions (locked)

- **Meta selector:** seeded list **+ custom add** (reuse the existing reference-combobox
  mechanism used for sets today).
- **Required fields:** **Leader is required** at tournament creation; **Meta is optional**.
- **Existing data:** **clean start** — no data migration. The schema change may
  drop/recreate existing tournaments and rounds.
- **Internal naming:** rename `set → meta` throughout the codebase (not just the UI label),
  because a clean start makes it cheap and mixing "set" internally with "meta" in the UI
  invites bugs.
- **Meta display:** metas are shown **by code** (`OP16`), keeping the real set name only
  where already known (OP01–OP08).

## Design

### 1. Product rename

- **Name:** `Crew Stat` → `Grand Line TCG`
- **Tagline:** `Track your OPTCG Games`
- Touch points:
  - `src/app/layout.tsx` — page `<title>` / metadata.
  - `src/app/manifest.ts` — PWA `name` / `short_name` / description.
  - `src/components/tournaments/tournament-list.tsx` — app header.
  - `src/components/share/watermark.tsx` and `src/components/share/stats-share-card.tsx`
    — share-card branding.
- No behavioral change; string/branding updates only. The GitHub repo and Vercel project
  keep their existing names (`tcgtracker`) — this is a product-name change, not an infra rename.

### 2. Leader moves to the tournament

**Schema (`src/db/schema.ts`):**

- Remove `myLeaderId` from `rounds`.
- Add `myLeaderId uuid NOT NULL REFERENCES leaders(id)` to `tournaments`.
- `rounds` now holds: `opponentLeaderId`, `result`, `playOrder`, `notes`, `roundNumber`.

**Validation:**

- `src/lib/validation/round.ts` — remove `myLeaderId` from `createRoundSchema` and
  `updateRoundSchema`.
- `src/lib/validation/tournament.ts` — add `myLeaderId: z.string().uuid()` **required** to
  `createTournamentSchema`; add `myLeaderId: z.string().uuid().optional()` to
  `updateTournamentSchema` (editable while draft).

**DTOs (`src/lib/dto.ts`):**

- `RoundDTO` — drop `myLeaderId`.
- `TournamentSummaryDTO` / `TournamentDetailDTO` — add `myLeaderId: string`.

**UI:**

- `new-tournament-form.tsx` — add a **Leader** `ReferenceCombobox` (required); the
  "Create & Start Logging" button stays disabled until a leader is chosen.
- `round-form-sheet.tsx` — remove the "My leader" field. First field becomes
  "Opponent deck".
- `tournament-detail.tsx` — show the tournament's leader in the header; allow changing it
  while the tournament is `draft` (via the update endpoint).
- `round-item.tsx` — remove any display of the round's own leader.

**Services:**

- `src/services/tournaments.ts` — accept/persist `myLeaderId` on create and update; include
  it in returned DTOs.
- `src/services/rounds.ts` — stop reading/writing `myLeaderId`.

### 3. "Meta" replaces "Set" (internal rename included)

- **Table:** `sets` → `metas` (same columns: `id, name, code, releasedAt, isCustom, ownerId,
  createdAt`).
- **Column:** `tournaments.setId` → `tournaments.metaId` (nullable, optional).
- **Seed:** `SEED_SETS` → `SEED_METAS` in `src/db/seed-data.ts`. Seed `OP01 … OP16`. Keep the
  known names for OP01–OP08; OP09–OP16 are seeded with code as the display name (no invented
  set names). Custom entries cover anything else.
- **Reference service/API:** `src/services/reference.ts`, `query-hooks.ts`, `api-client.ts` —
  rename `sets`/`useSets`/`useAddCustomSet` → `metas`/`useMetas`/`useAddCustomMeta`. Route
  path `/api/…/sets` → `/api/…/metas` (or the existing reference route's equivalent).
- **DTO:** `SetDTO` → `MetaDTO`; `TournamentSummaryDTO.setId` → `metaId`.
- **Form label:** `new-tournament-form.tsx` "Set" → "Meta", placeholder "Choose a meta"
  (optional field).

### 4. Stats impact (consequence of §2 and §3)

Because `myLeaderId` moves off `rounds`, every stats query that filtered or grouped by
`rounds.myLeaderId` must join through `tournaments.myLeaderId`:

- `getPlayedLeaders` — join `leaders` on `tournaments.myLeaderId` instead of
  `rounds.myLeaderId`.
- `getOverallStats` → `mostPlayedLeader` — group by `tournaments.myLeaderId`.
- `getMatchupStats` — all three sub-queries (opponents, turn order, color breakdown) filter
  `tournaments.myLeaderId = :leaderId` instead of `rounds.myLeaderId`.

Set → meta renames in stats:

- `aggregateBySet` → `aggregateByMeta`, grouping by `tournaments.metaId` (+ `metas` join).
- `getPerSetStats` → `getPerMetaStats`; `PerSetStat` → `PerMetaStat`.
- `OverallStats.bestSet` → `bestMeta`; DTO `PerSetStatDTO` → `PerMetaStatDTO`,
  `OverallStatsDTO.bestSet` → `bestMeta`, `StatsDTO.perSet` → `perMeta`.
- `src/components/stats/per-set-stats.tsx` → `per-meta-stats.tsx`, labels "Per set" →
  "Per meta", "Best set" → "Best meta", "No set" → "No meta".

Achievements (`src/services/achievements.ts`) that read `rounds.myLeaderId` or `setId` are
updated the same way.

### 5. Tests & data

- **Clean schema change** — regenerate the Drizzle migration; existing tournaments/rounds are
  dropped and recreated. No data-preservation migration.
- Update every test that sets `myLeaderId` on a round to instead set it on the tournament:
  `services/rounds.test.ts`, `stats.test.ts`, `stats.matchups.test.ts`,
  `achievements.test.ts`, `tournaments.test.ts`, `seed.test.ts`, `reference.test.ts`, and the
  route tests under `src/app/api/**` (`rounds`, `stats`, `achievements`).
- Update `validation.test.ts` for the moved `myLeaderId`.

## Non-goals

- No data migration of V1 tournaments.
- No rename of the GitHub repo or Vercel project.
- No change to leader seed data, achievements definitions, themes, sharing, or offline/PWA
  behavior beyond the branding strings and the `myLeaderId`/`meta` renames above.

## Success criteria

- Creating a tournament requires picking a leader and optionally a meta; rounds no longer ask
  for "my leader".
- The leader cannot vary within a tournament.
- Stats (overall, per-meta, matchups, achievements) compute correctly from the
  tournament-level leader and meta.
- The product reads as "Grand Line TCG — Track your OPTCG Games" in the title bar, PWA
  install, header, and share cards.
- `npm test` passes.
