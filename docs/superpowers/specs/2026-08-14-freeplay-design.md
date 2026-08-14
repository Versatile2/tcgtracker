# Grand Line TCG — Freeplay: a session where the leader changes per round (Design)

**Date:** 2026-08-14
**Status:** Approved, not yet implemented
**Scope:** A new `freeplay` tournament type whose leader is recorded per round rather than per session, with the stats, validation and UI changes that follow.

## 1. Context

Freeplay is structurally a tournament — rounds, opponents, results, a meta, a record — except that the deck you played can change every round. It is for casual testing: a Thursday evening trying five decks.

This reverses a deliberate V1 decision. The app originally stored the leader per round and the V1-remarks rework moved it to the tournament (`tournaments.my_leader_id NOT NULL`), leaving rounds with only `opponent_leader_id`. Eight places read the tournament's leader. Freeplay reintroduces a per-round leader **alongside** that, rather than reverting the decision.

No stats or achievements filter by tournament type today — the existing `testing` type counts fully toward everything.

## 2. Requirements

1. A freeplay session records a different leader per round.
2. A freeplay session has **no session-level leader at all**.
3. Freeplay counts toward matchup-flavoured statistics but not toward the headline competitive record.

## 3. Decisions

### 3.1 Freeplay is a seventh tournament type

`'freeplay'` joins the `tournament_type` enum, the Type dropdown, the list filter, and `tournamentTypeLabel`. Precedent: `testing` is already a mode rather than a venue.

Rejected: a separate boolean axis ("leader may change per round") applicable to any type — a second dimension to design, display and filter by, for a case with no demand. Also rejected: a separate entity with its own table and screens, which would duplicate rounds, stats, export and the entire detail UI.

### 3.2 The leader lives on the round; the session has none

- `tournaments.my_leader_id` drops `NOT NULL`.
- `rounds` gains `my_leader_id`, nullable, referencing `leaders`.

A freeplay session stores **no leader**. It is not a default, not a starting deck, not a fallback — the column is null for the session and every round carries its own.

**The invariant, enforced as an exclusive-or:**

| Tournament type | `tournaments.my_leader_id` | `rounds.my_leader_id` (swiss / top_cut) |
|---|---|---|
| Non-freeplay | **required** | **must be null** |
| Freeplay | **must be null** | **required** |

This guarantees exactly one leader source per real round — never zero, never two — so no display needs a "no leader" fallback.

**Byes and no-shows are exempt**: a freeplay bye may have a null leader. They are not games, and they are already excluded from every statistic freeplay feeds — the opponent joins drop rounds with a null `opponent_leader_id`, and the turn-order query filters on non-null `play_order` (byes are written with `playOrder: null`). The first round of a session being a bye would otherwise have no previous round to inherit a leader from.

**Reading a round's leader** is `coalesce(rounds.my_leader_id, tournaments.my_leader_id)`. This is *not* a fallback to a session leader for freeplay — for a freeplay round the second operand is always null. It exists so one expression serves both modes, letting queries find the leader without branching on tournament type.

**Type changes into or out of freeplay are disallowed.** The invariant cannot be satisfied across that switch without inventing or discarding leaders. `updateTournamentSchema` currently permits any type change and gains this restriction; switching freely among the classic types stays allowed.

One incremental migration covers all three schema changes — all additive or loosening, no data rewrite. `0001_brave_starhawk` already proved incremental migrations apply cleanly to the prod Neon DB (apply the DB migration **before** deploying code, as with that one).

### 3.3 Statistics: in for matchups, out of the headline record

| Surface | Freeplay | Change needed |
|---|---|---|
| **Matchups** (`getMatchupStats`) | included | leader filter → coalesced, in **both** its queries |
| **By opponent** (`getOpponentStats`) | included | **none** — keyed by opponent leader, never mine |
| **By meta** (`getPerMetaStats`) | included | none of its own (see below) |
| Leader selector (`getPlayedLeaders`) | included | join → coalesced |
| **Overall** (`getOverallStats`) | excluded | `type != 'freeplay'` filter |
| **Achievements** | excluded | `type != 'freeplay'` filter |
| CSV export | included | `my_leader` join → coalesced |

