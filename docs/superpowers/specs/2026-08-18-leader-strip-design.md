# One horizontal strip for the leader selector

Date: 2026-08-18

## Problem

The leader selector was unpleasant to use at the thing it exists for: logging a
round on a phone. Its shape was a two-tier suggest/browse split — three suggested
cards over a "Browse all 132 leaders" button, and behind that a colour-banded
grid in a `max-h-[26rem]` scroll box.

Measured against the code as it stood:

- **Scroll inside scroll.** The banded grid was a 26rem box inside a `max-h-[90vh]`
  bottom sheet. A drag has to pick a layer, and on a phone it often picks wrong.
- **~44 rows to reach the end.** 132 cards at 3 across. Colour bands organised
  that but could not shorten it: reaching Yellow meant scrolling past five other
  colours, because a band is not a filter.
- **Colour was the wrong axis.** A player looking for a card knows its set, not
  the band it was filed under.
- **Three suggestions, then a cliff.** `SUGGEST_LIMIT = 3`, and everything past
  it was behind a tap and a scroll.
- **A freeplay round renders two of these pickers**, so every cost above is paid
  twice per round.

## Design

**One horizontal strip, no tiers.** The search field, then a single row of cards
that scrolls sideways. Nothing behind a gate.

**Order: what you last picked, then set code.** Recency heads the strip because
that is where nearly every pick lands — at an event you are on one deck all day
and facing the same few. The tail runs by set code, the only ordering a player
already knows; name order puts three unrelated Luffys together and hides which
set each came from. Custom leaders, which have no set code, trail the run.

**A run label above the strip** — `Recent`, `OP09`, `Custom` — read off the DOM
as it scrolls, because 132 card backs look much alike in motion and the strip is
long. A divider separates the recents head from the run, so the head does not
read as the start of EB01.

**Reopening lands on your leader.** Tapping "Change" scrolls the strip to the
current selection rather than starting at EB01. It sets `scrollLeft` directly;
`scrollIntoView` walks up and scrolls every ancestor, which here means the bottom
sheet and the page behind it.

**Search is the answer to distance.** It already matches name, set code and
starter-deck code, so "op09" or "st17" collapses 132 to a handful. A search
replaces the whole strip with its hits — no recents head, which would only push
the answer off-screen.

### Recency

`stats.playedLeaders` and `stats.opponents` are ordered by games played, which
answers "what do you play most", not "what did you just pick". At an event those
differ. So recency is a local list in `src/lib/recent-leaders.ts`: no round trip,
works offline, which the logging path requires.

Scoped by role — `my-deck`, `opponent` — because two pickers share the round
form and choosing an opponent must not reorder your own decks. Capped at 8;
beyond a handful the head stops being a shortcut. It falls back to `suggested`
(most-played, from stats) to fill the head out, so a player's first round still
opens on their decks rather than on EB01.

Keys carry the `crewstat-` prefix that PRODUCT.md fixes. These are new keys, not
renames — renaming an existing one would strand a player's data.

Read through `useIsMounted`, the app's existing rule for anything out of
`localStorage`, so the server and first client render agree. Memoised behind a
bump counter rather than re-read every render: the picker sits in a sheet that
re-renders on every keystroke in the search box.

## Trade-offs accepted

- **Fewer cards visible at once**: about 4 across, against 9 in the 3-column
  grid. Browsing to a leader you have never played is slower. The bet is that
  recency and search carry nearly all traffic, and the measured strip confirms
  the shape: 133 cards, 13824px of scroll width against a 358px viewport.
- **A horizontal gesture returns to a bottom sheet.** That is what made an
  earlier alt-art revision dangerous. It is safe only because the strip now owns
  that axis alone: nothing inside a card answers to a horizontal drag, and
  choosing a printing is taps on the settled selection. This constraint is
  recorded in the component header and must not be relaxed.
- **Colour is gone as an organising axis**, along with `leaderColorBand`,
  `bandSwatch`, `bandField` and `COLOR_BANDS` as picker inputs. They remain in
  `leader-visual.ts` for the avatar fallback.

## Testing

- `recent-leaders`: empty to start; most-recent-first; a repeat moves to the
  front rather than duplicating; the cap drops the oldest; roles stay apart; no
  role remembers nothing; the `crewstat-` key; junk in storage degrades to empty
  rather than throwing.
- The strip: every leader by set code with customs last; recents lead; falls back
  to play history when nothing is recent; a pick is remembered under its own
  role; search drops the recents head; search matches starter-deck codes; the
  no-match message; the chosen leader is marked.
- Browser, since jsdom has no layout: card count, `scrollWidth` against
  `clientWidth`, `overflow-x`, how many fit at once, the run label tracking a
  swipe across `EB01 → OP11 → ST22`, and a pick leading the strip after a reload.

## Deliberately not doing

- **A second row**, to halve the strip's length. It doubles the height in a form
  that renders two pickers, and recency plus search already answer distance.
- **Set-code jump markers** to skip along the run. Search does this already, by
  typing the same characters the markers would show.
