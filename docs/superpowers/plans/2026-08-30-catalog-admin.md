# Catalog Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the catalog a draft/published/hidden lifecycle, an admin area to curate it, and an importer that proposes instead of overwriting.

**Architecture:** A shared `catalog_status` enum on `leaders` and `metas`. Player-facing endpoints return published rows plus anything that player's own matches reference, so hiding a leader never blanks their history. A separate `/api/admin/*` surface, gated twice (middleware and per-route), returns and mutates everything. `build-leader-data.ts` becomes an insert-only importer that writes drafts to the database and reports differences it refuses to apply.

**Tech Stack:** Next.js 16.2.10 (App Router), drizzle-orm 0.45.2 / drizzle-kit 0.31.10, node-postgres, Clerk, Vitest against a real Postgres, sharp (devDependency, scripts only), @base-ui/react + Tailwind for UI.

**Spec:** `docs/superpowers/specs/2026-08-30-catalog-admin-design.md`

## Prerequisite

**Stage 1 must be merged before this plan starts.** It is specified in
`docs/superpowers/specs/2026-08-30-leader-images-in-db-design.md` and planned in
`docs/superpowers/plans/2026-08-30-leader-images-in-db.md`. This plan assumes
`leader_images` exists, `leader_art` is keyed on `(owner_id, leader_id)`,
`LeaderDTO` carries `images` and `defaultImageId`, and
`src/lib/leader-deck-codes.ts` exists. If any of that is missing, stop — do not
build it here.

## Global Constraints

- **This is not the Next.js in your training data.** Per `AGENTS.md`, read the relevant guide in `node_modules/next/dist/docs/` before writing route handler, middleware or caching code.
- Dynamic route context is a Promise: `type Ctx = { params: Promise<{ id: string }> }` — see `src/app/api/rounds/[id]/route.ts:7`.
- Every API route declares `export const runtime = 'nodejs'`.
- Tests run against a real Postgres at `DATABASE_URL_TEST` with `fileParallelism: false`. Do not mock the database. The only mocks are `@clerk/nextjs/server` and `@/db/client` — copy the two lines from `src/app/api/reference.route.test.ts:5-6`.
- drizzle-orm 0.45.2: the table's second argument returns an **array** of constraints.
- `sharp` stays in `devDependencies`. Nothing under `src/` may import it.
- Every admin API route lives under `src/app/api/admin/`. No exceptions — the security model is a path prefix.
- UI: reuse `src/components/ui/*` (badge, button, card, dialog, input, select, sheet, skeleton). There is **no checkbox component**; do not add a dependency for one, use a `<button role="checkbox" aria-checked>` as specified in Task 6.
- Comments and prose in this codebase are English. Match that.

---

### Task 1: Statuses, aliases and deck codes on the catalog

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/00NN_*.sql` (generated, then hand-edited — see Step 4)
- Test: `src/db/schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `catalogStatus` pgEnum (`'draft' | 'published' | 'hidden'`); `leaders.status`, `leaders.aliases`, `leaders.deckCodes`, `metas.status`.

- [ ] **Step 1: Write the failing test**

Append to `src/db/schema.test.ts`:

```ts
describe('catalog status', () => {
  beforeEach(async () => { await resetDb(); });

  it('defaults a newly inserted leader to draft', async () => {
    const [row] = await db.insert(leaders).values({ name: 'Yamato', colors: ['green'] }).returning();
    expect(row.status).toBe('draft');
    expect(row.aliases).toEqual([]);
    expect(row.deckCodes).toEqual([]);
  });

  it('defaults a newly inserted meta to draft', async () => {
    const [row] = await db.insert(metas).values({ name: 'OP17 Whatever', code: 'OP17' }).returning();
    expect(row.status).toBe('draft');
  });

  it('rejects a status outside the enum', async () => {
    await expect(
      db.execute(sql`INSERT INTO leaders (name, colors, status) VALUES ('X', '{}', 'retired')`),
    ).rejects.toThrow();
  });

  it('round-trips aliases and deck codes', async () => {
    const [row] = await db.insert(leaders).values({
      name: 'Edward Newgate', colors: ['red'], setCode: 'OP02-001',
      aliases: ['whitebeard', 'pops'], deckCodes: ['ST15'],
    }).returning();
    expect(row.aliases).toEqual(['whitebeard', 'pops']);
    expect(row.deckCodes).toEqual(['ST15']);
  });
});
```

Add `metas` and `sql` to that file's imports:

```ts
import { eq, sql } from 'drizzle-orm';
import { leaders, leaderImages, leaderArt, metas } from './schema';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/db/schema.test.ts`
Expected: FAIL — `row.status` is `undefined` (the column does not exist).

- [ ] **Step 3: Add the enum and the columns**

In `src/db/schema.ts`, add the enum beside the existing ones:

```ts
/**
 * Where a catalog row is in its review. `draft` is "arrived, never reviewed" —
 * what the importer produces. `hidden` is "reviewed and set aside": a duplicate,
 * a mistake, or a product this player never sees. The distinction is what makes
 * a review queue possible, so the two are not collapsed into one flag.
 */
export const catalogStatus = pgEnum('catalog_status', ['draft', 'published', 'hidden']);
```

Add to the `leaders` table:

```ts
  /** Nicknames players actually type: 'gear 5', 'whitebeard'. Fed into leaderSearchText. */
  aliases: text('aliases').array().notNull().default([]),
  /** Starter decks that reprint this leader under its original code, e.g. ['ST17']. */
  deckCodes: text('deck_codes').array().notNull().default([]),
  status: catalogStatus('status').notNull().default('draft'),
```

Add to the `metas` table:

```ts
  status: catalogStatus('status').notNull().default('draft'),
```

- [ ] **Step 4: Generate the migration, then fix its defaults by hand**

Run: `npm run db:generate`

drizzle-kit will emit `ADD COLUMN "status" ... NOT NULL DEFAULT 'draft'`. **That
would put all 308 existing leaders into draft and empty the application.** Edit
the generated SQL so each `status` column is added as published, existing custom
rows are swept into draft, and only then does the default become draft:

```sql
CREATE TYPE "public"."catalog_status" AS ENUM('draft', 'published', 'hidden');

ALTER TABLE "leaders" ADD COLUMN "aliases" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "leaders" ADD COLUMN "deck_codes" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "leaders" ADD COLUMN "status" "catalog_status" DEFAULT 'published' NOT NULL;
ALTER TABLE "metas"   ADD COLUMN "status" "catalog_status" DEFAULT 'published' NOT NULL;

-- Nothing creates these today, so these are legacy rows: surface them for review
-- rather than leaving them silently live.
UPDATE "leaders" SET "status" = 'draft' WHERE "owner_id" IS NOT NULL;
UPDATE "metas"   SET "status" = 'draft' WHERE "owner_id" IS NOT NULL;

-- Everything inserted from now on is a proposal.
ALTER TABLE "leaders" ALTER COLUMN "status" SET DEFAULT 'draft';
ALTER TABLE "metas"   ALTER COLUMN "status" SET DEFAULT 'draft';
```

- [ ] **Step 5: Backfill deck codes in the same migration**

Append to the same SQL file, one statement per entry in
`src/lib/leader-deck-codes.ts`. Read that file and transcribe every entry — the
five known today are:

```sql
UPDATE "leaders" SET "deck_codes" = '{ST17}' WHERE "set_code" = 'OP01-060';
UPDATE "leaders" SET "deck_codes" = '{ST15}' WHERE "set_code" = 'OP02-001';
UPDATE "leaders" SET "deck_codes" = '{ST19}' WHERE "set_code" = 'OP02-093';
UPDATE "leaders" SET "deck_codes" = '{ST20}' WHERE "set_code" = 'OP03-099';
UPDATE "leaders" SET "deck_codes" = '{ST18}' WHERE "set_code" = 'OP05-060';
```

If `src/lib/leader-deck-codes.ts` holds entries beyond these five, add them too.
Do not guess — read the file.

- [ ] **Step 6: Run the migration and the tests**

```bash
npm run db:migrate && npm test -- src/db/schema.test.ts
```

Expected: PASS. The new-insert tests see `draft` because Step 4's final
`SET DEFAULT` applies to inserts, while the rows that existed before the
migration are `published`.

- [ ] **Step 7: Verify the backfill on real data**

```bash
npm run db:seed
```

Then, against your local database:

```sql
SELECT status, count(*) FROM leaders GROUP BY status;
```

Expected: every pre-existing leader `published`. Any row inserted by the seed
after the migration will be `draft` — that is correct behaviour, and Task 9
replaces the seed entirely.

- [ ] **Step 8: Commit**

```bash
git add src/db/schema.ts src/db/schema.test.ts drizzle/
git commit -m "feat(db): add catalog status, aliases and deck codes"
```

---

### Task 2: Visibility — published, plus what this player has played

**Files:**
- Modify: `src/services/reference.ts`
- Modify: `src/lib/dto.ts` (`LeaderDTO`, `MetaDTO` gain `status`)
- Modify: `src/lib/leader-visual.ts` (`leaderSearchText` reads the new columns)
- Test: `src/services/reference.test.ts`

**Interfaces:**
- Consumes: `catalogStatus` from Task 1.
- Produces: `listLeaders(db, ownerId)` and `listMetas(db, ownerId)` filtered as below; `LeaderDTO.status`, `MetaDTO.status`; `leaderSearchText(name, setCode, aliases, deckCodes)`.

- [ ] **Step 1: Write the failing test**

Append to `src/services/reference.test.ts`:

```ts
describe('catalog visibility', () => {
  beforeEach(async () => { await resetDb(); });

  async function leader(name: string, status: 'draft' | 'published' | 'hidden') {
    const [row] = await db.insert(leaders).values({ name, colors: ['red'], status }).returning();
    return row;
  }

  it('returns published leaders', async () => {
    const pub = await leader('Published Zoro', 'published');
    const list = await listLeaders(db, 'user_1');
    expect(list.map((l) => l.id)).toContain(pub.id);
  });

  it('hides drafts and hidden leaders nobody played', async () => {
    await leader('Draft Zoro', 'draft');
    await leader('Hidden Zoro', 'hidden');
    const list = await listLeaders(db, 'user_1');
    expect(list).toHaveLength(0);
  });

  it('still returns a hidden leader this player has played', async () => {
    // Hiding a leader must never blank a past match: the client resolves names
    // by id from this one list.
    const hidden = await leader('Hidden Zoro', 'hidden');
    const [t] = await db.insert(tournaments).values({
      ownerId: 'user_1', type: 'local', playedOn: '2026-01-01', myLeaderId: hidden.id,
    }).returning();
    await db.insert(rounds).values({
      tournamentId: t.id, roundNumber: 1, result: 'win',
    });
    const list = await listLeaders(db, 'user_1');
    expect(list.map((l) => l.id)).toContain(hidden.id);
  });

  it('does not leak another player hidden leader', async () => {
    const hidden = await leader('Hidden Zoro', 'hidden');
    const [t] = await db.insert(tournaments).values({
      ownerId: 'user_2', type: 'local', playedOn: '2026-01-01', myLeaderId: hidden.id,
    }).returning();
    await db.insert(rounds).values({ tournamentId: t.id, roundNumber: 1, result: 'win' });
    const list = await listLeaders(db, 'user_1');
    expect(list).toHaveLength(0);
  });

  it('returns a hidden leader played as an opponent', async () => {
    const hidden = await leader('Hidden Zoro', 'hidden');
    const [t] = await db.insert(tournaments).values({
      ownerId: 'user_1', type: 'local', playedOn: '2026-01-01',
    }).returning();
    await db.insert(rounds).values({
      tournamentId: t.id, roundNumber: 1, result: 'win', opponentLeaderId: hidden.id,
    });
    const list = await listLeaders(db, 'user_1');
    expect(list.map((l) => l.id)).toContain(hidden.id);
  });
});
```

Import `tournaments` and `rounds` from `../db/schema` in that file if they are
not already imported.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/services/reference.test.ts`
Expected: FAIL — drafts and hidden leaders are returned, because nothing filters
on status yet.

- [ ] **Step 3: Implement the visibility rule**

In `src/services/reference.ts`, replace `visibleTo` and both list functions:

```ts
/**
 * What this player may see of the catalog.
 *
 * Published rows, plus any row their own matches already reference whatever its
 * status. The second half is not a nicety: the client fetches this list once and
 * resolves leader names by id, so without it, hiding a leader would blank every
 * past match that used it. "Offerable" is a display filter the pickers apply to
 * `status`, not a narrower query.
 *
 * The ownership clause stays because legacy custom rows exist; nothing creates
 * new ones.
 */
const inMyMatches = (leaderId: typeof leaders.id, ownerId: string) => sql`EXISTS (
  SELECT 1 FROM ${tournaments} t
  LEFT JOIN ${rounds} r ON r.tournament_id = t.id
  WHERE t.owner_id = ${ownerId}
    AND (t.my_leader_id = ${leaderId} OR r.my_leader_id = ${leaderId} OR r.opponent_leader_id = ${leaderId})
)`;

const metaInMyMatches = (metaId: typeof metas.id, ownerId: string) => sql`EXISTS (
  SELECT 1 FROM ${tournaments} t
  LEFT JOIN ${rounds} r ON r.tournament_id = t.id
  WHERE t.owner_id = ${ownerId}
    AND (t.meta_id = ${metaId} OR r.opponent_meta_id = ${metaId})
)`;

export async function listLeaders(db: DB, ownerId: string): Promise<Leader[]> {
  return db.select().from(leaders)
    .where(and(
      or(isNull(leaders.ownerId), eq(leaders.ownerId, ownerId)),
      or(eq(leaders.status, 'published'), inMyMatches(leaders.id, ownerId)),
    ))
    .orderBy(asc(leaders.name));
}

export async function listMetas(db: DB, ownerId: string): Promise<Meta[]> {
  // Official sets newest-first (codes are zero-padded, so lexical DESC is
  // correct), then custom metas alphabetically.
  return db.select().from(metas)
    .where(and(
      or(isNull(metas.ownerId), eq(metas.ownerId, ownerId)),
      or(eq(metas.status, 'published'), metaInMyMatches(metas.id, ownerId)),
    ))
    .orderBy(asc(metas.isCustom), sql`${metas.code} desc nulls last`, asc(metas.name));
}
```

Add `and` to the `drizzle-orm` import and `tournaments`, `rounds` to the schema
import.

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- src/services/reference.test.ts`
Expected: PASS.

- [ ] **Step 5: Carry status and the new search fields to the client**

In `src/lib/dto.ts`, add to `LeaderDTO`:

```ts
  status: 'draft' | 'published' | 'hidden';
  aliases: string[];
  deckCodes: string[];
```

and to `MetaDTO`:

```ts
  status: 'draft' | 'published' | 'hidden';
  releasedAt: string | null;
```

In `src/lib/leader-visual.ts`, replace `leaderSearchText` and delete the
`leader-deck-codes` import:

```ts
/**
 * Haystack for the leader pickers: the name, the card's set code, the nicknames
 * players actually type, and the codes of any starter deck that reprints it.
 *
 * The single-colour starter decks ship an existing booster leader under its
 * original code, so without the deck codes a player searching for their "ST17"
 * deck would find nothing. Aliases are there for the same reason at a different
 * altitude: nobody at a venue calls a deck "OP02-001".
 */
export function leaderSearchText(
  name: string,
  setCode: string | null | undefined,
  aliases: readonly string[] = [],
  deckCodes: readonly string[] = [],
): string {
  return [name, setCode, ...aliases, ...deckCodes].filter(Boolean).join(' ').toLowerCase();
}
```

Update its caller in `src/components/leaders/leader-picker.tsx` to pass
`leader.aliases` and `leader.deckCodes`.

- [ ] **Step 6: Delete the parked module**

```bash
git rm src/lib/leader-deck-codes.ts
```

- [ ] **Step 7: Filter the pickers on status**

In `src/components/leaders/leader-picker.tsx`, the list the picker offers becomes
`leaders.filter((l) => l.status === 'published')`. The list used to *resolve* a
leader by id — anywhere the picker shows an already-selected leader — must not be
filtered, or selecting a hidden leader in an old match would show a blank.

Do the same in the meta picker if one exists; `grep -rn "listMetas\|useMetas" src/components` to find it.

- [ ] **Step 8: Typecheck and run the full suite**

```bash
npx tsc --noEmit && npm test
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(catalog): show published rows plus whatever this player has played"
```

---

### Task 3: The default meta stops guessing from set codes

**Files:**
- Modify: `src/lib/meta-selection.ts`
- Test: `src/lib/meta-selection.test.ts`

**Interfaces:**
- Consumes: `MetaDTO.releasedAt` from Task 2.
- Produces: `pickDefaultMetaId(metas)` where `Selectable = { id, code, isCustom, releasedAt }`.

- [ ] **Step 1: Replace the tests**

`src/lib/meta-selection.test.ts` currently pins the lexical rule. Those tests
describe behaviour that is about to stop existing, so they are **replaced, not
extended** — a suite that asserts both rules documents a contradiction.

```ts
import { describe, it, expect } from 'vitest';
import { pickDefaultMetaId } from './meta-selection';

const meta = (id: string, code: string | null, releasedAt: string | null, isCustom = false) =>
  ({ id, code, releasedAt, isCustom });

describe('pickDefaultMetaId', () => {
  it('picks the most recently released official meta', () => {
    const picked = pickDefaultMetaId([
      meta('a', 'OP15', '2025-06-01'),
      meta('b', 'OP16', '2025-11-01'),
      meta('c', 'OP14', '2025-02-01'),
    ]);
    expect(picked).toBe('b');
  });

  it('ignores metas with no release date once any meta has one', () => {
    // Comparing a date against a code has no meaning, so a dateless meta simply
    // cannot be the default while dated ones exist.
    const picked = pickDefaultMetaId([
      meta('a', 'OP16', null),
      meta('b', 'OP15', '2025-06-01'),
    ]);
    expect(picked).toBe('b');
  });

  it('falls back to the lexically highest code when no meta has a date', () => {
    const picked = pickDefaultMetaId([
      meta('a', 'OP15', null),
      meta('b', 'OP16', null),
    ]);
    expect(picked).toBe('b');
  });

  it('excludes custom metas from both rules', () => {
    // A custom meta named "Zoro locals" outranking OP16 would silently become
    // everyone's default.
    const picked = pickDefaultMetaId([
      meta('a', 'OP16', '2025-11-01'),
      meta('b', null, '2026-01-01', true),
    ]);
    expect(picked).toBe('a');
  });

  it('returns null when there is no official meta', () => {
    expect(pickDefaultMetaId([meta('b', null, null, true)])).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/lib/meta-selection.test.ts`
Expected: FAIL — `releasedAt` is not part of `Selectable` and is ignored.

- [ ] **Step 3: Implement**

Replace `src/lib/meta-selection.ts`:

```ts
type Selectable = { id: string; code: string | null; isCustom: boolean; releasedAt: string | null };

/**
 * The meta a new tournament defaults to: the most recently released official set.
 *
 * `releasedAt` is filled in through the admin. Before it existed this compared
 * `code` lexically, which was correct only for `OP01`…`OP99`: an `ST`-coded meta
 * would have outranked `OP16`, and `"OP99" > "OP100"`. Release dates have none
 * of those edges.
 *
 * The fallback is all-or-nothing. If any official meta has a date, the default
 * comes from among those and dateless ones cannot win; only when none has a date
 * does the old lexical rule apply. Comparing a date against a code would mean
 * nothing, so the two rules never mix.
 *
 * Custom metas are excluded from both: they have no code, and one named "Zoro
 * locals" would otherwise silently become everyone's default.
 */
export function pickDefaultMetaId(metas: Selectable[]): string | null {
  const official = metas.filter((m) => !m.isCustom);
  if (official.length === 0) return null;

  const dated = official.filter((m): m is Selectable & { releasedAt: string } => m.releasedAt !== null);
  if (dated.length > 0) {
    return dated.reduce((best, m) => (m.releasedAt > best.releasedAt ? m : best)).id;
  }

  const coded = official.filter((m): m is Selectable & { code: string } => m.code !== null);
  if (coded.length === 0) return null;
  return coded.reduce((best, m) => (m.code > best.code ? m : best)).id;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- src/lib/meta-selection.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. If a caller passes objects without `releasedAt`, fix the caller
to pass the DTO field rather than widening the type back.

- [ ] **Step 6: Commit**

```bash
git add src/lib/meta-selection.ts src/lib/meta-selection.test.ts
git commit -m "feat(metas): default to the most recently released set"
```

---

### Task 4: Admin authorisation

**Files:**
- Modify: `src/lib/api/handler.ts`
- Modify: `src/proxy.ts`
- Create: `src/app/admin/layout.tsx`
- Create: `src/app/admin/page.tsx`
- Modify: `src/components/settings/settings-view.tsx`
- Test: `src/lib/api/handler.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `requireAdmin(): Promise<string>` from `src/lib/api/handler.ts`, throwing `ForbiddenError`; `ForbiddenError` mapped to 403 by `errorToResponse`.

