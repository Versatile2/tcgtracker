# Editing a tournament on purpose

Date: 2026-08-18

## Problem

The tournament detail screen let you change the leader through an inline
combobox sitting in the header. That is the one field you can change by accident
while reading the page, and it is the field every statistic for that event hangs
off. Meanwhile the name, the type and the date — all of them already editable
through `PATCH /api/tournaments/:id` — had no interface at all.

## Decisions

- **The inline combobox goes.** The leader renders as plain text, which is what
  the locked state already did.
- **An Edit button** opens a dedicated screen holding name, type, leader (with
  its printing), meta, date and a new note.
- **Alt art stays global.** The printing picker on that screen is the one that
  already exists, and it still writes to `leader_art`, keyed
  `(ownerId, setCode)`. Choosing a printing there changes that leader everywhere
  — other tournaments, stats, share cards. Rejected the alternative of a
  per-tournament printing column: the same leader looking different from screen
  to screen is worse than one global answer, and it is a migration.
- **Locked means locked.** Edit is offered only while the tournament is a draft,
  matching rounds, which already refuse edits until it is reopened.
- **A tournament note is new.** `notes` at `schema.ts:88` is on *rounds*;
  tournaments have no such column. This adds one.

## Model

One new nullable column, `tournaments.notes`, and one migration.

`updateTournamentSchema` already accepts `type`, `myLeaderId`, `metaId`, `name`
and `playedOn`, so it gains only `notes`. The existing type guards still hold: a
session cannot be switched into or out of freeplay or match, which is why the
edit screen shows the type strip for a tournament and hides it for a freeplay
session.

## Interface

**Where Edit lives.** The bottom action row, which already holds Finish and
Delete: `Edit | Finish | Delete` while drafting, `Reopen | Delete` once locked.
The header stays as it is. Putting it there keeps the header uncrowded — it
already carries the leader art, badges, name, date, record and Share — and puts
the three whole-tournament actions in one place instead of two.

**The screen** is the creation form under a third `kind`, the way `/freeplay/new`
already reuses it. Same fields in the same order, so editing looks like creating
rather than like a different app, and freeplay sessions get an edit screen for
free, minus the leader and type they do not have. It is renamed from
`NewTournamentForm` to `TournamentForm`, since it now creates and edits.

Two behaviours that must not carry over from creation:

- The last-played-leader default and the last-created-type lead are for a blank
  form. In edit mode the tournament's own values win.
- Creating remembers the type; editing does not. Changing an event's type after
  the fact says nothing about what you will log next.

## Error handling

- Editing a locked tournament: the button is not rendered, and the service
  layer's existing guards still reject a type switch across freeplay or match.
- Offline: the edit is a `tournament.update` through the outbox, like every
  other write, and applies to the cache at once.

## Testing

- `notes` round-trips through create and update, and is nullable.
- The detail screen renders no combobox, and offers Edit only while drafting.
- Browser: Edit opens prefilled; changing name, type, leader and note persists;
  the leader cannot be changed from the detail screen itself.

## Migration

`ALTER TABLE tournaments ADD COLUMN notes text` runs against production before
the deploy, the same rule as the `match` enum value and `leader_art`.
