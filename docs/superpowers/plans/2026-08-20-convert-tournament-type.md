# Convert Tournament Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a tournament be converted into a freeplay session and — when it is lossless — back again.

**Architecture:** One service function performs the reshape that migration `0011` already performs in SQL: the leader moves between the session row and its rounds as the type crosses the freeplay boundary. It is a distinct operation rather than a widening of `updateTournament`, which keeps rejecting cross-segment type changes. A new API route, outbox op and confirm sheet carry it to the UI on the same rails as Finish and Reopen.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle/Postgres, Zod, Vitest, Tailwind, base-ui/shadcn, TanStack Query + a localStorage outbox.

**Spec:** `docs/superpowers/specs/2026-08-20-convert-tournament-type-design.md`

## Global Constraints

- `npm test`, `npx tsc --noEmit` and `npm run lint` clean at every commit.
- Comments explain WHY, not what — match the surrounding code.
- DB-backed tests use `DATABASE_URL_TEST`; `npm test` migrates it automatically. `.env.local`'s `DATABASE_URL` is PRODUCTION — never touch it.
- Byes and no-shows never carry a leader, in either segment.
- `updateTournament`'s cross-segment rejection at `services/tournaments.ts:97` stays exactly as it is.

---

### Task 1: The conversion service

**Files:**
- Modify: `src/services/tournaments.ts`
- Modify: `src/lib/validation/tournament.ts`
- Test: `src/services/convert-type.test.ts` (create)

**Interfaces:**
- Consumes: `isFreeplay`, `FREEPLAY_TYPES` from `lib/tournament-kinds`; `computeDeckCount` from `lib/record`.
- Produces:
  - `convertTournamentSchema` in `lib/validation/tournament.ts`: `z.object({ type: tournamentTypeEnum, myLeaderId: z.uuid().optional() })`, exported with `export type ConvertTournamentInput = z.infer<...>`.
  - `convertTournamentType(db, ownerId, id, input: ConvertTournamentInput): Promise<Tournament>` in `services/tournaments.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/services/convert-type.test.ts`. Follow the harness used by `src/services/tournaments.test.ts` — read it first for `getTestDb` / `resetDb` / `closeTestDb` / `seedReferenceData` usage.

Cover exactly these cases:

```ts
describe('converting a tournament into a session', () => {
  it('moves the leader down onto the games and off the session');
  it('leaves byes and no-shows without a leader');
  it('keeps placement, field size, name, notes, meta and date');
  it('converts a locked tournament and leaves it locked');
});

describe('converting a session into a tournament', () => {
  it('promotes the single deck onto the session and clears the rounds');
  it('refuses a session that played two or more decks');
  it('takes the leader it is given when the session has no rounds');
  it('refuses a session with no rounds and no leader offered');
});

describe('either direction', () => {
  it('round-trips a tournament unchanged', /* convert away and back; every column equal to the start */);
  it('refuses another owner');
  it('refuses a match');
  it('is a no-op when the type does not cross the boundary');
});
```

The round-trip test is the load-bearing one: build a tournament with a leader, a placement, a field size and three rounds (two games and a bye), convert to `freeplay_gauntlet`, convert back to its original type, and assert every tournament column and every round's `myLeaderId` matches the starting state.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/services/convert-type.test.ts`
Expected: FAIL — `convertTournamentType` is not exported.

- [ ] **Step 3: Add the validation schema**

In `src/lib/validation/tournament.ts`, after `updateTournamentSchema`:

```ts
/**
 * A conversion is its own input, not a patch: it carries only the destination
 * type and — for a session with no rounds to promote a leader from — the leader
 * the tournament will own. Everything else about the row is preserved.
 */
export const convertTournamentSchema = z.object({
  type: tournamentTypeEnum,
  myLeaderId: z.uuid().optional(),
});

export type ConvertTournamentInput = z.infer<typeof convertTournamentSchema>;
```

- [ ] **Step 4: Implement the service**

In `src/services/tournaments.ts`, after `updateTournament`. Import `computeDeckCount` from `../lib/record` and `MATCH_TYPE` from `../lib/tournament-kinds` if not already imported.

