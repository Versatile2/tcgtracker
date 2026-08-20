# Freeplay Types and Type Glyphs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Widen the freeplay strip from two types to eight, move Testing out of the competitive record, and give every type in the app an icon.

**Architecture:** The type system already separates *what was played* (the type) from *where it lives* (`FREEPLAY_TYPES`), and derives casual-vs-competitive from the latter. Adding types is therefore additive: new enum values plus list membership, and every statistic follows. The glyph work introduces one lookup (`TYPE_ICONS`) and two small components (`TypeBadge`, `TypeGlyph`) that replace markup currently duplicated across four files.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle ORM + Postgres (Neon), Zod, Vitest, Tailwind, shadcn/base-ui, lucide-react.

**Spec:** `docs/superpowers/specs/2026-08-20-freeplay-types-design.md`

## Global Constraints

- localStorage keys use the `crewstat-` prefix, fixed by PRODUCT.md.
- `TOURNAMENT_TYPE_LABELS` and `TYPE_ICONS` are `Record<TournamentType, …>`: a missing entry is a compile error, and that is deliberate.
- Tests run with `npm test` (vitest). DB-backed suites use `DATABASE_URL_TEST`; migrations are applied to it automatically by `tests/setup/global-setup.ts`.
- `.env.local`'s `DATABASE_URL` points at **production** Neon. `npm run db:migrate` therefore migrates prod. Production migrates *before* the code is pushed.
- Freeplay strip order is fixed: Freeplay · Ranked Simulator · Casual Simulator · Friend Battle · Locals Pickup · Gauntlet · Testing · Teaching Game.
- Every commit leaves `npm test` green.

---

### Task 1: The type set

Five new enum values, and `testing` changes segment.

**Files:**
- Modify: `src/db/schema.ts:7-10`
- Modify: `src/lib/dto.ts:18`
- Modify: `src/lib/validation/tournament.ts:4-17`
- Modify: `src/lib/labels.ts:3-16`
- Modify: `src/lib/tournament-kinds.ts:12,43-45`
- Test: `src/lib/tournament-kinds.test.ts`
- Create: `drizzle/0010_*.sql` (generated)

**Interfaces:**
- Consumes: nothing.
- Produces: `TournamentType` gains `'freeplay_sim_casual' | 'freeplay_friend' | 'freeplay_locals' | 'freeplay_gauntlet' | 'freeplay_teaching'`. `FREEPLAY_TYPES` becomes the eight-item ordered list above. `TOURNAMENT_TYPES` becomes six items, without `'testing'`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/tournament-kinds.test.ts`, inside the existing `describe('tournament kinds', …)` block:

```ts
  it('puts every new session flavour in the freeplay segment', () => {
    const added: TournamentType[] = [
      'freeplay_sim_casual', 'freeplay_friend', 'freeplay_locals', 'freeplay_gauntlet', 'freeplay_teaching',
    ];
    for (const t of added) {
      expect(isFreeplay(t)).toBe(true);
      expect(CASUAL_TYPES).toContain(t);
      expect(TOURNAMENT_TYPES).not.toContain(t);
    }
  });

  it('moves testing out of the competitive record', () => {
    // Testing was always testing; the tournament segment only ever gave it a
    // leader it did not need.
    expect(isFreeplay('testing')).toBe(true);
    expect(CASUAL_TYPES).toContain('testing');
    expect(TOURNAMENT_TYPES).not.toContain('testing');
  });

  it('offers the freeplay strip in the order the product fixes', () => {
    expect(FREEPLAY_TYPES).toEqual([
      'freeplay', 'freeplay_sim', 'freeplay_sim_casual', 'freeplay_friend',
      'freeplay_locals', 'freeplay_gauntlet', 'testing', 'freeplay_teaching',
    ]);
  });
```

Add the type-only import at the top of the file, after the existing import:

```ts
import type { TournamentType } from './dto';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/tournament-kinds.test.ts`
Expected: FAIL — TypeScript rejects `'freeplay_sim_casual'` as a `TournamentType`, and `isFreeplay('testing')` returns `false`.

- [ ] **Step 3: Add the values to the database enum**

In `src/db/schema.ts`, replace the `tournamentType` enum:

```ts
export const tournamentType = pgEnum('tournament_type', [
  'local', 'treasure_cup', 'regionals', 'extra_grand_battle', 'pirates_party', 'testing', 'freeplay', 'match',
  'ranked_sim', 'freeplay_sim',
  'freeplay_sim_casual', 'freeplay_friend', 'freeplay_locals', 'freeplay_gauntlet', 'freeplay_teaching',
]);
```

Order here is append-only on purpose: `ALTER TYPE … ADD VALUE` appends, and reordering the literal would make drizzle generate a spurious diff.

- [ ] **Step 4: Widen the DTO union**

In `src/lib/dto.ts`, replace line 18:

```ts
export type TournamentType = 'local' | 'treasure_cup' | 'regionals' | 'extra_grand_battle' | 'pirates_party' | 'testing' | 'ranked_sim' | 'freeplay' | 'freeplay_sim' | 'freeplay_sim_casual' | 'freeplay_friend' | 'freeplay_locals' | 'freeplay_gauntlet' | 'freeplay_teaching' | 'match';
```

- [ ] **Step 5: Widen the Zod enum**

In `src/lib/validation/tournament.ts`, replace the `tournamentTypeEnum` declaration:

```ts
export const tournamentTypeEnum = z.enum([
  'local',
  'treasure_cup',
  'regionals',
  'extra_grand_battle',
  'pirates_party',
  // Deck testing. A freeplay-segment type: it records a leader per round, and
  // it has never belonged in the competitive record.
  'testing',
  // Ranked play on the simulator, logged as an event.
  'ranked_sim',
  'freeplay',
  // The same simulator games logged as a casual session instead.
  'freeplay_sim',
  'freeplay_sim_casual',
  'freeplay_friend',
  'freeplay_locals',
  'freeplay_gauntlet',
  'freeplay_teaching',
  'match',
]);
```

- [ ] **Step 6: Add the labels**

In `src/lib/labels.ts`, add to `TOURNAMENT_TYPE_LABELS` after the `freeplay_sim` entry:

```ts
  freeplay_sim_casual: 'Casual Simulator',
  freeplay_friend: 'Friend Battle',
  freeplay_locals: 'Locals Pickup',
  freeplay_gauntlet: 'Gauntlet',
  freeplay_teaching: 'Teaching Game',
