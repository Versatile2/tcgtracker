# Freeplay types, and a glyph for every type

Freeplay is a segment with two labels — Freeplay and Ranked Simulator — and a
player logging a gauntlet, a teaching game and a night on the casual ladder has
one word for all three. This widens the freeplay strip to eight types, moves
Testing out of the tournament segment where it never belonged, and gives every
type in the app an icon so a list reads at a glance.

## The type set

Five new values on the `tournament_type` enum, following the existing
`freeplay_` prefix:

| value | label | what it records |
| --- | --- | --- |
| `freeplay_sim_casual` | Casual Simulator | unranked or open sim lobbies |
| `freeplay_friend` | Friend Battle | an arranged game against someone you know |
| `freeplay_locals` | Locals Pickup | casual games at the shop, around the event |
| `freeplay_gauntlet` | Gauntlet | one deck run through a line-up of meta decks |
| `freeplay_teaching` | Teaching Game | showing a new player the ropes |

`testing` moves segment without changing value: out of `TOURNAMENT_TYPES`, into
`FREEPLAY_TYPES`, label unchanged. It was always testing — the tournament
segment only ever gave it a leader it did not need.

The freeplay strip reads, in fixed order:

> Freeplay · Ranked Simulator · Casual Simulator · Friend Battle · Locals Pickup
> · Gauntlet · Testing · Teaching Game

The tournament strip loses Testing and keeps the rest: Local, Treasure Cup,
Regionals, Extra Grand Battle, Pirates Party, Ranked Simulator.

None of the five new types gets a tournament-side twin. The
`ranked_sim`/`freeplay_sim` pair exists because that one event genuinely reads
both ways depending on where you logged it; a Teaching Game does not.

### What follows for free

`CASUAL_TYPES` is derived from `FREEPLAY_TYPES` (`tournament-kinds.ts:37`), so
every new type is casual the moment it joins the list: outside the win rate, the
tournament count and achievements, inside opponent and matchup statistics. No
statistics code changes.

A stated consequence, not an oversight: **a Teaching Game counts toward your
matchup data** like every other casual type. Excluding it would need a second
axis on top of the segment, which the codebase does not have and this design
does not add. The list filter gives the same read without the machinery.

## Rewriting Testing history

Moving `testing` into the freeplay segment is retroactive. Two migrations
follow from it, both data-only — the enum value itself is unchanged.

A freeplay session records its leader per round and holds none of its own, so
existing Testing tournaments must be reshaped to match before `isFreeplay`
starts returning true for them:

```sql
UPDATE rounds r
   SET my_leader_id = t.my_leader_id
  FROM tournaments t
 WHERE r.tournament_id = t.id
   AND t.type = 'testing'
   AND r.my_leader_id IS NULL
   AND r.round_kind NOT IN ('bye', 'no_show');

UPDATE tournaments SET my_leader_id = NULL WHERE type = 'testing';
```

Byes and no-shows are skipped deliberately: they are not games and carry no
leader in either segment.

Achievements and the win rate are computed live from "everything not in
`CASUAL_TYPES`" (`achievements.ts:31`, `stats.ts:103`), so this shifts the
competitive record: the win rate moves, the tournament count drops, and a
derived achievement can un-earn itself. That is the intended end state — those
games were never competitive — and it is the reason the migration is called out
here rather than buried in a step.

The five `ALTER TYPE … ADD VALUE` statements mirror `0009_thin_warhawk.sql`.
Production migrates before the push, per the standing rule.

### One accepted edge

`createTournamentSchema` rejects a leader on a freeplay type. An outbox entry
created before the deploy holding `{type: 'testing', myLeaderId}` will therefore
fail validation when it drains after it. The outbox normally drains within the
session that filled it, so the window is a live client that goes offline across
the deploy. Accepted rather than mitigated: weakening the validation to tolerate
it would cost more than the case is worth.

## Remembering the last type

`last-tournament-type.ts` becomes `last-type.ts` — two import sites, and the old
name is now a lie. The getter and setter take a segment and read one of two
keys:

