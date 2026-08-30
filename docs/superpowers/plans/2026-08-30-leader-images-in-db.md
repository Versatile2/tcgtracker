# Leader Images in the Database — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move leader card art out of generated files and into Postgres, with no visible change to the application.

**Architecture:** A new `leader_images` table holds the bytes; rows are immutable, so `/api/leader-images/[id]` can serve them with a one-year `immutable` cache and never need a purge. `leader_art` (the per-player choice of printing) is rewired from `(set_code, art)` strings onto real foreign keys. The generated modules and the 428 files in `public/leaders/` are deleted last, after a verified backfill.

**Tech Stack:** Next.js 16.2.10 (App Router), drizzle-orm 0.45.2 / drizzle-kit 0.31.10, node-postgres, Clerk, Vitest against a real Postgres, sharp (devDependency, scripts only).

**Spec:** `docs/superpowers/specs/2026-08-30-leader-images-in-db-design.md`

## Global Constraints

- **This is not the Next.js in your training data.** Per `AGENTS.md`, read the relevant guide in `node_modules/next/dist/docs/` before writing route handler or caching code, and heed deprecation notices.
- Dynamic route context is a Promise. The in-repo pattern is `type Ctx = { params: Promise<{ id: string }> }` — see `src/app/api/rounds/[id]/route.ts:7`.
- Every API route declares `export const runtime = 'nodejs'`.
- Tests run against a real Postgres at `DATABASE_URL_TEST` with `fileParallelism: false`. Do not introduce mocks for the database. The only mocks in this codebase are `@clerk/nextjs/server` and `@/db/client` — follow `src/app/api/reference.route.test.ts:5-6` exactly.
- drizzle-orm 0.45.2: the table's second argument returns an **array** of constraints, e.g. `(t) => [primaryKey({ columns: [...] })]` — see `src/db/schema.ts:47`.
- `sharp` stays in `devDependencies`. Nothing in `src/` may import it.
- Comments and prose in this codebase are English. Match that.
- Before starting: `npm install`, and create `.env.local` from `.env.example` with a real `DATABASE_URL` and a **separate** `DATABASE_URL_TEST`.

---

### Task 1: The `leader_images` table

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `tests/setup/db.ts:26-30` (the TRUNCATE list)
- Create: `drizzle/00NN_*.sql` (generated — do not hand-write)
- Test: `src/db/schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `leaderImages` table export from `src/db/schema.ts`, with columns `id`, `leaderId`, `cardImageId`, `label`, `data`, `mimeType`, `width`, `height`, `byteSize`, `checksum`, `isDefault`, `sortOrder`, `createdAt`.

- [ ] **Step 1: Write the failing tests**

Append to `src/db/schema.test.ts`, inside a new `describe` block at the end of the file:

```ts
describe('leader_images', () => {
  beforeEach(async () => { await resetDb(); });
  // No afterAll here: the existing `describe('schema')` block already closes the
  // shared pool, and calling pool.end() twice throws.

  async function makeLeader() {
    const [row] = await db.insert(leaders)
      .values({ name: 'Yamato', colors: ['green'], setCode: 'OP06-022' })
      .returning();
    return row;
  }

  const bytes = Buffer.from('not-really-a-webp');

  it('allows only one default image per leader', async () => {
    const leader = await makeLeader();
    const base = {
      leaderId: leader.id, data: bytes, mimeType: 'image/webp',
      width: 240, height: 335, byteSize: bytes.byteLength, checksum: 'abc',
    };
    await db.insert(leaderImages).values({ ...base, cardImageId: 'OP06-022', label: 'Base', isDefault: true });
    await expect(
      db.insert(leaderImages).values({ ...base, cardImageId: 'OP06-022_p1', label: 'p1', isDefault: true }),
    ).rejects.toThrow();
  });

  it('allows many non-default images for one leader', async () => {
    const leader = await makeLeader();
    const base = {
      leaderId: leader.id, data: bytes, mimeType: 'image/webp',
      width: 240, height: 335, byteSize: bytes.byteLength, checksum: 'abc',
    };
    await db.insert(leaderImages).values({ ...base, cardImageId: 'OP06-022', label: 'Base', isDefault: true });
    await db.insert(leaderImages).values({ ...base, cardImageId: 'OP06-022_p1', label: 'p1' });
    await db.insert(leaderImages).values({ ...base, cardImageId: 'OP06-022_p2', label: 'p2' });
    const rows = await db.select().from(leaderImages).where(eq(leaderImages.leaderId, leader.id));
    expect(rows).toHaveLength(3);
  });

  it('rejects the same printing twice for one leader', async () => {
    const leader = await makeLeader();
    const base = {
      leaderId: leader.id, cardImageId: 'OP06-022', label: 'Base', data: bytes,
      mimeType: 'image/webp', width: 240, height: 335, byteSize: bytes.byteLength, checksum: 'abc',
    };
    await db.insert(leaderImages).values(base);
    await expect(db.insert(leaderImages).values(base)).rejects.toThrow();
  });

  it('reads bytes back unchanged', async () => {
    const leader = await makeLeader();
    const [row] = await db.insert(leaderImages).values({
      leaderId: leader.id, cardImageId: 'OP06-022', label: 'Base', data: bytes,
      mimeType: 'image/webp', width: 240, height: 335, byteSize: bytes.byteLength, checksum: 'abc',
    }).returning();
    expect(Buffer.isBuffer(row.data)).toBe(true);
    expect(row.data.equals(bytes)).toBe(true);
  });

  it('deletes a leader images with the leader', async () => {
    const leader = await makeLeader();
    await db.insert(leaderImages).values({
      leaderId: leader.id, cardImageId: 'OP06-022', label: 'Base', data: bytes,
      mimeType: 'image/webp', width: 240, height: 335, byteSize: bytes.byteLength, checksum: 'abc',
    });
    await db.delete(leaders).where(eq(leaders.id, leader.id));
    const rows = await db.select().from(leaderImages);
    expect(rows).toHaveLength(0);
  });
});
```

Update the import at the top of the file from `import { leaders } from './schema';` to:

```ts
import { leaders, leaderImages } from './schema';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/db/schema.test.ts`
Expected: FAIL. The import of `leaderImages` does not resolve, so the whole file errors before any test runs.

- [ ] **Step 3: Add the custom `bytea` type and the table**

In `src/db/schema.ts`, change the first import line to add `uniqueIndex` and `customType`, and add a `sql` import:

```ts
import { pgTable, pgEnum, uuid, text, boolean, integer, timestamp, date, jsonb, primaryKey, uniqueIndex, customType } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
```

Add the custom type just below the imports:

```ts
/**
 * Postgres bytea. drizzle-orm ships no bytea column and node-postgres already
 * hands one back as a Buffer, so this is a straight pass-through.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() { return 'bytea'; },
});
```

Add the table immediately after the `leaders` table (so it sits next to what it belongs to):

```ts
/**
 * A leader's card art, stored as bytes rather than as a file in public/.
 *
 * Rows are immutable. Correcting a leader's art inserts a new row and moves
 * `isDefault`; it never rewrites `data`. That is what lets /api/leader-images
 * serve these with `immutable` caching — an id names bytes that cannot change,
 * so a correction produces a new URL rather than a stale cache.
 */