```ts
/**
 * Moves an event across the freeplay boundary, carrying its leader with it.
 *
 * This is the reshape migration 0011 performs in SQL, as an action: a
 * tournament owns one leader for the whole event, a session owns one per round,
 * and changing the type without moving the leader would leave the row in a
 * shape no query can read. That is why `updateTournament` refuses the same
 * change — a field edit must not silently rewrite two tables.
 *
 * The reverse direction is only offered when it is lossless. Two different
 * decks cannot collapse into one leader without discarding what was played, so
 * the caller is refused rather than asked to choose which round to lose.
 */
export async function convertTournamentType(
  db: DB, ownerId: string, id: string, input: ConvertTournamentInput,
): Promise<Tournament> {
  const current = await requireOwned(db, ownerId, id);
  if (current.type === MATCH_TYPE || input.type === MATCH_TYPE) {
    throw new ValidationError('A match cannot be converted.');
  }
  // Not a conversion at all — the caller wants updateTournament.
  if (isFreeplay(input.type) === isFreeplay(current.type)) {
    throw new ValidationError('That type is already on the same side of freeplay.');
  }

  const rs = await db.select().from(rounds).where(eq(rounds.tournamentId, id));
  // Byes and no-shows are not games and carry no leader in either segment.
  const games = rs.filter((r) => r.kind !== 'bye' && r.kind !== 'no_show');
  const patch: Partial<typeof tournaments.$inferInsert> = { type: input.type, updatedAt: new Date() };

  if (isFreeplay(input.type)) {
    // Down onto the games, off the session.
    if (current.myLeaderId) {
      const leaderId = current.myLeaderId;
      await Promise.all(games
        .filter((r) => r.myLeaderId === null)
        .map((r) => db.update(rounds).set({ myLeaderId: leaderId, updatedAt: new Date() }).where(eq(rounds.id, r.id))));
    }
    patch.myLeaderId = null;
  } else {
    const decks = computeDeckCount(games);
    if (decks > 1) {
      throw new ValidationError('This session played more than one deck, so it cannot become a tournament.');
    }
    const promoted = games.find((r) => r.myLeaderId !== null)?.myLeaderId ?? input.myLeaderId ?? null;
    if (!promoted) throw new ValidationError('Choose the leader this tournament was played with.');
    patch.myLeaderId = promoted;
    await Promise.all(games
      .filter((r) => r.myLeaderId !== null)
      .map((r) => db.update(rounds).set({ myLeaderId: null, updatedAt: new Date() }).where(eq(rounds.id, r.id))));
  }

  const [row] = await db.update(tournaments).set(patch).where(owned(id, ownerId)).returning();
  return row;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/services/convert-type.test.ts`
Expected: PASS, every case.

- [ ] **Step 6: Full suite and commit**

Run: `npm test && npx tsc --noEmit && npm run lint`

```bash
git add src/services/tournaments.ts src/lib/validation/tournament.ts src/services/convert-type.test.ts
git commit -m "feat(convert): move an event across the freeplay boundary, leader and all"
```

---

### Task 2: The route, the client and the queue

**Files:**
- Create: `src/app/api/tournaments/[id]/convert/route.ts`
- Modify: `src/lib/api-client.ts`
- Modify: `src/lib/outbox/types.ts`
- Modify: `src/lib/outbox/flush.ts`
- Modify: `src/lib/outbox/coalesce.ts`
- Modify: `src/components/query-hooks.ts`
- Test: `src/lib/outbox/coalesce.test.ts`

**Interfaces:**
- Consumes: `convertTournamentType`, `convertTournamentSchema` from Task 1.
- Produces:
  - `OutboxOp` gains `| { kind: 'tournament.convert'; tournamentId: string; payload: ConvertTournamentInput }`
  - `apiClient.convertTournament(id, payload)`
  - `useTournamentWrites().convert(id, payload)`

- [ ] **Step 1: Write the failing coalesce test**