```

- [ ] **Step 7: Move the lists**

In `src/lib/tournament-kinds.ts`, replace `FREEPLAY_TYPES` (line 12) with the ordered eight, and `TOURNAMENT_TYPES` (lines 43-45) with the remaining six:

```ts
export const FREEPLAY_TYPES: TournamentType[] = [
  'freeplay', 'freeplay_sim', 'freeplay_sim_casual', 'freeplay_friend',
  'freeplay_locals', 'freeplay_gauntlet', 'testing', 'freeplay_teaching',
];
```

```ts
/** Offered when creating a tournament, in the order the strip reads. */
export const TOURNAMENT_TYPES: TournamentType[] = [
  'local', 'treasure_cup', 'regionals', 'extra_grand_battle', 'pirates_party', 'ranked_sim',
];
```

Then extend the `FREEPLAY_TYPES` doc comment (lines 3-11) with a sentence recording why `testing` sits there:

```ts
 * `testing` lives here too. It was offered as a tournament type for as long as
 * freeplay was a single option, which forced a deck-testing night to declare
 * one leader and put it in the competitive record. It is a session.
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/lib/tournament-kinds.test.ts`
Expected: PASS, all cases including the pre-existing ones.

- [ ] **Step 9: Generate the schema migration**

Run: `npm run db:generate`
Expected: a new `drizzle/0010_<slug>.sql` containing five `ALTER TYPE "public"."tournament_type" ADD VALUE …` statements, and an updated `drizzle/meta/_journal.json`. Open the file and confirm it contains exactly those five statements and no table changes.

- [ ] **Step 10: Run the whole suite**

Run: `npm test`
Expected: PASS. The migration is applied to the test database by the global setup, so the new values exist there.

- [ ] **Step 11: Commit**

```bash
git add src/db/schema.ts src/lib/dto.ts src/lib/validation/tournament.ts src/lib/labels.ts src/lib/tournament-kinds.ts src/lib/tournament-kinds.test.ts drizzle/
git commit -m "feat(types): five more ways to log a session, and testing becomes one"
```

---

### Task 2: Reshape the Testing history

`isFreeplay('testing')` is now true, so every Testing tournament already in the database has the wrong shape: a leader on the session, and rounds with none. This migration reshapes them.

**Files:**
- Create: `drizzle/0011_testing_to_freeplay.sql` (generated as a custom migration)
- Test: `src/services/testing-migration.test.ts`

**Interfaces:**
- Consumes: `FREEPLAY_TYPES` including `'testing'` from Task 1.
- Produces: no code interface. After this runs, no `tournaments` row of type `testing` has a `my_leader_id`, and each of its non-bye rounds has one.

- [ ] **Step 1: Create the empty custom migration**

Run: `npx drizzle-kit generate --custom --name=testing_to_freeplay`
Expected: an empty `drizzle/0011_testing_to_freeplay.sql` and a new journal entry.

- [ ] **Step 2: Write the failing test**

Create `src/services/testing-migration.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../tests/setup/db';
import { seedReferenceData } from '../db/seed';
import { leaders, tournaments, rounds } from '../db/schema';

const db = getTestDb();
const USER = 'user_migration';

/*
 * The migration is exercised against data shaped the way the old code wrote it:
 * a Testing tournament holding one leader for the whole event, and rounds
 * holding none. Reading the shipped .sql rather than restating it keeps this
 * test honest — an edit to the migration that breaks the reshape fails here.
 */
async function runMigration() {
  const sql = readFileSync('./drizzle/0011_testing_to_freeplay.sql', 'utf8');
  for (const statement of sql.split('--> statement-breakpoint')) {
    const trimmed = statement.trim();
    if (trimmed) await db.execute(trimmed);
  }
}