`getPlayedLeaders` matters more than it looks: it populates the matchup leader selector, so a deck played only in freeplay must appear there or its matchups are unreachable.

**`aggregateByMeta` has to split.** It currently feeds both "By meta" and Overall's win/loss totals and best-meta. Those now need different row sets, so it takes an `includeFreeplay` flag and is called twice — Overall can no longer sum whatever "By meta" produced.

`getOverallStats`'s `totalTournaments` and `mostPlayedLeader` need only the type filter, not the coalesce: with freeplay excluded, every remaining tournament has its own leader.

**Empty-state consequence.** The Stats page gates its whole body on `overall.totalTournaments > 0`. With freeplay excluded from Overall, someone who has only logged freeplay would see "No stats yet — log a tournament to get started" while holding a full matchup history. The gate changes to "any data at all", and the Overall section renders its own empty state when there are no non-freeplay tournaments.

### 3.4 UI

**New tournament form.** Selecting Freeplay hides the leader carousel entirely. The submit guard is currently `disabled={!myLeaderId}`, which would block a freeplay session forever — it becomes type-aware. Meta selection and the newest-meta default are unchanged.

**Round sheet — a "Playing as" header, freeplay only.** A sticky row above the form showing the round's leader with a "Switch" button, rather than a second field beside the opponent's.

- A new round **inherits the previous round's leader**, so a run of games on one deck costs no extra taps.
- The **first** round of a session has no previous round: it opens in a pick state and Save stays disabled until a leader is chosen.
- Editing shows that round's recorded leader.
- "Switch" opens the same collapsing carousel built in the add-round rework.

Known tension, accepted: the header reads as session-level state ("who I'm playing as") while the value is stored per round. Switching affects the round being added and every later round that inherits from it — it does **not** rewrite earlier rounds. This was chosen over a symmetrical two-card layout because it matches how freeplay actually goes (several games on one deck, then a switch) and costs the least sheet height.

**Tournament card / list.** A freeplay session shows a generic freeplay glyph where the leader avatar sits, with the deck count in the subtitle ("14 Aug · OP16 · 5 decks"). `listTournaments` already loads every round to build the match summary, so the distinct-leader count comes free. The count is **omitted entirely when it is zero** — a session created but not yet logged reads "14 Aug · OP16", not "0 decks". Singular at one ("1 deck").

Rejected: overlapping avatars of the decks played (more informative, but a heavier card treatment), and the most-played deck with a count (keeps the list uniform but implies the session was one deck).

**Tournament detail.** The header avatar becomes the glyph and the session-leader combobox is hidden — there is no session leader to edit. Round rows need no new prop: `RoundItem` already takes a `myLeader`, so the page passes each round's own leader instead of the tournament's.

**Share card.** The header takes the glyph treatment. Match rows additionally show **your** leader for freeplay, so a shared card reveals which deck won which game — without it, a freeplay card would report "7–3" and name five opponents while never showing what you played.

### 3.5 DTO changes

- `TournamentType` gains `'freeplay'`.
- `RoundDTO` gains `myLeaderId: string | null`.
- `TournamentSummaryDTO` / `TournamentDetailDTO`: `myLeaderId` becomes `string | null`; the summary gains `deckCount: number` (distinct non-null round leaders; `0` for classic types, where it is unused).

### 3.6 Where the invariant is enforced

`createTournamentSchema` makes `myLeaderId` optional and adds a `superRefine`: required when `type !== 'freeplay'`, forbidden when it is, with the issue attached to the `myLeaderId` path.

The round schema **cannot** enforce its half — a round payload does not know its tournament's type. `createRoundSchema` therefore declares `myLeaderId` as nullable-optional, and `addRound` / `updateRound` enforce the rule against the tournament they already load. That is the correct seam: the service is the only layer holding both the round and its tournament.

## 4. Changes by file

**Schema / migration**

| File | Change |
|---|---|
| `src/db/schema.ts` | `'freeplay'` enum value; `my_leader_id` nullable on `tournaments`; new nullable `my_leader_id` on `rounds` |
| `drizzle/` | One generated incremental migration |

