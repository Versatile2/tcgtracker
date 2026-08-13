# Grand Line TCG — Add round form: focus, fewer fields, faster controls (Design)

**Date:** 2026-08-13
**Status:** Approved, not yet implemented
**Scope:** Four changes to the add/edit round sheet — collapse the leader carousel once a leader is chosen, remove the opponent-meta picker, rebuild Dice Roll / Start / Result as consistent segmented controls, and give all three a default value.

## 1. Context

`src/components/tournaments/round-form-sheet.tsx` is a bottom sheet with two steps: pick a round type, then fill in opponent and result. The second step currently stacks a 132-card leader carousel, an opponent-meta combobox, two tap-to-cycle buttons, a Result row, and a notes field — more vertical space than a phone sheet comfortably holds.

Part 1 of this work (merged as `1ca7a1c`) shortened meta labels to their set code across the app. This spec removes two of the surfaces that touched.

## 2. Requirements

1. Once a leader is selected, show only that leader so the choice is unmistakable.
2. Remove the meta selection from this form.
3. Fix the ergonomics of Dice Roll, Start, and Result.
4. All three of those controls start with a value selected.

## 3. Decisions

### 3.1 The leader carousel collapses to the selection

`LeaderCarousel` (`src/components/leaders/leader-carousel.tsx`) gains one piece of local state: whether it is expanded.

- **A leader is selected and the user hasn't asked to change it** → render only that leader's card at full size, plus a "Change" button. The search input is hidden.
- **"Change"** → re-expand to today's search-plus-row, selection still ringed.
- **Selecting a card, or adding a custom leader** → collapse again.
- **Nothing selected** → exactly today's behaviour.

Search text resets when the picker collapses, so re-opening never shows a stale filter.

**"Change" renders inside `LeaderCarousel`, beside the collapsed card — not in the section header.** The header label ("Opponent's Deck", "Leader") belongs to each parent, while the expanded/collapsed state belongs to the component. Keeping the control inside the component means **neither call site changes at all**, and the two parents stay free to label the field however they like.

This also improves editing: the sheet opens with `initial.opponentLeaderId` already set, so you land on a one-card confirmation rather than a 132-card scroll.

**Applies to both usages** — the round sheet's "Opponent's Deck" and the new tournament form's leader. The behaviour lives in the component with no opt-in prop, so the picker works identically everywhere.

Rejected: shrinking and dimming the other cards instead. It keeps one-tap correction, but 48px thumbnails are too small to identify a leader by art — which is the only reason the carousel exists — and it saves no vertical space.

### 3.2 The opponent-meta picker is removed; stats coalesce through the tournament

The combobox, its `oppMetaId` state, and the `useMetas` / `useAddCustomMeta` hooks come out of the round sheet. The submit payload stops sending `opponentMetaId`; `createRoundSchema` already declares it optional and nullable (`src/lib/validation/round.ts:40,51`), so **no API or validation change is needed** and new rounds simply store `null`.

**The `rounds.opponent_meta_id` column and the DTO field stay.** No migration, and every per-round meta already recorded is preserved.

The field was largely redundant: every round of a tournament is played in that tournament's meta, so the form was asking a question it could already answer.

**Stats.** `getOpponentStats` (`src/services/stats.ts:139`) currently joins `metas` on `rounds.opponentMetaId` and filters out nulls, which would leave the per-opponent breakdown with no new data. It changes to join on:

```sql
coalesce(rounds.opponent_meta_id, tournaments.meta_id)
```

Coalescing rather than switching outright is the load-bearing choice: a plain switch to the tournament's meta would silently rewrite history for any round whose recorded meta differs from its tournament's. Coalescing keeps every historical value exactly as recorded and falls back to the tournament only where the round has none — which is all new rounds. The "vs Nami: OP16 3–1" breakdown keeps working and past numbers do not move.

The `innerJoin` on `metas` already excludes rows where the coalesced value is null, so a tournament with no meta at all contributes nothing to the breakdown — same as today.

### 3.3 Per-round meta display is dropped

With rounds no longer recording their own meta, the two per-round meta tags would render for historical rounds and vanish for new ones — reading as a bug. Since every round in a tournament shares one meta, showing it per row was always redundant.

Removed:
- `round-item.tsx:61` — the `· OP16` suffix on each round line, and the `metaName` prop that feeds it
- `tournament-share-card.tsx` — `MatchRow`'s `metaName` prop and the `metaLabelFor` helper that supplies it

Kept:
- The share card's **event badge**, which shows the tournament's own meta (`tournament-share-card.tsx:105`). This remains the one place a meta appears on a shared card.
- The CSV export's `opponent_meta` column, untouched. It still carries historical values, and removing a column would break existing spreadsheets.

**Nothing is added to the tournament detail header.** That page shows no meta today and will continue not to; the meta remains visible on the share card and the stats page. This was an explicit decision, not an oversight.

Consequence worth recording: this removes two display sites that part 1 had just converted to short labels. `tournament-detail.tsx`'s `metaName` resolver and the share card's `metaLabelFor` both become dead and are deleted. `metaById` stays — the event badge still needs it.

### 3.4 Dice Roll / Start / Result become consistent segmented controls

Today Dice Roll and Start are **tap-to-cycle** buttons (Won → Lost → — → Won) sitting directly above a Result row that uses visible segmented buttons. Two interaction models adjacent to each other, and the cycling one has no affordance saying it cycles or what the other value is.