describe('testing tournaments become freeplay sessions', () => {
  beforeEach(async () => {
    await resetDb();
    await seedReferenceData(db);
  });
  afterAll(closeTestDb);

  it('carries the session leader down onto the rounds and clears it', async () => {
    const [myLeader, opponent] = await db.select().from(leaders).orderBy(asc(leaders.setCode)).limit(2);
    const tournamentId = randomUUID();
    await db.insert(tournaments).values({
      id: tournamentId, ownerId: USER, type: 'testing',
      myLeaderId: myLeader.id, playedOn: '2026-08-01',
    });
    await db.insert(rounds).values([
      { tournamentId, roundNumber: 1, kind: 'swiss', opponentLeaderId: opponent.id, result: 'win' },
      { tournamentId, roundNumber: 2, kind: 'bye', result: 'win' },
    ]);

    await runMigration();

    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
    expect(t.myLeaderId).toBeNull();

    const rows = await db.select().from(rounds)
      .where(eq(rounds.tournamentId, tournamentId)).orderBy(asc(rounds.roundNumber));
    expect(rows[0].myLeaderId).toBe(myLeader.id);
    // A bye is not a game and carries no leader in either segment.
    expect(rows[1].myLeaderId).toBeNull();
  });

  it('leaves other types alone', async () => {
    const [myLeader] = await db.select().from(leaders).orderBy(asc(leaders.setCode)).limit(1);
    const tournamentId = randomUUID();
    await db.insert(tournaments).values({
      id: tournamentId, ownerId: USER, type: 'regionals',
      myLeaderId: myLeader.id, playedOn: '2026-08-01',
    });

    await runMigration();

    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
    expect(t.myLeaderId).toBe(myLeader.id);
  });

  it('is safe to run twice', async () => {
    const [myLeader, opponent] = await db.select().from(leaders).orderBy(asc(leaders.setCode)).limit(2);
    const tournamentId = randomUUID();
    await db.insert(tournaments).values({
      id: tournamentId, ownerId: USER, type: 'testing',
      myLeaderId: myLeader.id, playedOn: '2026-08-01',
    });
    await db.insert(rounds).values(
      { tournamentId, roundNumber: 1, kind: 'swiss', opponentLeaderId: opponent.id, result: 'win' },
    );

    await runMigration();
    await runMigration();

    const rows = await db.select().from(rounds).where(eq(rounds.tournamentId, tournamentId));
    expect(rows[0].myLeaderId).toBe(myLeader.id);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/services/testing-migration.test.ts`
Expected: FAIL — the migration file is empty, so `t.myLeaderId` is still the leader id and `rows[0].myLeaderId` is null.

- [ ] **Step 4: Write the migration**

Put this in `drizzle/0011_testing_to_freeplay.sql`:

```sql
-- Testing moved from the tournament segment to the freeplay segment, where the
-- leader is recorded per round rather than once for the session. Reshape the
-- rows written under the old rule so they render and count correctly.
UPDATE "rounds" r
   SET "my_leader_id" = t."my_leader_id"
  FROM "tournaments" t
 WHERE r."tournament_id" = t."id"
   AND t."type" = 'testing'
   AND t."my_leader_id" IS NOT NULL
   AND r."my_leader_id" IS NULL
   AND r."round_kind" NOT IN ('bye', 'no_show');
--> statement-breakpoint
UPDATE "tournaments" SET "my_leader_id" = NULL WHERE "type" = 'testing';
```

Both statements are idempotent: the first matches only rounds that still lack a leader, and the second is a no-op once the column is null.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/services/testing-migration.test.ts`
Expected: PASS, all three cases.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add drizzle/ src/services/testing-migration.test.ts
git commit -m "feat(migration): reshape testing tournaments into sessions"
```

---

### Task 3: Remember the last type per segment

**Files:**
- Rename: `src/lib/last-tournament-type.ts` → `src/lib/last-type.ts`
- Rename: `src/lib/last-tournament-type.test.ts` → `src/lib/last-type.test.ts`
- Modify: `src/components/tournaments/tournament-form.tsx:15` (import only; behaviour is Task 4)

**Interfaces:**
- Consumes: `TournamentType` from Task 1.
- Produces:
  - `export type TypeSegment = 'tournament' | 'freeplay'`
  - `export function lastType(segment: TypeSegment): TournamentType | null`
  - `export function rememberType(segment: TypeSegment, type: TournamentType): void`
  - `export function orderTypes(types: TournamentType[], lead: TournamentType | null): TournamentType[]` — unchanged.

- [ ] **Step 1: Rename both files with git**

```bash
git mv src/lib/last-tournament-type.ts src/lib/last-type.ts
git mv src/lib/last-tournament-type.test.ts src/lib/last-type.test.ts
```

- [ ] **Step 2: Write the failing tests**

Replace the whole contents of `src/lib/last-type.test.ts`:

```ts
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { lastType, rememberType, orderTypes } from './last-type';
import type { TournamentType } from './dto';

const TYPES: TournamentType[] = ['local', 'treasure_cup', 'regionals', 'extra_grand_battle', 'pirates_party', 'ranked_sim'];

beforeEach(() => window.localStorage.clear());

describe('the last type', () => {
  it('is null before anything is created', () => {
    expect(lastType('tournament')).toBeNull();
    expect(lastType('freeplay')).toBeNull();
  });

  it('remembers the most recent one', () => {
    rememberType('tournament', 'regionals');
    expect(lastType('tournament')).toBe('regionals');
    rememberType('tournament', 'local');
    expect(lastType('tournament')).toBe('local');
  });

  it('keeps the two segments apart', () => {
    // A Regional logged last week must not open the session form on Ranked
    // Simulator, and a gauntlet must not lead the tournament strip.
    rememberType('tournament', 'regionals');
    rememberType('freeplay', 'freeplay_gauntlet');
    expect(lastType('tournament')).toBe('regionals');
    expect(lastType('freeplay')).toBe('freeplay_gauntlet');
  });

  it('uses the crewstat- prefix the product fixes', () => {
    rememberType('tournament', 'local');
    rememberType('freeplay', 'freeplay_friend');
    expect(window.localStorage.getItem('crewstat-last-tournament-type')).toBe('local');
    expect(window.localStorage.getItem('crewstat-last-freeplay-type')).toBe('freeplay_friend');
  });
});

describe('orderTypes', () => {
  it('leaves the order alone when nothing is remembered', () => {
    expect(orderTypes(TYPES, null)).toEqual(TYPES);
  });

  it('leads with the remembered type, keeping the rest in order', () => {
    expect(orderTypes(TYPES, 'regionals'))
      .toEqual(['regionals', 'local', 'treasure_cup', 'extra_grand_battle', 'pirates_party', 'ranked_sim']);
  });

  it('is a no-op when the remembered type already leads', () => {
    expect(orderTypes(TYPES, 'local')).toEqual(TYPES);
  });

  it('ignores a type that is no longer offered', () => {
    // Testing was a tournament type until it moved to the freeplay segment; a
    // player who created one last must not get an empty lead chip.
    expect(orderTypes(TYPES, 'testing')).toEqual(TYPES);
    expect(orderTypes(TYPES, 'freeplay')).toEqual(TYPES);
    expect(orderTypes(TYPES, 'match')).toEqual(TYPES);
  });

  it('never drops or duplicates a type', () => {
    const out = orderTypes(TYPES, 'pirates_party');
    expect(out).toHaveLength(TYPES.length);
    expect(new Set(out).size).toBe(TYPES.length);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/last-type.test.ts`
Expected: FAIL — `lastType` and `rememberType` are not exported from `./last-type`.

- [ ] **Step 4: Rewrite the module**

Replace the contents of `src/lib/last-type.ts` above `orderTypes` (keep `orderTypes` exactly as it is, adjusting only the parenthetical in its doc comment from "freeplay, once it moved to its own tab" to "testing, once it moved to the freeplay segment"):

```ts
import type { TournamentType } from './dto';

/** The two strips that remember what you picked last. */
export type TypeSegment = 'tournament' | 'freeplay';

/**
 * The type you last created, per segment. Players run the same kind of thing
 * over and over — a season of locals, a month of gauntlets — so the last one is
 * a far better default than always starting at the head of the list.
 *
 * Two keys rather than one because the segments have nothing to say to each
 * other: a Regional logged last week must not open the session form on Ranked
 * Simulator. That used to be prevented by refusing to remember anything on the
 * freeplay side at all, which was fine at two options and useless at eight.
 *
 * Local, like the recent-leaders list, and for the same reasons: no round trip,
 * works with no signal, and it is a preference about this device rather than
 * data worth a column.
 *
 * The `crewstat-` prefix is fixed by PRODUCT.md.
 */
const KEYS: Record<TypeSegment, string> = {
  tournament: 'crewstat-last-tournament-type',
  freeplay: 'crewstat-last-freeplay-type',
};

/** Null when nothing is remembered, or when storage is unreadable. */
export function lastType(segment: TypeSegment): TournamentType | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEYS[segment]);
    return raw ? (raw as TournamentType) : null;
  } catch {
    // Reading storage can itself throw in a locked-down or private-mode browser.
    return null;
  }
}

export function rememberType(segment: TypeSegment, type: TournamentType): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEYS[segment], type);
  } catch {
    // A full or blocked store costs the shortcut, never the tournament.
  }
}
```

- [ ] **Step 5: Fix the import in the form**

In `src/components/tournaments/tournament-form.tsx`, replace line 15:

```ts
import { lastType, rememberType, orderTypes } from '@/lib/last-type';
```

Then update the two call sites so the file compiles — the behaviour change comes in Task 4:

- line 92: `const lastTypeValue = useMemo(() => (mounted && !editing ? lastType('tournament') : null), [mounted, editing]);` and rename its use on line 98 to `lastTypeValue`.
- line 129: `if (!freeplayMode) rememberType('tournament', type);`

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/lib/last-type.test.ts && npx tsc --noEmit`
Expected: PASS, and no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/last-type.ts src/lib/last-type.test.ts src/components/tournaments/tournament-form.tsx
git commit -m "refactor(types): remember the last type per segment, not per app"
```

---

### Task 4: The form opens on what you last logged

**Files:**
- Modify: `src/components/tournaments/tournament-form.tsx:87-101,129`

**Interfaces:**
- Consumes: `lastType`, `rememberType`, `orderTypes`, `TypeSegment` from Task 3; `FREEPLAY_TYPES`, `TOURNAMENT_TYPES` from Task 1.
- Produces: no new exports.

- [ ] **Step 1: Replace the ordering block**

In `src/components/tournaments/tournament-form.tsx`, replace lines 87-101 (the comment, `lastTypeValue`, `offered`, `orderedTypes`, `type`) with:

```tsx
  /*
   * Open on the type you last logged, and lead the strip with it. Same rule as
   * the leader default: derived, not stored, so a pick simply takes precedence
   * and there is no effect to sequence against.
   *
   * Per segment, because the two have nothing to say to each other. A Regional
   * logged last week must not open the session form on Ranked Simulator — which
   * is why this used to skip the reordering on the freeplay side entirely. At
   * eight session types, always landing on plain Freeplay costs a scroll and a
   * tap for every gauntlet and every ladder night.
   */
  const segment: TypeSegment = freeplayMode ? 'freeplay' : 'tournament';
  const remembered = useMemo(
    () => (mounted && !editing ? lastType(segment) : null),
    [mounted, editing, segment],
  );
  const offered = freeplayMode ? FREEPLAY_TYPES : TOURNAMENT_TYPES;
  const orderedTypes = useMemo(() => orderTypes(offered, remembered), [offered, remembered]);
  const type: TournamentType = pickedType ?? orderedTypes[0];
```

Add `TypeSegment` to the Task 3 import:

```ts
import { lastType, rememberType, orderTypes, type TypeSegment } from '@/lib/last-type';
```

- [ ] **Step 2: Remember on create, in both segments**

Replace line 129 (`if (!freeplayMode) rememberType('tournament', type);`) with:

```tsx
    rememberType(segment, type);
```

The comment two lines above it already explains why editing does not move the remembered type; leave it.

- [ ] **Step 3: Update the strip comment**

In the `Type` block (around line 166), replace the last paragraph of the comment — "Freeplay gets the same strip with its own two options…" — with:

```tsx
              Freeplay gets the same strip with its own eight options, so a
              gauntlet is chosen exactly the way a Regional is. */}
```

- [ ] **Step 4: Verify it compiles and the suite is green**

Run: `npx tsc --noEmit && npm test`
Expected: PASS, no type errors.

- [ ] **Step 5: Check it in the browser**

Run: `npm run dev` in one shell, then `npm run shot` per the project's screenshot workflow, targeting `/freeplay/new`.
Expected: eight chips in the strip, Freeplay leading on a fresh device. Create a Gauntlet session, return to `/freeplay/new`, and confirm Gauntlet now leads. Then open `/tournaments/new` and confirm it still leads with the last *tournament* type and shows six chips with no Testing.

- [ ] **Step 6: Commit**

```bash
git add src/components/tournaments/tournament-form.tsx
git commit -m "feat(freeplay): open the strip on the session type you last logged"
```

---

### Task 5: An icon for every type

**Files:**
- Create: `src/lib/type-glyph.ts`
- Create: `src/lib/type-glyph.test.ts`
- Rename: `src/components/tournaments/freeplay-glyph.tsx` → `src/components/tournaments/type-glyph.tsx`
- Modify: `src/components/tournaments/tournament-card.tsx:8,57`
- Modify: `src/components/tournaments/tournament-detail.tsx:17,111`
- Modify: `src/components/tournaments/card-actions-sheet.tsx:9,109`
- Modify: `src/components/share/tournament-share-card.tsx:3,105`

**Interfaces:**
- Consumes: `TournamentType` from Task 1.
- Produces:
  - `export const TYPE_ICONS: Record<TournamentType, LucideIcon>`
  - `export function typeIcon(type: TournamentType): LucideIcon`
  - `export function TypeGlyph({ type, size, className }: { type: TournamentType; size?: 'sm' | 'md' | 'lg'; className?: string })` — replaces `FreeplayGlyph`, same footprint, `type` required.

- [ ] **Step 1: Write the failing test**

Create `src/lib/type-glyph.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TYPE_ICONS, typeIcon } from './type-glyph';
import { FREEPLAY_TYPES, TOURNAMENT_TYPES, MATCH_TYPE } from './tournament-kinds';

