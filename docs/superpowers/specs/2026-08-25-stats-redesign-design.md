# Stats redesign: answer first, and stats that know about time

Date: 2026-08-25

## Problem

The stats surface reports without answering. A type page is six sections of
equal weight and roughly 4,500px of scroll, and nothing on it says *your worst
matchup is Kaido at 1-4*. A reader standing up between rounds with four minutes
has to assemble that themselves from four cards.

Some charts are not charts. Measured across the four routes, **five donuts
render as a single unbroken ring** — two on sessions, three on free play. A
donut needs parts to divide; below three it is decoration occupying a card of
vertical space. Note where this does *not* apply: on `/stats/tournaments` the
slice counts are 7, 3, 5 and 3, so the rule changes nothing there. It earns its
place on the thinner segments, which is also where a new player starts.

And **nothing knows when**. There is no recent form, no streak, no trend, no
sense of a month. A tracker whose stated purpose is improvement cannot currently
tell a player whether they are improving.

A detector pass over `src/components/stats` returns clean — 0 findings, exit 0.
That is not evidence of a clean surface: the pass never resolves Tailwind to
computed values, so nothing measured below is in its rule space. Everything here
came from looking and measuring.

The page is **2,502 CSS px — 2.96 viewport-heights** at 390×844.

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
- **`verdictOf` takes the same threshold.** It currently maps a win rate straight
  to a badge with no minimum sample, so one win renders `favored` in confident
  green on a page where most rows read `1 game`. Below `THIN` a matchup has no
  verdict — it reads *"too early to call"* — and the thresholds (0.55 / 0.45)
  are stated on the surface rather than left invisible. This is the product's
  stated first edge; a verdict it has to retract costs more than a missing one.
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

- `formStrip(tournaments, scope, n)` — the last n results, most recent first.
- `streaks(tournaments, scope)` — current and longest run of wins.
- `trendByMonth(tournaments, scope)` — one row per calendar month that has at
  least one game, most recent last. Months with no games are omitted rather than
  drawn as zero: a gap in play is not a month of losses. The card renders only
  when two or more months are present.

`scope` is a `Segment` **or `'all'`**, because the overview shows form across
every kind of game while a type page shows only its own. Without the `'all'`
case the overview would have to call the function three times and merge, which
would order the merged list wrongly. The UI passes `n = 10` everywhere; the
parameter exists so the tests can use a smaller window.
- `headline(stats)` — best and worst matchup and the turn-order split, filtered
  to rows at or above `THIN`, or null when none qualify.

**Build 2**

- `placementStats(tournaments)` — best finish, top-cut conversion, median finish
  as a percentile of field, podium count, average field size.

  Defined precisely, because each of these can be read two ways: **best finish**
  is the lowest placement number, shown with its field; **top-cut conversion** is
  events where a `top_cut` round was played, over events with any round at all;
  **median finish** is the median of `placement / fieldSize`, over only the
  events carrying both — placement is optional, and averaging over events that
  never recorded one would silently flatter the number; **podiums** are
  placements 1–3; **average field size** covers events recording one.
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

## Defects the critique found, fixed as part of this work

These are not future work. They are in the code this redesign touches, and
shipping the redesign over them would preserve them.

1. **The legend is not a key for its donut**, for three independent reasons.
   The gradient is defined in *object bounding box* space (`donut.tsx`), so a
   multi-colour slice takes its colour from where it sits on the ring — "All
   six" renders as a plain grey arc, indistinguishable from Red/Black next to
   it. The donut maps `sliced` while the legend maps `rows` (`chart-card.tsx:38`
   vs `:63`), so a folded `Other (n)` slice has no legend entry at all. And the
   ramp indices disagree — `rampCount={rows.length}` against
   `rampColorVar(i, arcs.length)` — so every meta and type swatch is a different
   tint from its slice whenever the two arrays differ in length.
2. **Dark mode fails WCAG AA.** The back link and active tab label measure
   **3.16:1** against 4.5:1 required at 15px. The cause is structural:
   `globals.css:222-227` defines all six accent presets as single fixed hex
   values with no dark variant, so every accent fails, not only indigo. Each
   preset gains a dark step.
3. **Reduced motion is half honoured.** Seven of nine live transitions are
   unguarded Tailwind utilities; nothing under `components/stats/` imports the
   `useReducedMotion` hook that already exists. New motion is gated, and the
   existing transitions are brought under the same guard — otherwise this
   redesign adds motion on top of motion that ignores the preference.
4. **Two tap targets under 44px** — the "Next: …" achievement link at 324×20 and
   the leader select trigger at 202×32.
5. **Leader names truncate to uselessness** — 379px of string in an 87px box,
   77% cut, seven times on one page. The set code is `shrink-0` while the name
   is not, so the identifying half is the half that goes. Names wrap to two
   lines or the code yields first.
6. **The overall record is computed and never shown to the player.**
   `useStats().data.overall` is fetched on the overview and used *only* to render
   the share image. The overview shows three rows to sum by hand under a hero
   reading "Level 3". The overview gains the aggregate record — and it comes from
   the same client module as everything else, since the server value also
   disagrees with the screen after an offline round.
7. **`1 GAMES`** — an unpluralised hardcoded caption, in a file that pluralises
   correctly in three other places.
8. **Share exists only on the overview**, and shares every game type mixed
   together. A player looking at a clean `12-7-1 · 60%` on the tournaments page
   cannot share what is on screen. Each type page gets a share affordance.

## Testing

- Per function: ordering and ties, streak edges (all wins, all losses, a draw
  interrupting), month bucketing across a year boundary, empty history.
- The thin-data rule: a `1-0` row renders dimmed, and `headline` refuses to
  select it; with nothing above the threshold, `headline` returns null and the
  card renders its own copy.
- The chart rule: two slices render rows, three render a donut, and a slice
  under 5% does not qualify a card for a donut on its own.
- Motion: with `prefers-reduced-motion`, no animation classes are applied, and
  the count of live transition declarations does not rise between the default
  and reduced states.
- Contrast: every accent preset clears 4.5:1 for body text in both themes,
  asserted against computed values rather than by eye.
- The legend/slice correspondence: a folded `Other` row appears in both the ring
  and the legend, and the swatch colour equals the slice colour for every row.
- Browser verification of the overview and all three type pages, in both themes
  and with reduced motion on, against a fixture with several months of history.
