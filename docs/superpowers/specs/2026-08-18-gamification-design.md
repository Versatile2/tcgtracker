# Gamification: make finishing a match something you look forward to logging

## Context

Grand Line TCG currently ends a match in silence. Evidence from the code, not impressions:

- **Logging a win produces no positive feedback at all.** The only toasts in the logging path are errors and `'Round deleted'` (`tournament-detail.tsx:81`). Deleting a round is acknowledged more than winning one. `grep` for `vibrate|Audio(|confetti` across `src/` returns nothing.
- **Achievement unlocks are detached from the act that earned them.** `achievements-view.tsx:16-32` runs the newly-unlocked check on mount *of the Achievements screen*. You can seal a Perfect Run at locals and not hear about it until you open that tab days later.
- **Nothing accrues.** PRODUCT.md Principle 4 is "Reward the habit", but there is no habit mechanic — no streak, no level, nothing that grows between events.

The goal, in the user's words: *"the user should be happy to finish a match so he can encode it in the app."* That is a statement about **anticipation**, not just reward. Most gamification ships only the payoff. Anticipation requires that the player knows, *before* the match ends, that logging will pay.

### Decisions taken with the user

| Decision | Chosen |
|---|---|
| Brand tension with PRODUCT.md's "clean and largely neutral" | **Loud only at the moment of logging.** Everything else stays neutral; the contrast is what makes the payoff land. |
| Scope | **One spec for all four subsystems** (reward moment, progression, achievements, share loop). Decomposition was offered and declined. |
| Sound | **None at all.** The scene is a quiet game hall. |
| Progression home | **A new Profile screen.** |

**Consequence to accept up front:** with no sound, and `navigator.vibrate` unsupported on iOS Safari and iOS PWAs, **motion is the entire reward channel** for a large share of users. Haptics are a bonus on Android, never the carrier.

---

## The idea: the last card flip

At the end of an OPTCG match the loser's final life card flips. The celebration is built from that, not from confetti — confetti is the saturated pattern, and the app already owns 285 real card printings including the player's own chosen alternate art.

On a milestone save, a **result card** turns over where the form was: the player's chosen printing on one face, the opponent's on the other. It settles with the winner's leader forward, carrying the deltas — XP gained, streak, any achievement just unlocked. Win blooms accent behind it; loss settles factually with the opponent forward and **still advances XP and streak**.

### Intensity scales with significance

This is the spine of the design and the reason it does not tax logging speed.

- **Routine round (most saves)** — ~450ms, non-blocking, no overlay. The new round row slides in, the record counts up, a short haptic fires. Logging stays as fast as it is today.
- **Milestone save** — the full card moment: an achievement unlocked, a level gained, a week streak extended, a perfect run sealed, the first log of a week. Interruptible by tap, self-dismissing, never blocking.

Celebrating every save equally makes nothing feel special and turns 8 rounds at a Regional into 8 taxes. Variable payout is both better game feel and the thing that protects Product Principle 1 (log-first).

### Anticipation, which is what the user actually asked for

- The round form sheet carries a live **next-payoff line**: "2 rounds from Century", "1 win from Rainbow Crusher". Computed from the achievement `progress` fields that already exist.
- The home screen surfaces a **streak at risk**: "Log this week to keep a 6-week streak."

---

## Architecture

### The unlock: the achievement engine moves to the client

`ACHIEVEMENTS` and `computeCtx` in `src/services/achievements.ts:34-107` are **already pure functions** — only `getAchievements` touches the database. Moving them to `src/lib/` (the same move `CASUAL_TYPES` already made) lets the client evaluate achievements from its own cache, so **unlocks fire offline, at the instant of logging**, with no new tables and no migration.

The client already caches everything `computeCtx` needs except one field:

| `computeCtx` input | Client source |
|---|---|
| result, tournamentId | `TournamentSummaryDTO.matches[]` |
| metaId, myLeaderId | `TournamentSummaryDTO` |
| opponentColors | `matches[].opponentLeaderId` → `useLeaders()` cache |
| **playOrder** | **missing — must be added to `MatchSummaryDTO`** |

`listTournaments` (`services/tournaments.ts:76`) builds `matches` from round rows it already holds in memory, so adding `playOrder` costs one field on an existing map.

**One implementation, two callers.** The server builds `Ctx` from SQL; the client builds it from the cache. A parity test asserts both builders produce an identical `Ctx` from the same fixture — without it the two drift and the client celebrates things the server disagrees with.

### Progression is derived, never stored

No new tables. XP and streak are pure functions of history already in the cache.