describe('type glyphs', () => {
  it('covers every type the app can offer', () => {
    // The Record already enforces this at compile time. Stated here for anyone
    // tempted to widen the type: a type without a glyph renders an empty slot.
    for (const t of [...TOURNAMENT_TYPES, ...FREEPLAY_TYPES, MATCH_TYPE]) {
      expect(typeIcon(t)).toBeTypeOf('function');
    }
  });

  it('gives ranked simulator one icon under both stored values', () => {
    // One label, one glyph, two stored values — the split is about which
    // segment the games were logged in, and it should not look like two things.
    expect(TYPE_ICONS.ranked_sim).toBe(TYPE_ICONS.freeplay_sim);
  });

  it('keeps every other type visually distinct', () => {
    const icons = Object.entries(TYPE_ICONS).filter(([t]) => t !== 'freeplay_sim').map(([, i]) => i);
    expect(new Set(icons).size).toBe(icons.length);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/type-glyph.test.ts`
Expected: FAIL — cannot resolve `./type-glyph`.

- [ ] **Step 3: Write the lookup**

Create `src/lib/type-glyph.ts`:

```ts
import {
  Store, Trophy, Globe, Crown, PartyPopper, TrendingUp, Shuffle, Gamepad2,
  Users, MapPin, Target, FlaskConical, GraduationCap, Swords, type LucideIcon,
} from 'lucide-react';
import type { TournamentType } from './dto';

/**
 * One icon per type, so a list of events and a list of sessions read the same
 * way. A sibling of the label map, and the same contract: a `Record` keyed on
 * the enum, so a new type cannot ship without one.
 *
 * `ranked_sim` and `freeplay_sim` share an icon deliberately — they are one
 * label with two stored values, and drawing them differently would say there
 * are two kinds of event when there is only one.
 *
 * `local` is the shop you compete in; `freeplay_locals` is the place you hang
 * around afterwards. Different icons, because on a card they sit side by side.
 */
export const TYPE_ICONS: Record<TournamentType, LucideIcon> = {
  local: Store,
  treasure_cup: Trophy,
  regionals: Globe,
  extra_grand_battle: Crown,
  pirates_party: PartyPopper,
  ranked_sim: TrendingUp,
  freeplay: Shuffle,
  freeplay_sim: TrendingUp,
  freeplay_sim_casual: Gamepad2,
  freeplay_friend: Users,
  freeplay_locals: MapPin,
  freeplay_gauntlet: Target,
  testing: FlaskConical,
  freeplay_teaching: GraduationCap,
  match: Swords,
};

export function typeIcon(type: TournamentType): LucideIcon {
  return TYPE_ICONS[type];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/type-glyph.test.ts`
Expected: PASS.

- [ ] **Step 5: Rename the component file**

```bash
git mv src/components/tournaments/freeplay-glyph.tsx src/components/tournaments/type-glyph.tsx
```

- [ ] **Step 6: Rewrite the component**

Replace the contents of `src/components/tournaments/type-glyph.tsx`:

```tsx
import { cn } from '@/lib/utils';
import { typeIcon } from '@/lib/type-glyph';
import type { TournamentType } from '@/lib/dto';

// Matches LeaderAvatar's 5:7 card footprint so a session card sits flush in a
// list beside normal leader avatars.
const SIZES = {
  sm: 'w-6 h-[2.1rem] rounded-[0.2rem]',
  md: 'w-11 h-[3.85rem] rounded-[0.35rem]',
  lg: 'w-16 h-[5.6rem] rounded-lg',
} as const;

const ICON = { sm: 'size-3', md: 'size-5', lg: 'size-7' } as const;

/**
 * Stands in for the leader avatar on a freeplay session, which has no single
 * leader. It draws the session's own type rather than one shared symbol: at
 * eight session types, a list of identical shuffle icons said only "not a
 * tournament", which the reader already knew from the tab they were on.
 *
 * An icon rather than an emoji: the original 🎴 depended on the platform having
 * that codepoint and rendered as a blank box where it did not.
 */
export function TypeGlyph({ type, size = 'md', className }: {
  type: TournamentType;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const Icon = typeIcon(type);
  return (
    <div
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center border border-border/60 bg-muted text-muted-foreground',
        SIZES[size], className,
      )}
    >
      <Icon className={ICON[size]} />
    </div>
  );
}
```

- [ ] **Step 7: Update the four call sites**

In `src/components/tournaments/tournament-card.tsx`, replace the import on line 8 with `import { TypeGlyph } from './type-glyph';` and line 57 with:

```tsx
            ? <TypeGlyph type={t.type} size="md" />
```

In `src/components/tournaments/tournament-detail.tsx`, replace the import on line 17 with `import { TypeGlyph } from './type-glyph';` and line 111 with:

```tsx
            ? <TypeGlyph type={t.type} size="lg" />
```

In `src/components/tournaments/card-actions-sheet.tsx`, replace the import on line 9 with `import { TypeGlyph } from './type-glyph';` and line 109 with:

```tsx
          ? <TypeGlyph type={t.type} size="md" />
```

In `src/components/share/tournament-share-card.tsx`, replace the import on line 3 with `import { TypeGlyph } from '@/components/tournaments/type-glyph';` and line 105 with:

```tsx
          ? <TypeGlyph type={tournament.type} size="lg" />
```

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: PASS, no type errors, no lint errors. A leftover `FreeplayGlyph` import would fail the first command.

- [ ] **Step 9: Commit**

```bash
git add src/lib/type-glyph.ts src/lib/type-glyph.test.ts src/components/tournaments/type-glyph.tsx src/components/tournaments/tournament-card.tsx src/components/tournaments/tournament-detail.tsx src/components/tournaments/card-actions-sheet.tsx src/components/share/tournament-share-card.tsx
git commit -m "feat(glyphs): draw a session as the kind of session it was"
```

---

### Task 6: The type badge, everywhere

Three files render `<Badge variant="secondary">{tournamentTypeLabel(…)}</Badge>` by hand. One component, and every type carries its icon.

**Files:**
- Create: `src/components/tournaments/type-badge.tsx`
- Modify: `src/components/tournaments/tournament-card.tsx:61`
- Modify: `src/components/tournaments/tournament-detail.tsx:115`
- Modify: `src/components/share/tournament-share-card.tsx:127`

**Interfaces:**
- Consumes: `typeIcon` from Task 5, `tournamentTypeLabel` from `@/lib/labels`.
- Produces: `export function TypeBadge({ type, className }: { type: TournamentType; className?: string })`.

- [ ] **Step 1: Write the component**

Create `src/components/tournaments/type-badge.tsx`:

```tsx
import { Badge } from '@/components/ui/badge';
import { tournamentTypeLabel } from '@/lib/labels';
import { typeIcon } from '@/lib/type-glyph';
import type { TournamentType } from '@/lib/dto';

/**
 * The type of an event or a session, named and drawn. One component rather than
 * the same badge hand-written on the card, the detail header and the share
 * card, because those had already started to drift.
 *
 * The `data-icon` attribute is the Badge's own convention: it tightens the
 * padding on the side the icon sits.
 */
export function TypeBadge({ type, className }: { type: TournamentType; className?: string }) {
  const Icon = typeIcon(type);
  return (
    <Badge variant="secondary" className={className}>
      <Icon data-icon="inline-start" aria-hidden />
      {tournamentTypeLabel(type)}
    </Badge>
  );
}
```

The Badge already supplies `gap-1` and forces `[&>svg]:size-3`, so the icon needs no sizing of its own.

- [ ] **Step 2: Use it on the tournament card**

In `src/components/tournaments/tournament-card.tsx`, add `import { TypeBadge } from './type-badge';` beside the other local imports and replace line 61:

```tsx
              <TypeBadge type={t.type} />
```

Remove `tournamentTypeLabel` from the line 13 import if nothing else in the file uses it — check first; `deckCountLabel` and `roundKindLabel` stay.

- [ ] **Step 3: Use it on the detail header**

In `src/components/tournaments/tournament-detail.tsx`, add `import { TypeBadge } from './type-badge';` and replace line 115:

```tsx
            <TypeBadge type={t.type} />
```

`tournamentTypeLabel` is still used on lines 118 and 242, so keep its import.

- [ ] **Step 4: Use it on the share card**

In `src/components/share/tournament-share-card.tsx`, add `import { TypeBadge } from '@/components/tournaments/type-badge';` and replace line 127:

```tsx
            <TypeBadge type={tournament.type} />
```

`tournamentTypeLabel` is still used on lines 92 and 110, so keep its import. The share card is rasterised by html-to-image; lucide icons are inline SVG and rasterise with the rest of the frame.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: PASS. An unused `tournamentTypeLabel` import is a lint error, which is how you find out whether step 2 needed it removed.

- [ ] **Step 6: Check it in the browser**

Run the screenshot workflow against `/` and one tournament detail page.
Expected: each card's type badge shows its icon; a Regional shows a globe, a session shows its own. The badge height is unchanged, so no card reflows.

- [ ] **Step 7: Commit**

```bash
git add src/components/tournaments/type-badge.tsx src/components/tournaments/tournament-card.tsx src/components/tournaments/tournament-detail.tsx src/components/share/tournament-share-card.tsx
git commit -m "feat(glyphs): one type badge, drawn the same way everywhere"
```

---

### Task 7: Filter the freeplay list

**Files:**
- Modify: `src/components/tournaments/tournament-list.tsx:21-24,76-92,123-138,151-163,175-179`

**Interfaces:**
- Consumes: `FREEPLAY_TYPES`, `TOURNAMENT_TYPES` from Task 1.
- Produces: no new exports.

- [ ] **Step 1: Replace the chip-type constant**

In `src/components/tournaments/tournament-list.tsx`, replace lines 23-24:

```ts
// Freeplay and match are segments of their own, not filters within this one —
// but each segment filters within itself. A match has one type, so it has none.
const CHIP_TYPES: Record<Segment, TournamentType[]> = {
  tournaments: TOURNAMENT_TYPES,
  freeplay: FREEPLAY_TYPES,
  matches: [],
};
```

This must sit *below* the `type Segment` declaration on line 26; move it there. Update the line 21 import:

```ts
import { isFreeplay, TOURNAMENT_TYPES, FREEPLAY_TYPES } from '@/lib/tournament-kinds';
```

- [ ] **Step 2: Reset the filter when the segment changes**

After the `const current = …` line (line 80), add:

```ts
  // The filter belongs to the segment, not to the page. Carrying "Regionals"
  // into Freeplay would show an empty list with nothing on screen to explain it.
  const selectSegment = (key: Segment) => {
    setSegment(key);
    setFilter('all');
  };
  const chips = CHIP_TYPES[segment];
```

- [ ] **Step 3: Filter every segment that has chips**

Replace lines 89-92:

```ts
  const shown = chips.length > 0
    ? inSegment.filter((t) => filter === 'all' || t.type === filter)
    : inSegment;
```

- [ ] **Step 4: Point the segmented control at the new handler**

On line 130, replace `onClick={() => setSegment(s.key)}` with:

```tsx
            onClick={() => selectSegment(s.key)}
```

- [ ] **Step 5: Show the chips for both segments**

Replace lines 151-163:

```tsx
      {/* Type chips filter within the segment; matches have one type, so none. */}
      {chips.length > 0 && (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
          <button onClick={() => setFilter('all')}
            className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${filter === 'all' ? 'bg-primary text-primary-foreground' : 'border border-border/50 bg-card/60 supports-backdrop-filter:backdrop-blur-md'}`}>All</button>
          {chips.map((ty) => (
            <button key={ty} onClick={() => setFilter(ty)}
              className={`inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-4 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${filter === ty ? 'bg-primary text-primary-foreground' : 'border border-border/50 bg-card/60 supports-backdrop-filter:backdrop-blur-md'}`}>
              {tournamentTypeLabel(ty)}
            </button>
          ))}
        </div>
      )}
```

Chips stay text-only: the freeplay strip runs to eight and scrolls, and an icon on each costs width without saying anything the label does not.

- [ ] **Step 6: Make the empty state read its segment**

Replace line 177:

```tsx
            No {tournamentTypeLabel(filter as TournamentType)} {plural} yet.
```

`plural` is already destructured from `current` on line 98 — confirm that destructuring sits above this JSX, which it does.

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: PASS.

- [ ] **Step 8: Check it in the browser**

Run the screenshot workflow against `/?tab=freeplay`.
Expected: an All chip plus eight type chips, scrolling horizontally. Filter to Gauntlet, switch to the Tournaments tab, and confirm the tournament list is unfiltered rather than empty. Filter Tournaments to Regionals, switch to Freeplay, and confirm the same in reverse. With a filter matching nothing, the empty state reads "No Gauntlet sessions yet."

- [ ] **Step 9: Commit**

```bash
git add src/components/tournaments/tournament-list.tsx
git commit -m "feat(freeplay): filter sessions by type, the way tournaments already do"
```

---

### Task 8: Migrate production, then ship

The two migrations reshape live data, and one of them moves rows out of the competitive record. Production migrates before the code that depends on it is pushed — a push first would serve a build that treats `testing` as freeplay against rows still holding a session leader.

**Files:** none.

**Interfaces:**
- Consumes: everything above.
- Produces: a deployed build.

- [ ] **Step 1: Full local verification**

Run: `npm test && npm run lint && npm run build`
Expected: all three pass. Do not continue past a failure.

- [ ] **Step 2: Record what the migration will change**

Against production, before migrating, capture the counts so the effect is known rather than guessed:

```bash
npx tsx --env-file=.env.local -e "
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query(\"SELECT count(*)::int AS tournaments, (SELECT count(*)::int FROM rounds r JOIN tournaments t ON t.id = r.tournament_id WHERE t.type = 'testing') AS rounds FROM tournaments WHERE type = 'testing'\");
console.log(rows[0]);
await pool.end();
"
```

Expected: a count of Testing tournaments and their rounds. Report it — that is the size of the history rewrite, and it is what the win rate and achievement counts will move by.

- [ ] **Step 3: Migrate production**

Run: `npm run db:migrate`
Expected: migrations `0010` and `0011` applied. `.env.local`'s `DATABASE_URL` is production; this is the intended target.

- [ ] **Step 4: Confirm the reshape landed**

```bash
npx tsx --env-file=.env.local -e "
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query(\"SELECT (SELECT count(*)::int FROM tournaments WHERE type='testing' AND my_leader_id IS NOT NULL) AS sessions_with_leader, (SELECT count(*)::int FROM rounds r JOIN tournaments t ON t.id=r.tournament_id WHERE t.type='testing' AND r.round_kind NOT IN ('bye','no_show') AND r.my_leader_id IS NULL) AS rounds_without_leader\");
console.log(rows[0]);
await pool.end();
"
```

Expected: both counts are `0`.

- [ ] **Step 5: Push**

```bash
git push
```

- [ ] **Step 6: Verify the deployed app**

Once the deploy is live, use the project's authenticated screenshot workflow against the production URL: `/freeplay/new` (eight chips), `/?tab=freeplay` (filter chips and per-type glyphs), `/tournaments/new` (six chips, no Testing), and one previously-Testing session's detail page (a flask glyph, a leader shown per round, no session leader line).

Expected: all five render correctly. Report what changed in the competitive record — the win rate and tournament count now exclude the Testing events counted in step 2.

---

## Self-Review

**Spec coverage.** The type set and strip order → Task 1. Testing's history rewrite, including the bye/no-show carve-out and the accepted outbox edge → Task 2 (the outbox edge needs no code, and is recorded in the spec). Per-segment memory and the `last-type.ts` rename → Task 3, wired in Task 4. `TYPE_ICONS`, `TypeGlyph`, `TypeBadge`, and the shared-icon rule for `ranked_sim`/`freeplay_sim` → Tasks 5 and 6. Filter chips, the reset on segment change, and the segment-aware empty state → Task 7. Text-only chips → stated in Task 7 step 5. Migrate-before-push → Task 8.

**Placeholders.** None: every step names its files, shows its code, and states the command to run and what it should print.

**Type consistency.** `lastType(segment)` / `rememberType(segment, type)` / `TypeSegment` are defined in Task 3 and used with those exact names in Task 4. `typeIcon` is defined in Task 5 and consumed in Task 6. `TypeGlyph` takes `{ type, size, className }` in Task 5 and is called with `type` and `size` at all four sites. `CHIP_TYPES` is declared and consumed inside Task 7 only.
