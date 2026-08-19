# Quick actions on a long-press

Date: 2026-08-19

## Problem

Deleting or editing anything from the home list costs two navigations: open the
tournament, find the action at the bottom, come back. The list is where you
already are when you notice the mistake.

## Decisions

| Decision | Chosen |
|---|---|
| Hold duration | **~500ms**, the platform norm |
| Actions | **Edit, Share, Finish/Reopen, Delete** |
| Discoverability | **Hint once, then retire it** |

The request specified 2 seconds. That is roughly four times what iOS and Android
use, and at 2s most people have released and concluded the gesture is broken —
so 500ms was chosen instead, matching the muscle memory players bring from every
other app on the phone.

## The gesture

`useLongPress`, built on the pointer idiom already in `swipe-row.tsx:26-49`:

- `pointerdown` starts a 500ms timer and records the position.
- A move beyond 8px cancels it. **Scrolling always wins** — a list that
  occasionally swallows a scroll into a menu is worse than no shortcut.
- Release before it fires cancels it.
- When it fires, a ref flag suppresses the `click` that follows, or the card's
  link would navigate out from under the menu.

**The OS gets there first unless stopped.** The cards are `<a>` elements, and
long-pressing a link opens iOS Safari's link preview and Android Chrome's
context menu. Three things prevent that: `-webkit-touch-callout: none`,
`user-select: none`, and a `contextmenu` handler that calls `preventDefault`.

That handler also earns the desktop path for free: right-click and the keyboard
context-menu key open the same sheet. It is the only non-pointer route in, which
matters because a long-press has no keyboard equivalent — and every action
remains on the detail screen regardless, so nothing here is the sole way to
reach anything.

## The menu

A bottom sheet, not a floating context menu: one-handed reach on a phone, and
the app already established the idiom with the `+` chooser. It leads with the
event's own identity — leader art, name, date — so it is clear what is about to
be acted on.

| | Edit | Share | Finish / Reopen | Delete |
|---|---|---|---|---|
| Tournament, drafting | yes | yes | Finish | yes |
| Tournament, finished | — | yes | Reopen | yes |
| Freeplay | yes | yes | yes | yes |
| Match | yes | yes | — | yes |

Edit is absent on a finished tournament because `/tournaments/[id]/edit` refuses
one; a menu should not offer a door that is locked. Matches have no draft state
worth toggling.

**Delete confirms in place**, by swapping the sheet's contents rather than
opening a dialog over it. The leader picker already carries the lesson: *"this
component renders inside a bottom sheet and nesting overlays there is fragile."*

**One sheet for the whole list**, owned by `TournamentList`, with cards
reporting the long-press upward — rather than mounting a sheet per card on a
list that can run to dozens.

## Share, and why it navigates

`TournamentShareCard` needs full rounds; the list holds only summaries
(`TournamentSummaryDTO.matches`), so the card cannot be rendered from the list.
Share navigates to the detail with `?share=1`, which opens the existing dialog
there.

Rejected: fetching the detail on demand when Share is tapped. It duplicates the
share plumbing and depends on a query that may not be cached offline — a poor
trade for the least time-critical of the four actions.

## The hint

One line under the list: "Press and hold a card for quick actions." Stored under
`crewstat-longpress-hint-seen` — the prefix PRODUCT.md fixes — and retired the
first time the gesture is actually used, so it teaches once and then leaves.

## Error handling

- **Scroll started mid-press**: cancelled, no menu, no navigation.
- **Long-press then release**: the menu is open and the click is swallowed; the
  card does not navigate.
- **Offline**: every action already goes through the outbox, so delete, finish
  and reopen work with no connection. Share navigates, and the detail renders
  from cache.
- **A tournament deleted from the sheet** removes it from the list optimistically
  via the existing `cache.dropTournament`.

## Testing

- `useLongPress`: fires after the delay; cancelled by movement past the
  threshold; cancelled by early release; the following click is suppressed;
  cleans up its timer on unmount.
- Browser: hold a card and the sheet appears naming that event; a finished
  tournament offers Reopen and no Edit; a match offers no Finish; delete asks
  first and then removes the card; the hint appears once and not again.

## Deliberately not doing

- **A `…` button on every card.** The hint was chosen instead; a permanent
  control on a dense list costs space on every row to serve a shortcut.
- **Swipe-to-reveal on cards.** `SwipeRow` exists and is used on round items,
  but adding a second gesture to a list that already scrolls vertically and
  hosts a horizontally-scrolling leader strip elsewhere invites exactly the
  conflict the strip work spent a commit fixing.
