# Placement skins: making a finish look like what it was worth

## Context

Placement was added on 2026-08-18 so a player could record "2nd of 14" when finishing an
event. It works, and it is invisible.

Evidence from the code, not impressions:

- All four surfaces that render a placement print the same string in the same colour.
  `tournament-card.tsx:69` and `tournament-share-card.tsx:110` both use
  `text-primary`; `tournament-detail.tsx:118` adds a `Medal` icon to a `bg-primary/12`
  chip. Winning a 32-player Regional and finishing 19th of 24 at locals are typeset
  identically.
- The achievement engine already grades finishes into three tiers —
  `champion`, `podium`, `top_cut` (`definitions.ts:58-60`) — and the UI reflects none of
  that grading. The app knows the difference and does not show it.
- `isMilestone` (`celebration.ts:34`) fires on achievements, levels and streaks only.
  Because `champion` unlocks the first time and never again, **your second tournament
  win is celebrated less than your first round of the day**. The single best thing that
  can happen to a player is, after it happens once, silent.

The request, in the user's words: make the classement cool — colour and skins for the
tournament where I came 1st, and skins by ranking.

### Decisions taken with the user

| Decision | Chosen | Rejected |
|---|---|---|
| How far the skin spreads | **Full trophy skin** — gradient field, metal edge, shimmer | Badge only; badge + edge |
| How many rungs | **Four, descending heat**: champion → silver → bronze → cut → plain | Podium-only; champion-only |
| What happens when you record a win | **The gold moment fires every time**, not only the first | First win only; no moment |

**Consequence accepted up front.** PRODUCT.md commits to a UI that is "clean and largely
neutral", and the gamification spec confined loudness to the moment of logging. A gold
card sitting permanently in the home list is a deliberate, named exception to both. It is
defensible because it is *rare and earned* — a player has a handful of these in a year —
and because the loudness is bounded by the ladder: only four cards in a hundred can be
anything other than plain.

---

## 1. One source of truth for how good a finish was

`src/lib/rank.ts`, pure, no React, no DOM.

```ts
export type RankTier = 'champion' | 'silver' | 'bronze' | 'cut';

export function rankTier(placement: number | null, fieldSize: number | null): RankTier | null;
```

| Tier | Condition | Label |
|---|---|---|
| `champion` | `placement === 1` | Champion |
| `silver` | `placement === 2` | Runner-up |
| `bronze` | `placement === 3` | 3rd place |
| `cut` | `placement <= 8` and `fieldSize >= 16` | Top 8 |
| `null` | anything else, or no placement | — |

Rows are tested **in the order listed and the first match wins**, so 2nd of 32 is `silver`
rather than `cut` even though it satisfies both.

It is built on `isWin`, `isPodium` and `isTopCut` in `src/lib/placement.ts`, which already
back the three achievements. **The visual ladder and the achievement ladder are the same
ladder**, evaluated by the same predicates, so the card a player sees can never disagree
with the achievement they unlocked. `8th of 8` is last place, not a cut, and stays plain —
that rule already exists in `isTopCut` and is inherited rather than restated.

`rankLabel: Record<RankTier, string>` lives beside it so the four surfaces cannot drift on
wording.

## 2. What makes the metal look like metal

Gold is not yellow. A flat warm fill reads as plastic; what reads as metal is a **gradient
that reverses** — a pale champagne highlight crossing a warm amber field into a bronze
shadow. Each metal is three oklch stops in `globals.css`:

```css
--rank-gold-hi / --rank-gold-mid / --rank-gold-lo
--rank-silver-hi / -mid / -lo      /* cool, near-neutral chroma */
--rank-bronze-hi / -mid / -lo      /* warmer and darker than gold */
```

Four rules govern every surface built from them:

1. **The edge carries the identity.** A gradient-filled wrapper with the card inset by
   1.5px, *not* `border-image` — `html-to-image` clones computed styles into an SVG
   `foreignObject` and rasterises `border-image` unreliably, and the share card must
   survive that path.
