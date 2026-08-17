# Grand Line TCG — First-look fixes (Design)

**Date:** 2026-08-17
**Status:** Approved, not yet implemented
**Scope:** Defects and clutter found by rendering every main screen for the first time, in both themes, with realistic data.

## 1. Context

Until 2026-08-17 no UI in this project had ever been seen rendered — the Clerk dev instance bounces non-browser clients, so every previous slice shipped on lint, `tsc`, a green suite and reasoning. `npm run shot` (`scripts/screenshot.mjs`) now makes authenticated screens capturable headlessly.

The first pass over the tournament list, tournament detail, stats, achievements and settings — light and dark, three seeded tournaments including a freeplay session — found four defects and a set of clutter problems. **Every item here was observed in a render, not inferred.**

Two things in the screenshots are *not* defects and must not be "fixed": the red "2 Issues" badge is the Next dev overlay, and the bottom nav appearing mid-page is how `position: fixed` renders in a full-page screenshot.

## 2. Requirements

1. Fix the four observed defects.
2. Remove the detail page's per-round repetition of a leader that cannot change.
3. Stop Overall and By-meta contradicting each other.
4. Stop the achievements grid reading as ragged.

## 3. Decisions

### 3.1 Hydration mismatch — stop branching the component tree

**Observed:** every load of `/` and `/stats` logs *"Hydration failed because the server rendered HTML didn't match the client"*, and React discards the server tree and regenerates it on the client.

**Cause,** in `src/app/providers.tsx:21-29`: `persister` is `null` on the server and non-null on the client, so the server renders `QueryClientProvider` while the client renders `PersistQueryClientProvider`. Those are different components in the same position — that can never hydrate cleanly.

**Fix:** always render `PersistQueryClientProvider`, and let the persister be constructed with `storage: undefined` on the server. `createSyncStoragePersister` no-ops without storage, so persistence still only happens client-side — but the tree is identical on both sides.

`suppressHydrationWarning` is already on `<html>` (`layout.tsx:37`), so next-themes is *not* implicated; do not add theme-related guards chasing this.

### 3.2 Dates format without a locale lookup

**Observed:** raw ISO strings — "2026-08-09" on the detail header, "2026-08-16" on the freeplay card.

A shared `formatPlayedOn(iso: string): string` renders `9 Aug 2026` by indexing a fixed month array from the ISO parts.

**It must not use `toLocaleDateString`.** The server and client can resolve different locales, which produces exactly the hydration class of bug §3.1 removes. Deriving the string from the ISO parts is deterministic on both sides.

### 3.3 The freeplay glyph becomes an icon

**Observed:** the glyph renders as a small red-and-white box rather than 🎴.

`FreeplayGlyph` currently renders an emoji, so it depends on the platform having that codepoint. It switches to a lucide `Shuffle` icon — "the deck changes" — which renders identically everywhere and matches every other icon in the app. Size, footprint and the `bg-muted` treatment are unchanged.

### 3.4 Truncation must never eat the set code or the date

**Observed:** "Portgas D. Ace OP…", "Donquixote Dofla…", and on tournament cards the date disappears entirely.

Two sites, one principle: **the disambiguator survives, the name gives way.**

- `tournament-card.tsx` — the subtitle is one truncating line holding leader name, set code and date, so the date is simply lost. The subtitle becomes a flex row of two segments: a truncating leader segment (name + set code) and a date segment that does not shrink. The date therefore always renders in full and the leader name absorbs the pressure.
- `opponent-stats.tsx` — same shape: the name truncates while the set code is held at its natural width.

This matters because names are not unique: there are 15 Monkey D. Luffy printings and the set code is the only thing separating them, so it is the worst possible thing to drop first.

### 3.5 The detail page stops repeating a leader that cannot change

**Observed:** seven identical Roronoa Zoro cards down the left edge of a seven-round tournament.

`RoundItem` renders the player's leader on every row. In a **non-freeplay** tournament the leader is fixed for the whole event, so every one of those cards after the first carries no information while costing height on the app's densest screen.

The player's leader card renders per round **only for freeplay**, where it genuinely varies. Everything else about the row is unchanged.

**Explicitly kept:** the header's "Leader: Roronoa Zoro" line. An earlier reading called it redundant; it is not — the header's card art shows the name only in tiny print, so that line is the sole legible statement of which leader the tournament was played with.

### 3.6 By-meta drops its tournament count

