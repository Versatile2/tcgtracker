# Converting a tournament into a session, and back

You log an event as a Local, then realise halfway through it was really just
testing with friends. Today the only way out is to delete it and log it again:
`updateTournament` rejects every type change that crosses the freeplay boundary,
because the leader lives in a different place on each side.

This adds a deliberate conversion that moves the leader with the type.

## The transform

One service function, `convertTournamentType`, handling both directions —
the reshape is symmetric, and splitting it would duplicate the guard.

**Tournament → session.** Copy `tournaments.my_leader_id` down onto every
swiss/top_cut round that lacks one, null it on the session, set the new type.
Byes and no-shows are skipped: they are not games and carry no leader in either
segment.

This is exactly migration `0011_testing_to_freeplay`, which already ran in
production. Reusing its shape means reusing something proven — including its
idempotency, so a replayed outbox op is a no-op rather than a corruption.

**Session → tournament**, guarded on `computeDeckCount` (`lib/record.ts:26`),
the distinct non-null leaders across a session's rounds:

| decks | behaviour |
| --- | --- |
| 1 | promote that leader onto the session, null every round's leader |
| 0 | nothing to promote — the confirm sheet asks for a leader, since a tournament requires one |
| 2+ | the action is not offered |

Two or more decks cannot become one leader without discarding rounds' data, so
that door stays shut. `card-actions-sheet.tsx:76` already states the principle
this follows: "a menu should not offer a door that is locked."

Everything else rides along untouched — placement, field size, status, name,
notes, meta, date. **Placement is preserved rather than cleared**, which is what
makes the round trip lossless; a converted session keeps its standing and its
rank skin, and you can still clear it on the edit screen.

**A locked tournament converts and stays locked.** The lock means "done logging
games"; converting logs nothing. Delete already works on a locked event, so
forbidding a reversible conversion would be the odd rule out.

Matches are excluded, consistent with the existing separate match guard at
`tournaments.ts:103`.

### Why not widen `updateTournament`

`updateTournament` keeps rejecting cross-segment type changes, so the edit
screen's error stays true. A conversion is a deliberate act that reshapes two
tables; a field edit is not. Keeping them apart means the edit screen cannot
accidentally trigger a reshape by patching a type.

## Where you reach it

The long-press action sheet, beside Finish / Reopen / Delete. The detail
screen's action row is already three buttons wide and a fourth would crowd it,
so this ships to the sheet only.

The confirm sheet carries:

- the consequence, stated plainly: "This moves it out of your competitive
  record — it won't count toward your win rate, tournament count or
  achievements," inverted for the reverse direction
- the destination type strip — the eight session types one way, the six
  tournament types the other, reusing the chip pattern from the create form
- a leader picker, only in the zero-deck case
- the confirm button

No computed damage estimate. The generic sentence is the guard; the numbers
would cost a stats round trip to render a dialog.

## API and offline

`POST /api/tournaments/[id]/convert`, mirroring the existing `finish` and
`reopen` routes. A new outbox op `tournament.convert` carrying
`{ type, myLeaderId? }`, so a conversion made at a venue with no signal queues
like every other write, with the matching optimistic-cache update so the card
changes segment immediately rather than after the flush.

## What does not change

Nothing in stats or achievements. `CASUAL_TYPES` derives from `FREEPLAY_TYPES`,
so the moment the row's type changes every aggregate follows on the next read.
That is the same property that made moving Testing a one-line change.

## Tests

Service-level against the test database:

- tournament → session moves the leader down onto games and off the session
- byes and no-shows keep their null leader through the conversion
- session → tournament promotes the single leader and clears the rounds
- a two-deck session is rejected
- a zero-deck session requires a leader, and takes the one it is given
- a locked tournament converts and is still locked
- another owner's tournament is untouchable
- **round trip**: a tournament converted to a session and back is identical to
  where it started, placement and all — the promise the whole design rests on