2. **The field stays quiet.** Inside the edge, a ~10% wash of the mid stop over `--card`.
   Body copy stays `foreground`. This is the rule that keeps "full trophy skin" readable
   rather than an unreadable gold rectangle.
3. **The medal chip is a physical object.** Gradient fill, dark warm text, and *identical
   in light and dark mode* — a real medal does not change colour when the lights go out.
   Fixed dark-on-metal also sidesteps the contrast trap of gold on white.
4. **Shimmer sweeps once, on mount, then rests.** A narrow highlight band crossing over
   ~2.6s. A looping shimmer in a scrolling list is a slot machine; one sweep when the app
   opens is a greeting. Champion only — silver and bronze are still metal, not animated.

**Metals ignore the accent.** `--primary` is user-selectable; a medal is not. The one tier
that *does* use the accent is `cut`, so making the cut is tinted in whatever colour the
player chose. Earned metal is fixed, earned accent is theirs.

## 3. Where it appears

One `<RankBadge tier>` component and one `rankSkin(tier)` class helper serve all four
surfaces:

| Surface | Treatment |
|---|---|
| Home card (`tournament-card.tsx`) | Full skin: metal edge, wash, chip, one shimmer sweep |
| Event header (`tournament-detail.tsx`) | Chip in metal, replacing the `bg-primary/12` chip |
| Share card (`tournament-share-card.tsx`) | Full skin, **no shimmer** — `html-to-image` captures one frame and would freeze the sweep mid-travel |
| Celebration (`result-card.tsx`) | Bloom and headline take the tier's metal |

`card-actions-sheet.tsx:114` keeps its plain text line; it is a context menu, not a place
to celebrate.

## 4. The win moment

This is the one change that is not styling.

`Celebration` gains `placement: number | null` and `fieldSize: number | null`.
`isMilestone` gains a clause: **a podium finish is a milestone in its own right**,
independent of whether any achievement unlocked. That is what makes a second, third and
tenth tournament win land as hard as the first.

`headlineFor` gains a matching branch, ordered above the achievement branch so the most
specific claim still wins: a win that also unlocks something reads "Champion", not the
achievement name.

The finish path in `tournament-detail.tsx:167` already runs both writes inside
`logCelebration`'s window, so it needs only to pass the new placement through — the
existing before/after snapshot mechanism does the rest.

The moment extends to 2nd and 3rd, in their metals, because the ladder should behave
consistently at every rung. `cut` gets no moment: it earns an edge in the list, and the
existing `top_cut` achievement still fires the first time.

## 5. Edge cases, accessibility, verification

- **Freeplay and matches** carry no placement, so `rankTier` returns `null` and nothing
  changes for them.
- **Reduced motion** drops the sweep and keeps the static metal, inside the existing guard
  at `globals.css:163`.
- **Screen readers** get the label, not the metal: the chip carries its `rankLabel` as
  text, and the decorative gradient layers are `aria-hidden`.
- **A placement removed on edit** returns the card to plain on the next read. Nothing is
  clawed back visibly, matching the rule already set for un-earned achievements.

**Verification**

1. `npm test` — `rankTier` at every boundary: 1st, 2nd, 3rd, 4th, 8th of 16, 8th of 8,
   9th of 32, unplaced, and a placement with no field size.
2. `npx tsc --noEmit`, `npm run lint`, `npm run build`.
3. Browser, against the seeded test database with `DATABASE_URL` overridden to
   `DATABASE_URL_TEST`: a list holding one of each tier plus a plain event, screenshotted
   in **light and dark**, since gold on white is the hard case; the event header and the
   share card at each tier; and one champion finish logged end to end to confirm the
   moment fires on a *repeat* win.
4. Migration: **none.** `placement` and `fieldSize` are existing columns.

## Deliberately not doing

- **Metals for round results.** Win/loss pills are frequent and factual; making them
  metallic would spend the vocabulary that makes a tournament win feel rare.
- **A rank on the profile screen.** Level and streak already live there; a third
  progression number would compete with them rather than add to them.
- **Animated metal on the share card.** It rasterises to a single frame, and a frozen
  half-swept highlight looks like a rendering bug.