**Before starting, note the manual setup this depends on.** In the Clerk
dashboard: *Sessions → Customize session token* set to
`{"metadata": "{{user.public_metadata}}"}`, and the owner's user given public
metadata `{"role": "admin"}`. Without both, `requireAdmin` correctly refuses
everyone. If you cannot verify this, say so rather than loosening the check.

- [ ] **Step 1: Write the failing test**

Create `src/lib/api/handler.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const auth = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({ auth: () => auth() }));

describe('requireAdmin', () => {
  beforeEach(() => { auth.mockReset(); });

  it('returns the user id when the session claims the admin role', async () => {
    auth.mockResolvedValue({ userId: 'user_1', sessionClaims: { metadata: { role: 'admin' } } });
    const { requireAdmin } = await import('./handler');
    await expect(requireAdmin()).resolves.toBe('user_1');
  });

  it('throws for a signed-in user with no role', async () => {
    auth.mockResolvedValue({ userId: 'user_1', sessionClaims: {} });
    const { requireAdmin, ForbiddenError } = await import('./handler');
    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws for a signed-in user with some other role', async () => {
    auth.mockResolvedValue({ userId: 'user_1', sessionClaims: { metadata: { role: 'player' } } });
    const { requireAdmin, ForbiddenError } = await import('./handler');
    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws Unauthorized when nobody is signed in', async () => {
    auth.mockResolvedValue({ userId: null });
    const { requireAdmin, UnauthorizedError } = await import('./handler');
    await expect(requireAdmin()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('maps ForbiddenError to a 403', async () => {
    const { errorToResponse, ForbiddenError } = await import('./handler');
    const res = errorToResponse(new ForbiddenError());
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/lib/api/handler.test.ts`
Expected: FAIL — `requireAdmin` is not exported.

- [ ] **Step 3: Implement**

In `src/lib/api/handler.ts`, add beside `UnauthorizedError`:

```ts
export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') { super(message); this.name = 'ForbiddenError'; }
}
```

Add to `errorToResponse`, above the `NotFoundError` line:

```ts
  if (err instanceof ForbiddenError) return json({ error: err.message }, { status: 403 });
```

And at the end of the file:

```ts
/**
 * The signed-in user id, provided they hold the admin role.
 *
 * The role is read from the session token rather than fetched per request,
 * which needs the Clerk session token to expose public metadata (dashboard:
 * Sessions → Customize session token → {"metadata": "{{user.public_metadata}}"}).
 *
 * This is the second of two barriers — src/proxy.ts is the first. The
 * redundancy is deliberate: a mis-written matcher opens the whole admin area
 * with nothing to signal it, and this turns that mistake into a 403 rather than
 * a silent breach.
 */
export async function requireAdmin(): Promise<string> {
  const { userId, sessionClaims } = await auth();
  if (!userId) throw new UnauthorizedError();
  const role = (sessionClaims as { metadata?: { role?: string } } | null)?.metadata?.role;
  if (role !== 'admin') throw new ForbiddenError();
  return userId;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- src/lib/api/handler.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add the middleware barrier**

Replace the body of `src/proxy.ts`:

```ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublic = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)', '/api/leader-images/(.*)']);
const isAdmin = createRouteMatcher(['/admin(.*)', '/api/admin(.*)']);

export default clerkMiddleware(async (auth, req) => {
  if (isPublic(req)) return;
  await auth.protect();

  if (!isAdmin(req)) return;
  const { sessionClaims } = await auth();
  const role = (sessionClaims as { metadata?: { role?: string } } | null)?.metadata?.role;
  if (role === 'admin') return;

  // A page nobody linked to may as well not exist; an API that 404s teaches its
  // client that the endpoint moved, which is a lie.
  return req.nextUrl.pathname.startsWith('/api/')
    ? NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    : NextResponse.rewrite(new URL('/404', req.url));
});

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)', '/(api|trpc)(.*)'],
};
```

Check the Next 16 guide in `node_modules/next/dist/docs/` for the current
middleware return contract before assuming `NextResponse.rewrite` is right here.
If the guide names a different mechanism for rendering a 404 from middleware,
follow the guide and note the difference in the commit message.

- [ ] **Step 6: Create the admin shell**

`src/app/admin/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

export default function AdminPage() {
  redirect('/admin/leaders');
}
```

`src/app/admin/layout.tsx`:

```tsx
import Link from 'next/link';
import { requireAdmin } from '@/lib/api/handler';
import { notFound } from 'next/navigation';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Third barrier, and the one that protects server-rendered content: the
  // middleware guards the request, this guards the render.
  try {
    await requireAdmin();
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <nav className="mb-4 flex gap-4 text-sm">
        <Link href="/admin/leaders" className="font-medium">Leaders</Link>
        <Link href="/admin/metas" className="font-medium">Metas</Link>
      </nav>
      {children}
    </div>
  );
}
```

- [ ] **Step 7: Add the settings link**

In `src/components/settings/settings-view.tsx`, add before `<ExportCard />`:

```tsx
      <AdminCard />
```

Create `src/components/settings/admin-card.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * Display convenience, not security. Hiding this link protects nothing — the
 * middleware and requireAdmin are what enforce access. It is here so the owner
 * does not have to remember a URL.
 */
export function AdminCard() {
  const { user } = useUser();
  if ((user?.publicMetadata as { role?: string } | undefined)?.role !== 'admin') return null;

  return (
    <Card className="mt-4 space-y-3 p-4">
      <h2 className="text-lg font-semibold">Administration</h2>
      <p className="text-sm text-muted-foreground">Curate the leader and meta catalog.</p>
      <Button render={<Link href="/admin/leaders" />}>Open admin</Button>
    </Card>
  );
}
```

Check `src/components/ui/button.tsx` for how it accepts a custom element — this
codebase uses `@base-ui/react`'s `useRender`, so the prop may be `render` or
`asChild`. Read the file rather than guessing.

- [ ] **Step 8: Verify by hand**

Start the dev server. Signed in **without** the admin role, visit `/admin` —
expect a 404 page, not a redirect to sign-in. Then set your own Clerk public
metadata to `{"role":"admin"}`, sign out and in again so the session token is
reissued, and visit `/admin` — expect the Leaders/Metas nav.

The sign-out/in step matters: the role rides in the session token, so an
existing session will not see a metadata change.

- [ ] **Step 9: Commit**

```bash
git add src/lib/api/handler.ts src/lib/api/handler.test.ts src/proxy.ts src/app/admin src/components/settings
git commit -m "feat(admin): gate the admin area behind a Clerk role"
```

---

### Task 5: Admin read endpoints and the leaders grid

**Files:**
- Create: `src/services/admin-catalog.ts`
- Create: `src/app/api/admin/leaders/route.ts`
- Create: `src/app/api/admin/metas/route.ts`
- Create: `src/app/admin/leaders/page.tsx`
- Create: `src/components/admin/leader-grid.tsx`
- Create: `src/components/admin/status-badge.tsx`
- Modify: `src/lib/api-client.ts`, `src/lib/query-keys.ts`
- Test: `src/app/api/admin.route.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` from Task 4; `LeaderDTO`, `MetaDTO` from Task 2.
- Produces: `adminListLeaders(db)`, `adminListMetas(db)` returning **every** row; `apiClient.adminListLeaders()`, `apiClient.adminListMetas()`; `keys.adminLeaders`, `keys.adminMetas`.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/admin.route.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../../tests/setup/db';
import { leaders, metas } from '../../db/schema';

const auth = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({ auth: () => auth() }));
vi.mock('@/db/client', () => ({ db: getTestDb(), schema: {} }));

const db = getTestDb();
afterAll(closeTestDb);

const asAdmin = () => auth.mockResolvedValue({ userId: 'user_admin', sessionClaims: { metadata: { role: 'admin' } } });
const asPlayer = () => auth.mockResolvedValue({ userId: 'user_1', sessionClaims: {} });

describe('/api/admin/leaders', () => {
  beforeEach(async () => { await resetDb(); auth.mockReset(); });

  it('403s without the admin role', async () => {
    asPlayer();
    const { GET } = await import('./admin/leaders/route');
    expect((await GET()).status).toBe(403);
  });

  it('returns drafts and hidden rows, which the player endpoint does not', async () => {
    await db.insert(leaders).values([
      { name: 'Draft Zoro', colors: ['red'], status: 'draft' },
      { name: 'Hidden Law', colors: ['green'], status: 'hidden' },
      { name: 'Live Luffy', colors: ['red'], status: 'published' },
    ]);
    asAdmin();
    const { GET } = await import('./admin/leaders/route');
    const body = await (await GET()).json();
    expect(body.map((l: { name: string }) => l.name).sort())
      .toEqual(['Draft Zoro', 'Hidden Law', 'Live Luffy']);
  });

  it('sorts drafts first', async () => {
    await db.insert(leaders).values([
      { name: 'AAA Published', colors: ['red'], status: 'published' },
      { name: 'ZZZ Draft', colors: ['red'], status: 'draft' },
    ]);
    asAdmin();
    const { GET } = await import('./admin/leaders/route');
    const body = await (await GET()).json();
    expect(body[0].name).toBe('ZZZ Draft');
  });
});

describe('/api/admin/metas', () => {
  beforeEach(async () => { await resetDb(); auth.mockReset(); });

  it('403s without the admin role', async () => {
    asPlayer();
    const { GET } = await import('./admin/metas/route');
    expect((await GET()).status).toBe(403);
  });

  it('returns every meta whatever its status', async () => {
    await db.insert(metas).values([
      { name: 'OP17', code: 'OP17', status: 'draft' },
      { name: 'OP16', code: 'OP16', status: 'published' },
    ]);
    asAdmin();
    const { GET } = await import('./admin/metas/route');
    const body = await (await GET()).json();
    expect(body).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/app/api/admin.route.test.ts`
Expected: FAIL — the routes do not exist.

- [ ] **Step 3: Write the service**

Create `src/services/admin-catalog.ts`:

```ts
import { asc, sql, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { leaders, metas, leaderImages } from '../db/schema';
import type { LeaderDTO, LeaderImageDTO, MetaDTO } from '../lib/dto';

type DB = NodePgDatabase<typeof schema>;

/**
 * The whole catalog, status and all.
 *
 * Separate from listLeaders rather than a flag on it. A `?all=true` that only an
 * admin may pass is one forgotten check away from serving the draft catalog to
 * every player; a separate path under /api/admin cannot be reached by accident.
 *
 * Drafts sort first: they are the work waiting to be done, and work you have to
 * search for is work that does not get done.
 */
export async function adminListLeaders(db: DB): Promise<LeaderDTO[]> {
  const rows = await db.select().from(leaders).orderBy(
    sql`case ${leaders.status} when 'draft' then 0 when 'published' then 1 else 2 end`,
    asc(leaders.name),
  );
  if (!rows.length) return [];

  const imgs = await db
    .select({
      id: leaderImages.id, leaderId: leaderImages.leaderId,
      label: leaderImages.label, isDefault: leaderImages.isDefault,
    })
    .from(leaderImages)
    .where(inArray(leaderImages.leaderId, rows.map((r) => r.id)))
    .orderBy(asc(leaderImages.sortOrder));

  const byLeader = new Map<string, LeaderImageDTO[]>();
  const defaultOf = new Map<string, string>();
  for (const img of imgs) {
    const list = byLeader.get(img.leaderId);
    if (list) list.push({ id: img.id, label: img.label });
    else byLeader.set(img.leaderId, [{ id: img.id, label: img.label }]);
    if (img.isDefault) defaultOf.set(img.leaderId, img.id);
  }

  return rows.map((l) => ({
    ...l,
    images: byLeader.get(l.id) ?? [],
    defaultImageId: defaultOf.get(l.id) ?? null,
  }));
}

export async function adminListMetas(db: DB): Promise<MetaDTO[]> {
  return db.select().from(metas).orderBy(
    sql`case ${metas.status} when 'draft' then 0 when 'published' then 1 else 2 end`,
    sql`${metas.code} desc nulls last`,
    asc(metas.name),
  );
}
```

- [ ] **Step 4: Write the routes**

`src/app/api/admin/leaders/route.ts`:

```ts
import { db } from '@/db/client';
import { requireAdmin, errorToResponse, json } from '@/lib/api/handler';
import { adminListLeaders } from '@/services/admin-catalog';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await requireAdmin();
    return json(await adminListLeaders(db));
  } catch (err) {
    return errorToResponse(err);
  }
}
```

`src/app/api/admin/metas/route.ts` is the same shape with `adminListMetas`.

- [ ] **Step 5: Run it to verify it passes**

Run: `npm test -- src/app/api/admin.route.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Wire the client**

In `src/lib/query-keys.ts`:

```ts
  adminLeaders: ['admin-leaders'] as const,
  adminMetas: ['admin-metas'] as const,
```

In `src/lib/api-client.ts`, beside the existing entries:

```ts
  adminListLeaders: () => request<LeaderDTO[]>('/api/admin/leaders'),
  adminListMetas: () => request<MetaDTO[]>('/api/admin/metas'),
```

- [ ] **Step 7: Build the grid, read-only for now**

Create `src/components/admin/status-badge.tsx`:

```tsx
import { Badge } from '@/components/ui/badge';

const VARIANT = {
  draft: 'outline',
  published: 'default',
  hidden: 'secondary',
} as const;

export function StatusBadge({ status }: { status: 'draft' | 'published' | 'hidden' }) {
  return <Badge variant={VARIANT[status]}>{status}</Badge>;
}
```

Create `src/components/admin/leader-grid.tsx` as a client component that queries
`keys.adminLeaders`, and renders a responsive grid of cards. Each card shows the
default image via `leaderImageUrl(leader.defaultImageId)` (falling back to the
coloured initial exactly as `LeaderAvatar` does), the name, the set code, and a
`<StatusBadge>`. Above the grid, a filter bar with:

- a status `Select` (all / draft / published / hidden),
- a colour `Select` built from `COLOR_BANDS` in `src/lib/leader-visual.ts`,
- a text `Input` matched against `leaderSearchText(l.name, l.setCode, l.aliases, l.deckCodes)`,
- a "no image" toggle matching `l.images.length === 0`.

Filtering is client-side over the already-fetched list — the catalog is ~300 rows
and a round trip per keystroke would be worse in every way.

Create `src/app/admin/leaders/page.tsx`:

```tsx
import { LeaderGrid } from '@/components/admin/leader-grid';