- `crewstat-last-tournament-type`
- `crewstat-last-freeplay-type`

Sessions remember sessions, tournaments remember tournaments, and neither leaks
into the other. `orderTypes` is untouched; it already ignores a remembered type
that is not in the offered list, which is exactly what a stored `testing` from
the tournament key now is.

In `tournament-form.tsx` the freeplay special case at lines 94–100 disappears.
Both segments order by their own remembered type and both call the setter on
create. The comment there is rewritten to explain the per-segment key rather
than the retired always-lead-with-Freeplay rule.

## A glyph for every type

One icon per type, used everywhere a type is named, so the tournament list and
the freeplay list read the same way.

| type | icon | | type | icon |
| --- | --- | --- | --- | --- |
| `local` | `Store` | | `freeplay` | `Shuffle` |
| `treasure_cup` | `Trophy` | | `freeplay_sim_casual` | `Gamepad2` |
| `regionals` | `Globe` | | `freeplay_friend` | `Users` |
| `extra_grand_battle` | `Crown` | | `freeplay_locals` | `MapPin` |
| `pirates_party` | `PartyPopper` | | `freeplay_gauntlet` | `Target` |
| `ranked_sim` | `TrendingUp` | | `testing` | `FlaskConical` |
| `freeplay_sim` | `TrendingUp` | | `freeplay_teaching` | `GraduationCap` |
| `match` | `Swords` | | | |

`ranked_sim` and `freeplay_sim` share an icon on purpose: one label, one glyph,
two stored values. Every other icon is distinct — `local` is the shop you
compete in, `freeplay_locals` the place you hang around afterwards.

Three pieces, each with one job:

- **`src/lib/type-glyph.ts`** — `TYPE_ICONS: Record<TournamentType, LucideIcon>`
  and `typeIcon(type)`. A lookup beside `labels.ts`, which is the same kind of
  thing and already proves a `Record` keyed on the enum catches a missing entry
  at compile time.
- **`src/components/tournaments/type-badge.tsx`** — the `<Badge
  variant="secondary">` with icon and label together. Replaces the inline badge
  duplicated in `tournament-card.tsx:60` and `tournament-detail.tsx:114`, and is
  the piece that makes tournaments and sessions look like one app.
- **`src/components/tournaments/type-glyph.tsx`** — replaces
  `freeplay-glyph.tsx`. Same 5:7 card footprint, same muted treatment, but takes
  a required `type` and draws its icon. Four call sites already hold the
  tournament: tournament card, detail, card-actions sheet, share card.

The filter chips stay text-only. The freeplay strip now runs to eight items and
scrolls; an icon on each chip costs horizontal room without saying anything the
label does not.

## The freeplay list filter

The chip row at `tournament-list.tsx:152` opens up to the freeplay segment, fed
`FREEPLAY_TYPES` where the tournament segment is fed `TOURNAMENT_TYPES`. Matches
still get none — a match has one type.

Two details that would otherwise bite:

- **The filter resets to `all` when the segment changes.** The `filter` state is
  shared across segments, so switching from Tournaments-filtered-to-Regionals
  into Freeplay would show an empty list with nothing to explain it.
- The empty state hardcodes the word "tournaments" (`tournament-list.tsx:177`).
  It reads the segment's noun instead: "No Gauntlet sessions yet."

## Tests

- `tournament-kinds.test.ts` — each new type is casual, is in `FREEPLAY_TYPES`,
  and is absent from `TOURNAMENT_TYPES`; `testing` has moved and is no longer
  competitive.
- `last-type.test.ts` — the two keys do not collide: remembering a Regional
  leaves the freeplay strip on its own last type, and a stored `testing` on the
  tournament key is ignored rather than prepended.
- A test that `TYPE_ICONS` covers every enum value, so a future type cannot ship
  without a glyph. The `Record` type already enforces this at compile time; the
  test states the intent for anyone tempted to widen the type.
- Existing round and stats tests cover the migrated shape — a freeplay session
  whose rounds each hold a leader is the shape they already assert.