**Observed:** Overall reports 2 tournaments; By-meta lists OP15 "1 tournament" and OP16 "2 tournaments", which sums to 3.

Both numbers are correct under the freeplay rules: Overall excludes freeplay, By-meta includes it. Nothing explains that to a reader, so the page looks wrong.

`per-meta-stats.tsx:16` stops rendering the tournament count. Each row keeps record, win rate and games. That removes the invitation to sum without changing a number, without a footnote to read, and without reversing the freeplay decision. **Games is also the better denominator** for a per-format breakdown — it is what a win rate is computed over.

Rejected: labelling each section's rule (makes the reader hold two rules while scanning), splitting freeplay out per row (denser still), and excluding freeplay from By-meta (reverses a deliberate decision and loses per-format insight from testing).

### 3.7 Small copy and layout corrections

- `overall-stats.tsx:27` renders `` `${o.mostPlayedLeader.tournaments} tournaments` `` unconditionally, so a single tournament reads **"1 tournaments"**. It pluralises. (`per-meta-stats.tsx` already pluralised correctly — that site is being removed by §3.6 regardless.)
- `achievement-card.tsx:19` renders its progress block only when `!a.unlocked && a.progress`, so binary achievements (Perfect Run, Meta Dominator) render nothing there. Grid rows stretch cards to equal height, so a bar's vertical position depends on how long its neighbour's description is, and rows look ragged. The card becomes a flex column with the progress block pushed to the bottom, so every bar in a row aligns on the card's bottom edge and cards without one read as deliberate rather than unfinished.

## 4. Changes by file

| File | Change |
|---|---|
| `src/app/providers.tsx` | One provider tree on both sides (§3.1) |
| `src/lib/format-date.ts` *(new)* | `formatPlayedOn`, no locale lookup (§3.2) |
| `src/components/tournaments/freeplay-glyph.tsx` | lucide `Shuffle` replaces the emoji (§3.3) |
| `src/components/tournaments/tournament-card.tsx` | Date out of the truncating line; formatted (§3.2, §3.4) |
| `src/components/stats/opponent-stats.tsx` | Protect the set code from truncation (§3.4) |
| `src/components/tournaments/tournament-detail.tsx` | Per-round leader only for freeplay; formatted date (§3.2, §3.5) |
| `src/components/tournaments/round-item.tsx` | Accept an absent player leader without reserving its space (§3.5) |
| `src/components/stats/per-meta-stats.tsx` | Drop the tournament count (§3.6) |
| `src/components/stats/overall-stats.tsx` | Pluralise (§3.7) |
| `src/components/achievements/achievement-card.tsx` | Bottom-align the progress region (§3.7) |

No schema, service, DTO or API changes. No migration.

## 5. Testing

`formatPlayedOn` is pure and gets unit tests — a normal date, a single-digit day, and a December date, asserting exact output.

The rest is presentational, and this repo has **no component-test infrastructure** (`vitest.config.ts` is `environment: 'node'`, `.ts` only; `@testing-library/react` and `jsdom` installed but unused). Do not stand it up. Verification is lint, `tsc --noEmit`, the existing suite staying green, and — now genuinely available — `npm run shot`.

**Screenshot verification is part of this work, not optional.** Every item below was found by looking; each fix is confirmed the same way, both themes:

1. `/` and `/stats` load with **no hydration error** in the console. This is the primary check and the console is the evidence.
2. The freeplay card shows a Shuffle icon, not a box.
3. A tournament card shows leader, set code **and** a formatted date, none truncated away.
4. The detail page of a classic tournament shows the leader card **once**, in the header; a freeplay session still shows each round's own deck.
5. By-meta rows show record, win rate and games, with no tournament count.
6. Most-played leader with one tournament reads "1 tournament".
7. Achievement rows align: a card with a progress bar and one without sit level.

Run a dev server against `DATABASE_URL_TEST` first — `scripts/screenshot.mjs`'s header explains why, and pointing it at the default `DATABASE_URL` writes to production Neon.

## 6. Out of scope

The tournament detail page still shows no meta anywhere — a Regionals with no format visible. That follows from the deliberate "drop per-round, add nothing" decision when freeplay was specced, and reversing it is a product change, not a fix.

Also untouched: the type-filter row on the list, which needs horizontal scrolling to reach Freeplay; and the Clerk `createRouteMatcher` deprecation warning in the dev log.