export default function AdminLeadersPage() {
  return <LeaderGrid />;
}
```

- [ ] **Step 8: Verify by hand**

With the admin role, open `/admin/leaders`. Expect every leader including drafts
and hidden ones, drafts first, artwork rendering, and each filter narrowing the
grid.

- [ ] **Step 9: Commit**

```bash
git add src/services/admin-catalog.ts src/app/api/admin src/app/admin src/components/admin src/lib/api-client.ts src/lib/query-keys.ts src/app/api/admin.route.test.ts
git commit -m "feat(admin): list the whole catalog behind the admin role"
```

---

### Task 6: Bulk status changes

**Files:**
- Modify: `src/services/admin-catalog.ts`
- Create: `src/lib/validation/admin-catalog.ts`
- Create: `src/app/api/admin/leaders/status/route.ts`
- Create: `src/app/api/admin/metas/status/route.ts`
- Create: `src/components/admin/selection-bar.tsx`
- Modify: `src/components/admin/leader-grid.tsx`
- Modify: `src/lib/api-client.ts`
- Test: `src/app/api/admin.route.test.ts`

**Interfaces:**
- Consumes: `adminListLeaders` from Task 5.
- Produces: `setCatalogStatus(db, table, ids, status)` returning the number of rows changed; `bulkStatusSchema` = `{ ids: string[] (1..500, uuid), status: 'draft'|'published'|'hidden' }`; `apiClient.adminSetLeaderStatus(body)`, `apiClient.adminSetMetaStatus(body)`.

- [ ] **Step 1: Write the failing test**

Append to `src/app/api/admin.route.test.ts`:

```ts
describe('/api/admin/leaders/status', () => {
  beforeEach(async () => { await resetDb(); auth.mockReset(); });

  async function threeDrafts() {
    return db.insert(leaders).values([
      { name: 'A', colors: ['red'], status: 'draft' },
      { name: 'B', colors: ['red'], status: 'draft' },
      { name: 'C', colors: ['red'], status: 'draft' },
    ]).returning();
  }

  function patch(body: unknown) {
    return new Request('http://localhost/api/admin/leaders/status', {
      method: 'PATCH', body: JSON.stringify(body),
    });
  }

  it('403s without the admin role', async () => {
    asPlayer();
    const { PATCH } = await import('./admin/leaders/status/route');
    expect((await PATCH(patch({ ids: [], status: 'published' }))).status).toBe(403);
  });

  it('publishes exactly the selected rows and leaves the rest alone', async () => {
    const [a, b, c] = await threeDrafts();
    asAdmin();
    const { PATCH } = await import('./admin/leaders/status/route');
    const res = await PATCH(patch({ ids: [a.id, b.id], status: 'published' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ changed: 2 });

    const after = await db.select().from(leaders);
    const byId = Object.fromEntries(after.map((l) => [l.id, l.status]));
    expect(byId[a.id]).toBe('published');
    expect(byId[b.id]).toBe('published');
    expect(byId[c.id]).toBe('draft');
  });

  it('rejects an empty selection', async () => {
    asAdmin();
    const { PATCH } = await import('./admin/leaders/status/route');
    expect((await PATCH(patch({ ids: [], status: 'published' }))).status).toBe(400);
  });

  it('rejects a status outside the enum', async () => {
    const [a] = await threeDrafts();
    asAdmin();
    const { PATCH } = await import('./admin/leaders/status/route');
    expect((await PATCH(patch({ ids: [a.id], status: 'retired' }))).status).toBe(400);
  });

  it('reports zero changed for ids that do not exist', async () => {
    asAdmin();
    const { PATCH } = await import('./admin/leaders/status/route');
    const res = await PATCH(patch({
      ids: ['00000000-0000-0000-0000-000000000000'], status: 'published',
    }));
    expect(await res.json()).toEqual({ changed: 0 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/app/api/admin.route.test.ts`
Expected: FAIL — the status route does not exist.

- [ ] **Step 3: Write the validation schema**

Create `src/lib/validation/admin-catalog.ts`:

```ts
import { z } from 'zod';

/**
 * A bulk status change. The 500 cap is not a guess at a limit: the grid's
 * "select all" applies to the current filter, and the whole catalog is ~300
 * rows, so anything larger is a client bug rather than a real selection.
 */
export const bulkStatusSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  status: z.enum(['draft', 'published', 'hidden']),
});

export type BulkStatusInput = z.infer<typeof bulkStatusSchema>;
```

- [ ] **Step 4: Write the service**

Append to `src/services/admin-catalog.ts`:

```ts
/**
 * Move a set of catalog rows to one status.
 *
 * Returns how many rows actually changed, which is not always how many ids were
 * sent — an id that no longer exists changes nothing, and the caller deserves to
 * know that rather than being told "done".
 */
export async function setLeaderStatus(db: DB, input: BulkStatusInput): Promise<{ changed: number }> {
  const rows = await db.update(leaders)
    .set({ status: input.status })
    .where(inArray(leaders.id, input.ids))
    .returning({ id: leaders.id });
  return { changed: rows.length };
}

export async function setMetaStatus(db: DB, input: BulkStatusInput): Promise<{ changed: number }> {
  const rows = await db.update(metas)
    .set({ status: input.status })
    .where(inArray(metas.id, input.ids))
    .returning({ id: metas.id });
  return { changed: rows.length };
}
```

Add `import type { BulkStatusInput } from '../lib/validation/admin-catalog';`.

- [ ] **Step 5: Write the routes**

`src/app/api/admin/leaders/status/route.ts`:

```ts
import { db } from '@/db/client';
import { requireAdmin, errorToResponse, json } from '@/lib/api/handler';
import { setLeaderStatus } from '@/services/admin-catalog';
import { bulkStatusSchema } from '@/lib/validation/admin-catalog';

export const runtime = 'nodejs';

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
    const input = bulkStatusSchema.parse(await req.json());
    return json(await setLeaderStatus(db, input));
  } catch (err) {
    return errorToResponse(err);
  }
}
```

`src/app/api/admin/metas/status/route.ts` is the same with `setMetaStatus`.

Note the ordering inside the `try`: `requireAdmin()` runs **before** the body is
parsed, so a non-admin gets 403 rather than a 400 that reveals the schema.

- [ ] **Step 6: Run it to verify it passes**

Run: `npm test -- src/app/api/admin.route.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 7: Add the client calls**

In `src/lib/api-client.ts`:

```ts
  adminSetLeaderStatus: (b: BulkStatusInput) =>
    request<{ changed: number }>('/api/admin/leaders/status', { method: 'PATCH', body: JSON.stringify(b) }),
  adminSetMetaStatus: (b: BulkStatusInput) =>
    request<{ changed: number }>('/api/admin/metas/status', { method: 'PATCH', body: JSON.stringify(b) }),
```

- [ ] **Step 8: Build the selection UI**

There is **no checkbox component** in `src/components/ui`. Do not add a
dependency for one — use a button with the checkbox role, which is accessible and
costs nothing:

```tsx
function SelectToggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        'absolute left-2 top-2 z-10 size-5 rounded border-2 bg-background/80 backdrop-blur',
        checked ? 'border-primary bg-primary' : 'border-border',
      )}
    >
      {checked ? <Check className="size-4 text-primary-foreground" /> : null}
    </button>
  );
}
```

In `leader-grid.tsx`, hold `const [selected, setSelected] = useState<Set<string>>(new Set())`.
Add a "Select all" button above the grid that selects **the currently filtered
list**, not the whole catalog — selecting 308 invisible rows is a trap, and the
button's label should say what it will do (`Select all 24 shown`).

Create `src/components/admin/selection-bar.tsx`: a bar fixed to the bottom of the
viewport, rendered only when `selected.size > 0`, with the count and three
buttons — Publish, Hide, Back to draft — each firing the mutation and then
`qc.invalidateQueries({ queryKey: keys.adminLeaders })`.

The count line names what is about to happen, including the part the owner might
not want:

```tsx
const withoutArt = selectedLeaders.filter((l) => l.images.length === 0).length;
const summary = withoutArt > 0
  ? `${selected.size} selected, ${withoutArt} without artwork`
  : `${selected.size} selected`;
```

Publishing an artless leader is **not blocked**. It renders as a coloured initial,
which is degraded but valid, and a guard here would be wrong more often than
useful. Say it, do not prevent it.

- [ ] **Step 9: Verify by hand**

Select three drafts, publish them, and confirm the badges change and the rows
move out of the drafts-first block after the refetch. Then open the player-facing
app and confirm those three now appear in the leader picker.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(admin): publish and hide catalog rows in bulk"
```

---

### Task 7: Editing and creating catalog rows

**Files:**
- Modify: `src/services/admin-catalog.ts`
- Modify: `src/lib/validation/admin-catalog.ts`
- Create: `src/app/api/admin/leaders/[id]/route.ts`
- Create: `src/app/api/admin/metas/[id]/route.ts`
- Modify: `src/app/api/admin/leaders/route.ts` and `src/app/api/admin/metas/route.ts` (add POST)
- Create: `src/components/admin/leader-panel.tsx`
- Create: `src/components/admin/meta-table.tsx`
- Create: `src/app/admin/metas/page.tsx`
- Test: `src/app/api/admin.route.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 5 and 6.
- Produces: `leaderInputSchema` = `{ name, colors[], setCode|null, aliases[], deckCodes[], status }`; `metaInputSchema` = `{ name, code|null, releasedAt|null, status }`; `createLeader`, `updateLeader`, `createMeta`, `updateMeta`.

- [ ] **Step 1: Write the failing test**

Append to `src/app/api/admin.route.test.ts`:

```ts
describe('editing catalog rows', () => {
  beforeEach(async () => { await resetDb(); auth.mockReset(); });

  const body = (b: unknown, method = 'PATCH') =>
    new Request('http://localhost/x', { method, body: JSON.stringify(b) });

  it('creates a leader as a draft by default', async () => {
    asAdmin();
    const { POST } = await import('./admin/leaders/route');
    const res = await POST(body({
      name: 'Homebrew Luffy', colors: ['red'], setCode: null,
      aliases: [], deckCodes: [], status: 'draft',
    }, 'POST'));
    expect(res.status).toBe(200);
    const created = await res.json();
    expect(created.status).toBe('draft');
    expect(created.name).toBe('Homebrew Luffy');
  });

  it('updates a leader name, aliases and status', async () => {
    const [row] = await db.insert(leaders)
      .values({ name: 'Wrong Name', colors: ['red'], setCode: 'OP01-001' }).returning();
    asAdmin();
    const { PATCH } = await import('./admin/leaders/[id]/route');
    const res = await PATCH(body({
      name: 'Roronoa Zoro', colors: ['red'], setCode: 'OP01-001',
      aliases: ['red zoro'], deckCodes: [], status: 'published',
    }), { params: Promise.resolve({ id: row.id }) });
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.name).toBe('Roronoa Zoro');
    expect(updated.aliases).toEqual(['red zoro']);
    expect(updated.status).toBe('published');
  });

  it('404s when updating a leader that does not exist', async () => {
    asAdmin();
    const { PATCH } = await import('./admin/leaders/[id]/route');
    const res = await PATCH(body({
      name: 'X', colors: [], setCode: null, aliases: [], deckCodes: [], status: 'draft',
    }), { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) });
    expect(res.status).toBe(404);
  });

  it('rejects a colour that is not an OPTCG colour', async () => {
    asAdmin();
    const { POST } = await import('./admin/leaders/route');
    const res = await POST(body({
      name: 'X', colors: ['turquoise'], setCode: null, aliases: [], deckCodes: [], status: 'draft',
    }, 'POST'));
    expect(res.status).toBe(400);
  });

  it('403s for a non-admin', async () => {
    asPlayer();
    const { POST } = await import('./admin/leaders/route');
    const res = await POST(body({
      name: 'X', colors: ['red'], setCode: null, aliases: [], deckCodes: [], status: 'draft',
    }, 'POST'));
    expect(res.status).toBe(403);
  });

  it('stores a meta release date', async () => {
    const [row] = await db.insert(metas).values({ name: 'OP16', code: 'OP16' }).returning();
    asAdmin();
    const { PATCH } = await import('./admin/metas/[id]/route');
    const res = await PATCH(body({
      name: 'OP16 Royal Blood', code: 'OP16', releasedAt: '2025-11-01', status: 'published',
    }), { params: Promise.resolve({ id: row.id }) });
    expect((await res.json()).releasedAt).toBe('2025-11-01');
  });

  it('rejects a release date that is not a date', async () => {
    const [row] = await db.insert(metas).values({ name: 'OP16', code: 'OP16' }).returning();
    asAdmin();
    const { PATCH } = await import('./admin/metas/[id]/route');
    const res = await PATCH(body({
      name: 'OP16', code: 'OP16', releasedAt: 'last november', status: 'draft',
    }), { params: Promise.resolve({ id: row.id }) });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/app/api/admin.route.test.ts`
Expected: FAIL — no POST export and no `[id]` routes.

- [ ] **Step 3: Extend the validation**

Append to `src/lib/validation/admin-catalog.ts`:

```ts
/** The six OPTCG colours. A seventh would break every avatar gradient and colour band. */
const COLORS = ['red', 'green', 'blue', 'purple', 'black', 'yellow'] as const;

export const leaderInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  colors: z.array(z.enum(COLORS)).max(6),
  setCode: z.string().trim().min(1).max(20).nullable(),
  aliases: z.array(z.string().trim().min(1).max(40)).max(10),
  deckCodes: z.array(z.string().trim().min(1).max(10)).max(10),
  status: z.enum(['draft', 'published', 'hidden']),
});

export const metaInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(20).nullable(),
  /** ISO date, the format Postgres `date` round-trips through JSON. */
  releasedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  status: z.enum(['draft', 'published', 'hidden']),
});

export type LeaderInput = z.infer<typeof leaderInputSchema>;
export type MetaInput = z.infer<typeof metaInputSchema>;
```

- [ ] **Step 4: Extend the service**

Append to `src/services/admin-catalog.ts`:

```ts
export async function createLeader(db: DB, input: LeaderInput) {
  const [row] = await db.insert(leaders).values(input).returning();
  return { ...row, images: [], defaultImageId: null };
}

export async function updateLeader(db: DB, id: string, input: LeaderInput) {
  const [row] = await db.update(leaders).set(input).where(eq(leaders.id, id)).returning();
  if (!row) throw new NotFoundError('No such leader.');
  const imgs = await db
    .select({ id: leaderImages.id, label: leaderImages.label, isDefault: leaderImages.isDefault })
    .from(leaderImages).where(eq(leaderImages.leaderId, id)).orderBy(asc(leaderImages.sortOrder));
  return {
    ...row,
    images: imgs.map((i) => ({ id: i.id, label: i.label })),
    defaultImageId: imgs.find((i) => i.isDefault)?.id ?? null,
  };
}

export async function createMeta(db: DB, input: MetaInput) {
  const [row] = await db.insert(metas).values(input).returning();
  return row;
}

export async function updateMeta(db: DB, id: string, input: MetaInput) {
  const [row] = await db.update(metas).set(input).where(eq(metas.id, id)).returning();
  if (!row) throw new NotFoundError('No such meta.');
  return row;
}
```

Add `eq` to the drizzle import and `import { NotFoundError } from '../lib/errors';`.

- [ ] **Step 5: Write the routes**

Add to `src/app/api/admin/leaders/route.ts`:

```ts
export async function POST(req: Request) {
  try {
    await requireAdmin();
    const input = leaderInputSchema.parse(await req.json());
    return json(await createLeader(db, input));
  } catch (err) {
    return errorToResponse(err);
  }
}
```

Create `src/app/api/admin/leaders/[id]/route.ts`:

```ts
import { db } from '@/db/client';
import { requireAdmin, errorToResponse, json } from '@/lib/api/handler';
import { updateLeader } from '@/services/admin-catalog';
import { leaderInputSchema } from '@/lib/validation/admin-catalog';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    const { id } = await params;
    const input = leaderInputSchema.parse(await req.json());
    return json(await updateLeader(db, id, input));
  } catch (err) {
    return errorToResponse(err);
  }
}
```

Mirror both for metas with `metaInputSchema`, `createMeta` and `updateMeta`.

**There is deliberately no DELETE.** A leader referenced by a round cannot be
removed without either cascading away real match history or failing on a foreign
key. `hidden` is the delete: it takes the row out of every picker and leaves the
history intact. If a genuinely spurious row ever needs erasing, that is a
one-line SQL statement run by hand, not an endpoint that exists to be misfired.

- [ ] **Step 6: Run it to verify it passes**

Run: `npm test -- src/app/api/admin.route.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 7: Build the edit panel**

Create `src/components/admin/leader-panel.tsx` using `src/components/ui/sheet.tsx`.
It receives `leader: LeaderDTO | null` (null means "new") and holds local form
state seeded from it. Fields: name (`Input`), colours (six toggle buttons using
the same `role="checkbox"` pattern as Task 6, tinted with `LEADER_COLOR_HEX`),
set code (`Input`), aliases and deck codes (comma-separated `Input`s split on
save), status (`Select`).

Save calls `apiClient.adminUpdateLeader(id, values)` or
`apiClient.adminCreateLeader(values)`, then invalidates `keys.adminLeaders` and
`keys.leaders` — the second matters, or the player-facing picker keeps serving
the pre-edit catalog from cache until its hour-long `staleTime` expires.

Wire "New leader" above the grid to open the same panel with `leader={null}`.

- [ ] **Step 8: Build the metas screen**

Create `src/components/admin/meta-table.tsx` — a table, not a grid, since metas
have no artwork: name, code, release date, status badge, and the same selection
toggle and `SelectionBar` from Task 6 wired to `adminSetMetaStatus`. Clicking a
row opens a panel with name, code, release date (`<input type="date">`) and
status.

Create `src/app/admin/metas/page.tsx`:

```tsx
import { MetaTable } from '@/components/admin/meta-table';

export default function AdminMetasPage() {
  return <MetaTable />;
}
```

- [ ] **Step 9: Verify by hand**

Rename a leader and confirm the change appears in the player-facing picker
without a reload. Create a leader from scratch and confirm it arrives as a draft.
Set a release date on OP16 and confirm a new tournament defaults to it.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(admin): edit and create leaders and metas"
```

---

### Task 8: Leader artwork — upload, crop, default, delete

**Files:**
- Create: `src/services/admin-images.ts`
- Create: `src/app/api/admin/leaders/[id]/images/route.ts`
- Create: `src/app/api/admin/images/[id]/route.ts`
- Create: `src/lib/image-crop.ts` (pure crop maths)
- Create: `src/lib/image-crop.test.ts`
- Create: `src/components/admin/image-cropper.tsx`
- Modify: `src/components/admin/leader-panel.tsx`
- Test: `src/app/api/admin-images.route.test.ts`

**Interfaces:**
- Consumes: `leaderImages` (stage 1), `requireAdmin` (Task 4).
- Produces: `sourceRect(natural, frame, view)` from `src/lib/image-crop.ts`; `addLeaderImage(db, leaderId, bytes, label)`, `updateLeaderImage(db, id, patch)`, `deleteLeaderImage(db, id)`; `POST /api/admin/leaders/:id/images`, `PATCH|DELETE /api/admin/images/:id`.

**Output format:** 240×336 WebP. Stage 1's bundled art is 240px wide at the
card's 5:7 footprint, and an upload that does not match it would sit visibly
differently in the same grid.

- [ ] **Step 1: Write the failing test for the crop maths**

Create `src/lib/image-crop.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { coverScale, clampOffset, sourceRect } from './image-crop';

const FRAME = { w: 240, h: 336 };

describe('coverScale', () => {
  it('scales a wide image to cover the frame by height', () => {
    expect(coverScale({ w: 1000, h: 500 }, FRAME)).toBeCloseTo(336 / 500);
  });

  it('scales a tall image to cover the frame by width', () => {
    expect(coverScale({ w: 500, h: 1000 }, FRAME)).toBeCloseTo(240 / 500);
  });
});

describe('clampOffset', () => {
  it('pins a frame-sized image to the centre', () => {
    // At zoom 1 a covering image has no slack on at least one axis.
    expect(clampOffset({ x: 50, y: 50 }, { w: 240, h: 336 }, FRAME)).toEqual({ x: 0, y: 0 });
  });

  it('allows sliding within the overflow and no further', () => {
    const clamped = clampOffset({ x: 999, y: -999 }, { w: 340, h: 436 }, FRAME);
    expect(clamped).toEqual({ x: 50, y: -50 });
  });
});

describe('sourceRect', () => {
  it('takes the whole image when it matches the frame exactly', () => {
    const rect = sourceRect(
      { w: 240, h: 336 },
      FRAME,
      { zoom: 1, offset: { x: 0, y: 0 } },
    );
    expect(rect).toEqual({ sx: 0, sy: 0, sw: 240, sh: 336 });
  });

  it('takes a centred window from an oversized image', () => {
    // 480x672 covers at scale 1, so the source window is the whole image.
    const rect = sourceRect({ w: 480, h: 672 }, FRAME, { zoom: 1, offset: { x: 0, y: 0 } });
    expect(rect).toEqual({ sx: 0, sy: 0, sw: 480, sh: 672 });
  });

  it('halves the window when zoomed to 2x', () => {
    const rect = sourceRect({ w: 240, h: 336 }, FRAME, { zoom: 2, offset: { x: 0, y: 0 } });
    expect(rect.sw).toBeCloseTo(120);
    expect(rect.sh).toBeCloseTo(168);
    expect(rect.sx).toBeCloseTo(60);
    expect(rect.sy).toBeCloseTo(84);
  });

  it('moves the window opposite to the drag', () => {
    // Dragging the image right shows what was to its left.
    const rect = sourceRect({ w: 240, h: 336 }, FRAME, { zoom: 2, offset: { x: 60, y: 0 } });
    expect(rect.sx).toBeCloseTo(30);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/lib/image-crop.test.ts`
Expected: FAIL — `./image-crop` does not exist.

- [ ] **Step 3: Write the crop maths**

Create `src/lib/image-crop.ts`:

```ts
export type Size = { w: number; h: number };
export type Offset = { x: number; y: number };
export type View = { zoom: number; offset: Offset };

/**
 * The scale at which an image just covers the frame — the starting zoom.
 *
 * Cover, not contain: a card slot with letterboxing inside it looks broken, and
 * the owner is choosing which part of the art to keep anyway.
 */
export function coverScale(natural: Size, frame: Size): number {
  return Math.max(frame.w / natural.w, frame.h / natural.h);
}

/** The on-screen size of the image at a given zoom. */
export function displaySize(natural: Size, frame: Size, zoom: number): Size {
  const s = coverScale(natural, frame) * zoom;
  return { w: natural.w * s, h: natural.h * s };
}

/**
 * Keep the frame inside the image.
 *
 * Without this the owner can drag the artwork off the frame and export a band of
 * empty canvas, which is a worse failure than a bad crop because it looks like a
 * broken image rather than a choice.
 */
export function clampOffset(offset: Offset, display: Size, frame: Size): Offset {
  const maxX = Math.max(0, (display.w - frame.w) / 2);
  const maxY = Math.max(0, (display.h - frame.h) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  };
}

/**
 * The rectangle of the source image that the frame is showing, in source pixels.
 *
 * This is what makes the exported crop equal the preview: the preview is a CSS
 * transform and the export is a drawImage, and they agree only because both are
 * derived from the same zoom and offset.
 */
export function sourceRect(natural: Size, frame: Size, view: View) {
  const scale = coverScale(natural, frame) * view.zoom;
  const display = { w: natural.w * scale, h: natural.h * scale };
  const { x, y } = clampOffset(view.offset, display, frame);
  return {
    sx: (display.w / 2 - frame.w / 2 - x) / scale,
    sy: (display.h / 2 - frame.h / 2 - y) / scale,
    sw: frame.w / scale,
    sh: frame.h / scale,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- src/lib/image-crop.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Write the failing test for the image routes**

Create `src/app/api/admin-images.route.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq, asc } from 'drizzle-orm';
import { getTestDb, resetDb, closeTestDb } from '../../../tests/setup/db';
import { leaders, leaderImages } from '../../db/schema';

const auth = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({ auth: () => auth() }));
vi.mock('@/db/client', () => ({ db: getTestDb(), schema: {} }));

const db = getTestDb();
afterAll(closeTestDb);

const asAdmin = () => auth.mockResolvedValue({ userId: 'u', sessionClaims: { metadata: { role: 'admin' } } });
const asPlayer = () => auth.mockResolvedValue({ userId: 'u', sessionClaims: {} });

/** A minimal valid WebP header followed by filler. */
function webp(size = 2048): Buffer {
  const b = Buffer.alloc(size, 0x20);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(size - 8, 4);
  b.write('WEBP', 8, 'ascii');
  return b;
}

function upload(bytes: Buffer, label = 'Custom', type = 'image/webp') {
  const form = new FormData();
  form.set('file', new Blob([bytes], { type }), 'art.webp');
  form.set('label', label);
  return new Request('http://localhost/x', { method: 'POST', body: form });
}

async function makeLeader() {
  const [row] = await db.insert(leaders)
    .values({ name: 'Yamato', colors: ['green'], setCode: 'OP06-022' }).returning();
  return row;
}

describe('POST /api/admin/leaders/[id]/images', () => {
  beforeEach(async () => { await resetDb(); auth.mockReset(); });

  it('403s without the admin role', async () => {
    const leader = await makeLeader();
    asPlayer();
    const { POST } = await import('./admin/leaders/[id]/images/route');
    const res = await POST(upload(webp()), { params: Promise.resolve({ id: leader.id }) });
    expect(res.status).toBe(403);
  });

  it('stores a webp and makes it the default when it is the first', async () => {
    const leader = await makeLeader();
    asAdmin();
    const { POST } = await import('./admin/leaders/[id]/images/route');
    const res = await POST(upload(webp()), { params: Promise.resolve({ id: leader.id }) });
    expect(res.status).toBe(200);
    const rows = await db.select().from(leaderImages).where(eq(leaderImages.leaderId, leader.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].isDefault).toBe(true);
    expect(rows[0].mimeType).toBe('image/webp');
  });

  it('does not steal the default from an existing image', async () => {
    const leader = await makeLeader();
    const bytes = webp();
    await db.insert(leaderImages).values({
      leaderId: leader.id, label: 'Base', data: bytes, mimeType: 'image/webp',
      width: 240, height: 336, byteSize: bytes.byteLength, checksum: 'x', isDefault: true,
    });
    asAdmin();
    const { POST } = await import('./admin/leaders/[id]/images/route');
    await POST(upload(webp(3000)), { params: Promise.resolve({ id: leader.id }) });
    const rows = await db.select().from(leaderImages)
      .where(eq(leaderImages.leaderId, leader.id)).orderBy(asc(leaderImages.sortOrder));
    expect(rows.filter((r) => r.isDefault)).toHaveLength(1);
    expect(rows.find((r) => r.isDefault)?.label).toBe('Base');
  });

  it('rejects a body over the cap', async () => {
    const leader = await makeLeader();
    asAdmin();
    const { POST } = await import('./admin/leaders/[id]/images/route');
    const res = await POST(upload(webp(600 * 1024)), { params: Promise.resolve({ id: leader.id }) });
    expect(res.status).toBe(400);
  });

  it('rejects bytes that are not a webp however they are labelled', async () => {
    // A client can claim any content type; the signature is the only thing that
    // is actually true about the bytes.
    const leader = await makeLeader();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    asAdmin();
    const { POST } = await import('./admin/leaders/[id]/images/route');
    const res = await POST(upload(png), { params: Promise.resolve({ id: leader.id }) });
    expect(res.status).toBe(400);
  });
});

describe('PATCH/DELETE /api/admin/images/[id]', () => {
  beforeEach(async () => { await resetDb(); auth.mockReset(); });

  async function twoImages() {
    const leader = await makeLeader();
    const bytes = webp();
    const common = {
      leaderId: leader.id, data: bytes, mimeType: 'image/webp',
      width: 240, height: 336, byteSize: bytes.byteLength,
    };
    const [base] = await db.insert(leaderImages)
      .values({ ...common, label: 'Base', checksum: 'a', isDefault: true, sortOrder: 0 }).returning();
    const [alt] = await db.insert(leaderImages)
      .values({ ...common, label: 'p1', checksum: 'b', sortOrder: 1 }).returning();
    return { leader, base, alt };
  }

  const patch = (b: unknown) => new Request('http://localhost/x', { method: 'PATCH', body: JSON.stringify(b) });

  it('renames a label', async () => {
    const { alt } = await twoImages();
    asAdmin();
    const { PATCH } = await import('./admin/images/[id]/route');
    const res = await PATCH(patch({ label: 'Alternate Art' }), { params: Promise.resolve({ id: alt.id }) });
    expect(res.status).toBe(200);
    const [row] = await db.select().from(leaderImages).where(eq(leaderImages.id, alt.id));
    expect(row.label).toBe('Alternate Art');
  });

  it('moves the default without violating the one-default constraint', async () => {
    const { base, alt } = await twoImages();
    asAdmin();
    const { PATCH } = await import('./admin/images/[id]/route');
    const res = await PATCH(patch({ isDefault: true }), { params: Promise.resolve({ id: alt.id }) });
    expect(res.status).toBe(200);
    const rows = await db.select().from(leaderImages);
    expect(rows.find((r) => r.id === alt.id)?.isDefault).toBe(true);
    expect(rows.find((r) => r.id === base.id)?.isDefault).toBe(false);
  });

  it('promotes a survivor when the default is deleted', async () => {
    // A leader with images but no default renders as a blank slot, which reads
    // as a bug rather than as a deletion.
    const { base, alt } = await twoImages();
    asAdmin();
    const { DELETE } = await import('./admin/images/[id]/route');
    await DELETE(new Request('http://localhost/x', { method: 'DELETE' }), {
      params: Promise.resolve({ id: base.id }),
    });
    const rows = await db.select().from(leaderImages);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(alt.id);
    expect(rows[0].isDefault).toBe(true);
  });

  it('403s without the admin role', async () => {
    const { alt } = await twoImages();
    asPlayer();
    const { PATCH } = await import('./admin/images/[id]/route');
    const res = await PATCH(patch({ label: 'X' }), { params: Promise.resolve({ id: alt.id }) });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm test -- src/app/api/admin-images.route.test.ts`
Expected: FAIL — the routes do not exist.

- [ ] **Step 7: Write the image service**

Create `src/services/admin-images.ts`:

```ts
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { leaderImages } from '../db/schema';
import { NotFoundError, ValidationError } from '../lib/errors';

type DB = NodePgDatabase<typeof schema>;

export const MAX_IMAGE_BYTES = 512 * 1024;

/**
 * Whether these bytes really are a WebP.
 *
 * The declared content type is whatever the client felt like sending. The RIFF
 * container's magic is the only statement about the bytes that the bytes
 * themselves make.
 */
export function isWebp(bytes: Buffer): boolean {
  return bytes.length > 12
    && bytes.toString('ascii', 0, 4) === 'RIFF'
    && bytes.toString('ascii', 8, 12) === 'WEBP';
}

export async function addLeaderImage(db: DB, leaderId: string, bytes: Buffer, label: string) {
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new ValidationError('Image too large.');
  if (!isWebp(bytes)) throw new ValidationError('Image must be a WebP.');

  const existing = await db.select({ sortOrder: leaderImages.sortOrder })
    .from(leaderImages).where(eq(leaderImages.leaderId, leaderId));

  const [row] = await db.insert(leaderImages).values({
    leaderId,
    cardImageId: null,
    label,
    data: bytes,
    mimeType: 'image/webp',
    width: 240,
    height: 336,
    byteSize: bytes.byteLength,
    checksum: createHash('sha256').update(bytes).digest('hex'),
    // First image in, first image shown. Later uploads never displace a default
    // the owner chose — that is what the star in the panel is for.
    isDefault: existing.length === 0,
    sortOrder: existing.length,
  }).returning({ id: leaderImages.id, label: leaderImages.label, isDefault: leaderImages.isDefault });

  return row;
}

export async function updateLeaderImage(db: DB, id: string, patch: { label?: string; isDefault?: boolean }) {
  const [image] = await db.select().from(leaderImages).where(eq(leaderImages.id, id)).limit(1);
  if (!image) throw new NotFoundError('No such image.');

  return db.transaction(async (tx) => {
    if (patch.isDefault) {
      // Clear first: the partial unique index rejects two defaults, so the order
      // of these two statements is the difference between working and erroring.
      await tx.update(leaderImages).set({ isDefault: false })
        .where(and(eq(leaderImages.leaderId, image.leaderId), ne(leaderImages.id, id)));
    }
    const [row] = await tx.update(leaderImages)
      .set({
        ...(patch.label === undefined ? {} : { label: patch.label }),
        ...(patch.isDefault === undefined ? {} : { isDefault: patch.isDefault }),
      })
      .where(eq(leaderImages.id, id))
      .returning({ id: leaderImages.id, label: leaderImages.label, isDefault: leaderImages.isDefault });
    return row;
  });
}

export async function deleteLeaderImage(db: DB, id: string) {
  const [image] = await db.select().from(leaderImages).where(eq(leaderImages.id, id)).limit(1);
  if (!image) throw new NotFoundError('No such image.');

  return db.transaction(async (tx) => {
    await tx.delete(leaderImages).where(eq(leaderImages.id, id));
    if (!image.isDefault) return { ok: true };

    // Leaving a leader with images but no default renders a blank slot, which
    // reads as a bug rather than as a deletion.
    const [survivor] = await tx.select({ id: leaderImages.id }).from(leaderImages)
      .where(eq(leaderImages.leaderId, image.leaderId))
      .orderBy(asc(leaderImages.sortOrder)).limit(1);
    if (survivor) {
      await tx.update(leaderImages).set({ isDefault: true }).where(eq(leaderImages.id, survivor.id));
    }
    return { ok: true };
  });
}
```

- [ ] **Step 8: Write the routes**

`src/app/api/admin/leaders/[id]/images/route.ts`:

```ts
import { db } from '@/db/client';
import { requireAdmin, errorToResponse, json } from '@/lib/api/handler';
import { addLeaderImage, MAX_IMAGE_BYTES } from '@/services/admin-images';
import { ValidationError } from '@/lib/errors';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    const { id } = await params;
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof Blob)) throw new ValidationError('No file.');
    if (file.size > MAX_IMAGE_BYTES) throw new ValidationError('Image too large.');
    const label = String(form.get('label') ?? 'Custom').trim().slice(0, 40) || 'Custom';
    const bytes = Buffer.from(await file.arrayBuffer());
    return json(await addLeaderImage(db, id, bytes, label));
  } catch (err) {
    return errorToResponse(err);
  }
}
```

`src/app/api/admin/images/[id]/route.ts` exports `PATCH` (body validated with a
zod schema of `{ label: string optional, isDefault: boolean optional }`) and
`DELETE`, both calling `requireAdmin()` first and delegating to the service.

- [ ] **Step 9: Run it to verify it passes**

Run: `npm test -- src/app/api/admin-images.route.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 10: Build the cropper**

Create `src/components/admin/image-cropper.tsx`, a client component:

- a file `<input type="file" accept="image/*">` producing an object URL;
- a 240×336 frame with `overflow-hidden`, holding the `<img>` with
  `transform: translate(${offset.x}px, ${offset.y}px) scale(${zoom})` and
  `transform-origin: center`, sized by `displaySize(natural, FRAME, 1)`;
- pointer drag updating `offset`, run through `clampOffset`;
- a zoom `<input type="range" min="1" max="4" step="0.01">`;
- a confirm button that draws to a canvas and uploads:

```tsx
const FRAME = { w: 240, h: 336 };

async function exportCrop(img: HTMLImageElement, view: View): Promise<Blob> {
  const natural = { w: img.naturalWidth, h: img.naturalHeight };
  const { sx, sy, sw, sh } = sourceRect(natural, FRAME, view);
  const canvas = document.createElement('canvas');
  canvas.width = FRAME.w;
  canvas.height = FRAME.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2d context');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, FRAME.w, FRAME.h);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.85),
  );
  if (!blob) throw new Error('Could not encode WebP');
  return blob;
}
```

Then POST it as `FormData` with `file` and `label` to
`/api/admin/leaders/${leaderId}/images`, and invalidate `keys.adminLeaders` and
`keys.leaders`.

If `canvas.toBlob` yields null for `image/webp`, surface the error to the owner
rather than silently falling back to PNG — the server rejects non-WebP bytes, so
a silent fallback would produce a confusing 400.

- [ ] **Step 11: Extend the leader panel**

In `src/components/admin/leader-panel.tsx`, add an images section listing
`leader.images` as thumbnails from `leaderImageUrl(img.id)`, each with: a star
button (`PATCH { isDefault: true }`), an inline-editable label
(`PATCH { label }`), and a delete button (`DELETE`). Mount `<ImageCropper>`
below for adding one.

- [ ] **Step 12: Verify by hand**

Upload a full card scan into a leader, drag and zoom until the frame holds the
character's face, confirm, and check the stored thumbnail matches what the frame
showed. Then set it as default and confirm the grid and the player-facing picker
both change.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat(admin): upload, crop and manage leader artwork"
```

---

### Task 9: The importer proposes instead of overwriting

**Files:**
- Create: `scripts/import-catalog.ts`
- Create: `src/lib/catalog-import.ts` (pure diffing)
- Create: `src/lib/catalog-import.test.ts`
- Modify: `src/db/seed.ts`
- Create: `tests/fixtures/catalog.ts`
- Modify: `package.json`, `README.md`, `.gitignore`
- Delete: `scripts/build-leader-data.ts`, `tests/build-leader-data.test.ts`, `src/db/seed-data.ts`
- Test: `src/db/seed.test.ts`, `src/lib/catalog-import.test.ts`

**Interfaces:**
- Consumes: `catalogStatus` (Task 1), `leaderImages` (stage 1).
- Produces: `diffLeader(existing, incoming)` returning `string[]` of differing field names; `seedReferenceData(db, data)` where `data = { leaders: SeedLeader[], metas: SeedMeta[] }`; the npm script `db:import-catalog`.

- [ ] **Step 1: Write the failing test for the diff**

Create `src/lib/catalog-import.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { diffLeader } from './catalog-import';

describe('diffLeader', () => {
  it('reports nothing when they agree', () => {
    expect(diffLeader(
      { name: 'Yamato', colors: ['green', 'yellow'] },
      { name: 'Yamato', colors: ['green', 'yellow'] },
    )).toEqual([]);
  });

  it('reports a differing name', () => {
    expect(diffLeader(
      { name: 'Yamato', colors: ['green'] },
      { name: 'Yamato (Alt)', colors: ['green'] },
    )).toEqual(['name']);
  });

  it('ignores colour ordering', () => {
    // The API is not stable about ordering, and a reported difference the owner
    // cannot act on trains them to ignore the report.
    expect(diffLeader(
      { name: 'Yamato', colors: ['green', 'yellow'] },
      { name: 'Yamato', colors: ['yellow', 'green'] },
    )).toEqual([]);
  });

  it('reports both fields when both differ', () => {
    expect(diffLeader(
      { name: 'A', colors: ['red'] },
      { name: 'B', colors: ['blue'] },
    ).sort()).toEqual(['colors', 'name']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/lib/catalog-import.test.ts`
Expected: FAIL — `./catalog-import` does not exist.

- [ ] **Step 3: Write the diff**

Create `src/lib/catalog-import.ts`:

```ts
type Comparable = { name: string; colors: string[] };

/**
 * Which fields the API disagrees with us about.
 *
 * The importer never applies these — it prints them. The whole point of this
 * rework is that a hand correction outranks the API, so a difference is a
 * question for the owner, not an instruction to the script.
 *
 * Colour order is ignored: optcgapi is not stable about it, and a difference
 * nobody can act on teaches the owner to skim past the report.
 */
export function diffLeader(existing: Comparable, incoming: Comparable): string[] {
  const fields: string[] = [];
  if (existing.name !== incoming.name) fields.push('name');
  const a = [...existing.colors].sort().join(',');
  const b = [...incoming.colors].sort().join(',');
  if (a !== b) fields.push('colors');
  return fields;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- src/lib/catalog-import.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Give the seed its data as an argument**

`src/db/seed.ts` currently imports `SEED_LEADERS` and `SEED_METAS` from a
generated file that is about to be deleted. Change its signature:

```ts
export type SeedLeader = { name: string; colors: string[]; setCode: string };
export type SeedMeta = { name: string; code: string };

export async function seedReferenceData(
  db: DB,
  data: { leaders: SeedLeader[]; metas: SeedMeta[] },
) {
```

and replace the two `for` loops' sources with `data.leaders` and `data.metas`.
Delete the `SEED_LEADERS` / `SEED_METAS` import and the `npm run db:seed`
bottom-of-file block — there is no longer a canonical dataset to seed from, and
the importer is the way catalog data enters.

Create `tests/fixtures/catalog.ts`:

```ts
import type { SeedLeader, SeedMeta } from '../../src/db/seed';

/**
 * A five-leader catalog for tests.
 *
 * Small on purpose. Tests that need "a leader" should not depend on the real
 * 308-row catalog: the assertions get slower, and any of them that accidentally
 * depend on real data break when a set releases.
 */
export const FIXTURE_LEADERS: SeedLeader[] = [
  { name: 'Roronoa Zoro', colors: ['red'], setCode: 'OP01-001' },
  { name: 'Trafalgar Law', colors: ['green', 'red'], setCode: 'OP01-002' },
  { name: 'Monkey D. Luffy', colors: ['green', 'red'], setCode: 'OP01-003' },
  { name: 'Kaido', colors: ['blue', 'purple'], setCode: 'OP01-061' },
  { name: 'Yamato', colors: ['green', 'yellow'], setCode: 'OP06-022' },
];

export const FIXTURE_METAS: SeedMeta[] = [
  { name: 'OP01 Romance Dawn', code: 'OP01' },
  { name: 'OP06 Wings of the Captain', code: 'OP06' },
];

export const FIXTURE_CATALOG = { leaders: FIXTURE_LEADERS, metas: FIXTURE_METAS };
```

Update every caller — `src/db/seed.test.ts`, `src/app/api/reference.route.test.ts`
and anything `grep -rn "seedReferenceData" src tests` finds — to pass
`FIXTURE_CATALOG`. Assertions that named a leader not in the fixture (for
instance the existing `'Roronoa Zoro'` check) keep working; any that relied on
the full catalog's size must be rewritten against the fixture.

- [ ] **Step 6: Write the importer**

Create `scripts/import-catalog.ts`. Start from the current
`scripts/build-leader-data.ts` — its optcgapi fetching, its promo handling and
its `sharp` resizing are all correct and worth keeping. Replace only the output:
instead of writing `seed-data.ts`, `leader-images.ts` and `public/leaders/`, it
writes rows.

```ts
/**
 * Pulls the OPTCG catalog from optcgapi and proposes what is new.
 *
 *   npm run db:import-catalog
 *
 * INSERT-ONLY, on purpose. This script used to generate the catalog, which meant
 * every hand correction died at the next run. Now it may add a leader, a meta or
 * a printing that does not exist yet, and nothing else. Where it disagrees with
 * the database it prints the disagreement and moves on.
 *
 * Run by hand when a set drops — never in `next build`. optcgapi's docs ask
 * callers not to hammer the API.
 */
```

Its main loop, per API leader:

1. `SELECT` the global leader with that `set_code`.
2. Absent → `INSERT` with `status: 'draft'`, then insert each printing into
   `leader_images` (download, `sharp().resize(240)`, `.webp()`, sha256), the
   first one `isDefault: true`.
3. Present → `diffLeader(existing, incoming)`; if non-empty, collect it for the
   report. **Write nothing.** Then insert only printings whose `card_image_id`
   is not already a row for that leader, with `isDefault: false`.

Per API set: insert a `draft` meta if no meta has that code; otherwise skip.

Close with a report:

```
inserted:   4 leaders (draft), 1 meta (draft), 11 printings
unchanged:  304 leaders
differs:    2 leaders — NOT modified:
  OP05-060  name: "Monkey D. Luffy" (db) vs "Monkey.D.Luffy" (api)
  OP09-051  colors: black,yellow (db) vs yellow,black (api)
```

Add to `package.json`:

```json
"db:import-catalog": "tsx --env-file-if-exists=.env.local scripts/import-catalog.ts",
```

and remove `data:leaders`.

- [ ] **Step 7: Test the importer's write rules against fixture responses**

Add to `src/lib/catalog-import.test.ts` a `describe` that exercises the
insert-only rules against the test database, by extracting the loop body from the
script into an exported `applyImport(db, apiLeaders, apiSets)` in
`src/lib/catalog-import.ts` and having the script call it. Keep the fetching in
the script and the decisions in the tested module — the network is what makes the
script untestable, and the decisions are the part that matters.

Assert: a leader whose set code is absent is inserted as `draft`; a leader that
exists with a different name is **not** modified and is returned in the
`differs` list; a printing already present is not inserted twice; a new printing
of an existing leader is inserted with `isDefault: false`.

Use plain objects for the API rows — no network, no fixtures on disk.

- [ ] **Step 8: Delete the old generator**

```bash
git rm scripts/build-leader-data.ts tests/build-leader-data.test.ts src/db/seed-data.ts
```

Remove the `/public/leaders/` entry from `.gitignore` — nothing writes that
folder any more, and an ignore rule for a path nothing produces is a puzzle for
whoever reads it next.

- [ ] **Step 9: Update the README**

Add a setup section saying that a fresh database has **no catalog** until
`npm run db:import-catalog` has run, and that its output arrives as drafts which
must be published in `/admin/leaders` before players can select them. This is the
one change in this plan that silently breaks a new contributor's first run if it
goes undocumented.

- [ ] **Step 10: Run the full suite**

```bash
npx tsc --noEmit && npm run lint && npm test
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(catalog): import proposes drafts instead of overwriting"
```

---

### Task 10: End-to-end verification

No new code. This is the task that decides whether the previous nine actually
work together, and it cannot be automated here.

- [ ] **Step 1: Run the importer against a fresh local database**

```bash
npm run db:migrate && npm run db:import-catalog
```

Expected: several hundred leaders and 16 metas inserted as drafts, printings
downloaded, and a report with no differences (nothing existed to differ from).

- [ ] **Step 2: Confirm the player app is empty and says so honestly**

Open the player-facing leader picker. Expect **no leaders** — everything is
draft. This is correct, and it is the moment to check that an empty picker
renders an empty state rather than a broken layout.

- [ ] **Step 3: Publish in bulk and watch it appear**

In `/admin/leaders`, filter to drafts, select all shown, publish. Reload the
player picker and confirm the catalog is there.

- [ ] **Step 4: Exercise the whole loop on one leader**

Pick a leader whose art is wrong. Open the panel, upload a correct scan, crop it,
set it as default, rename the old printing's label, delete a wrong image. Confirm
the grid, the player picker, a match card and the `html-to-image` share card all
show the new art.

- [ ] **Step 5: Confirm hiding does not damage history**

Hide a leader you have played against. Confirm it disappears from the picker and
that the past match still shows its name and art.

- [ ] **Step 6: Re-run the importer and confirm it changes nothing**

```bash
npm run db:import-catalog
```

Expected: `inserted: 0`, everything unchanged, and any hand-edited name listed
under `differs` rather than being silently restored. **This is the single
assertion that the original problem is solved.** If a hand correction is
overwritten here, stop and report it.

- [ ] **Step 7: Commit any documentation fixes the walkthrough surfaced**

```bash
git add -A
git commit -m "docs: corrections found during end-to-end verification"
```

---

## Done when

- Statuses exist on both tables; pre-existing rows are `published`; new rows default to `draft`.
- The admin publishes, hides, edits, creates, and manages artwork for leaders and metas.
- `npm run db:import-catalog` inserts drafts and modifies nothing that exists.
- `src/db/seed-data.ts`, `src/lib/leader-deck-codes.ts` and `scripts/build-leader-data.ts` are gone.
- `npx tsc --noEmit`, `npm run lint` and `npm test` pass.

## What the owner must do by hand

1. **Clerk dashboard → Sessions → Customize session token**: `{"metadata": "{{user.public_metadata}}"}`.
2. **Clerk dashboard → your user → Public metadata**: `{"role": "admin"}`. Sign out and back in so the token is reissued.
3. After deploying: `npm run db:import-catalog`, then publish the drafts.
4. Enter the 16 meta release dates in `/admin/metas`.