All three become segmented pairs with both values always visible and one tap to reach either:

- **Dice Roll** and **Start** keep their side-by-side two-column layout, each cell becoming a small label above a two-button control filling the cell width.
- **Result** keeps its full-width emerald row, structurally unchanged.

The `cycle()` helper (`round-form-sheet.tsx:174`) drops out with the last cycling control.

Rejected: stacking all three full-width. More consistent still and gives larger tap targets, but adds a row of height to a sheet that is already tall on a phone.

### 3.5 All three controls default, on add only

| Control | Default |
|---|---|
| Dice Roll | Won |
| Start | 1st |
| Result | Win |

These apply **only when adding a round**. Editing shows what was recorded and never overrides it.

Swiss only. Top Cut has no die roll and no single result — play order and results live per game in the best-of-3 log, which this change does not touch.

**Older rounds may hold `null`** for `wonDieRoll` or `playOrder`. The segmented control renders that naturally as neither button active; tapping sets a value.

**Accepted consequences**, both raised during design and confirmed:

1. **You can no longer clear these to "not recorded."** The three-state cycle allowed returning to `—`; two visible buttons plus a default do not. That state now exists only on historical rows.
2. **Turn-order statistics will skew toward 1st.** `playOrder` is not cosmetic — it feeds the turn-order win rate (`stats.ts:218`, which deliberately excludes null play order) and the "wins going second" achievement (`achievements.ts:63`). Defaulting it means rounds the user never thought about are counted as real turn-order data. Coupling the default to the die roll was offered as a mitigation and declined in favour of flat, independent defaults. **Treat the turn-order win rate as soft data from this change forward.**

`wonDieRoll` carries no such risk — it appears only on the share card pill and in the CSV, and feeds no statistic.

Save remains gated on choosing an opponent leader (`valid = Boolean(oppLeaderId && result)`). With Result always set on add, the opponent leader becomes the only thing standing between an open sheet and a saved round — which is correct, since it is the one field that cannot be defaulted.

## 4. Changes by file

**Server**

| File | Change |
|---|---|
| `src/services/stats.ts` | `getOpponentStats` metaRows joins/groups on `coalesce(rounds.opponent_meta_id, tournaments.meta_id)` (§3.2) |

**Client**

| File | Change |
|---|---|
| `src/components/leaders/leader-carousel.tsx` | Collapse-to-selection with "Change" (§3.1) |
| `src/components/tournaments/round-form-sheet.tsx` | Remove the meta picker, `oppMetaId` state, and the now-unused `ReferenceCombobox` / `metaLabel` / `useMetas` / `useAddCustomMeta` imports; segmented Dice Roll / Start (§3.4); defaults on add (§3.5); delete `cycle()` |
| `src/components/tournaments/round-item.tsx` | Drop the per-round meta tag and the `metaName` prop |
| `src/components/tournaments/tournament-detail.tsx` | Delete the now-unused `metaName` resolver; stop passing it to `RoundItem`; drop the `metaLabel` import (`metas`/`useMetas` stay — the share card needs them) |
| `src/components/share/tournament-share-card.tsx` | Drop `MatchRow`'s `metaName` prop and the `metaLabelFor` helper; keep `metaById`, `eventMeta` and the event badge |

No schema migration. No API or validation change. No change to `round-values.ts`, `csv.ts`, or `export.ts`.

## 5. Testing

The repo has **no component-test infrastructure** — `vitest.config.ts` sets `environment: 'node'` and collects `.ts` only; `@testing-library/react` and `jsdom` are installed but unused, and the `e2e` script has no Playwright config. This was established during part 1 and is unchanged. The three UI changes (§3.1, §3.3, §3.4, §3.5) therefore have no automated coverage and are verified by lint, `tsc --noEmit`, the existing suite staying green, and a manual pass.

Automated coverage lands where the logic is:

| Test | Asserts |
|---|---|
| `getOpponentStats` — round with its own meta | Still bucketed under that meta, not the tournament's (proves coalesce order) |
| `getOpponentStats` — round with `opponentMetaId: null` | Bucketed under its tournament's meta |
| `getOpponentStats` — round in a tournament with no meta and no round meta | Excluded from the breakdown entirely |
| Existing `stats.test.ts:130` (`nami.byMeta[0].name === 'OP02'`) | Must still pass unchanged — its helper sets an explicit opponent meta, so it exercises the first coalesce branch |

Manual pass, on the round sheet:

1. Add a round → Dice Roll reads Won, Start reads 1st, Result reads Win, all with both options visible.
2. Save is disabled until an opponent leader is chosen.
3. Choosing a leader collapses the carousel to that one card with a "Change" button; "Change" reopens the full row with the selection still ringed.
4. No meta field appears anywhere in the sheet.
5. Edit an existing round → the recorded values show, not the defaults; the carousel opens collapsed.
6. Edit a round saved before this change with no play order → neither Start button is highlighted.
7. Round lines and the share card's match rows no longer show a `· OP16` tag; the share card's event badge still does.
8. Stats → the per-opponent meta breakdown still lists metas, including for rounds added after this change.

## 6. Out of scope

The best-of-3 game log's per-game result and play-order buttons, the round type picker, the notes field, the tournament detail header, and the CSV format.