**Server**

| File | Change |
|---|---|
| `src/services/stats.ts` | Coalesced leader in `getPlayedLeaders` and both `getMatchupStats` queries; `type != 'freeplay'` in `getOverallStats`; `aggregateByMeta` gains `includeFreeplay` |
| `src/services/achievements.ts` | `type != 'freeplay'` filter |
| `src/services/export.ts` | `my_leader` join → coalesced |
| `src/services/tournaments.ts` | Reject type changes into/out of freeplay; `deckCount` in `listTournaments` |
| `src/services/rounds.ts` | Enforce the round half of the invariant in `addRound` / `updateRound` |
| `src/lib/validation/tournament.ts` | `myLeaderId` optional + `superRefine`; type-change restriction |
| `src/lib/validation/round.ts` | `myLeaderId` nullable-optional |
| `src/lib/round-values.ts` | Carry `myLeaderId` through |
| `src/lib/dto.ts` | §3.5 |

**Client**

| File | Change |
|---|---|
| `src/lib/labels.ts` | `'Freeplay'` label |
| `src/components/tournaments/new-tournament-form.tsx` | Type-aware leader field and submit guard |
| `src/components/tournaments/round-form-sheet.tsx` | "Playing as" header, inheritance, first-round pick state |
| `src/components/tournaments/tournament-card.tsx` | Glyph + deck count |
| `src/components/tournaments/tournament-detail.tsx` | Glyph header; hide leader editor; per-round leader to `RoundItem` |
| `src/components/tournaments/tournament-list.tsx` | `'freeplay'` in the filter list |
| `src/components/share/tournament-share-card.tsx` | Glyph header; per-row leader for freeplay |
| `src/components/stats/stats-view.tsx` | Gate on any data; Overall empty state |

## 5. Testing

Service-layer logic is integration-tested against the real Postgres test DB, as with every prior slice. The repo has **no component-test infrastructure** (`vitest.config.ts` is `environment: 'node'`, collects `.ts` only; `@testing-library/react` and `jsdom` are installed but unused; the `e2e` script has no Playwright config) — do not stand it up. UI work is verified by lint, `tsc --noEmit`, a green suite, and the manual pass below.

| Test | Asserts |
|---|---|
| Invariant — tournament | Creating a non-freeplay tournament without a leader is rejected; creating a freeplay tournament *with* one is rejected |
| Invariant — round | A freeplay swiss round without `myLeaderId` is rejected; a non-freeplay round *with* one is rejected; a freeplay **bye** without one is accepted |
| Type change | Classic → freeplay and freeplay → classic are both rejected; classic → classic still succeeds |
| `getMatchupStats` | A freeplay round is attributed to the round's leader, not to the session; a classic round still resolves via its tournament |
| `getPlayedLeaders` | A deck played only in freeplay appears in the selector |
| `getOverallStats` | Freeplay rounds change none of wins/losses/draws/winRate; `totalTournaments` excludes freeplay sessions |
| `getPerMetaStats` | Freeplay rounds **are** counted |
| `getOpponentStats` | Freeplay rounds are counted (regression guard — this query needs no change, so the test pins that) |
| `getAchievements` | Freeplay rounds do not advance any achievement |
| CSV export | A freeplay row carries the round's leader in `my_leader` |
| `listTournaments` | `deckCount` is the distinct round-leader count for freeplay, `0` for classic |

Manual pass: create a freeplay session (no leader asked for); add a round and pick a deck; add a second round and confirm it inherited that deck; Switch to another deck and confirm the earlier round is unchanged; check the card shows the glyph and "2 decks"; check Stats shows the freeplay decks under Matchups but leaves Overall's totals unchanged; share the session and confirm each row names your deck.

## 6. Out of scope

The existing `testing` type is untouched. `listTournaments` currently does `db.select().from(rounds)` with **no owner filter**, pulling the whole rounds table on every list — no data leaks (rows are keyed by the owner's tournament ids) but it is a full table scan that will degrade. Pre-existing; deliberately not fixed here.