export const leaderImages = pgTable('leader_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  leaderId: uuid('leader_id').notNull().references(() => leaders.id, { onDelete: 'cascade' }),
  /** The optcgapi card_image_id this came from ('OP06-022_p2'); null for art added by hand. */
  cardImageId: text('card_image_id'),
  /** Shown in the printing picker: 'Base', 'p1', 'p2', 'pr1'. */
  label: text('label').notNull(),
  data: bytea('data').notNull(),
  mimeType: text('mime_type').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  byteSize: integer('byte_size').notNull(),
  /** sha256 of `data`, hex. Doubles as the ETag and as a dedup key. */
  checksum: text('checksum').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Nulls are distinct in Postgres, so this pins imported printings without
  // blocking several hand-uploaded images on one leader.
  uniqueIndex('leader_images_leader_card_uq').on(t.leaderId, t.cardImageId),
  // "Exactly one default per leader", enforced by Postgres rather than by
  // application code that every future writer would have to remember.
  uniqueIndex('leader_images_one_default_uq').on(t.leaderId).where(sql`${t.isDefault}`),
]);
```

- [ ] **Step 4: Generate the migration**

Run: `npm run db:generate`
Expected: a new file `drizzle/00NN_<name>.sql` containing `CREATE TABLE "leader_images"` and both `CREATE UNIQUE INDEX` statements, one of them carrying a `WHERE "is_default"` clause.

Open the generated SQL and confirm the partial index has its `WHERE` clause. If drizzle-kit emitted it without one, add ` WHERE "is_default"` to that statement by hand — the test in Step 1 is what proves it.

- [ ] **Step 5: Add the table to the test reset**

In `tests/setup/db.ts`, change the TRUNCATE to:

```ts
export async function resetDb() {
  await testDb.execute(
    sql`TRUNCATE TABLE rounds, tournaments, metas, leaders, leader_art, leader_images RESTART IDENTITY CASCADE`,
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- src/db/schema.test.ts`
Expected: PASS, 6 tests (the pre-existing one plus the 5 new ones).

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts src/db/schema.test.ts tests/setup/db.ts drizzle/
git commit -m "feat(db): add leader_images table with one-default-per-leader constraint"
```

---

### Task 2: Serve images over HTTP

**Files:**
- Create: `src/services/leader-images.ts`
- Create: `src/app/api/leader-images/[id]/route.ts`
- Test: `src/app/api/leader-images.route.test.ts`

**Interfaces:**
- Consumes: `leaderImages` from Task 1.
- Produces: `findLeaderImage(db, id)` returning `{ data: Buffer; mimeType: string; checksum: string } | null`; the route `GET /api/leader-images/:id`.

**This route is deliberately unauthenticated.** Card art is public game data, not user data, and a `Cache-Control: public` header on an authenticated route would be a bug — the CDN would serve one user's response to everyone. Nothing about which leader a player uses is exposed: the id says nothing without a session that already lists it.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/leader-images.route.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../../tests/setup/db';
import { leaders, leaderImages } from '../../db/schema';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_api' })) }));
vi.mock('@/db/client', () => ({ db: getTestDb(), schema: {} }));

const db = getTestDb();
afterAll(closeTestDb);

const bytes = Buffer.from('not-really-a-webp');

async function seedImage() {
  const [leader] = await db.insert(leaders)
    .values({ name: 'Yamato', colors: ['green'], setCode: 'OP06-022' })
    .returning();
  const [image] = await db.insert(leaderImages).values({
    leaderId: leader.id, cardImageId: 'OP06-022', label: 'Base', data: bytes,
    mimeType: 'image/webp', width: 240, height: 335, byteSize: bytes.byteLength,
    checksum: 'sha-of-the-bytes', isDefault: true,
  }).returning();
  return image;
}

describe('/api/leader-images/[id]', () => {
  beforeEach(async () => { await resetDb(); });

  it('returns the bytes with the stored mime type', async () => {
    const image = await seedImage();
    const { GET } = await import('./leader-images/[id]/route');
    const res = await GET(new Request('http://localhost/api/leader-images/x'), {
      params: Promise.resolve({ id: image.id }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.equals(bytes)).toBe(true);
  });

  it('caches immutably and tags the response with the checksum', async () => {
    const image = await seedImage();
    const { GET } = await import('./leader-images/[id]/route');
    const res = await GET(new Request('http://localhost/api/leader-images/x'), {
      params: Promise.resolve({ id: image.id }),
    });
    expect(res.headers.get('etag')).toBe('"sha-of-the-bytes"');
    expect(res.headers.get('cache-control')).toContain('immutable');
    expect(res.headers.get('cache-control')).toContain('max-age=31536000');
  });

  it('answers 304 when the client already has that checksum', async () => {
    const image = await seedImage();
    const { GET } = await import('./leader-images/[id]/route');
    const res = await GET(
      new Request('http://localhost/api/leader-images/x', {
        headers: { 'if-none-match': '"sha-of-the-bytes"' },
      }),
      { params: Promise.resolve({ id: image.id }) },
    );
    expect(res.status).toBe(304);
  });

  it('404s on an unknown id', async () => {
    await seedImage();
    const { GET } = await import('./leader-images/[id]/route');
    const res = await GET(new Request('http://localhost/api/leader-images/x'), {
      params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }),
    });
    expect(res.status).toBe(404);
  });

  it('404s on an id that is not a uuid instead of erroring', async () => {
    // Postgres raises on a malformed uuid comparison; an unknown id is a 404,
    // not a 500, however malformed it is.
    const { GET } = await import('./leader-images/[id]/route');
    const res = await GET(new Request('http://localhost/api/leader-images/x'), {
      params: Promise.resolve({ id: 'nonsense' }),
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/app/api/leader-images.route.test.ts`
Expected: FAIL — cannot resolve `./leader-images/[id]/route`.

- [ ] **Step 3: Write the service**

Create `src/services/leader-images.ts`:

```ts
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { leaderImages } from '../db/schema';

type DB = NodePgDatabase<typeof schema>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LeaderImageBytes = { data: Buffer; mimeType: string; checksum: string };

/**
 * The bytes behind one image id, or null if there is none.
 *
 * The shape check comes first because Postgres raises on a malformed uuid
 * comparison rather than returning no rows, and a junk id in a URL is a 404
 * like any other miss, not a 500.
 */
export async function findLeaderImage(db: DB, id: string): Promise<LeaderImageBytes | null> {
  if (!UUID.test(id)) return null;
  const [row] = await db
    .select({ data: leaderImages.data, mimeType: leaderImages.mimeType, checksum: leaderImages.checksum })
    .from(leaderImages)
    .where(eq(leaderImages.id, id))
    .limit(1);
  return row ?? null;
}
```

- [ ] **Step 4: Write the route**

Create `src/app/api/leader-images/[id]/route.ts`:

```ts
import { db } from '@/db/client';
import { findLeaderImage } from '@/services/leader-images';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

/**
 * Leader card art, addressed by image id.
 *
 * Unauthenticated on purpose: this is public card art, and `Cache-Control:
 * public` on an authenticated route would let the CDN hand one player's
 * response to another.
 *
 * `immutable` is not a gamble — image rows are never rewritten, so an id names
 * bytes that cannot change. Correcting a leader's art produces a new id, and
 * therefore a new URL, so no cache ever needs purging.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const image = await findLeaderImage(db, id);
  if (!image) return new Response('Not found', { status: 404 });

  const etag = `"${image.checksum}"`;
  if (req.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { etag } });
  }

  return new Response(new Uint8Array(image.data), {
    status: 200,
    headers: {
      'content-type': image.mimeType,
      'cache-control': 'public, max-age=31536000, immutable',
      etag,
    },
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/app/api/leader-images.route.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/services/leader-images.ts src/app/api/leader-images src/app/api/leader-images.route.test.ts
git commit -m "feat(api): serve leader art from the database with immutable caching"
```

---

### Task 3: Expand `leader_art` with the new columns

Nullable and unused for now. This is the "expand" half of expand/migrate/contract: it deploys safely while the current app is still reading `set_code` and `art`.

**Files:**
- Modify: `src/db/schema.ts` (the `leaderArt` table)
- Create: `drizzle/00NN_*.sql` (generated)

**Interfaces:**
- Consumes: `leaderImages` from Task 1.
- Produces: `leaderArt.leaderId` (`uuid`, nullable) and `leaderArt.leaderImageId` (`uuid`, nullable).

- [ ] **Step 1: Add the columns**

In `src/db/schema.ts`, replace the whole `leaderArt` table definition with:

```ts
/**
 * Which printing of a leader this player wants to look at. Most leaders are
 * printed several times — a base card, a Parallel or Alternate Art, sometimes
 * an SPR — and this records the one they picked.
 *
 * Purely presentational: nothing in the statistics reads it, and a leader is
 * one leader however it is drawn.
 *
 * MIGRATION IN PROGRESS: `leaderId` / `leaderImageId` are the new keys and are
 * still nullable while the backfill runs. `setCode` / `art` are the old string
 * keys and are dropped in the contract migration once the backfill is verified.
 */
export const leaderArt = pgTable('leader_art', {
  ownerId: text('owner_id').notNull(),
  setCode: text('set_code').notNull(),
  art: text('art').notNull(),
  leaderId: uuid('leader_id').references(() => leaders.id, { onDelete: 'cascade' }),
  leaderImageId: uuid('leader_image_id').references(() => leaderImages.id, { onDelete: 'cascade' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.ownerId, t.setCode] })]);
```

Note the table must be declared **after** `leaderImages` in the file, because it now references it. Move it if needed.

- [ ] **Step 2: Generate and inspect the migration**

Run: `npm run db:generate`
Expected: a migration adding two nullable `uuid` columns with foreign keys, and dropping nothing.

- [ ] **Step 3: Run the suite to confirm nothing broke**

Run: `npm test`
Expected: PASS. The existing `leader_art` behaviour is untouched — the new columns are nullable and unread.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat(db): add nullable leader_id/leader_image_id to leader_art"
```

---

### Task 4: The backfill script

**Files:**
- Create: `scripts/migrate-leader-images.ts`
- Create: `src/lib/leader-image-import.ts` (the pure functions, so they are testable without IO)
- Test: `src/lib/leader-image-import.test.ts`
- Modify: `package.json` (add the npm script)

**Interfaces:**
- Consumes: `leaderImages`, `leaderArt` from Tasks 1 and 3; the existing `printingsOf` from `src/lib/printings.ts` and `CLEAN_ART` from `src/lib/clean-art.ts`.
- Produces: `labelForPrinting(setCode, printing)`, `imagePathForPrinting(printing, isClean)`; the npm script `db:migrate-leader-images`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/leader-image-import.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { labelForPrinting, imagePathForPrinting } from './leader-image-import';

describe('labelForPrinting', () => {
  it('calls the printing that equals the set code the base', () => {
    expect(labelForPrinting('OP06-022', 'OP06-022')).toBe('Base');
  });

  it('uses the bare suffix for every other printing', () => {
    // An honest, ugly label beats an invented one: nothing in the data says
    // whether _p1 is a Parallel or an Alternate Art, and the admin page in
    // stage 2 is where these get real names.
    expect(labelForPrinting('OP06-022', 'OP06-022_p1')).toBe('p1');
    expect(labelForPrinting('EB02-010', 'EB02-010_pr1')).toBe('pr1');
  });

  it('falls back to the whole printing id when it does not start with the set code', () => {
    expect(labelForPrinting('OP06-022', 'P-071')).toBe('P-071');
  });
});

describe('imagePathForPrinting', () => {
  it('reads a clean scan from the clean folder', () => {
    expect(imagePathForPrinting('OP01-001', true)).toBe('public/leaders/clean/OP01-001.webp');
  });

  it('reads everything else from the generated bundle', () => {
    expect(imagePathForPrinting('OP01-001_p1', false)).toBe('public/leaders/OP01-001_p1.webp');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/leader-image-import.test.ts`
Expected: FAIL — `./leader-image-import` does not exist.

- [ ] **Step 3: Write the pure functions**

Create `src/lib/leader-image-import.ts`:

```ts
/**
 * Pure helpers for the one-shot backfill in scripts/migrate-leader-images.ts.
 *
 * They live here rather than in the script so they can be tested without a
 * filesystem or a database, following tests/build-leader-data.test.ts.
 */

/**
 * The label a printing carries in the picker.
 *
 * The base printing is the one whose image id is the set code itself. Every
 * other one keeps its bare suffix ('p1', 'p2', 'pr1') rather than being guessed
 * at: the data does not say whether _p1 is a Parallel or an Alternate Art, and
 * a wrong name reads as fact where an ugly one reads as a placeholder.
 */
export function labelForPrinting(setCode: string, printing: string): string {
  if (printing === setCode) return 'Base';
  const prefix = `${setCode}_`;
  return printing.startsWith(prefix) ? printing.slice(prefix.length) : printing;
}

/** Repo-relative path to a printing's bundled file. */
export function imagePathForPrinting(printing: string, isClean: boolean): string {
  return isClean ? `public/leaders/clean/${printing}.webp` : `public/leaders/${printing}.webp`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/leader-image-import.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the backfill script**

Create `scripts/migrate-leader-images.ts`:

```ts
/**
 * One-shot backfill: bundled leader art files -> the leader_images table.
 *
 *   npm run db:migrate-leader-images
 *
 * Idempotent and re-runnable. It keys on (leader_id, card_image_id) and skips
 * what is already there, so an interrupted run is resumed by running it again.
 *
 * Ordering matters. This reads src/lib/printings.ts, src/lib/clean-art.ts and
 * both image folders, so none of them may be deleted until this has run against
 * production and been verified. See the spec's "Sequencing matters here".
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { and, eq, isNull, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { db } from '../src/db/client';
import { leaders, leaderImages, leaderArt } from '../src/db/schema';
import { printingsOf } from '../src/lib/printings';
import { CLEAN_ART } from '../src/lib/clean-art';
import { labelForPrinting, imagePathForPrinting } from '../src/lib/leader-image-import';

const ROOT = path.resolve(import.meta.dirname, '..');

async function backfillImages() {
  const rows = await db.select().from(leaders).where(isNull(leaders.ownerId));
  let inserted = 0, skipped = 0, missing = 0;

  for (const leader of rows) {
    if (!leader.setCode) continue;
    const printings = printingsOf(leader.setCode);
    for (const [i, printing] of printings.entries()) {
      const existing = await db.select({ id: leaderImages.id }).from(leaderImages)
        .where(and(eq(leaderImages.leaderId, leader.id), eq(leaderImages.cardImageId, printing)))
        .limit(1);
      if (existing[0]) { skipped++; continue; }

      const file = path.join(ROOT, imagePathForPrinting(printing, CLEAN_ART.has(printing)));
      let data: Buffer;
      try {
        data = await readFile(file);
      } catch {
        console.warn(`missing file for ${printing}: ${file}`);
        missing++;
        continue;
      }
      const meta = await sharp(data).metadata();
      await db.insert(leaderImages).values({
        leaderId: leader.id,
        cardImageId: printing,
        label: labelForPrinting(leader.setCode, printing),
        data,
        mimeType: 'image/webp',
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        byteSize: data.byteLength,
        checksum: createHash('sha256').update(data).digest('hex'),
        // The base printing is the default, always. A clean scan changes where
        // a printing's bytes come from, never which printing is the default —
        // that is exactly what getLeaderImage does today.
        isDefault: i === 0,
        sortOrder: i,
      });
      inserted++;
    }
  }
  return { inserted, skipped, missing };
}

async function backfillArtPreferences() {
  const prefs = await db.select().from(leaderArt);
  let linked = 0, dropped = 0;

  for (const pref of prefs) {
    if (pref.leaderImageId) { linked++; continue; }
    const [leader] = await db.select({ id: leaders.id }).from(leaders)
      .where(and(isNull(leaders.ownerId), eq(leaders.setCode, pref.setCode)))
      .limit(1);
    const image = leader
      ? (await db.select({ id: leaderImages.id }).from(leaderImages)
          .where(and(eq(leaderImages.leaderId, leader.id), eq(leaderImages.cardImageId, pref.art)))
          .limit(1))[0]
      : undefined;

    if (!leader || !image) {
      // Cosmetic only: a preference that finds no target is deleted, and the
      // player falls back to the leader's default art.
      await db.delete(leaderArt)
        .where(and(eq(leaderArt.ownerId, pref.ownerId), eq(leaderArt.setCode, pref.setCode)));
      dropped++;
      continue;
    }
    await db.update(leaderArt)
      .set({ leaderId: leader.id, leaderImageId: image.id })
      .where(and(eq(leaderArt.ownerId, pref.ownerId), eq(leaderArt.setCode, pref.setCode)));
    linked++;
  }
  return { linked, dropped };
}

async function verify() {
  const [{ count: withoutDefault }] = await db.execute<{ count: number }>(sql`
    SELECT count(*)::int AS count FROM leaders l
    WHERE l.owner_id IS NULL AND l.set_code IS NOT NULL
      AND EXISTS (SELECT 1 FROM leader_images i WHERE i.leader_id = l.id)
      AND NOT EXISTS (SELECT 1 FROM leader_images i WHERE i.leader_id = l.id AND i.is_default)
  `).then((r) => r.rows);
  const [{ count: unlinked }] = await db.execute<{ count: number }>(sql`
    SELECT count(*)::int AS count FROM leader_art WHERE leader_image_id IS NULL
  `).then((r) => r.rows);
  return { leadersWithoutDefault: withoutDefault, unlinkedPreferences: unlinked };
}

async function main() {
  const target = (process.env.DATABASE_URL ?? '').replace(/:[^:@/]+@/, ':***@');
  console.log(`Backfilling ${target || '(DATABASE_URL unset)'}`);
  console.log('images:', await backfillImages());
  console.log('art preferences:', await backfillArtPreferences());
  const checks = await verify();
  console.log('verify:', checks);
  if (checks.leadersWithoutDefault > 0 || checks.unlinkedPreferences > 0) {
    console.error('Backfill incomplete — do not run the contract migration.');
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 6: Add the npm script**

In `package.json`, add to `scripts`, right after `db:seed`:

```json
"db:migrate-leader-images": "tsx --env-file-if-exists=.env.local scripts/migrate-leader-images.ts",
```

- [ ] **Step 7: Run the backfill against your local database**

```bash
npm run db:migrate && npm run db:seed && npm run db:migrate-leader-images
```

Expected output: `images: { inserted: <n>, skipped: 0, missing: 0 }` where `n` is the total printing count across all seeded leaders, then `verify: { leadersWithoutDefault: 0, unlinkedPreferences: 0 }`, exit code 0.

If `missing` is non-zero, a printing listed in `EXTRA_ART` has no file on disk. Report the list rather than working around it — it means the two sources disagree and the spec's assumption needs revisiting.

- [ ] **Step 8: Run it a second time to prove it is idempotent**

Run: `npm run db:migrate-leader-images`
Expected: `inserted: 0`, `skipped: <n>` — the same `n` as the first run — and the same clean verify.

- [ ] **Step 9: Commit**

```bash
git add scripts/migrate-leader-images.ts src/lib/leader-image-import.ts src/lib/leader-image-import.test.ts package.json
git commit -m "feat(db): backfill leader_images from the bundled art files"
```

---

### Task 5: Rewire the server

**Files:**
- Modify: `src/lib/dto.ts:1-4`
- Modify: `src/services/reference.ts:22-24`
- Modify: `src/services/leader-art.ts` (whole file)
- Modify: `src/lib/validation/leader-art.ts` (whole file)
- Test: `src/app/api/leader-art.route.test.ts` (update to the new contract)

**Interfaces:**
- Consumes: `leaderImages`, the backfilled data.
- Produces: `LeaderDTO` gains `defaultImageId: string | null` and `images: LeaderImageDTO[]`; `LeaderArtMapDTO` becomes `leaderId -> imageId`; `leaderArtSchema` becomes `{ leaderId, imageId }`.

- [ ] **Step 1: Update the DTOs**

In `src/lib/dto.ts`, replace lines 1-4 with:

```ts
export type LeaderImageDTO = { id: string; label: string };
export type LeaderDTO = {
  id: string; name: string; colors: string[]; setCode: string | null;
  isCustom: boolean; ownerId: string | null;
  /** The printing shown to a player who has chosen none. Null for a leader with no art. */
  defaultImageId: string | null;
  /** Every printing this leader has, base first. Empty for custom leaders. */
  images: LeaderImageDTO[];
};
export type MetaDTO = { id: string; name: string; code: string | null; isCustom: boolean; ownerId: string | null };
/** Leader id → the image id this player chose. A missing key means the default. */
export type LeaderArtMapDTO = Record<string, string>;
```

- [ ] **Step 2: Write the failing test for `listLeaders`**

Append to `src/app/api/reference.route.test.ts` inside the existing `describe('/api/leaders')` block:

```ts
  it('GET carries each leader printings and its default', async () => {
    const [leader] = await db.select().from(leaders)
      .where(eq(leaders.setCode, 'OP01-001')).limit(1);
    const bytes = Buffer.from('not-really-a-webp');
    const [base] = await db.insert(leaderImages).values({
      leaderId: leader.id, cardImageId: 'OP01-001', label: 'Base', data: bytes,
      mimeType: 'image/webp', width: 240, height: 335, byteSize: bytes.byteLength,
      checksum: 'a', isDefault: true, sortOrder: 0,
    }).returning();
    await db.insert(leaderImages).values({
      leaderId: leader.id, cardImageId: 'OP01-001_p1', label: 'p1', data: bytes,
      mimeType: 'image/webp', width: 240, height: 335, byteSize: bytes.byteLength,
      checksum: 'b', sortOrder: 1,
    });

    const { GET } = await import('./leaders/route');
    const body = await (await GET()).json();
    const zoro = body.find((l: { id: string }) => l.id === leader.id);
    expect(zoro.defaultImageId).toBe(base.id);
    expect(zoro.images.map((i: { label: string }) => i.label)).toEqual(['Base', 'p1']);
  });
```

Add to that file's imports:

```ts
import { eq } from 'drizzle-orm';
import { leaders, leaderImages } from '../../db/schema';
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- src/app/api/reference.route.test.ts`
Expected: FAIL — `zoro.defaultImageId` is `undefined`.

- [ ] **Step 4: Implement `listLeaders`**

In `src/services/reference.ts`, replace the `listLeaders` function (lines 22-24) with:

```ts
export async function listLeaders(db: DB, ownerId: string): Promise<LeaderDTO[]> {
  const rows = await db.select().from(leaders).where(visibleTo(leaders, ownerId)).orderBy(asc(leaders.name));
  if (!rows.length) return [];

  // Two queries rather than a join: a join multiplies leader rows by their
  // printings, and the regrouping costs more than the extra round trip.
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
```

Add `inArray` to the `drizzle-orm` import in that file, `leaderImages` to the schema import, and `import type { LeaderDTO, LeaderImageDTO } from '../lib/dto';`.

- [ ] **Step 5: Run it to verify it passes**

Run: `npm test -- src/app/api/reference.route.test.ts`
Expected: PASS.

- [ ] **Step 6: Rewrite the validation schema**

Replace `src/lib/validation/leader-art.ts` entirely:

```ts
import { z } from 'zod';

/**
 * Shape only. Whether the image actually belongs to that leader is a question
 * about the catalog, not about the request, so the service answers it.
 */
export const leaderArtSchema = z.object({
  leaderId: z.string().uuid(),
  imageId: z.string().uuid(),
});

export type LeaderArtInput = z.infer<typeof leaderArtSchema>;
```

- [ ] **Step 7: Rewrite the leader-art service**

Replace `src/services/leader-art.ts` entirely:

```ts
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { leaderArt, leaderImages } from '../db/schema';
import { ValidationError } from '../lib/errors';
import type { LeaderArtInput } from '../lib/validation/leader-art';

type DB = NodePgDatabase<typeof schema>;

/** Leader id → the image this player chose. Absent means the leader's default. */
export type LeaderArtMap = Record<string, string>;

export async function listLeaderArt(db: DB, ownerId: string): Promise<LeaderArtMap> {
  const rows = await db.select().from(leaderArt).where(eq(leaderArt.ownerId, ownerId));
  return Object.fromEntries(rows.map((r) => [r.leaderId, r.leaderImageId]));
}

/**
 * Records which printing of a leader this player wants to see, and returns the
 * whole map so the client never has to merge a partial response.
 *
 * The image is checked against the leader rather than trusted: an unchecked id
 * would be stored happily and then render as another leader's face, or as a
 * 404, everywhere that leader appears.
 */
export async function setLeaderArt(db: DB, ownerId: string, input: LeaderArtInput): Promise<LeaderArtMap> {
  const [image] = await db
    .select({ id: leaderImages.id, isDefault: leaderImages.isDefault })
    .from(leaderImages)
    .where(and(eq(leaderImages.id, input.imageId), eq(leaderImages.leaderId, input.leaderId)))
    .limit(1);
  if (!image) throw new ValidationError('That art is not a printing of this leader.');

  if (image.isDefault) {
    // The default is what every reader already falls back to, so choosing it is
    // the absence of a preference rather than a preference for the base. The
    // table stays a record of genuine deviations.
    await db.delete(leaderArt)
      .where(and(eq(leaderArt.ownerId, ownerId), eq(leaderArt.leaderId, input.leaderId)));
  } else {
    await db.insert(leaderArt)
      .values({ ownerId, leaderId: input.leaderId, leaderImageId: input.imageId })
      .onConflictDoUpdate({
        target: [leaderArt.ownerId, leaderArt.leaderId],
        set: { leaderImageId: input.imageId, updatedAt: new Date() },
      });
  }
  return listLeaderArt(db, ownerId);
}
```

Note: this writes only the new columns. `set_code` and `art` are still `NOT NULL` at this point, so **the insert will fail until Task 7 drops them**. That is expected and is why Task 6 and Task 7 land together — see Task 7 Step 1.

- [ ] **Step 8: Update the leader-art route test to the new contract**

Replace `src/app/api/leader-art.route.test.ts` entirely:

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { getTestDb, resetDb, closeTestDb } from '../../../tests/setup/db';
import { leaders, leaderImages } from '../../db/schema';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_api' })) }));
vi.mock('@/db/client', () => ({ db: getTestDb(), schema: {} }));

const db = getTestDb();
afterAll(closeTestDb);

const bytes = Buffer.from('not-really-a-webp');

async function seedLeaderWithTwoPrintings(name: string, setCode: string) {
  const [leader] = await db.insert(leaders).values({ name, colors: ['green'], setCode }).returning();
  const common = {
    leaderId: leader.id, data: bytes, mimeType: 'image/webp',
    width: 240, height: 335, byteSize: bytes.byteLength,
  };
  const [base] = await db.insert(leaderImages)
    .values({ ...common, cardImageId: setCode, label: 'Base', checksum: `${setCode}-a`, isDefault: true, sortOrder: 0 })
    .returning();
  const [alt] = await db.insert(leaderImages)
    .values({ ...common, cardImageId: `${setCode}_p1`, label: 'p1', checksum: `${setCode}-b`, sortOrder: 1 })
    .returning();
  return { leader, base, alt };
}

function put(body: unknown) {
  return new Request('http://localhost/api/leader-art', {
    method: 'PUT', body: JSON.stringify(body),
  });
}

describe('/api/leader-art', () => {
  beforeEach(async () => { await resetDb(); });

  it('GET starts empty', async () => {
    const { GET } = await import('./leader-art/route');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  it('PUT records a non-default printing', async () => {
    const { leader, alt } = await seedLeaderWithTwoPrintings('Yamato', 'OP06-022');
    const { PUT } = await import('./leader-art/route');
    const res = await PUT(put({ leaderId: leader.id, imageId: alt.id }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ [leader.id]: alt.id });
  });

  it('PUT of the default printing clears the preference', async () => {
    // Choosing the default is the absence of a preference, not a preference for
    // the default, so the row is deleted rather than stored.
    const { leader, base, alt } = await seedLeaderWithTwoPrintings('Yamato', 'OP06-022');
    const { PUT } = await import('./leader-art/route');
    await PUT(put({ leaderId: leader.id, imageId: alt.id }));
    const res = await PUT(put({ leaderId: leader.id, imageId: base.id }));
    expect(await res.json()).toEqual({});
  });

  it('rejects an image belonging to another leader', async () => {
    const { leader } = await seedLeaderWithTwoPrintings('Yamato', 'OP06-022');
    const other = await seedLeaderWithTwoPrintings('Zoro', 'OP01-001');
    const { PUT } = await import('./leader-art/route');
    const res = await PUT(put({ leaderId: leader.id, imageId: other.alt.id }));
    expect(res.status).toBe(400);
  });

  it('rejects a body that is not two uuids', async () => {
    const { PUT } = await import('./leader-art/route');
    const res = await PUT(put({ setCode: 'OP06-022', art: 'OP06-022_p1' }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/dto.ts src/services/reference.ts src/services/leader-art.ts src/lib/validation/leader-art.ts src/app/api/reference.route.test.ts src/app/api/leader-art.route.test.ts
git commit -m "feat(api): key leader art on image ids instead of set codes"
```

---

### Task 6: Rewire the client

**Files:**
- Modify: `src/lib/leader-visual.ts` (replace `getLeaderImage` and `leaderPrintings`)
- Modify: `src/components/leaders/leader-art-provider.tsx`
- Modify: `src/components/leaders/leader-avatar.tsx`
- Modify: `src/components/leaders/leader-picker.tsx:45-70,150-180`
- Modify: `src/components/celebrate/result-card.tsx:35,119`
- Modify: `src/components/stats/headline-card.tsx:44`
- Modify: the 13 files that render `<LeaderAvatar>` — swap the `setCode` prop for `leaderId`
- Test: `src/components/leaders/leader-avatar.test.tsx`

**Interfaces:**
- Consumes: `LeaderDTO.images`, `LeaderDTO.defaultImageId`, `LeaderArtMapDTO` (leaderId → imageId) from Task 5.
- Produces: `leaderImageUrl(imageId)`; `useLeaderArt()` returning `{ art, imageIdFor, choose }`; `<LeaderAvatar leaderId=... />`.

**Design note.** `LeaderAvatar` takes `leaderId` rather than the leader's image array, and resolves the image through the provider. The alternative — threading `images` and `defaultImageId` through fifteen call sites — puts catalog data in the props of a component whose whole point is that it does not need any. The provider already owns "which art does this player want"; it now owns "and which image is that", which is the same question.

- [ ] **Step 1: Write the failing component test**

Replace the body of `src/components/leaders/leader-avatar.test.tsx` with tests against the new prop. Keep the existing `@vitest-environment jsdom` docblock at the top of the file.

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LeaderAvatar } from './leader-avatar';
import { LeaderArtContext } from './leader-art-provider';

function withArt(imageIdFor: (id?: string | null) => string | null, ui: React.ReactNode) {
  return render(
    <LeaderArtContext.Provider value={{ art: {}, imageIdFor, choose: () => {} }}>
      {ui}
    </LeaderArtContext.Provider>,
  );
}

describe('LeaderAvatar', () => {
  it('renders the resolved image from the API route', () => {
    const { container } = withArt(() => 'img-1', <LeaderAvatar name="Yamato" colors={['green']} leaderId="lead-1" />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/api/leader-images/img-1');
  });

  it('falls back to the coloured initial when the leader has no image', () => {
    const { container } = withArt(() => null, <LeaderAvatar name="Homebrew" colors={['red']} leaderId="lead-2" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('H');
  });

  it('draws the initial outside the provider rather than throwing', () => {
    const { container } = render(<LeaderAvatar name="Yamato" colors={['green']} leaderId="lead-1" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('Y');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/components/leaders/leader-avatar.test.tsx`
Expected: FAIL — `LeaderArtContext` is not exported and `leaderId` is not a prop.

- [ ] **Step 3: Replace the image helpers**

In `src/lib/leader-visual.ts`, delete the `getLeaderImage` and `leaderPrintings` functions and the imports of `LEADER_ART`, `CLEAN_ART` and `printingsOf`. Add:

```ts
/** The URL an image id is served from. Null in, null out, so callers can pass a miss straight through. */
export function leaderImageUrl(imageId: string | null | undefined): string | null {
  return imageId ? `/api/leader-images/${imageId}` : null;
}
```

`leaderSearchText` still needs `LEADER_DECK_CODES`. Change its import to the new module created in Task 8 Step 2 — or, if doing Task 8 later, leave the import on `./leader-images` for now and let Task 8 move it. Everything else in the file (`leaderBackground`, `leaderTextColor`, `leaderInitial`, `leaderColorBand`, `COLOR_BANDS`) is unchanged.

- [ ] **Step 4: Teach the provider to resolve images**

In `src/components/leaders/leader-art-provider.tsx`:

Export the context (the test needs it) and widen the value:

```tsx
type LeaderArtValue = {
  /** Leader id → the image id this player chose. */
  art: LeaderArtMapDTO;
  /** The image to draw for a leader: the player's choice, else the leader's default, else none. */
  imageIdFor: (leaderId: string | null | undefined) => string | null;
  /** No-op outside the provider. */
  choose: (leaderId: string, imageId: string) => void;
};

export const LeaderArtContext = createContext<LeaderArtValue>({
  art: {}, imageIdFor: () => null, choose: () => {},
});
```

Add a leaders query beside the existing art query — react-query dedupes it against the one the pages already run under the same key:

```tsx
  const { data: leaderRows } = useQuery({
    queryKey: keys.leaders,
    queryFn: apiClient.listLeaders,
    enabled: Boolean(isSignedIn),
    staleTime: 1000 * 60 * 60,
    retry: false,
  });
```

Build the resolver:

```tsx
  const imageIdFor = useCallback((leaderId: string | null | undefined): string | null => {
    if (!leaderId) return null;
    const leader = leaderRows?.find((l) => l.id === leaderId);
    if (!leader) return null;
    const chosen = data?.[leaderId];
    // A choice is checked against the leader's own printings rather than
    // trusted: an image deleted in the admin page would otherwise render as a
    // 404 everywhere that leader appears.
    if (chosen && leader.images.some((i) => i.id === chosen)) return chosen;
    return leader.defaultImageId;
  }, [leaderRows, data]);
```

Update the mutation's optimistic update to key on `leaderId`, and `choose` to `(leaderId: string, imageId: string) => mutate({ leaderId, imageId })`. Include `imageIdFor` in the `useMemo` value and its dependency array.

For a catalog of ~300 leaders re-resolved per avatar, the linear `find` is fine; if a stats page ever feels slow, build a `Map` in a `useMemo` instead. Do not pre-optimise it now.

- [ ] **Step 5: Update `LeaderAvatar`**

In `src/components/leaders/leader-avatar.tsx`, replace the `setCode` prop with `leaderId`, and the two lines that compute `src`:

```tsx
  const { imageIdFor } = useLeaderArt();
  const src = leaderImageUrl(imageIdFor(leaderId));
```

Import `leaderImageUrl` from `@/lib/leader-visual` instead of `getLeaderImage`.

- [ ] **Step 6: Run the component test to verify it passes**

Run: `npm test -- src/components/leaders/leader-avatar.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 7: Update every `<LeaderAvatar>` call site**

Run: `grep -rn "<LeaderAvatar" src`
Expected: 15 call sites across 13 files.

At each one, replace `setCode={X?.setCode}` with `leaderId={X?.id}`. Every call site already has the leader object in scope — `match-card.tsx:53` becomes `<LeaderAvatar name={mine?.name ?? '—'} colors={mine?.colors} leaderId={mine?.id} size="md" />`.

- [ ] **Step 8: Update the picker**

In `src/components/leaders/leader-picker.tsx`, change the import line at the top from

```tsx
import {
  leaderBackground, leaderTextColor, leaderInitial, getLeaderImage, leaderPrintings, leaderSearchText,
} from '@/lib/leader-visual';
```

to

```tsx
import {
  leaderBackground, leaderTextColor, leaderInitial, leaderImageUrl, leaderSearchText,
} from '@/lib/leader-visual';
```

`LeaderCard` (around line 45) takes an image id instead of an art string:

```tsx
function LeaderCard({ leader, selected, imageId }: { leader: Option; selected: boolean; imageId?: string | null }) {
  const src = leaderImageUrl(imageId);
```

The rest of `LeaderCard` is unchanged — it already branches on `src`.

The printing strip (around line 150) iterates the leader's own images. Replace the `printings.map(...)` body with:

```tsx
      {leader.images.map((img, i) => {
        const isCurrent = img.id === current;
        return (
          <button
            key={img.id}
            type="button"
            onClick={() => onPick(img.id)}
            disabled={disabled}
            aria-pressed={isCurrent}
            aria-label={`Artwork ${i + 1} of ${leader.images.length}`}
            className={cn(
              'overflow-hidden rounded-[0.35rem] outline-none transition-[transform,box-shadow] duration-150 ease-out',
              'focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              'disabled:opacity-50',
              isCurrent ? 'ring-2 ring-primary' : 'ring-1 ring-border/70 hover:-translate-y-px',
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={leaderImageUrl(img.id) ?? ''} alt="" loading="lazy" className="h-[3.85rem] w-11 object-cover" />
          </button>
        );
      })}
```

`current` is now `imageIdFor(leader.id)` from `useLeaderArt()`, and the strip's enclosing component no longer needs `printings` at all — delete that local and the `leaderPrintings` call that produced it. A leader with an empty `images` array renders an empty strip, which is what a custom leader already does today.

- [ ] **Step 9: Update the share card and the stats headline**

`src/components/celebrate/result-card.tsx:35` becomes:

```tsx
  const src = (l: typeof front) => leaderImageUrl(imageIdFor(l?.id));
```

`src/components/stats/headline-card.tsx:44` becomes:

```tsx
  const art = leaderImageUrl(imageIdFor(leader?.id));
```

Both files pull `imageIdFor` from `useLeaderArt()` and import `leaderImageUrl` in place of `getLeaderImage`.

- [ ] **Step 10: Typecheck, lint and run the full suite**

```bash
npx tsc --noEmit && npm run lint && npm test
```

Expected: no type errors, no lint errors. Tests: everything passes **except** the leader-art write path, which fails because `leader_art.set_code` is still `NOT NULL`. That is the expected state — Task 7 clears it. Note which tests fail so you can confirm they are exactly those.

- [ ] **Step 11: Commit**

```bash
git add src/lib/leader-visual.ts src/components
git commit -m "feat(ui): draw leader art from image ids served by the API"
```

---

### Task 7: Contract — drop the old columns

**Files:**
- Modify: `src/db/schema.ts` (the `leaderArt` table)
- Create: `drizzle/00NN_*.sql` (generated)
- Test: `src/db/schema.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `leaderArt` with primary key `(ownerId, leaderId)` and no `setCode` / `art`.

> **DEPLOYMENT GATE.** This migration must not reach production until the Task 4 backfill has run there and printed a clean `verify:`. In production the order is: deploy Tasks 1-3 → run `npm run db:migrate-leader-images` against `DATABASE_URL` → confirm `verify: { leadersWithoutDefault: 0, unlinkedPreferences: 0 }` → only then deploy Tasks 5-7. Do not merge Tasks 5-7 to a branch that auto-deploys before that backfill has run.

- [ ] **Step 1: Write the failing test**

Append to the `leader_images` describe block in `src/db/schema.test.ts`:

```ts
  it('drops a player art preference when the image is deleted', async () => {
    const leader = await makeLeader();
    const [image] = await db.insert(leaderImages).values({
      leaderId: leader.id, cardImageId: 'OP06-022_p1', label: 'p1', data: bytes,
      mimeType: 'image/webp', width: 240, height: 335, byteSize: bytes.byteLength, checksum: 'c',
    }).returning();
    await db.insert(leaderArt).values({ ownerId: 'user_1', leaderId: leader.id, leaderImageId: image.id });

    await db.delete(leaderImages).where(eq(leaderImages.id, image.id));
    const rows = await db.select().from(leaderArt);
    // The preference is cosmetic: losing the image means falling back to the
    // leader's default, not pointing at nothing.
    expect(rows).toHaveLength(0);
  });
```

Add `leaderArt` to the schema import in that test file.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/db/schema.test.ts`
Expected: FAIL — the insert into `leader_art` omits `set_code` and `art`, which are still `NOT NULL`.

- [ ] **Step 3: Contract the table**

In `src/db/schema.ts`, replace the `leaderArt` definition with:

```ts
/**
 * Which printing of a leader this player wants to look at. Most leaders are
 * printed several times — a base card, a Parallel or Alternate Art, sometimes
 * an SPR — and this records the one they picked.
 *
 * A missing row means the leader's default printing, so the table only ever
 * holds genuine deviations from it. Purely presentational: nothing in the
 * statistics reads it, and a leader is one leader however it is drawn.
 *
 * Deleting an image deletes the preferences that chose it, by design — the
 * player falls back to the default rather than to a broken image.
 */
export const leaderArt = pgTable('leader_art', {
  ownerId: text('owner_id').notNull(),
  leaderId: uuid('leader_id').notNull().references(() => leaders.id, { onDelete: 'cascade' }),
  leaderImageId: uuid('leader_image_id').notNull().references(() => leaderImages.id, { onDelete: 'cascade' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.ownerId, t.leaderId] })]);
```

- [ ] **Step 4: Generate and read the migration**

Run: `npm run db:generate`
Expected: a migration that drops the old primary key, drops `set_code` and `art`, sets the two uuid columns `NOT NULL`, and adds the new primary key.

Read the generated SQL before running it. If drizzle-kit emitted a destructive statement in an order that would fail on populated data (setting `NOT NULL` before the backfill, for instance), reorder it by hand and say so in the commit message.

- [ ] **Step 5: Run the full suite**

```bash
npm run db:migrate && npm test
```

Expected: PASS, including the leader-art route tests that failed at the end of Task 6.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/schema.test.ts drizzle/
git commit -m "feat(db): key leader_art on leader and image ids"
```

---

### Task 8: Delete the generated files

Only after the production backfill has run and been verified, and the app has been checked in the browser (Step 5 below).

**Files:**
- Create: `src/lib/leader-deck-codes.ts`
- Modify: `src/lib/leader-visual.ts` (import path for `LEADER_DECK_CODES`)
- Modify: `.gitignore`
- Modify: `package.json` (drop the `db:reset-reference` script)
- Delete: `src/lib/leader-images.ts`, `src/lib/clean-art.ts`, `src/lib/printings.ts`, `src/lib/printings.test.ts` (if present), `public/leaders/`, `scripts/reset-reference-data.ts`, `scripts/import-clean-art.ts`, `scripts/migrate-leader-images.ts`, `src/lib/leader-image-import.ts`, `src/lib/leader-image-import.test.ts`

- [ ] **Step 1: Verify in the browser first**

Start the dev server and check, against a database that has been through the backfill:
- the leaders list and the leader picker draw real art, not initials;
- opening a leader's printing strip shows every printing and switching one sticks after a reload;
- a match card, the stats headline, and the `html-to-image` share card all render art. **The share card is the one at risk** — it rasterises images onto a canvas, and it now pulls them from an API route instead of a static file. Confirm the captured PNG contains the art rather than a blank box;
- dark mode is unchanged.

Capture before/after with `npm run shot` if you have a baseline.

Do not proceed to Step 2 until all of the above passes. This is the only check that the change is invisible, and it cannot be automated here.

- [ ] **Step 2: Relocate `LEADER_DECK_CODES`**

Create `src/lib/leader-deck-codes.ts` and move the `LEADER_DECK_CODES` export from `src/lib/leader-images.ts` into it verbatim, keeping its doc comment. Add at the top:

```ts
// Search metadata, not image data: the single-colour starter decks reprint an
// existing booster leader under its original code, so a player searching for
// their "ST17" deck needs this to find OP01-060. Stage 2 folds it into a column
// on `leaders`.
```

Update the import in `src/lib/leader-visual.ts` to `import { LEADER_DECK_CODES } from './leader-deck-codes';`.

- [ ] **Step 3: Delete the generated modules, files and scripts**

```bash
git rm -r src/lib/leader-images.ts src/lib/clean-art.ts src/lib/printings.ts public/leaders scripts/reset-reference-data.ts scripts/import-clean-art.ts scripts/migrate-leader-images.ts src/lib/leader-image-import.ts src/lib/leader-image-import.test.ts
```

If `src/lib/printings.test.ts` exists, remove it in the same command.

In `package.json`, delete the `db:reset-reference` and `db:migrate-leader-images` scripts.

- [ ] **Step 4: Ignore the folder that the data script still writes**

Add to `.gitignore`:

```
# Written by scripts/build-leader-data.ts, now unused — the art lives in the
# database. Stage 2 stops the script writing it at all.
/public/leaders/
```

`scripts/build-leader-data.ts` is left alone in this stage. It still writes `seed-data.ts`, which is still the source of the text catalog.

- [ ] **Step 5: Typecheck, lint, test**

```bash
npx tsc --noEmit && npm run lint && npm test
```

Expected: all green. Any failure here is a leftover import of a deleted module — fix the import, do not restore the module.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: delete the generated leader art bundle"
```

---

## Done when

- The app looks and behaves exactly as before.
- `src/lib/leader-images.ts`, `src/lib/clean-art.ts`, `src/lib/printings.ts`, `public/leaders/`, `scripts/reset-reference-data.ts` and `scripts/import-clean-art.ts` are gone.
- `npx tsc --noEmit`, `npm run lint` and `npm test` all pass.
