# Stats rework: a page per game type, with charts that are also progress

Date: 2026-08-24

## Problem

Statistics is one flat page — overall, by meta, by opponent, matchups — and it
has no notion of the three things you can log. The service does not segment
either; it hardcodes a different rule per query (`getOverallStats` excludes
casual, `aggregateByMeta` includes sessions but not free play, opponent and
matchup stats include everything). A player cannot ask "how do I do in
tournaments?" separately from "how do I do at locals afterwards?".

Nothing is visual. Every number is text plus a win-rate bar, and there is no
by-colour breakdown at all outside one buried query inside `getMatchupStats`.

## Shape

**Overview** (`/stats`) — a player card, the all-time record, and one row per
game type. **A page per type** (`/stats/tournaments`, `/stats/sessions`,
`/stats/matches`) — the record for that type, then stacked chart cards.

Routes keep `matches` while the label reads "Free Play", the split already made
for the list. Segment keys reuse `Segment` from `components/tournaments/segment.ts`
so the app has one vocabulary for the three kinds.

## Where the numbers come from

**The client, from the cache it already holds.** `TournamentSummaryDTO` carries
`matches[]` precisely so achievements can be computed offline
(`lib/achievements/from-cache.ts`), and the leader catalog supplies colours. Every
breakdown here is derivable from the same two queries.

Rejected: new server endpoints per segment. Stats would go blank at a venue with
no signal, and every tap would be a round trip — against the product's first
principle, which is that logging and reading work offline.

**Two fields must be added** to `MatchSummaryDTO`: `myLeaderId` and
`opponentMetaId`. A session records its deck per round, so without the first its
"my colours" cannot be attributed; the meta resolves as
`coalesce(round.opponentMetaId, tournament.metaId)`, so the second is needed
wherever a round carries its own. The list query already reads these rounds, so
this is a projection change, not a new query.

## The module

`src/lib/stats/` — pure functions, no React, no network.

- `segmentOf(type)` → `'tournaments' | 'sessions' | 'matches'`, from `isSession`
  and `MATCH_TYPE`.
- `statsForSegment(tournaments, leaders, metas, segment)` → `{ record, winRate,
  events, byColourFaced, byMyColour, byMeta, byType }`.
- Every breakdown row: `{ key, label, colors, wins, losses, draws, games, winRate, share }`.

**Byes and no-shows are excluded** from win-rate maths, exactly as the SQL is
(`kind not in ('bye','no_show')`). They are not games.

## Colours

A leader can be several colours. Sakazuki is Blue/Black; the promo Release Event
Luffy is all six. So a game against a Purple/Red deck is one game that belongs
to two answers, and a pie of individual colours would sum far past 100%.

**A slice is a colour combination, not a colour.** Mono-red, Purple/Red and the
six-colour Luffy are three different decks; each game lands in exactly one slice
and the chart partitions honestly.

- **Combination keys are normalised** to the game's colour order — red, green,
  blue, purple, black, yellow — before counting. The catalog stores the same
  pairing both ways (`black/yellow` on four leaders, `yellow/black` on one), and
  unnormalised keys would split one deck across two slices.
- **A slice is painted in its own colours**, reusing the avatar gradient rule: a
  flat fill for mono, a split for two, hard bands for six.
- **Top 8 by games, the rest folded into "Other"**, with every row in the legend
  beneath. Twenty slices is decoration, not a chart.
- **Coverage still counts individual colours.** Beating a Purple/Red deck beats
  purple and red, so "5 / 6 colours beaten" stays meaningful however the slices
  are cut — and stays the progress bar for the Rainbow Crusher achievement.

23 combinations exist across the 140 seeded leaders: six mono, sixteen dual, one
six-colour.

## The chart

One `<Donut>`: inline SVG, no dependency. Only donuts and bars are needed, and a
charting library costs ~100KB on a phone and fights the canvas-rendered share
card.

The legend list is the content; the donut is `aria-hidden` decoration beside it.
A chart nobody can read aloud is not the only copy of the numbers.

## Gamification

Not a separate widget — the charts are the progress.

- **Overview player card**: level and XP bar (`levelFor`, `totalXp`), week streak
  (`weekStreak`), next achievement (`nextPayoff`). All exist already and live on
  Profile; this is where they answer a question.
- **Every chart card carries coverage**: colours faced 5/6, metas played 9/16,
  types played 4/6.
- **Never-faced slices are drawn hollow** and listed as `0-0 —`, so a gap reads
  as something to go and do rather than as missing data.

## Free Play has three cards, not four

`match` is a single type, so "by type" is omitted there rather than drawn as a
donut with one slice.

## Scope

The existing "By opponent" and matchup explorer stay on the overview, unchanged,
still served by `/api/stats`. Folding them into the type pages and retiring that
endpoint is a second slice — worth doing, not worth bundling into this one.

## Testing

- Unit tests on the module: segmentation, bye exclusion, combination
  normalisation (`yellow/black` and `black/yellow` are one slice), top-8 folding,
  coverage counts, empty-data behaviour.
- **A parity test** holding the client module to the server's existing numbers on
  one fixture, for the figures that overlap (overall record, per-meta) — the same
  guard `achievements.parity.test.ts` already applies, and for the same reason.
- Donut geometry: arcs sum to the full circle, a single slice renders a full
  ring, zero games renders empty rather than NaN.
- Browser verification of all four screens with real logged data, light and dark.
