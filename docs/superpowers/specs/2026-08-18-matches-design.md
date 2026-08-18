# Matches: a single game with no tournament

Date: 2026-08-18

## Problem

A player wants to log one game — at locals, testing, a pickup match — without
inventing a tournament to hold it.

## What already exists

Freeplay is close. It is a session with no fixed leader where each round records
its own deck, and it is already excluded from the competitive record:
`stats.ts:51,95,111` and `achievements.ts:121,126` all filter
`type <> 'freeplay'`, while opponent and matchup stats include it.

So the semantics a match needs are already implemented. What it does not have is
a place of its own, or a one-game shape.

## Decisions

Matches are **listed separately** from tournaments, and count toward **opponent
and matchup statistics only** — the same treatment freeplay gets. They do **not**
replace freeplay.

That last point leaves three overlapping concepts. A match is structurally a
freeplay session holding one round with identical stats treatment; only its
placement differs. Recorded here deliberately: if freeplay goes unused once
matches exist, folding them together would simplify the model.

## Model

A match is a `tournaments` row of `type = 'match'` holding **exactly one round**.
A new value on the existing enum, not a new table.

This inherits what is expensive to rebuild: the leader invariant, the offline
outbox, client-generated idempotent ids, CSV export, and every stats query. A
match carries `myLeaderId` on the row like a classic tournament — not per-round
like freeplay — so `assertLeaderInvariant` covers it unchanged, and its single
round carries only `opponentLeaderId`.

**Rejected: making `rounds.tournamentId` nullable** so a round could stand alone.
Every stats query reaches ownership through `innerJoin(tournaments)`, so a null
tournament breaks ownership derivation in `stats.ts`, `achievements.ts` and
`export.ts` at once — a large blast radius for a presentational distinction.

**One round means one.** `addRound` rejects a second round on a match, and
`updateTournament` refuses to switch a session into or out of `'match'` — the
same shape as the existing freeplay guard, and for the same reason: a five-round
tournament cannot become a single match without silently losing rounds.

**No meta field.** Matches do not feed the per-meta breakdown, so a meta on one
would be write-only. Verified safe: the per-leader×meta query inner-joins on the
meta (`stats.ts:172`), so a match without one contributes to its opponent's win
rate and is simply absent from that opponent's meta sub-breakdown.

## Statistics

Matches are excluded everywhere freeplay is, plus one place freeplay is not:

| Surface | Freeplay | Match |
|---|---|---|
| Overall record, tournament count | excluded | excluded |
| Per-meta breakdown | **included** | **excluded** |
| Achievements | excluded | excluded |
| Opponent & matchup stats | included | included |

`aggregateByMeta` takes an `includeFreeplay` option because the per-meta
breakdown wants freeplay and `bestMeta` does not. Matches must be excluded in
**both** modes, so the exclusion is unconditional there rather than folded into
that option.

The excluded set is a shared `CASUAL_TYPES` constant used with drizzle's
`notInArray`, so the four call sites cannot drift apart the way four hand-written
`<> 'freeplay'` fragments would.

Opponent and matchup queries carry no type filter at all today, so matches count
there with no change.

## Interface

**The home list gains a segmented control**, `Tournaments | Matches`, filtering
on type. No API change — `listTournaments` already returns everything.

- On Tournaments: the existing type chips and cards, unchanged.
- On Matches: no type chips (they filter tournament types, which a match has
  none of), and cards reading "vs <leader>" with a result and date.
- The empty state names the current segment instead of always saying
  "tournament".

**Two ways to add, deliberately.**

- The bottom-nav `+` opens a chooser sheet with New Tournament and New Match. It
  behaves identically from anywhere — from Stats or Achievements there is no
  segment to follow, which is why it does not simply track the list. It stops
  being a `Link` to `/tournaments/new` and becomes a button; its `aria-label`
  changes from "Add tournament" to "Log a game".
- Each segment carries its own full-width add button under the control, naming
  one thing: "New Tournament" or "New Match". No chooser step, because the
  section already states the intent.

**One screen to log one game**: your deck, their deck, result, play order, die
roll, date, notes. Creating writes a `tournament.create` and a `round.create`
through the outbox, both of which exist — so a match is loggable offline, like
everything else on the logging path. Tapping a match reopens the same form.

## Error handling

- A second round on a match: `ConflictError` (409), nothing written.
- Switching a session into or out of `'match'`: `ValidationError` (400).
- A match with no leader: rejected by the existing non-freeplay rule.
- Offline: the tournament id is generated client-side, so the round attaches to
  it before either has reached the server; the outbox delivers both in order.

## Testing

- A match rejects a second round; the first is accepted.
- A match requires a leader; its round must not carry one.
- A session cannot be switched into or out of `'match'`.
- Matches are absent from the overall record, tournament count, per-meta
  breakdown and achievements, and present in opponent and matchup stats.
- `tournamentTypeLabel('match')`.
- Browser: the segmented control filters, each segment's add button opens the
  right form, the `+` chooser offers both, and a logged match appears under
  Matches and not under Tournaments.

## Migration

Adding an enum value is a schema change, so it runs against production **before**
the deploy — the rule established by the freeplay work and followed for
`leader_art`.
