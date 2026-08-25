# Stats redesign: answer first, and stats that know about time

Date: 2026-08-25

## Problem

The stats surface reports without answering. A type page is six sections of
equal weight and roughly 4,500px of scroll, and nothing on it says *your worst
matchup is Kaido at 1-4*. A reader standing up between rounds with four minutes
has to assemble that themselves from four cards.

Two charts are not charts. "By type" renders a full ring labelled `1`, and "By
meta" often has two slices. A donut needs parts to divide; below three it is
decoration occupying a card of vertical space.

And **nothing knows when**. There is no recent form, no streak, no trend, no
sense of a month. A tracker whose stated purpose is improvement cannot currently
tell a player whether they are improving.

A detector pass over `src/components/stats` returns clean, so none of this is
mechanical. It is arrangement and absence.

## What the research changes

The established OPTCG statistics sites — Straw Hat Stats, OPTCG.ONE, One Piece
Trends, the OP16 win matrix — all do the same thing: aggregate hundreds of
thousands of games into Bayesian-adjusted win rates, tier lists and meta share.
Straw Hat Stats requires **100+ matches** before a leader appears at all.

None of that transfers. Production holds 24 events; most splits here are under
ten games, where a win rate is noise wearing a percentage sign. Copying
meta-site metrics would make this app confidently wrong.

The opening is the inverse. Those sites can never say anything about *this*
player — their trajectory, their turn-order habit, their conversion, their form.
Every one of those is meaningful at small n, and every one is missing today.

## Scope

Four new stat families and a redesign is more than one build should carry, and
building the layout before the stats exist would mean designing it twice. So the
information architecture below is designed once, for the complete set, and built
in two slices.

**Build 1** — the redesign, and the stats that reshape the page: hierarchy,
headline, charts that earn their place, form and time, motion, empty states.

**Build 2** — depth that slots into the same architecture: placement and
conversion, round-by-round, Swiss versus top cut.

## Information architecture

A type page, top to bottom. The first screen is the answer; the rest is the
evidence for it.

1. **Header** — type, record, win rate.
2. **Form strip** — the last ten games as pips, and the current streak.
3. **Headline card** — the finding, stated. Worst matchup leads, because it is
   the actionable one; best matchup and the turn-order split sit beneath it.
4. **Trend** — win rate by month. Hidden below two months of history, where a
   line between two points is a line, not a trend.
5. **Breakdowns** — colours faced, then metas, types and opponents.
6. **Matchup explorer** — unchanged in function.
7. *(Build 2)* **Events** — placement and conversion. **Rounds** — by round
   number, and Swiss versus top cut.

The overview takes the same shape one altitude up: player card, a form strip
across all three types, then the three rows, each carrying its own sparkline.

## A chart must earn its place

A donut renders only when it has **three or more slices, each holding at least
5%**. Otherwise the same data renders as a ranked bar list.

This is a rule rather than a judgement per card, so it holds as the data
changes: a player with one tournament type sees rows, and the same card becomes
a donut once they have played three. Colours faced keeps its donut in practice —
23 combinations exist across the catalog, and it is the breakdown that genuinely
partitions.

## Thin data is marked, never promoted

`THIN = 5` games.

- Every percentage is shown with its `n`.
- A row under the threshold is dimmed and reads *"too early to call"*. It is
  still shown: it is a real game the player logged, and hiding it would make the
  page disagree with their own history.
- **The headline selector only considers rows at or above the threshold.** This
  is the part that matters. Without it `1-0 · 100%` becomes "your best matchup",
  which is worse than showing nothing.
- When no row clears the threshold, the headline says so plainly rather than
  inventing a finding.

## Made of this game

The distinctive treatment is specific to this product rather than decorative:

- The **headline card carries the opponent leader's clean art** as a low-contrast
  backdrop. That art only arrived on 2026-08-24; no generic tracker has it. It
  falls back to the leader's colour field when a clean scan is missing, the same
  rule `getLeaderImage` already applies.
- **Form pips** use the validated chart palette's win/loss steps, not raw green
  and red — the same colours the rest of the surface was validated against.
- **Motion**: donut arcs sweep in on mount, form pips stagger, the headline
  number counts up. All gated on the existing `useReducedMotion`, which is live
  rather than read once, and reuses `components/celebrate/count-up.tsx`.

## What gets computed

Everything stays in the pure client module, from the cache, as the rest of the
surface already is.

**Build 1**

- `formStrip(tournaments, segment, n)` — the last n results, most recent first.
- `streaks(tournaments, segment)` — current and longest run of wins.
- `trendByMonth(tournaments, segment)` — one row per month with a record.
- `headline(stats)` — best and worst matchup and the turn-order split, filtered
  to rows at or above `THIN`, or null when none qualify.

**Build 2**

- `placementStats(tournaments)` — best finish, top-cut conversion, median finish
  as a percentile of field, podium count, average field size.
- `byRound(tournaments, segment)` — record by round number, and Swiss versus top
  cut. Needs `roundNumber` added to `MatchSummaryDTO`, the same cheap widening
  already done twice for `myLeaderId` and `opponentMetaId`.

### One honest limitation

`playedOn` lives on the **tournament**, not the round. So "the last ten games"
orders by event date and then by round order within the event, and every round
of one tournament shares a day. That is accurate enough for form and for
monthly trend, and it is recorded here rather than implied away: the app does
not know what time of day a round was played, and this design does not pretend
it does.

A draw breaks a win streak without starting a losing one; byes and no-shows are
not games and appear nowhere in form, streaks or trend, exactly as they are
already excluded from every win rate.

## Testing

- Per function: ordering and ties, streak edges (all wins, all losses, a draw
  interrupting), month bucketing across a year boundary, empty history.
- The thin-data rule: a `1-0` row renders dimmed, and `headline` refuses to
  select it; with nothing above the threshold, `headline` returns null and the
  card renders its own copy.
- The chart rule: two slices render rows, three render a donut, and a slice
  under 5% does not qualify a card for a donut on its own.
- Motion: with `prefers-reduced-motion`, no animation classes are applied.
- Browser verification of the overview and all three type pages, in both themes
  and with reduced motion on, against a fixture with several months of history.