- **XP** — 10 per round logged, +5 per win, +25 per event finished. XP rewards *logging*, with a bonus for winning. A design that paid only for wins would teach losing players to stop logging, destroying the data the product exists for (Principles 1 and 3).
- **Level** — a documented curve over total XP, computed in one place.
- **Week streak** — consecutive ISO weeks containing at least one logged game. **Weeks, not days**: locals are weekly, and a daily streak would punish normal behaviour and then break, which is worse than having none.
- **Scope split, deliberate:** XP and streak count *every* logged game including matches and freeplay, because they measure the habit. Achievements keep their existing competitive-only scope (`CASUAL_TYPES` excluded), because they measure accomplishment.

---

## Files

**New — pure logic (unit-tested, no React)**
- `src/lib/achievements/definitions.ts` — `ACHIEVEMENTS`, `computeCtx`, `Ctx` moved verbatim from `services/achievements.ts`
- `src/lib/achievements/from-cache.ts` — builds `Ctx` from `TournamentSummaryDTO[]` + `LeaderDTO[]`
- `src/lib/progress.ts` — `xpFor`, `levelFor`, `weekStreak`, `nextPayoff`

**New — celebration**
- `src/components/celebrate/celebration-provider.tsx` — context + queue; decides routine vs milestone
- `src/components/celebrate/result-card.tsx` — the card-flip moment
- `src/components/celebrate/count-up.tsx` — animated number, reduced-motion aware
- `src/lib/haptics.ts` — feature-detected `navigator.vibrate`, silent no-op elsewhere

**New — profile**
- `src/app/profile/page.tsx`, `src/components/profile/profile-view.tsx` — level, XP, streak, then the existing achievements grid as a section

**Modified**
- `src/services/achievements.ts` — keeps only the DB query, imports the definitions
- `src/lib/dto.ts`, `src/services/tournaments.ts` — `MatchSummaryDTO.playOrder`
- `src/components/query-hooks.ts` — `useRoundWrites.add` evaluates progress before/after and raises a celebration
- `src/components/tournaments/round-form-sheet.tsx`, `src/components/matches/match-form.tsx` — both logging paths trigger it; sheet gains the next-payoff line
- `src/components/nav/bottom-nav.tsx` — Achievements tab becomes Profile; bar stays at four tabs
- `src/components/tournaments/tournament-list.tsx` — streak-at-risk line
- `src/app/globals.css` — celebration keyframes inside the existing `prefers-reduced-motion` guard (`globals.css:163`)
- `src/app/providers.tsx` — mount `CelebrationProvider` inside the query provider

**Reuse rather than rebuild:** `LeaderAvatar` and `getLeaderImage` (the player's chosen printing is what the result card shows), `ShareDialog` + `TournamentShareCard` for the brag loop off the milestone card, `Segmented`, `tw-animate-css`, and the `useIsMounted` + derived-state rule used by `recent-leaders` and `last-tournament-type`.

---

## Accessibility and edge cases

- **Reduced motion** degrades the card flip to a static card and sets numbers instantly. The guard already exists at `globals.css:163`; it must wrap every new keyframe.
- **Offline** is the normal case, not an edge case: everything above is client-derived, so the celebration is identical with no connection.
- **A queued round that the server later rejects** must not leave a celebrated achievement standing. The server response reconciles; the client treats its own evaluation as optimistic.
- **First run** — a brand-new account has no history, so the first log must feel like the biggest one. `first_blood` fires on it.
- **Deleting a round** may un-earn an achievement. Never un-celebrate or claw back visibly; the grid simply reflects truth on next read.

## Verification

1. `npm test` — unit tests for `xpFor`, `levelFor`, `weekStreak` (including a broken streak and a week boundary), `nextPayoff`, and the **server/client `Ctx` parity test**.
2. `npx tsc --noEmit`, `npm run lint`, `npm run build`.
3. Browser, against the seeded test database with `DATABASE_URL` overridden to `DATABASE_URL_TEST` (never `.env.local`'s production URL):
   - log a routine round → no overlay, record counts up, round row appears
   - log the round that crosses an achievement → card moment fires **on the logging screen**, not on Achievements
   - reload → level, XP and streak persist and agree with the server
   - `prefers-reduced-motion: reduce` → no flip, numbers still correct
   - Profile renders level, streak and achievements; the bottom bar still has four tabs
4. Migration: **none.** No schema change in this plan.

## Deliberately not doing

- **Sound**, per the decision above.
- **Stored XP columns.** Derived values cannot drift from the history they describe.
- **Daily streaks.** They punish the real cadence of the game.
- **Leaderboards or anything social.** No accounts model for it, and it would need a privacy decision the product has not made.