In `src/lib/outbox/coalesce.test.ts`, add a case asserting consecutive converts of the same tournament collapse to the last one, and that a convert for a *different* tournament is left alone. Model it on the existing finish/reopen cases in that file.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/outbox/coalesce.test.ts`

- [ ] **Step 3: The route**

Create `src/app/api/tournaments/[id]/convert/route.ts`, copying the shape of the sibling `finish/route.ts` exactly:

```ts
import { db } from '@/db/client';
import { requireUserId, errorToResponse, json } from '@/lib/api/handler';
import { convertTournamentType } from '@/services/tournaments';
import { convertTournamentSchema } from '@/lib/validation/tournament';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const input = convertTournamentSchema.parse(await req.json());
    return json(await convertTournamentType(db, userId, id, input));
  } catch (err) {
    return errorToResponse(err);
  }
}
```

- [ ] **Step 4: Client, op type and flush**

- `api-client.ts`: `convertTournament: (id: string, payload: ConvertTournamentInput) => request<TournamentSummaryDTO>(\`/api/tournaments/${id}/convert\`, { method: 'POST', body: JSON.stringify(payload) })` — match how the other body-carrying calls in that file are written.
- `outbox/types.ts`: add the op to the union, beside the other tournament ops.
- `outbox/flush.ts`: `case 'tournament.convert': return apiClient.convertTournament(op.tournamentId, op.payload);`
- `outbox/coalesce.ts`: add `case 'tournament.convert':` collapsing earlier converts for the same tournament, mirroring the `isStatusOp` treatment of finish/reopen. Write a WHY comment: only the final destination type matters.

- [ ] **Step 5: The write hook**

In `src/components/query-hooks.ts`, add to `useTournamentWrites`:

```ts
  const convert = useCallback(
    (id: string, payload: ConvertTournamentInput) => {
      // The card must change segment on the tap, not on the flush. The rounds'
      // leaders move too, but the list only reads the tournament row, so the
      // detail view reconciles on the next fetch.
      cache.patchTournament(qc, id, {
        type: payload.type,
        myLeaderId: isFreeplay(payload.type) ? null : (payload.myLeaderId ?? null),
      });
      push({ kind: 'tournament.convert', tournamentId: id, payload });
    },
    [qc, push]
  );
```

Add `convert` to the returned object and its dependency array.

- [ ] **Step 6: Verify and commit**

Run: `npm test && npx tsc --noEmit && npm run lint`

```bash
git add src/app/api src/lib/api-client.ts src/lib/outbox src/components/query-hooks.ts
git commit -m "feat(convert): carry a conversion over the same rails as finish"
```

---

### Task 3: The confirm sheet

**Files:**
- Create: `src/components/tournaments/convert-sheet.tsx`
- Modify: `src/components/tournaments/card-actions-sheet.tsx`

**Interfaces:**
- Consumes: `useTournamentWrites().convert` from Task 2; `FREEPLAY_TYPES` / `TOURNAMENT_TYPES`; `computeDeckCount`; `LeaderPicker`; `tournamentTypeLabel`.
- Produces: `ConvertSheet` — props `{ open, onOpenChange, tournament, onConverted }`.

- [ ] **Step 1: Build the sheet**

A confirm step, not a form. It shows:

- a title naming the direction — "Convert to a session?" / "Convert to a tournament?"
- the consequence in one sentence: going to a session, "This moves it out of your competitive record — it won't count toward your win rate, tournament count or achievements."; coming back, the same sentence inverted to "into".
- the destination type strip: `FREEPLAY_TYPES` one way, `TOURNAMENT_TYPES` the other. Reuse the chip markup and ARIA from `tournament-form.tsx`'s Type strip — `role="radiogroup"` / `role="radio"` / `aria-checked`, `min-h-11`, the same selected/unselected classes. Default the selection to the first chip.
- a `LeaderPicker`, **only** when converting a session with zero decks, since the tournament needs a leader. Read how `tournament-form.tsx` passes `options`, `value`, `onChange`, `suggested` and `recentKey` and follow it.
- the confirm button, disabled while a leader is required and unpicked.

Use the same `Sheet` primitives `card-actions-sheet.tsx` already uses so the two read as one surface.

- [ ] **Step 2: Wire it into the action sheet**

In `card-actions-sheet.tsx`, add a `convert` action to the `actions` array, between `share` and the finish/reopen entry.

Availability, which is the substance of this step:

- absent when `isMatch` — a match cannot be converted
- when the row is a tournament: always offered, label "Convert to session", icon `Shuffle`
- when the row is a session: offered **only** when `computeDeckCount(rounds) <= 1`, label "Convert to tournament", icon `Trophy`

The list's `TournamentSummaryDTO` already carries `deckCount`, so no extra fetch is needed — use it rather than loading rounds. Follow the existing pattern at line 76: a door that cannot open is not shown.

Running the action closes the action sheet and opens `ConvertSheet`.

- [ ] **Step 3: Verify in the browser**

A dev server may already be running on http://localhost:3100 against the TEST database — check before starting one, and never point a server at `.env.local`'s `DATABASE_URL`.

Seed a tournament with a leader and rounds, plus a one-deck session and a multi-deck session. Then, driving playwright directly (copy the Clerk ticket sign-in out of `scripts/screenshot.mjs`; `npm run shot` cannot click):

- long-press a tournament card → "Convert to session" is present → convert to Gauntlet → the card moves to the Freeplay tab with a target glyph, and each round now shows the leader
- long-press that converted session → "Convert to tournament" is present → convert back → the card returns to Tournaments with its leader and placement intact
- long-press a multi-deck session → "Convert to tournament" is **absent**
- long-press a match → neither action is present

Read the screenshots back and look at them. Delete any temporary script when done.

- [ ] **Step 4: Verify and commit**

Run: `npm test && npx tsc --noEmit && npm run lint`

```bash
git add src/components/tournaments/convert-sheet.tsx src/components/tournaments/card-actions-sheet.tsx
git commit -m "feat(convert): offer the conversion where the other card actions live"
```

---

### Task 4: Ship

**Files:** none.

- [ ] **Step 1:** `npm test && npm run lint && npm run build` — all clean.
- [ ] **Step 2:** No migration in this branch, so there is nothing to apply before the push. Confirm with `git diff main --stat -- drizzle/` that it is empty.
- [ ] **Step 3:** Merge to `main` and push. Vercel deploys from `main`.
- [ ] **Step 4:** Verify the deployed build: the action appears in the sheet, and a conversion round-trips.

---

## Self-Review

**Spec coverage.** The transform and both guards → Task 1. Placement preservation and locked-stays-locked → Task 1's tests. Route, outbox op, optimistic patch → Task 2. Confirm sheet, warning sentence, type strip, zero-deck leader picker, availability rules → Task 3. Ship → Task 4.

**Placeholders.** None: every step names its files and shows its code or states the exact rule to implement.

**Type consistency.** `ConvertTournamentInput` is defined in Task 1 and consumed by name in Tasks 2 and 3. `convertTournamentType` keeps one signature throughout. `apiClient.convertTournament` and the `tournament.convert` op kind are spelled identically in flush, coalesce and the hook.
