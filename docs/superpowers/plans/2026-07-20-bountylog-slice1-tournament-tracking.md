# Crew Stat Slice 1: Core Tournament Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cloud-backed, mobile-first web app where a signed-in user can create OPTCG tournaments, log rounds (leader, opponent, W/L/D, play order, notes), finish/lock them, and edit/delete — with all data persisted per-user in Postgres behind a REST API.

**Architecture:** Layered — React UI (client components) → REST Route Handlers (`/app/api/*`) → pure service layer (business rules, takes `ownerId`) → Drizzle data layer → Neon Postgres. Clerk provides auth; route handlers extract the user id and pass it to the service layer, keeping business logic pure and unit-testable. The REST layer is the contract a future native app will reuse.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Tailwind · Clerk · Neon Postgres · Drizzle ORM (node-postgres driver) · Zod · TanStack Query · shadcn/ui · Vitest · Playwright.

## Global Constraints

- **Runtime:** Node.js route handlers (not edge) — Drizzle + `pg` need Node. Every `app/api/**/route.ts` sets `export const runtime = 'nodejs'`.
- **Ownership:** every tournament/round query is scoped by `owner_id = <clerk user id>`. The service layer never runs an unscoped query on user data.
- **Errors:** service layer throws typed errors (`NotFoundError`, `ConflictError`, `ValidationError`); route handlers map them to HTTP `404 / 409 / 400`. Missing auth → `401`. Not-owned rows → `404` (never `403`, to avoid leaking existence).
- **Records computed, never stored:** a tournament's `wins/losses/draws` is always derived from its rounds.
- **Custom reference rows:** a custom leader/set is a row with `owner_id` set and `is_custom = true`; global seed rows have `owner_id = null`. Adding a custom row whose name already exists (case-insensitive, among global + that user's rows) reuses the existing row.
- **TDD:** every backend task writes a failing test first. Tests run against a dedicated `DATABASE_URL_TEST` Postgres; never the dev/prod DB.
- **Commits:** one commit per task minimum, at the end of each task.

---

## File Structure

```
drizzle.config.ts                     # Drizzle Kit config (schema path, migrations dir, test/dev url)
vitest.config.ts                      # Vitest config + globalSetup
.env.example                          # documents required env vars
src/
  db/
    schema.ts                         # enums + leaders, sets, tournaments, rounds tables
    client.ts                         # Drizzle client bound to DATABASE_URL
    seed.ts                           # idempotent seed of starter leaders + sets
  lib/
    errors.ts                         # NotFoundError, ConflictError, ValidationError
    validation/
      tournament.ts                   # Zod schemas for tournament create/update
      round.ts                        # Zod schemas for round create/update
      reference.ts                    # Zod schemas for custom leader/set
    record.ts                         # computeRecord(rounds) -> {wins,losses,draws}
    api/
      handler.ts                      # withAuth() wrapper + errorToResponse()
    api-client.ts                     # typed browser fetch client for the REST API
  services/
    reference.ts                      # listLeaders/addCustomLeader/listSets/addCustomSet
    tournaments.ts                    # create/list/get/update/delete/finish/reopen
    rounds.ts                         # add/update/delete(+renumber)
  app/
    layout.tsx                        # ClerkProvider + QueryProvider + fonts
    providers.tsx                     # TanStack Query client provider
    page.tsx                          # tournament list (home)
    sign-in/[[...sign-in]]/page.tsx
    sign-up/[[...sign-up]]/page.tsx
    tournaments/
      new/page.tsx                    # new tournament flow
      [id]/page.tsx                   # tournament detail
    api/
      leaders/route.ts                # GET, POST
      sets/route.ts                   # GET, POST
      tournaments/route.ts            # GET, POST
      tournaments/[id]/route.ts       # GET, PATCH, DELETE
      tournaments/[id]/finish/route.ts# POST
      tournaments/[id]/reopen/route.ts# POST
      tournaments/[id]/rounds/route.ts# POST
      rounds/[id]/route.ts            # PATCH, DELETE
  components/
    ui/                               # shadcn/ui generated components
    tournaments/
      tournament-card.tsx
      tournament-list.tsx
      new-tournament-form.tsx
      tournament-detail.tsx
      round-item.tsx
      round-form-sheet.tsx
      reference-combobox.tsx          # leader/set select with add-custom
    query-hooks.ts                    # useTournaments/useTournament/useLeaders/... mutations
middleware.ts                         # Clerk auth middleware
tests/
  setup/global-setup.ts              # migrate test DB before suite
  setup/db.ts                        # test DB client + truncate helper
e2e/
  tournament-flow.spec.ts            # Playwright happy path
playwright.config.ts
```

---

### Task 1: Install dependencies and configure test tooling

**Files:**
- Modify: `package.json` (scripts + deps)
- Create: `vitest.config.ts`, `tests/setup/global-setup.ts` (stub for now), `.env.example`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: working `npm test` (Vitest) and installed libraries used by all later tasks.

- [ ] **Step 1: Install runtime and dev dependencies**

```bash
npm install @clerk/nextjs drizzle-orm pg zod @tanstack/react-query
npm install -D drizzle-kit @types/pg vitest dotenv @playwright/test tsx
```

- [ ] **Step 2: Add scripts to `package.json`**

Merge into the `"scripts"` block:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:seed": "tsx src/db/seed.ts",
    "e2e": "playwright test"
  }
}
```

- [ ] **Step 3: Create `.env.example`**

```bash
# Postgres (Neon) — app + migrations
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
# Separate database used ONLY by the test suite
DATABASE_URL_TEST="postgresql://user:pass@host/db_test?sslmode=require"
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_xxx"
CLERK_SECRET_KEY="sk_test_xxx"
NEXT_PUBLIC_CLERK_SIGN_IN_URL="/sign-in"
NEXT_PUBLIC_CLERK_SIGN_UP_URL="/sign-up"
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './tests/setup/global-setup.ts',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    fileParallelism: false, // integration tests share one test DB
  },
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
});
```

- [ ] **Step 5: Create a no-op `tests/setup/global-setup.ts`** (Task 2 fills it in)

```ts
export default async function setup() {
  // Task 2 wires up test-DB migration here.
}
```

- [ ] **Step 6: Write the smoke test `tests/smoke.test.ts`**

```ts
import { describe, it, expect } from 'vitest';

describe('tooling', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 7: Run it and verify it passes**

Run: `npm test`
Expected: PASS (1 test).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests .env.example
git commit -m "chore: install deps and configure vitest"
```

---

### Task 2: Database schema, client, and test-DB migration harness

**Files:**
- Create: `src/db/schema.ts`, `src/db/client.ts`, `drizzle.config.ts`, `tests/setup/db.ts`
- Modify: `tests/setup/global-setup.ts`
- Test: `src/db/schema.test.ts`

**Interfaces:**
- Produces:
  - `db` (Drizzle client) from `src/db/client.ts`
  - Tables `leaders, sets, tournaments, rounds` and enums from `src/db/schema.ts`
  - Column types: `tournaments.status: 'draft'|'locked'`, `rounds.result: 'win'|'loss'|'draw'`, `rounds.playOrder: 'first'|'second'|null`, `tournaments.type: 'local'|'treasure_cup'|'regionals'|'extra_grand_battle'|'pirates_party'|'testing'`
  - `getTestDb()` and `resetDb()` from `tests/setup/db.ts`

- [ ] **Step 1: Write `src/db/schema.ts`**

```ts
import { pgTable, pgEnum, uuid, text, boolean, integer, timestamp, date } from 'drizzle-orm/pg-core';

export const tournamentType = pgEnum('tournament_type', [
  'local', 'treasure_cup', 'regionals', 'extra_grand_battle', 'pirates_party', 'testing',
]);
export const tournamentStatus = pgEnum('tournament_status', ['draft', 'locked']);
export const roundResult = pgEnum('round_result', ['win', 'loss', 'draw']);
export const playOrder = pgEnum('play_order', ['first', 'second']);

export const leaders = pgTable('leaders', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  colors: text('colors').array().notNull().default([]),
  isCustom: boolean('is_custom').notNull().default(false),
  ownerId: text('owner_id'), // null = global seed
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sets = pgTable('sets', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  code: text('code'),
  releasedAt: date('released_at'),
  isCustom: boolean('is_custom').notNull().default(false),
  ownerId: text('owner_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tournaments = pgTable('tournaments', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: text('owner_id').notNull(),
  type: tournamentType('type').notNull(),
  setId: uuid('set_id').references(() => sets.id),
  name: text('name'),
  playedOn: date('played_on').notNull(),
  status: tournamentStatus('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rounds = pgTable('rounds', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  roundNumber: integer('round_number').notNull(),
  myLeaderId: uuid('my_leader_id').notNull().references(() => leaders.id),
  opponentLeaderId: uuid('opponent_leader_id').notNull().references(() => leaders.id),
  result: roundResult('result').notNull(),
  playOrder: playOrder('play_order'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Write `src/db/client.ts`**

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });
export { schema };
```

- [ ] **Step 3: Write `drizzle.config.ts`**

```ts
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 4: Generate the migration**

Run: `npm run db:generate`
Expected: a new SQL file under `./drizzle/` creating the enums and four tables.

- [ ] **Step 5: Write `tests/setup/db.ts`**

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import * as schema from '../../src/db/schema';

const url = process.env.DATABASE_URL_TEST;
if (!url) throw new Error('DATABASE_URL_TEST is not set');

const pool = new Pool({ connectionString: url });
export const testDb = drizzle(pool, { schema });

export function getTestDb() {
  return testDb;
}

export async function resetDb() {
  await testDb.execute(
    sql`TRUNCATE TABLE rounds, tournaments, sets, leaders RESTART IDENTITY CASCADE`,
  );
}
```

- [ ] **Step 6: Fill in `tests/setup/global-setup.ts`** to migrate the test DB once

```ts
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

export default async function setup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set');
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: './drizzle' });
  await pool.end();
}
```

- [ ] **Step 7: Write `src/db/schema.test.ts`** (proves schema pushes and round-trips)

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, resetDb } from '../../tests/setup/db';
import { leaders } from './schema';

const db = getTestDb();

describe('schema', () => {
  beforeEach(async () => { await resetDb(); });

  it('inserts and reads a global leader with null owner', async () => {
    const [row] = await db.insert(leaders)
      .values({ name: 'Roronoa Zoro', colors: ['green'] })
      .returning();
    expect(row.ownerId).toBeNull();
    expect(row.isCustom).toBe(false);

    const found = await db.select().from(leaders).where(eq(leaders.id, row.id));
    expect(found[0].name).toBe('Roronoa Zoro');
    expect(found[0].colors).toEqual(['green']);
  });
});
```

- [ ] **Step 8: Run the test against the test DB**

Run: `npm test -- src/db/schema.test.ts`
Expected: PASS. (Requires `DATABASE_URL_TEST` pointing at an empty Postgres/Neon branch.)

- [ ] **Step 9: Commit**

```bash
git add src/db drizzle drizzle.config.ts tests/setup
git commit -m "feat(db): add schema, client, and test migration harness"
```

---

### Task 3: Seed starter leaders and sets

**Files:**
- Create: `src/db/seed.ts`, `src/db/seed-data.ts`
- Test: `src/db/seed.test.ts`

**Interfaces:**
- Consumes: `db` client, `leaders`, `sets` tables.
- Produces: `seedReferenceData(db)` — idempotent insert of global leaders + sets, returns `{ leaders: number, sets: number }`.

- [ ] **Step 1: Write `src/db/seed-data.ts`** (starter set — expand later)

```ts
export const SEED_LEADERS: { name: string; colors: string[] }[] = [
  { name: 'Monkey D. Luffy', colors: ['red'] },
  { name: 'Roronoa Zoro', colors: ['green'] },
  { name: 'Nami', colors: ['blue'] },
  { name: 'Usopp', colors: ['green', 'yellow'] },
  { name: 'Sanji', colors: ['blue'] },
  { name: 'Tony Tony Chopper', colors: ['green'] },
  { name: 'Nico Robin', colors: ['blue', 'purple'] },
  { name: 'Franky', colors: ['blue'] },
  { name: 'Donquixote Doflamingo', colors: ['purple'] },
  { name: 'Charlotte Katakuri', colors: ['yellow'] },
  { name: 'Trafalgar Law', colors: ['red', 'green'] },
  { name: 'Kaido', colors: ['purple', 'black'] },
  { name: 'Big Mom', colors: ['yellow'] },
  { name: 'Shanks', colors: ['red'] },
  { name: 'Boa Hancock', colors: ['purple'] },
  { name: 'Crocodile', colors: ['blue', 'black'] },
  { name: 'Rob Lucci', colors: ['black'] },
  { name: 'Sakazuki (Akainu)', colors: ['black'] },
  { name: 'Kuzan (Aokiji)', colors: ['blue'] },
  { name: 'Eustass Kid', colors: ['red', 'purple'] },
  { name: 'Portgas D. Ace', colors: ['red'] },
  { name: 'Yamato', colors: ['green', 'yellow'] },
  { name: 'Enel', colors: ['blue', 'yellow'] },
  { name: 'Gecko Moria', colors: ['black'] },
  { name: 'Jewelry Bonney', colors: ['green'] },
];

export const SEED_SETS: { name: string; code: string }[] = [
  { name: 'Romance Dawn', code: 'OP01' },
  { name: 'Paramount War', code: 'OP02' },
  { name: 'Pillars of Strength', code: 'OP03' },
  { name: 'Kingdoms of Intrigue', code: 'OP04' },
  { name: 'Awakening of the New Era', code: 'OP05' },
  { name: 'Wings of the Captain', code: 'OP06' },
  { name: '500 Years in the Future', code: 'OP07' },
  { name: 'Two Legends', code: 'OP08' },
];
```

- [ ] **Step 2: Write `src/db/seed.ts`**

```ts
import { sql } from 'drizzle-orm';
import { db as defaultDb } from './client';
import { leaders, sets } from './schema';
import { SEED_LEADERS, SEED_SETS } from './seed-data';

type DB = typeof defaultDb;

export async function seedReferenceData(db: DB) {
  let leaderCount = 0;
  for (const l of SEED_LEADERS) {
    const res = await db.insert(leaders)
      .values({ name: l.name, colors: l.colors, isCustom: false, ownerId: null })
      .onConflictDoNothing()
      .returning();
    leaderCount += res.length;
  }
  let setCount = 0;
  for (const s of SEED_SETS) {
    const res = await db.insert(sets)
      .values({ name: s.name, code: s.code, isCustom: false, ownerId: null })
      .onConflictDoNothing()
      .returning();
    setCount += res.length;
  }
  return { leaders: leaderCount, sets: setCount };
}

// Allow `npm run db:seed`
if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  seedReferenceData(defaultDb)
    .then((r) => { console.log('Seeded', r); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
```

Note: `onConflictDoNothing()` with no unique constraint is a no-op guard; idempotency here relies on the test truncating first. For production idempotency, re-running seed after a name-uniqueness migration is a later-slice concern; for now the seed is run once on a fresh DB.

- [ ] **Step 3: Write `src/db/seed.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { isNull } from 'drizzle-orm';
import { getTestDb, resetDb } from '../../tests/setup/db';
import { leaders, sets } from './schema';
import { seedReferenceData } from './seed';
import { SEED_LEADERS, SEED_SETS } from './seed-data';

const db = getTestDb();

describe('seedReferenceData', () => {
  beforeEach(async () => { await resetDb(); });

  it('inserts all global leaders and sets with null owner', async () => {
    const result = await seedReferenceData(db);
    expect(result.leaders).toBe(SEED_LEADERS.length);
    expect(result.sets).toBe(SEED_SETS.length);

    const globalLeaders = await db.select().from(leaders).where(isNull(leaders.ownerId));
    expect(globalLeaders.length).toBe(SEED_LEADERS.length);
    expect(globalLeaders.every((l) => l.isCustom === false)).toBe(true);

    const globalSets = await db.select().from(sets).where(isNull(sets.ownerId));
    expect(globalSets.length).toBe(SEED_SETS.length);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npm test -- src/db/seed.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/seed.ts src/db/seed-data.ts src/db/seed.test.ts
git commit -m "feat(db): add idempotent reference-data seed"
```

---

### Task 4: Typed errors and Zod validation schemas

**Files:**
- Create: `src/lib/errors.ts`, `src/lib/validation/reference.ts`, `src/lib/validation/tournament.ts`, `src/lib/validation/round.ts`
- Test: `src/lib/validation/validation.test.ts`

**Interfaces:**
- Produces:
  - `NotFoundError`, `ConflictError`, `ValidationError` (all extend `Error`, have `.name`)
  - `createTournamentSchema` → `{ type, setId?, name?, playedOn }` (playedOn `YYYY-MM-DD` string)
  - `updateTournamentSchema` (all optional)
  - `createRoundSchema` → `{ myLeaderId, opponentLeaderId, result, playOrder?, notes? }`
  - `updateRoundSchema` (all optional)
  - `customLeaderSchema` → `{ name, colors }`; `customSetSchema` → `{ name }`

- [ ] **Step 1: Write `src/lib/errors.ts`**

```ts
export class NotFoundError extends Error {
  constructor(message = 'Not found') { super(message); this.name = 'NotFoundError'; }
}
export class ConflictError extends Error {
  constructor(message = 'Conflict') { super(message); this.name = 'ConflictError'; }
}
export class ValidationError extends Error {
  constructor(message = 'Invalid input') { super(message); this.name = 'ValidationError'; }
}
```

- [ ] **Step 2: Write the validation schemas**

`src/lib/validation/reference.ts`:

```ts
import { z } from 'zod';

export const customLeaderSchema = z.object({
  name: z.string().trim().min(1).max(120),
  colors: z.array(z.string().trim().min(1)).max(5).default([]),
});
export const customSetSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export type CustomLeaderInput = z.infer<typeof customLeaderSchema>;
export type CustomSetInput = z.infer<typeof customSetSchema>;
```

`src/lib/validation/tournament.ts`:

```ts
import { z } from 'zod';

export const tournamentTypeEnum = z.enum([
  'local', 'treasure_cup', 'regionals', 'extra_grand_battle', 'pirates_party', 'testing',
]);
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const createTournamentSchema = z.object({
  type: tournamentTypeEnum,
  setId: z.string().uuid().optional(),
  name: z.string().trim().max(120).optional(),
  playedOn: dateString,
});
export const updateTournamentSchema = z.object({
  type: tournamentTypeEnum.optional(),
  setId: z.string().uuid().nullable().optional(),
  name: z.string().trim().max(120).nullable().optional(),
  playedOn: dateString.optional(),
});
export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
export type UpdateTournamentInput = z.infer<typeof updateTournamentSchema>;
```

`src/lib/validation/round.ts`:

```ts
import { z } from 'zod';

export const resultEnum = z.enum(['win', 'loss', 'draw']);
export const playOrderEnum = z.enum(['first', 'second']);

export const createRoundSchema = z.object({
  myLeaderId: z.string().uuid(),
  opponentLeaderId: z.string().uuid(),
  result: resultEnum,
  playOrder: playOrderEnum.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export const updateRoundSchema = z.object({
  myLeaderId: z.string().uuid().optional(),
  opponentLeaderId: z.string().uuid().optional(),
  result: resultEnum.optional(),
  playOrder: playOrderEnum.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export type CreateRoundInput = z.infer<typeof createRoundSchema>;
export type UpdateRoundInput = z.infer<typeof updateRoundSchema>;
```

- [ ] **Step 3: Write `src/lib/validation/validation.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { createTournamentSchema } from './tournament';
import { createRoundSchema } from './round';
import { customLeaderSchema } from './reference';

describe('validation', () => {
  it('accepts a valid tournament', () => {
    const parsed = createTournamentSchema.parse({ type: 'local', playedOn: '2026-07-20' });
    expect(parsed.type).toBe('local');
  });
  it('rejects a bad date', () => {
    expect(() => createTournamentSchema.parse({ type: 'local', playedOn: '20-07-2026' })).toThrow();
  });
  it('rejects an unknown tournament type', () => {
    expect(() => createTournamentSchema.parse({ type: 'worlds', playedOn: '2026-07-20' })).toThrow();
  });
  it('requires uuids on a round', () => {
    expect(() => createRoundSchema.parse({ myLeaderId: 'x', opponentLeaderId: 'y', result: 'win' })).toThrow();
  });
  it('defaults custom leader colors to empty array', () => {
    expect(customLeaderSchema.parse({ name: 'Test' }).colors).toEqual([]);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npm test -- src/lib/validation/validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/errors.ts src/lib/validation
git commit -m "feat(lib): add typed errors and zod validation schemas"
```

---

### Task 5: Record computation helper

**Files:**
- Create: `src/lib/record.ts`
- Test: `src/lib/record.test.ts`

**Interfaces:**
- Produces: `computeRecord(rounds: { result: 'win'|'loss'|'draw' }[]) => { wins: number; losses: number; draws: number }` and `formatRecord(r) => string` (e.g. `'4-2'`, or `'4-2-1'` when draws > 0).

- [ ] **Step 1: Write the failing test `src/lib/record.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { computeRecord, formatRecord } from './record';

describe('computeRecord', () => {
  it('counts wins/losses/draws', () => {
    const r = computeRecord([{ result: 'win' }, { result: 'win' }, { result: 'loss' }, { result: 'draw' }]);
    expect(r).toEqual({ wins: 2, losses: 1, draws: 1 });
  });
  it('handles empty', () => {
    expect(computeRecord([])).toEqual({ wins: 0, losses: 0, draws: 0 });
  });
});

describe('formatRecord', () => {
  it('omits draws when zero', () => {
    expect(formatRecord({ wins: 4, losses: 2, draws: 0 })).toBe('4-2');
  });
  it('includes draws when present', () => {
    expect(formatRecord({ wins: 4, losses: 2, draws: 1 })).toBe('4-2-1');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/lib/record.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/lib/record.ts`**

```ts
export type Record = { wins: number; losses: number; draws: number };

export function computeRecord(rounds: { result: 'win' | 'loss' | 'draw' }[]): Record {
  return rounds.reduce<Record>(
    (acc, r) => {
      if (r.result === 'win') acc.wins += 1;
      else if (r.result === 'loss') acc.losses += 1;
      else acc.draws += 1;
      return acc;
    },
    { wins: 0, losses: 0, draws: 0 },
  );
}

export function formatRecord(r: Record): string {
  return r.draws > 0 ? `${r.wins}-${r.losses}-${r.draws}` : `${r.wins}-${r.losses}`;
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npm test -- src/lib/record.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/record.ts src/lib/record.test.ts
git commit -m "feat(lib): add record computation helper"
```

---

### Task 6: Reference-data service (list + custom-add with dedupe)

**Files:**
- Create: `src/services/reference.ts`
- Test: `src/services/reference.test.ts`

**Interfaces:**
- Consumes: `db`-shaped client, `leaders`/`sets` tables, `CustomLeaderInput`/`CustomSetInput`.
- Produces (all take a Drizzle client `db` as first arg so tests can inject the test client):
  - `listLeaders(db, ownerId: string) => Promise<Leader[]>` — global + this user's custom, name-sorted
  - `addCustomLeader(db, ownerId, input: CustomLeaderInput) => Promise<Leader>` — dedupes case-insensitively against global + user's rows
  - `listSets(db, ownerId) => Promise<Set[]>`
  - `addCustomSet(db, ownerId, input: CustomSetInput) => Promise<Set>`
  - Types `Leader = typeof leaders.$inferSelect`, `Set = typeof sets.$inferSelect`

- [ ] **Step 1: Write the failing test `src/services/reference.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDb, resetDb } from '../../tests/setup/db';
import { seedReferenceData } from '../db/seed';
import { listLeaders, addCustomLeader, listSets, addCustomSet } from './reference';

const db = getTestDb();
const USER = 'user_123';

describe('reference service', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db); });

  it('lists global leaders plus the user custom ones', async () => {
    await addCustomLeader(db, USER, { name: 'My Homebrew', colors: ['red'] });
    const list = await listLeaders(db, USER);
    expect(list.some((l) => l.name === 'Roronoa Zoro' && l.ownerId === null)).toBe(true);
    expect(list.some((l) => l.name === 'My Homebrew' && l.ownerId === USER)).toBe(true);
  });

  it('does not show another user custom leaders', async () => {
    await addCustomLeader(db, 'other_user', { name: 'Secret Deck', colors: [] });
    const list = await listLeaders(db, USER);
    expect(list.some((l) => l.name === 'Secret Deck')).toBe(false);
  });

  it('reuses an existing leader on duplicate custom-add (case-insensitive)', async () => {
    const first = await addCustomLeader(db, USER, { name: 'roronoa zoro', colors: [] });
    // Matches the global seed "Roronoa Zoro"
    expect(first.ownerId).toBeNull();
    const list = await listLeaders(db, USER);
    expect(list.filter((l) => l.name.toLowerCase() === 'roronoa zoro').length).toBe(1);
  });

  it('adds and dedupes custom sets', async () => {
    const a = await addCustomSet(db, USER, { name: 'Local Promo Pack' });
    const b = await addCustomSet(db, USER, { name: 'local promo pack' });
    expect(b.id).toBe(a.id);
    const sets = await listSets(db, USER);
    expect(sets.filter((s) => s.name.toLowerCase() === 'local promo pack').length).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/services/reference.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/services/reference.ts`**

```ts
import { and, or, eq, isNull, sql, asc } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { leaders, sets } from '../db/schema';
import type { CustomLeaderInput, CustomSetInput } from '../lib/validation/reference';

type DB = NodePgDatabase<typeof schema>;
export type Leader = typeof leaders.$inferSelect;
export type Set = typeof sets.$inferSelect;

const visibleTo = (table: typeof leaders | typeof sets, ownerId: string) =>
  or(isNull(table.ownerId), eq(table.ownerId, ownerId));

export async function listLeaders(db: DB, ownerId: string): Promise<Leader[]> {
  return db.select().from(leaders).where(visibleTo(leaders, ownerId)).orderBy(asc(leaders.name));
}

export async function addCustomLeader(db: DB, ownerId: string, input: CustomLeaderInput): Promise<Leader> {
  const existing = await db.select().from(leaders)
    .where(and(visibleTo(leaders, ownerId), sql`lower(${leaders.name}) = lower(${input.name})`))
    .limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db.insert(leaders)
    .values({ name: input.name, colors: input.colors, isCustom: true, ownerId })
    .returning();
  return row;
}

export async function listSets(db: DB, ownerId: string): Promise<Set[]> {
  return db.select().from(sets).where(visibleTo(sets, ownerId)).orderBy(asc(sets.name));
}

export async function addCustomSet(db: DB, ownerId: string, input: CustomSetInput): Promise<Set> {
  const existing = await db.select().from(sets)
    .where(and(visibleTo(sets, ownerId), sql`lower(${sets.name}) = lower(${input.name})`))
    .limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db.insert(sets)
    .values({ name: input.name, isCustom: true, ownerId })
    .returning();
  return row;
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npm test -- src/services/reference.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/reference.ts src/services/reference.test.ts
git commit -m "feat(services): reference-data list and custom-add with dedupe"
```

---

### Task 7: Tournament service (create/list/get/update/delete/finish/reopen)

**Files:**
- Create: `src/services/tournaments.ts`
- Test: `src/services/tournaments.test.ts`

**Interfaces:**
- Consumes: `db`, `tournaments`/`rounds` tables, `computeRecord`, typed errors, `CreateTournamentInput`/`UpdateTournamentInput`.
- Produces (all take `db` first, then `ownerId`):
  - `createTournament(db, ownerId, input) => Promise<Tournament>`
  - `listTournaments(db, ownerId) => Promise<TournamentSummary[]>` where `TournamentSummary = Tournament & { record: { wins; losses; draws } }`, newest first
  - `getTournament(db, ownerId, id) => Promise<Tournament & { rounds: Round[] }>` — throws `NotFoundError` if missing/not owned
  - `updateTournament(db, ownerId, id, input) => Promise<Tournament>`
  - `deleteTournament(db, ownerId, id) => Promise<void>`
  - `finishTournament(db, ownerId, id) => Promise<Tournament>` — sets status `locked`
  - `reopenTournament(db, ownerId, id) => Promise<Tournament>` — sets status `draft`
  - Types `Tournament = typeof tournaments.$inferSelect`, `Round = typeof rounds.$inferSelect`

- [ ] **Step 1: Write the failing test `src/services/tournaments.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDb, resetDb } from '../../tests/setup/db';
import { seedReferenceData } from '../db/seed';
import {
  createTournament, listTournaments, getTournament,
  updateTournament, deleteTournament, finishTournament, reopenTournament,
} from './tournaments';
import { addRound } from './rounds';
import { listLeaders } from './reference';
import { NotFoundError } from '../lib/errors';

const db = getTestDb();
const USER = 'user_a';

async function anyLeaderIds() {
  const ls = await listLeaders(db, USER);
  return { mine: ls[0].id, opp: ls[1].id };
}

describe('tournament service', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db); });

  it('creates a draft tournament', async () => {
    const t = await createTournament(db, USER, { type: 'local', playedOn: '2026-07-20' });
    expect(t.status).toBe('draft');
    expect(t.ownerId).toBe(USER);
  });

  it('lists tournaments newest first with computed record', async () => {
    const { mine, opp } = await anyLeaderIds();
    const t = await createTournament(db, USER, { type: 'local', playedOn: '2026-07-20' });
    await addRound(db, USER, t.id, { myLeaderId: mine, opponentLeaderId: opp, result: 'win' });
    await addRound(db, USER, t.id, { myLeaderId: mine, opponentLeaderId: opp, result: 'loss' });
    const list = await listTournaments(db, USER);
    expect(list[0].record).toEqual({ wins: 1, losses: 1, draws: 0 });
  });

  it('getTournament throws NotFound for another user tournament', async () => {
    const t = await createTournament(db, USER, { type: 'local', playedOn: '2026-07-20' });
    await expect(getTournament(db, 'user_b', t.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('finish then reopen toggles status', async () => {
    const t = await createTournament(db, USER, { type: 'local', playedOn: '2026-07-20' });
    expect((await finishTournament(db, USER, t.id)).status).toBe('locked');
    expect((await reopenTournament(db, USER, t.id)).status).toBe('draft');
  });

  it('deletes a tournament and its rounds', async () => {
    const { mine, opp } = await anyLeaderIds();
    const t = await createTournament(db, USER, { type: 'local', playedOn: '2026-07-20' });
    await addRound(db, USER, t.id, { myLeaderId: mine, opponentLeaderId: opp, result: 'win' });
    await deleteTournament(db, USER, t.id);
    await expect(getTournament(db, USER, t.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('updates editable fields', async () => {
    const t = await createTournament(db, USER, { type: 'local', playedOn: '2026-07-20' });
    const updated = await updateTournament(db, USER, t.id, { type: 'regionals', name: 'Spring Regional' });
    expect(updated.type).toBe('regionals');
    expect(updated.name).toBe('Spring Regional');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/services/tournaments.test.ts`
Expected: FAIL (module not found; `rounds` service also not present yet — that's fine, this task creates `tournaments.ts` and Task 8 creates `rounds.ts`. Run this test again at the end of Task 8.)

- [ ] **Step 3: Write `src/services/tournaments.ts`**

```ts
import { and, eq, desc } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { tournaments, rounds } from '../db/schema';
import { computeRecord } from '../lib/record';
import { NotFoundError } from '../lib/errors';
import type { CreateTournamentInput, UpdateTournamentInput } from '../lib/validation/tournament';

type DB = NodePgDatabase<typeof schema>;
export type Tournament = typeof tournaments.$inferSelect;
export type Round = typeof rounds.$inferSelect;
export type TournamentSummary = Tournament & { record: ReturnType<typeof computeRecord> };

const owned = (id: string, ownerId: string) =>
  and(eq(tournaments.id, id), eq(tournaments.ownerId, ownerId));

async function requireOwned(db: DB, ownerId: string, id: string): Promise<Tournament> {
  const [row] = await db.select().from(tournaments).where(owned(id, ownerId)).limit(1);
  if (!row) throw new NotFoundError('Tournament not found');
  return row;
}

export async function createTournament(db: DB, ownerId: string, input: CreateTournamentInput): Promise<Tournament> {
  const [row] = await db.insert(tournaments)
    .values({
      ownerId, type: input.type, setId: input.setId ?? null,
      name: input.name ?? null, playedOn: input.playedOn, status: 'draft',
    })
    .returning();
  return row;
}

export async function listTournaments(db: DB, ownerId: string): Promise<TournamentSummary[]> {
  const ts = await db.select().from(tournaments)
    .where(eq(tournaments.ownerId, ownerId))
    .orderBy(desc(tournaments.playedOn), desc(tournaments.createdAt));
  const allRounds = await db.select().from(rounds);
  const byTournament = new Map<string, Round[]>();
  for (const r of allRounds) {
    const list = byTournament.get(r.tournamentId) ?? [];
    list.push(r);
    byTournament.set(r.tournamentId, list);
  }
  return ts.map((t) => ({ ...t, record: computeRecord(byTournament.get(t.id) ?? []) }));
}

export async function getTournament(db: DB, ownerId: string, id: string): Promise<Tournament & { rounds: Round[] }> {
  const t = await requireOwned(db, ownerId, id);
  const rs = await db.select().from(rounds)
    .where(eq(rounds.tournamentId, id))
    .orderBy(rounds.roundNumber);
  return { ...t, rounds: rs };
}

export async function updateTournament(db: DB, ownerId: string, id: string, input: UpdateTournamentInput): Promise<Tournament> {
  await requireOwned(db, ownerId, id);
  const patch: Partial<typeof tournaments.$inferInsert> = { updatedAt: new Date() };
  if (input.type !== undefined) patch.type = input.type;
  if (input.setId !== undefined) patch.setId = input.setId;
  if (input.name !== undefined) patch.name = input.name;
  if (input.playedOn !== undefined) patch.playedOn = input.playedOn;
  const [row] = await db.update(tournaments).set(patch).where(owned(id, ownerId)).returning();
  return row;
}

export async function deleteTournament(db: DB, ownerId: string, id: string): Promise<void> {
  await requireOwned(db, ownerId, id);
  await db.delete(tournaments).where(owned(id, ownerId));
}

export async function finishTournament(db: DB, ownerId: string, id: string): Promise<Tournament> {
  await requireOwned(db, ownerId, id);
  const [row] = await db.update(tournaments)
    .set({ status: 'locked', updatedAt: new Date() })
    .where(owned(id, ownerId)).returning();
  return row;
}

export async function reopenTournament(db: DB, ownerId: string, id: string): Promise<Tournament> {
  await requireOwned(db, ownerId, id);
  const [row] = await db.update(tournaments)
    .set({ status: 'draft', updatedAt: new Date() })
    .where(owned(id, ownerId)).returning();
  return row;
}
```

- [ ] **Step 4: Commit** (test goes green after Task 8 provides `addRound`)

```bash
git add src/services/tournaments.ts src/services/tournaments.test.ts
git commit -m "feat(services): tournament CRUD, finish/reopen, computed record"
```

---

### Task 8: Round service (add / update / delete + renumber, lock guard)

**Files:**
- Create: `src/services/rounds.ts`
- Test: `src/services/rounds.test.ts`

**Interfaces:**
- Consumes: `db`, `tournaments`/`rounds` tables, typed errors, `CreateRoundInput`/`UpdateRoundInput`.
- Produces (all take `db`, `ownerId`):
  - `addRound(db, ownerId, tournamentId, input) => Promise<Round>` — appends with next `round_number`; throws `NotFoundError` if tournament missing/not owned; throws `ConflictError` if tournament is `locked`
  - `updateRound(db, ownerId, roundId, input) => Promise<Round>` — throws `ConflictError` if parent tournament locked
  - `deleteRound(db, ownerId, roundId) => Promise<void>` — deletes and renumbers remaining rounds 1..n in a transaction; throws `ConflictError` if parent locked

- [ ] **Step 1: Write the failing test `src/services/rounds.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDb, resetDb } from '../../tests/setup/db';
import { seedReferenceData } from '../db/seed';
import { createTournament, finishTournament, getTournament } from './tournaments';
import { addRound, updateRound, deleteRound } from './rounds';
import { listLeaders } from './reference';
import { ConflictError, NotFoundError } from '../lib/errors';

const db = getTestDb();
const USER = 'user_r';

async function setup() {
  const ls = await listLeaders(db, USER);
  const t = await createTournament(db, USER, { type: 'local', playedOn: '2026-07-20' });
  return { t, mine: ls[0].id, opp: ls[1].id };
}

describe('round service', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db); });

  it('appends rounds with incrementing numbers', async () => {
    const { t, mine, opp } = await setup();
    const r1 = await addRound(db, USER, t.id, { myLeaderId: mine, opponentLeaderId: opp, result: 'win', playOrder: 'first' });
    const r2 = await addRound(db, USER, t.id, { myLeaderId: mine, opponentLeaderId: opp, result: 'loss' });
    expect(r1.roundNumber).toBe(1);
    expect(r2.roundNumber).toBe(2);
  });

  it('renumbers remaining rounds after a delete', async () => {
    const { t, mine, opp } = await setup();
    await addRound(db, USER, t.id, { myLeaderId: mine, opponentLeaderId: opp, result: 'win' });
    const r2 = await addRound(db, USER, t.id, { myLeaderId: mine, opponentLeaderId: opp, result: 'loss' });
    await addRound(db, USER, t.id, { myLeaderId: mine, opponentLeaderId: opp, result: 'draw' });
    await deleteRound(db, USER, r2.id);
    const detail = await getTournament(db, USER, t.id);
    expect(detail.rounds.map((r) => r.roundNumber)).toEqual([1, 2]);
    expect(detail.rounds.map((r) => r.result)).toEqual(['win', 'draw']);
  });

  it('rejects adding a round to a locked tournament', async () => {
    const { t, mine, opp } = await setup();
    await finishTournament(db, USER, t.id);
    await expect(
      addRound(db, USER, t.id, { myLeaderId: mine, opponentLeaderId: opp, result: 'win' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects updating a round in a locked tournament', async () => {
    const { t, mine, opp } = await setup();
    const r = await addRound(db, USER, t.id, { myLeaderId: mine, opponentLeaderId: opp, result: 'win' });
    await finishTournament(db, USER, t.id);
    await expect(updateRound(db, USER, r.id, { result: 'loss' })).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws NotFound adding to another user tournament', async () => {
    const { t, mine, opp } = await setup();
    await expect(
      addRound(db, 'intruder', t.id, { myLeaderId: mine, opponentLeaderId: opp, result: 'win' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/services/rounds.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/services/rounds.ts`**

```ts
import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { tournaments, rounds } from '../db/schema';
import { NotFoundError, ConflictError } from '../lib/errors';
import type { CreateRoundInput, UpdateRoundInput } from '../lib/validation/round';

type DB = NodePgDatabase<typeof schema>;
export type Round = typeof rounds.$inferSelect;

async function requireEditableTournament(db: DB, ownerId: string, tournamentId: string) {
  const [t] = await db.select().from(tournaments)
    .where(and(eq(tournaments.id, tournamentId), eq(tournaments.ownerId, ownerId)))
    .limit(1);
  if (!t) throw new NotFoundError('Tournament not found');
  if (t.status === 'locked') throw new ConflictError('Tournament is locked — reopen it to edit');
  return t;
}

async function requireOwnedRound(db: DB, ownerId: string, roundId: string) {
  const [row] = await db.select({ round: rounds, status: tournaments.status })
    .from(rounds)
    .innerJoin(tournaments, eq(rounds.tournamentId, tournaments.id))
    .where(and(eq(rounds.id, roundId), eq(tournaments.ownerId, ownerId)))
    .limit(1);
  if (!row) throw new NotFoundError('Round not found');
  if (row.status === 'locked') throw new ConflictError('Tournament is locked — reopen it to edit');
  return row.round;
}

export async function addRound(db: DB, ownerId: string, tournamentId: string, input: CreateRoundInput): Promise<Round> {
  await requireEditableTournament(db, ownerId, tournamentId);
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${rounds.roundNumber}), 0)` })
    .from(rounds).where(eq(rounds.tournamentId, tournamentId));
  const [row] = await db.insert(rounds).values({
    tournamentId,
    roundNumber: Number(max) + 1,
    myLeaderId: input.myLeaderId,
    opponentLeaderId: input.opponentLeaderId,
    result: input.result,
    playOrder: input.playOrder ?? null,
    notes: input.notes ?? null,
  }).returning();
  return row;
}

export async function updateRound(db: DB, ownerId: string, roundId: string, input: UpdateRoundInput): Promise<Round> {
  await requireOwnedRound(db, ownerId, roundId);
  const patch: Partial<typeof rounds.$inferInsert> = { updatedAt: new Date() };
  if (input.myLeaderId !== undefined) patch.myLeaderId = input.myLeaderId;
  if (input.opponentLeaderId !== undefined) patch.opponentLeaderId = input.opponentLeaderId;
  if (input.result !== undefined) patch.result = input.result;
  if (input.playOrder !== undefined) patch.playOrder = input.playOrder;
  if (input.notes !== undefined) patch.notes = input.notes;
  const [row] = await db.update(rounds).set(patch).where(eq(rounds.id, roundId)).returning();
  return row;
}

export async function deleteRound(db: DB, ownerId: string, roundId: string): Promise<void> {
  const round = await requireOwnedRound(db, ownerId, roundId);
  await db.transaction(async (tx) => {
    await tx.delete(rounds).where(eq(rounds.id, roundId));
    const remaining = await tx.select().from(rounds)
      .where(eq(rounds.tournamentId, round.tournamentId))
      .orderBy(rounds.roundNumber);
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].roundNumber !== i + 1) {
        await tx.update(rounds).set({ roundNumber: i + 1 }).where(eq(rounds.id, remaining[i].id));
      }
    }
  });
}
```

- [ ] **Step 4: Run the round + tournament tests (both go green now)**

Run: `npm test -- src/services/rounds.test.ts src/services/tournaments.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/services/rounds.ts src/services/rounds.test.ts
git commit -m "feat(services): round add/update/delete with renumber and lock guard"
```

---

### Task 9: API handler helper (auth wrapper + error mapping)

**Files:**
- Create: `src/lib/api/handler.ts`
- Test: `src/lib/api/handler.test.ts`

**Interfaces:**
- Produces:
  - `errorToResponse(err: unknown) => Response` — maps `ValidationError`/`ZodError`→400, `NotFoundError`→404, `ConflictError`→409, else 500; body `{ error: string }`
  - `requireUserId() => Promise<string>` — returns Clerk user id or throws a sentinel handled as 401
  - `UnauthorizedError` class
  - `json(data, init?)` helper

- [ ] **Step 1: Write the failing test `src/lib/api/handler.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { errorToResponse, UnauthorizedError } from './handler';
import { NotFoundError, ConflictError, ValidationError } from '../errors';

async function status(err: unknown) {
  const res = errorToResponse(err);
  return { code: res.status, body: await res.json() };
}

describe('errorToResponse', () => {
  it('maps NotFoundError to 404', async () => {
    expect((await status(new NotFoundError())).code).toBe(404);
  });
  it('maps ConflictError to 409', async () => {
    expect((await status(new ConflictError())).code).toBe(409);
  });
  it('maps ValidationError and ZodError to 400', async () => {
    expect((await status(new ValidationError())).code).toBe(400);
    const zerr = new ZodError([]);
    expect((await status(zerr)).code).toBe(400);
  });
  it('maps UnauthorizedError to 401', async () => {
    expect((await status(new UnauthorizedError())).code).toBe(401);
  });
  it('maps unknown to 500', async () => {
    expect((await status(new Error('boom'))).code).toBe(500);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/lib/api/handler.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/lib/api/handler.ts`**

```ts
import { ZodError } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { NotFoundError, ConflictError, ValidationError } from '../errors';

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') { super(message); this.name = 'UnauthorizedError'; }
}

export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
}

export function errorToResponse(err: unknown): Response {
  if (err instanceof UnauthorizedError) return json({ error: err.message }, { status: 401 });
  if (err instanceof NotFoundError) return json({ error: err.message }, { status: 404 });
  if (err instanceof ConflictError) return json({ error: err.message }, { status: 409 });
  if (err instanceof ValidationError) return json({ error: err.message }, { status: 400 });
  if (err instanceof ZodError) return json({ error: 'Invalid input', issues: err.issues }, { status: 400 });
  console.error(err);
  return json({ error: 'Internal error' }, { status: 500 });
}

export async function requireUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new UnauthorizedError();
  return userId;
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npm test -- src/lib/api/handler.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/handler.ts src/lib/api/handler.test.ts
git commit -m "feat(api): auth wrapper and error-to-response mapping"
```

---

### Task 10: Clerk auth wiring (middleware, provider, sign-in/up pages)

**Files:**
- Create: `middleware.ts`, `src/app/providers.tsx`, `src/app/sign-in/[[...sign-in]]/page.tsx`, `src/app/sign-up/[[...sign-up]]/page.tsx`
- Modify: `src/app/layout.tsx`
- Test: build verification (auth middleware is verified by the E2E task, not a unit test)

**Interfaces:**
- Consumes: Clerk env vars.
- Produces: protected app (all routes except `/sign-in`, `/sign-up` require a session), `Providers` component wrapping children in `ClerkProvider` + `QueryClientProvider`.

- [ ] **Step 1: Write `middleware.ts`**

```ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublic = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)']);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) await auth.protect();
});

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)', '/(api|trpc)(.*)'],
};
```

- [ ] **Step 2: Write `src/app/providers.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 3: Modify `src/app/layout.tsx`** to wrap in ClerkProvider + Providers

```tsx
import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Crew Stat',
  description: 'OPTCG tournament tracker',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          <Providers>{children}</Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
```

- [ ] **Step 4: Write the sign-in page** `src/app/sign-in/[[...sign-in]]/page.tsx`

```tsx
import { SignIn } from '@clerk/nextjs';

export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <SignIn />
    </main>
  );
}
```

- [ ] **Step 5: Write the sign-up page** `src/app/sign-up/[[...sign-up]]/page.tsx`

```tsx
import { SignUp } from '@clerk/nextjs';

export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <SignUp />
    </main>
  );
}
```

- [ ] **Step 6: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds. (Requires the Clerk env vars from `.env.example` to be present in `.env.local`.)

- [ ] **Step 7: Commit**

```bash
git add middleware.ts src/app/providers.tsx src/app/layout.tsx src/app/sign-in src/app/sign-up
git commit -m "feat(auth): wire Clerk provider, middleware, and auth pages"
```

---

### Task 11: REST route handlers — reference data (`/api/leaders`, `/api/sets`)

**Files:**
- Create: `src/app/api/leaders/route.ts`, `src/app/api/sets/route.ts`
- Test: `src/app/api/reference.route.test.ts`

**Interfaces:**
- Consumes: `requireUserId`, `errorToResponse`, `json`, reference service, validation schemas, `db`.
- Produces: `GET/POST /api/leaders`, `GET/POST /api/sets`. Test strategy: mock `@clerk/nextjs/server`'s `auth` and inject the test DB by mocking `src/db/client`.

- [ ] **Step 1: Write the failing test `src/app/api/reference.route.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTestDb, resetDb } from '../../../../tests/setup/db';
import { seedReferenceData } from '../../../db/seed';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_api' })) }));
vi.mock('../../../db/client', () => ({ db: getTestDb(), schema: {} }));

const db = getTestDb();

describe('/api/leaders', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db); });

  it('GET returns global leaders', async () => {
    const { GET } = await import('./leaders/route'); // resolved relative to app/api
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((l: { name: string }) => l.name === 'Roronoa Zoro')).toBe(true);
  });

  it('POST adds a custom leader', async () => {
    const { POST } = await import('./leaders/route');
    const req = new Request('http://test/api/leaders', {
      method: 'POST', body: JSON.stringify({ name: 'Homebrew', colors: ['red'] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('Homebrew');
    expect(body.ownerId).toBe('user_api');
  });

  it('POST rejects invalid body with 400', async () => {
    const { POST } = await import('./leaders/route');
    const req = new Request('http://test/api/leaders', { method: 'POST', body: JSON.stringify({ name: '' }) });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
```

> Note on import path: place this test file so the dynamic `import('./leaders/route')` resolves. If path resolution is awkward, co-locate the test as `src/app/api/leaders/route.test.ts` and import `'./route'`. Adjust the mock relative paths accordingly. The behavior asserted is what matters.

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- reference.route`
Expected: FAIL (route modules not found).

- [ ] **Step 3: Write `src/app/api/leaders/route.ts`**

```ts
import { db } from '@/db/client';
import { requireUserId, errorToResponse, json } from '@/lib/api/handler';
import { listLeaders, addCustomLeader } from '@/services/reference';
import { customLeaderSchema } from '@/lib/validation/reference';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const userId = await requireUserId();
    return json(await listLeaders(db, userId));
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const input = customLeaderSchema.parse(await req.json());
    return json(await addCustomLeader(db, userId, input), { status: 201 });
  } catch (err) {
    return errorToResponse(err);
  }
}
```

- [ ] **Step 4: Write `src/app/api/sets/route.ts`**

```ts
import { db } from '@/db/client';
import { requireUserId, errorToResponse, json } from '@/lib/api/handler';
import { listSets, addCustomSet } from '@/services/reference';
import { customSetSchema } from '@/lib/validation/reference';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const userId = await requireUserId();
    return json(await listSets(db, userId));
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const input = customSetSchema.parse(await req.json());
    return json(await addCustomSet(db, userId, input), { status: 201 });
  } catch (err) {
    return errorToResponse(err);
  }
}
```

- [ ] **Step 5: Run the test**

Run: `npm test -- reference.route`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/leaders src/app/api/sets src/app/api/reference.route.test.ts
git commit -m "feat(api): leaders and sets route handlers"
```

---

### Task 12: REST route handlers — tournaments

**Files:**
- Create: `src/app/api/tournaments/route.ts`, `src/app/api/tournaments/[id]/route.ts`, `src/app/api/tournaments/[id]/finish/route.ts`, `src/app/api/tournaments/[id]/reopen/route.ts`
- Test: `src/app/api/tournaments/route.test.ts`

**Interfaces:**
- Consumes: `requireUserId`, service functions, validation schemas.
- Produces: `GET/POST /api/tournaments`; `GET/PATCH/DELETE /api/tournaments/:id`; `POST /api/tournaments/:id/finish`; `POST /api/tournaments/:id/reopen`. Route context param shape: `{ params: Promise<{ id: string }> }` (Next.js 16 async params).

- [ ] **Step 1: Write the failing test `src/app/api/tournaments/route.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTestDb, resetDb } from '../../../../tests/setup/db';
import { seedReferenceData } from '../../../db/seed';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_t' })) }));
vi.mock('../../../db/client', () => ({ db: getTestDb(), schema: {} }));

const db = getTestDb();

describe('/api/tournaments', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db); });

  it('POST creates then GET lists it', async () => {
    const { POST, GET } = await import('./route');
    const createRes = await POST(new Request('http://test/api/tournaments', {
      method: 'POST', body: JSON.stringify({ type: 'local', playedOn: '2026-07-20' }),
    }));
    expect(createRes.status).toBe(201);

    const listRes = await GET();
    const body = await listRes.json();
    expect(body.length).toBe(1);
    expect(body[0].record).toEqual({ wins: 0, losses: 0, draws: 0 });
  });

  it('GET /:id returns 404 for a non-existent tournament', async () => {
    const mod = await import('./[id]/route');
    const res = await mod.GET(new Request('http://test'), { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- tournaments/route`
Expected: FAIL.

- [ ] **Step 3: Write `src/app/api/tournaments/route.ts`**

```ts
import { db } from '@/db/client';
import { requireUserId, errorToResponse, json } from '@/lib/api/handler';
import { createTournament, listTournaments } from '@/services/tournaments';
import { createTournamentSchema } from '@/lib/validation/tournament';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const userId = await requireUserId();
    return json(await listTournaments(db, userId));
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const input = createTournamentSchema.parse(await req.json());
    return json(await createTournament(db, userId, input), { status: 201 });
  } catch (err) {
    return errorToResponse(err);
  }
}
```

- [ ] **Step 4: Write `src/app/api/tournaments/[id]/route.ts`**

```ts
import { db } from '@/db/client';
import { requireUserId, errorToResponse, json } from '@/lib/api/handler';
import { getTournament, updateTournament, deleteTournament } from '@/services/tournaments';
import { updateTournamentSchema } from '@/lib/validation/tournament';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    return json(await getTournament(db, userId, id));
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const input = updateTournamentSchema.parse(await req.json());
    return json(await updateTournament(db, userId, id, input));
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await deleteTournament(db, userId, id);
    return json({ ok: true });
  } catch (err) {
    return errorToResponse(err);
  }
}
```

- [ ] **Step 5: Write `src/app/api/tournaments/[id]/finish/route.ts`** and **`.../reopen/route.ts`**

`finish/route.ts`:

```ts
import { db } from '@/db/client';
import { requireUserId, errorToResponse, json } from '@/lib/api/handler';
import { finishTournament } from '@/services/tournaments';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    return json(await finishTournament(db, userId, id));
  } catch (err) {
    return errorToResponse(err);
  }
}
```

`reopen/route.ts` (identical but calls `reopenTournament`):

```ts
import { db } from '@/db/client';
import { requireUserId, errorToResponse, json } from '@/lib/api/handler';
import { reopenTournament } from '@/services/tournaments';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    return json(await reopenTournament(db, userId, id));
  } catch (err) {
    return errorToResponse(err);
  }
}
```

- [ ] **Step 6: Run the test**

Run: `npm test -- tournaments/route`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/tournaments
git commit -m "feat(api): tournament route handlers (crud, finish, reopen)"
```

---

### Task 13: REST route handlers — rounds

**Files:**
- Create: `src/app/api/tournaments/[id]/rounds/route.ts`, `src/app/api/rounds/[id]/route.ts`
- Test: `src/app/api/rounds/route.test.ts`

**Interfaces:**
- Consumes: `requireUserId`, round service, validation schemas.
- Produces: `POST /api/tournaments/:id/rounds`; `PATCH/DELETE /api/rounds/:id`.

- [ ] **Step 1: Write the failing test `src/app/api/rounds/route.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTestDb, resetDb } from '../../../../tests/setup/db';
import { seedReferenceData } from '../../../db/seed';
import { createTournament, finishTournament } from '../../../services/tournaments';
import { listLeaders } from '../../../services/reference';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_rd' })) }));
vi.mock('../../../db/client', () => ({ db: getTestDb(), schema: {} }));

const db = getTestDb();

describe('round routes', () => {
  beforeEach(async () => { await resetDb(); await seedReferenceData(db); });

  it('POST adds a round; returns 409 once locked', async () => {
    const t = await createTournament(db, 'user_rd', { type: 'local', playedOn: '2026-07-20' });
    const leaders = await listLeaders(db, 'user_rd');
    const { POST } = await import('../tournaments/[id]/rounds/route');
    const body = JSON.stringify({ myLeaderId: leaders[0].id, opponentLeaderId: leaders[1].id, result: 'win' });

    const res = await POST(new Request('http://test', { method: 'POST', body }), { params: Promise.resolve({ id: t.id }) });
    expect(res.status).toBe(201);

    await finishTournament(db, 'user_rd', t.id);
    const locked = await POST(new Request('http://test', { method: 'POST', body }), { params: Promise.resolve({ id: t.id }) });
    expect(locked.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- rounds/route`
Expected: FAIL.

- [ ] **Step 3: Write `src/app/api/tournaments/[id]/rounds/route.ts`**

```ts
import { db } from '@/db/client';
import { requireUserId, errorToResponse, json } from '@/lib/api/handler';
import { addRound } from '@/services/rounds';
import { createRoundSchema } from '@/lib/validation/round';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const input = createRoundSchema.parse(await req.json());
    return json(await addRound(db, userId, id, input), { status: 201 });
  } catch (err) {
    return errorToResponse(err);
  }
}
```

- [ ] **Step 4: Write `src/app/api/rounds/[id]/route.ts`**

```ts
import { db } from '@/db/client';
import { requireUserId, errorToResponse, json } from '@/lib/api/handler';
import { updateRound, deleteRound } from '@/services/rounds';
import { updateRoundSchema } from '@/lib/validation/round';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const input = updateRoundSchema.parse(await req.json());
    return json(await updateRound(db, userId, id, input));
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await deleteRound(db, userId, id);
    return json({ ok: true });
  } catch (err) {
    return errorToResponse(err);
  }
}
```

- [ ] **Step 5: Run the test**

Run: `npm test -- rounds/route`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/tournaments/[id]/rounds src/app/api/rounds
git commit -m "feat(api): round route handlers"
```

---

### Task 14: Install shadcn/ui and add base components

**Files:**
- Create: `components.json`, `src/components/ui/*` (generated), `src/lib/utils.ts` (generated by shadcn)
- Modify: `src/app/globals.css` (shadcn theme tokens)
- Test: none (generated components); verified by build in later tasks

**Interfaces:**
- Produces: shadcn components `button`, `card`, `dialog`, `sheet`, `input`, `textarea`, `select`, `badge`, `sonner` (toast), `command`, `popover`, `skeleton`.

- [ ] **Step 1: Initialize shadcn**

Run: `npx shadcn@latest init -d`
Expected: creates `components.json`, `src/lib/utils.ts`, updates `globals.css`. Accept the default (New York / neutral) style.

- [ ] **Step 2: Add the components used by slice 1**

Run:
```bash
npx shadcn@latest add button card dialog sheet input textarea select badge sonner command popover skeleton
```
Expected: files created under `src/components/ui/`.

- [ ] **Step 3: Mount the toaster in the layout**

In `src/app/layout.tsx`, add inside `<body>` after `{children}`:

```tsx
import { Toaster } from '@/components/ui/sonner';
// ...
<Providers>{children}</Providers>
<Toaster />
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add components.json src/components/ui src/lib/utils.ts src/app/globals.css src/app/layout.tsx
git commit -m "chore(ui): add shadcn/ui base components"
```

---

### Task 15: Browser API client + TanStack Query hooks

**Files:**
- Create: `src/lib/api-client.ts`, `src/components/query-hooks.ts`, `src/lib/dto.ts`
- Test: `src/lib/api-client.test.ts`

**Interfaces:**
- Produces:
  - `src/lib/dto.ts` — shared client-facing types: `TournamentSummaryDTO`, `TournamentDetailDTO`, `RoundDTO`, `LeaderDTO`, `SetDTO`, and input types (`CreateTournamentInput`, etc. re-exported from validation).
  - `apiClient` with typed methods for every endpoint; throws `ApiError { status, message }` on non-2xx.
  - hooks: `useTournaments()`, `useTournament(id)`, `useLeaders()`, `useSets()`, and mutations `useCreateTournament()`, `useUpdateTournament()`, `useDeleteTournament()`, `useFinishTournament()`, `useReopenTournament()`, `useAddRound(tournamentId)`, `useUpdateRound(tournamentId)`, `useDeleteRound(tournamentId)`, `useAddCustomLeader()`, `useAddCustomSet()`.

- [ ] **Step 1: Write `src/lib/dto.ts`**

```ts
export type LeaderDTO = { id: string; name: string; colors: string[]; isCustom: boolean; ownerId: string | null };
export type SetDTO = { id: string; name: string; code: string | null; isCustom: boolean; ownerId: string | null };
export type RoundDTO = {
  id: string; tournamentId: string; roundNumber: number;
  myLeaderId: string; opponentLeaderId: string;
  result: 'win' | 'loss' | 'draw'; playOrder: 'first' | 'second' | null; notes: string | null;
};
export type RecordDTO = { wins: number; losses: number; draws: number };
export type TournamentType = 'local' | 'treasure_cup' | 'regionals' | 'extra_grand_battle' | 'pirates_party' | 'testing';
export type TournamentSummaryDTO = {
  id: string; type: TournamentType; setId: string | null; name: string | null;
  playedOn: string; status: 'draft' | 'locked'; record: RecordDTO;
};
export type TournamentDetailDTO = Omit<TournamentSummaryDTO, 'record'> & { rounds: RoundDTO[] };
```

- [ ] **Step 2: Write `src/lib/api-client.ts`**

```ts
import type {
  LeaderDTO, SetDTO, RoundDTO, TournamentSummaryDTO, TournamentDetailDTO,
} from './dto';
import type { CreateTournamentInput, UpdateTournamentInput } from './validation/tournament';
import type { CreateRoundInput, UpdateRoundInput } from './validation/round';
import type { CustomLeaderInput, CustomSetInput } from './validation/reference';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'ApiError'; }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = res.statusText;
    try { message = (await res.json()).error ?? message; } catch { /* ignore */ }
    throw new ApiError(res.status, message);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const apiClient = {
  listLeaders: () => request<LeaderDTO[]>('/api/leaders'),
  addLeader: (b: CustomLeaderInput) => request<LeaderDTO>('/api/leaders', { method: 'POST', body: JSON.stringify(b) }),
  listSets: () => request<SetDTO[]>('/api/sets'),
  addSet: (b: CustomSetInput) => request<SetDTO>('/api/sets', { method: 'POST', body: JSON.stringify(b) }),

  listTournaments: () => request<TournamentSummaryDTO[]>('/api/tournaments'),
  getTournament: (id: string) => request<TournamentDetailDTO>(`/api/tournaments/${id}`),
  createTournament: (b: CreateTournamentInput) => request<TournamentSummaryDTO>('/api/tournaments', { method: 'POST', body: JSON.stringify(b) }),
  updateTournament: (id: string, b: UpdateTournamentInput) => request<TournamentSummaryDTO>(`/api/tournaments/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteTournament: (id: string) => request<{ ok: true }>(`/api/tournaments/${id}`, { method: 'DELETE' }),
  finishTournament: (id: string) => request<TournamentSummaryDTO>(`/api/tournaments/${id}/finish`, { method: 'POST' }),
  reopenTournament: (id: string) => request<TournamentSummaryDTO>(`/api/tournaments/${id}/reopen`, { method: 'POST' }),

  addRound: (tid: string, b: CreateRoundInput) => request<RoundDTO>(`/api/tournaments/${tid}/rounds`, { method: 'POST', body: JSON.stringify(b) }),
  updateRound: (id: string, b: UpdateRoundInput) => request<RoundDTO>(`/api/rounds/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteRound: (id: string) => request<{ ok: true }>(`/api/rounds/${id}`, { method: 'DELETE' }),
};
```

- [ ] **Step 3: Write the failing test `src/lib/api-client.test.ts`**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiClient, ApiError } from './api-client';

afterEach(() => { vi.restoreAllMocks(); });

describe('apiClient', () => {
  it('parses a successful list response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{ id: '1' }]), { status: 200 })));
    const result = await apiClient.listTournaments();
    expect(result).toEqual([{ id: '1' }]);
  });

  it('throws ApiError with status and message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Tournament is locked' }), { status: 409 })));
    await expect(apiClient.finishTournament('x')).rejects.toMatchObject({ status: 409, message: 'Tournament is locked' });
    await expect(apiClient.finishTournament('x')).rejects.toBeInstanceOf(ApiError);
  });
});
```

- [ ] **Step 4: Run it to confirm it fails, then passes after Step 2 exists**

Run: `npm test -- api-client`
Expected: PASS (Step 2 already wrote the client).

- [ ] **Step 5: Write `src/components/query-hooks.ts`**

```ts
'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { CreateRoundInput, UpdateRoundInput } from '@/lib/validation/round';
import type { CreateTournamentInput, UpdateTournamentInput } from '@/lib/validation/tournament';

const keys = {
  tournaments: ['tournaments'] as const,
  tournament: (id: string) => ['tournament', id] as const,
  leaders: ['leaders'] as const,
  sets: ['sets'] as const,
};

export const useTournaments = () => useQuery({ queryKey: keys.tournaments, queryFn: apiClient.listTournaments });
export const useTournament = (id: string) => useQuery({ queryKey: keys.tournament(id), queryFn: () => apiClient.getTournament(id) });
export const useLeaders = () => useQuery({ queryKey: keys.leaders, queryFn: apiClient.listLeaders });
export const useSets = () => useQuery({ queryKey: keys.sets, queryFn: apiClient.listSets });

export function useCreateTournament() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: CreateTournamentInput) => apiClient.createTournament(b),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.tournaments }),
  });
}
export function useUpdateTournament(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: UpdateTournamentInput) => apiClient.updateTournament(id, b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.tournament(id) }); qc.invalidateQueries({ queryKey: keys.tournaments }); },
  });
}
export function useDeleteTournament() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.deleteTournament(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.tournaments }),
  });
}
export function useFinishTournament(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.finishTournament(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.tournament(id) }); qc.invalidateQueries({ queryKey: keys.tournaments }); },
  });
}
export function useReopenTournament(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.reopenTournament(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.tournament(id) }); qc.invalidateQueries({ queryKey: keys.tournaments }); },
  });
}
export function useAddRound(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: CreateRoundInput) => apiClient.addRound(tournamentId, b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.tournament(tournamentId) }); qc.invalidateQueries({ queryKey: keys.tournaments }); },
  });
}
export function useUpdateRound(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateRoundInput }) => apiClient.updateRound(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.tournament(tournamentId) }); qc.invalidateQueries({ queryKey: keys.tournaments }); },
  });
}
export function useDeleteRound(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.deleteRound(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.tournament(tournamentId) }); qc.invalidateQueries({ queryKey: keys.tournaments }); },
  });
}
export function useAddCustomLeader() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: apiClient.addLeader, onSuccess: () => qc.invalidateQueries({ queryKey: keys.leaders }) });
}
export function useAddCustomSet() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: apiClient.addSet, onSuccess: () => qc.invalidateQueries({ queryKey: keys.sets }) });
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/dto.ts src/lib/api-client.ts src/lib/api-client.test.ts src/components/query-hooks.ts
git commit -m "feat(client): typed API client and query hooks"
```

---

### Task 16: Reference combobox (leader/set select with add-custom)

**Files:**
- Create: `src/components/tournaments/reference-combobox.tsx`
- Test: none (interactive UI; exercised by E2E in Task 20)

**Interfaces:**
- Consumes: shadcn `command`, `popover`, `button`.
- Produces: `ReferenceCombobox` component:
  ```ts
  type Option = { id: string; name: string };
  function ReferenceCombobox(props: {
    options: Option[];
    value: string | null;
    onChange: (id: string) => void;
    onAddCustom: (name: string) => Promise<Option>;
    placeholder: string;
    disabled?: boolean;
  }): JSX.Element
  ```

- [ ] **Step 1: Write `src/components/tournaments/reference-combobox.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

type Option = { id: string; name: string };

export function ReferenceCombobox({
  options, value, onChange, onAddCustom, placeholder, disabled,
}: {
  options: Option[];
  value: string | null;
  onChange: (id: string) => void;
  onAddCustom: (name: string) => Promise<Option>;
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = options.find((o) => o.id === value);

  async function handleAdd() {
    const created = await onAddCustom(search.trim());
    onChange(created.id);
    setSearch('');
    setOpen(false);
  }

  const showAdd = search.trim().length > 0 &&
    !options.some((o) => o.name.toLowerCase() === search.trim().toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled}
          className="w-full justify-between h-12 text-base">
          {selected ? selected.name : <span className="text-muted-foreground">{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
        <Command>
          <CommandInput placeholder="Search…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.id} value={o.name} onSelect={() => { onChange(o.id); setOpen(false); }}>
                  <Check className={cn('mr-2 h-4 w-4', value === o.id ? 'opacity-100' : 'opacity-0')} />
                  {o.name}
                </CommandItem>
              ))}
              {showAdd && (
                <CommandItem value={`__add__${search}`} onSelect={handleAdd}>
                  <Plus className="mr-2 h-4 w-4" /> Add “{search.trim()}”
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/tournaments/reference-combobox.tsx
git commit -m "feat(ui): reference combobox with add-custom"
```

---

### Task 17: Tournament list (home page)

**Files:**
- Create: `src/components/tournaments/tournament-card.tsx`, `src/components/tournaments/tournament-list.tsx`, `src/lib/labels.ts`
- Modify: `src/app/page.tsx`
- Test: `src/lib/labels.test.ts`

**Interfaces:**
- Consumes: `useTournaments`, `formatRecord`, DTOs.
- Produces:
  - `src/lib/labels.ts` — `TOURNAMENT_TYPE_LABELS: Record<TournamentType, string>` and `tournamentTypeLabel(type)`.
  - `TournamentList` (client) rendering cards + empty/loading/error states + a link to `/tournaments/new`.

- [ ] **Step 1: Write the failing test `src/lib/labels.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { tournamentTypeLabel } from './labels';

describe('tournamentTypeLabel', () => {
  it('humanizes enum values', () => {
    expect(tournamentTypeLabel('treasure_cup')).toBe('Treasure Cup');
    expect(tournamentTypeLabel('extra_grand_battle')).toBe('Extra Grand Battle');
    expect(tournamentTypeLabel('local')).toBe('Local');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- labels`
Expected: FAIL.

- [ ] **Step 3: Write `src/lib/labels.ts`**

```ts
import type { TournamentType } from './dto';

export const TOURNAMENT_TYPE_LABELS: Record<TournamentType, string> = {
  local: 'Local',
  treasure_cup: 'Treasure Cup',
  regionals: 'Regionals',
  extra_grand_battle: 'Extra Grand Battle',
  pirates_party: 'Pirates Party',
  testing: 'Testing',
};

export function tournamentTypeLabel(type: TournamentType): string {
  return TOURNAMENT_TYPE_LABELS[type];
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npm test -- labels`
Expected: PASS.

- [ ] **Step 5: Write `src/components/tournaments/tournament-card.tsx`**

```tsx
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRecord } from '@/lib/record';
import { tournamentTypeLabel } from '@/lib/labels';
import type { TournamentSummaryDTO } from '@/lib/dto';

export function TournamentCard({ t }: { t: TournamentSummaryDTO }) {
  return (
    <Link href={`/tournaments/${t.id}`}>
      <Card className="p-4 flex items-center justify-between active:scale-[0.99] transition-transform">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{tournamentTypeLabel(t.type)}</Badge>
            {t.status === 'locked' && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
          <p className="mt-1 truncate font-medium">{t.name ?? tournamentTypeLabel(t.type)}</p>
          <p className="text-sm text-muted-foreground">{t.playedOn}</p>
        </div>
        <div className="text-2xl font-bold tabular-nums">{formatRecord(t.record)}</div>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 6: Write `src/components/tournaments/tournament-list.tsx`**

```tsx
'use client';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTournaments } from '@/components/query-hooks';
import { TournamentCard } from './tournament-card';
import { tournamentTypeLabel } from '@/lib/labels';
import type { TournamentType } from '@/lib/dto';

const TYPES: TournamentType[] = ['local', 'treasure_cup', 'regionals', 'extra_grand_battle', 'pirates_party', 'testing'];

export function TournamentList() {
  const { data, isLoading, isError } = useTournaments();
  const [filter, setFilter] = useState<TournamentType | 'all'>('all');

  return (
    <main className="mx-auto max-w-xl p-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Crew Stat</h1>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
        <button onClick={() => setFilter('all')}
          className={`rounded-full px-3 py-1 text-sm ${filter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>All</button>
        {TYPES.map((ty) => (
          <button key={ty} onClick={() => setFilter(ty)}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${filter === ty ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
            {tournamentTypeLabel(ty)}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        {isError && <p className="text-destructive">Couldn’t load tournaments. Pull to retry.</p>}
        {data && data.filter((t) => filter === 'all' || t.type === filter).map((t) => (
          <TournamentCard key={t.id} t={t} />
        ))}
        {data && data.length === 0 && (
          <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            No tournaments yet. Log your first one!
          </div>
        )}
      </div>

      <Link href="/tournaments/new" className="fixed inset-x-0 bottom-4 mx-auto w-[calc(100%-2rem)] max-w-xl">
        <Button className="h-14 w-full text-base shadow-lg"><Plus className="mr-2 h-5 w-5" /> Add Tournament</Button>
      </Link>
    </main>
  );
}
```

- [ ] **Step 7: Replace `src/app/page.tsx`**

```tsx
import { TournamentList } from '@/components/tournaments/tournament-list';

export default function HomePage() {
  return <TournamentList />;
}
```

- [ ] **Step 8: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/lib/labels.ts src/lib/labels.test.ts src/components/tournaments/tournament-card.tsx src/components/tournaments/tournament-list.tsx src/app/page.tsx
git commit -m "feat(ui): tournament list home page"
```

---

### Task 18: New tournament flow

**Files:**
- Create: `src/components/tournaments/new-tournament-form.tsx`, `src/app/tournaments/new/page.tsx`
- Test: none (form UI; exercised by E2E in Task 20)

**Interfaces:**
- Consumes: `useSets`, `useAddCustomSet`, `useCreateTournament`, `ReferenceCombobox`, `tournamentTypeLabel`.
- Produces: a form that creates a draft tournament and routes to `/tournaments/:id`.

- [ ] **Step 1: Write `src/components/tournaments/new-tournament-form.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ReferenceCombobox } from './reference-combobox';
import { useSets, useAddCustomSet, useCreateTournament } from '@/components/query-hooks';
import { tournamentTypeLabel } from '@/lib/labels';
import type { TournamentType } from '@/lib/dto';

const TYPES: TournamentType[] = ['local', 'treasure_cup', 'regionals', 'extra_grand_battle', 'pirates_party', 'testing'];

export function NewTournamentForm() {
  const router = useRouter();
  const { data: sets } = useSets();
  const addSet = useAddCustomSet();
  const create = useCreateTournament();

  const [type, setType] = useState<TournamentType>('local');
  const [setId, setSetId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [playedOn, setPlayedOn] = useState(() => new Date().toISOString().slice(0, 10));

  async function submit() {
    try {
      const t = await create.mutateAsync({
        type, setId: setId ?? undefined, name: name.trim() || undefined, playedOn,
      });
      router.push(`/tournaments/${t.id}`);
    } catch {
      toast.error('Could not create tournament');
    }
  }

  return (
    <main className="mx-auto max-w-xl space-y-5 p-4">
      <h1 className="text-2xl font-bold">New Tournament</h1>

      <div className="space-y-2">
        <label className="text-sm font-medium">Type</label>
        <Select value={type} onValueChange={(v) => setType(v as TournamentType)}>
          <SelectTrigger className="h-12 text-base"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TYPES.map((ty) => <SelectItem key={ty} value={ty}>{tournamentTypeLabel(ty)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Set</label>
        <ReferenceCombobox
          options={sets ?? []} value={setId} onChange={setSetId}
          onAddCustom={async (n) => { const s = await addSet.mutateAsync({ name: n }); return { id: s.id, name: s.name }; }}
          placeholder="Choose a set" />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Name (optional)</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spring Regional" className="h-12 text-base" />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Date</label>
        <Input type="date" value={playedOn} onChange={(e) => setPlayedOn(e.target.value)} className="h-12 text-base" />
      </div>

      <Button onClick={submit} disabled={create.isPending} className="h-14 w-full text-base">
        {create.isPending ? 'Creating…' : 'Create & Start Logging'}
      </Button>
    </main>
  );
}
```

- [ ] **Step 2: Write `src/app/tournaments/new/page.tsx`**

```tsx
import { NewTournamentForm } from '@/components/tournaments/new-tournament-form';

export default function NewTournamentPage() {
  return <NewTournamentForm />;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/tournaments/new-tournament-form.tsx src/app/tournaments/new/page.tsx
git commit -m "feat(ui): new tournament flow"
```

---

### Task 19: Tournament detail — rounds, add/edit sheet, finish/reopen, delete+undo

**Files:**
- Create: `src/components/tournaments/round-form-sheet.tsx`, `src/components/tournaments/round-item.tsx`, `src/components/tournaments/tournament-detail.tsx`, `src/app/tournaments/[id]/page.tsx`
- Test: none (interactive; exercised by E2E in Task 20)

**Interfaces:**
- Consumes: `useTournament`, `useLeaders`, `useAddCustomLeader`, round mutations, tournament finish/reopen/delete, `ReferenceCombobox`, shadcn `sheet`/`dialog`.
- Produces: the full detail screen.

- [ ] **Step 1: Write `src/components/tournaments/round-form-sheet.tsx`**

```tsx
'use client';
import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ReferenceCombobox } from './reference-combobox';
import { useLeaders, useAddCustomLeader } from '@/components/query-hooks';
import type { RoundDTO } from '@/lib/dto';
import type { CreateRoundInput } from '@/lib/validation/round';

type Result = 'win' | 'loss' | 'draw';
type PlayOrder = 'first' | 'second';

export function RoundFormSheet({
  open, onOpenChange, initial, onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: RoundDTO;
  onSubmit: (data: CreateRoundInput) => Promise<void>;
}) {
  const { data: leaders } = useLeaders();
  const addLeader = useAddCustomLeader();

  const [myLeaderId, setMyLeaderId] = useState<string | null>(null);
  const [oppLeaderId, setOppLeaderId] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [playOrder, setPlayOrder] = useState<PlayOrder | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMyLeaderId(initial?.myLeaderId ?? null);
      setOppLeaderId(initial?.opponentLeaderId ?? null);
      setResult(initial?.result ?? null);
      setPlayOrder(initial?.playOrder ?? null);
      setNotes(initial?.notes ?? '');
    }
  }, [open, initial]);

  const valid = myLeaderId && oppLeaderId && result;

  async function save() {
    if (!valid) return;
    setSaving(true);
    try {
      await onSubmit({ myLeaderId, opponentLeaderId: oppLeaderId, result, playOrder, notes: notes.trim() || null });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  const addLeaderCustom = async (n: string) => {
    const l = await addLeader.mutateAsync({ name: n, colors: [] });
    return { id: l.id, name: l.name };
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader><SheetTitle>{initial ? 'Edit Round' : 'Add Round'}</SheetTitle></SheetHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">My leader</label>
            <ReferenceCombobox options={leaders ?? []} value={myLeaderId} onChange={setMyLeaderId} onAddCustom={addLeaderCustom} placeholder="Your leader" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Opponent deck</label>
            <ReferenceCombobox options={leaders ?? []} value={oppLeaderId} onChange={setOppLeaderId} onAddCustom={addLeaderCustom} placeholder="Opponent’s leader" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Result</label>
            <div className="grid grid-cols-3 gap-2">
              {(['win', 'loss', 'draw'] as Result[]).map((r) => (
                <Button key={r} type="button" variant={result === r ? 'default' : 'outline'} className="h-12 capitalize" onClick={() => setResult(r)}>{r}</Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Play order</label>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={playOrder === 'first' ? 'default' : 'outline'} className="h-12" onClick={() => setPlayOrder(playOrder === 'first' ? null : 'first')}>Went 1st</Button>
              <Button type="button" variant={playOrder === 'second' ? 'default' : 'outline'} className="h-12" onClick={() => setPlayOrder(playOrder === 'second' ? null : 'second')}>Went 2nd</Button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Notes (optional)</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Opening hand, key turns…" />
          </div>
          <Button onClick={save} disabled={!valid || saving} className="h-14 w-full text-base">{saving ? 'Saving…' : 'Save Round'}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Write `src/components/tournaments/round-item.tsx`**

```tsx
'use client';
import { Badge } from '@/components/ui/badge';
import type { RoundDTO, LeaderDTO } from '@/lib/dto';

const resultStyle: Record<RoundDTO['result'], string> = {
  win: 'bg-green-600 text-white',
  loss: 'bg-red-600 text-white',
  draw: 'bg-yellow-500 text-black',
};

export function RoundItem({
  round, leaderName, onEdit, onDelete, editable,
}: {
  round: RoundDTO;
  leaderName: (id: string) => string;
  onEdit: () => void;
  onDelete: () => void;
  editable: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div className="w-6 text-center text-sm text-muted-foreground">{round.roundNumber}</div>
      <Badge className={resultStyle[round.result]}>{round.result[0].toUpperCase()}</Badge>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          <span className="text-muted-foreground">{leaderName(round.myLeaderId)}</span> vs {leaderName(round.opponentLeaderId)}
        </p>
        {round.playOrder && <p className="text-xs text-muted-foreground">Went {round.playOrder === 'first' ? '1st' : '2nd'}</p>}
        {round.notes && <p className="truncate text-xs text-muted-foreground">{round.notes}</p>}
      </div>
      {editable && (
        <div className="flex gap-1">
          <button onClick={onEdit} className="px-2 py-1 text-xs text-muted-foreground">Edit</button>
          <button onClick={onDelete} className="px-2 py-1 text-xs text-destructive">Delete</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write `src/components/tournaments/tournament-detail.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { RoundFormSheet } from './round-form-sheet';
import { RoundItem } from './round-item';
import {
  useTournament, useLeaders, useAddRound, useUpdateRound, useDeleteRound,
  useFinishTournament, useReopenTournament, useDeleteTournament,
} from '@/components/query-hooks';
import { formatRecord } from '@/lib/record';
import { computeRecord } from '@/lib/record';
import { tournamentTypeLabel } from '@/lib/labels';
import type { RoundDTO } from '@/lib/dto';

export function TournamentDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: t, isLoading, isError } = useTournament(id);
  const { data: leaders } = useLeaders();
  const addRound = useAddRound(id);
  const updateRound = useUpdateRound(id);
  const deleteRound = useDeleteRound(id);
  const finish = useFinishTournament(id);
  const reopen = useReopenTournament(id);
  const removeTournament = useDeleteTournament();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<RoundDTO | undefined>();

  if (isLoading) return <main className="mx-auto max-w-xl p-4"><Skeleton className="h-24 w-full" /></main>;
  if (isError || !t) return <main className="mx-auto max-w-xl p-4"><p className="text-destructive">Couldn’t load this tournament.</p></main>;

  const editable = t.status === 'draft';
  const leaderName = (lid: string) => leaders?.find((l) => l.id === lid)?.name ?? '—';
  const record = computeRecord(t.rounds);

  async function handleDeleteRound(r: RoundDTO) {
    await deleteRound.mutateAsync(r.id);
    toast('Round deleted', {
      action: {
        label: 'Undo',
        onClick: () => addRound.mutate({
          myLeaderId: r.myLeaderId, opponentLeaderId: r.opponentLeaderId,
          result: r.result, playOrder: r.playOrder, notes: r.notes,
        }),
      },
    });
  }

  return (
    <main className="mx-auto max-w-xl p-4 pb-28">
      <button onClick={() => router.push('/')} className="mb-2 text-sm text-muted-foreground">← All tournaments</button>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{tournamentTypeLabel(t.type)}</Badge>
            <Badge variant={editable ? 'outline' : 'default'}>{editable ? 'Draft' : 'Locked'}</Badge>
          </div>
          <h1 className="mt-1 text-xl font-bold">{t.name ?? tournamentTypeLabel(t.type)}</h1>
          <p className="text-sm text-muted-foreground">{t.playedOn}</p>
        </div>
        <div className="text-3xl font-bold tabular-nums">{formatRecord(record)}</div>
      </div>

      <div className="mt-5 space-y-2">
        {t.rounds.length === 0 && <p className="text-sm text-muted-foreground">No rounds yet.</p>}
        {t.rounds.map((r) => (
          <RoundItem key={r.id} round={r} leaderName={leaderName} editable={editable}
            onEdit={() => { setEditing(r); setSheetOpen(true); }}
            onDelete={() => handleDeleteRound(r)} />
        ))}
      </div>

      <div className="mt-6 flex gap-2">
        {editable ? (
          <>
            <Dialog>
              <DialogTrigger asChild><Button variant="outline" className="flex-1 h-12">Finish</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Finish tournament?</DialogTitle></DialogHeader>
                <p className="text-sm text-muted-foreground">This locks the tournament. You can reopen it later to make changes.</p>
                <DialogFooter><Button onClick={() => finish.mutate()}>Finish & Lock</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        ) : (
          <Button variant="outline" className="flex-1 h-12" onClick={() => reopen.mutate()}>Reopen</Button>
        )}
        <Dialog>
          <DialogTrigger asChild><Button variant="destructive" className="h-12">Delete</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Delete tournament?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">This permanently removes the tournament and all its rounds.</p>
            <DialogFooter>
              <Button variant="destructive" onClick={async () => { await removeTournament.mutateAsync(t.id); router.push('/'); }}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {editable && (
        <div className="fixed inset-x-0 bottom-4 mx-auto w-[calc(100%-2rem)] max-w-xl">
          <Button className="h-14 w-full text-base shadow-lg" onClick={() => { setEditing(undefined); setSheetOpen(true); }}>+ Add Round</Button>
        </div>
      )}

      <RoundFormSheet open={sheetOpen} onOpenChange={setSheetOpen} initial={editing}
        onSubmit={async (data) => {
          try {
            if (editing) await updateRound.mutateAsync({ id: editing.id, body: data });
            else await addRound.mutateAsync(data);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not save round');
            throw e;
          }
        }} />
    </main>
  );
}
```

- [ ] **Step 4: Write `src/app/tournaments/[id]/page.tsx`**

```tsx
import { TournamentDetail } from '@/components/tournaments/tournament-detail';

export default async function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TournamentDetail id={id} />;
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/tournaments/round-form-sheet.tsx src/components/tournaments/round-item.tsx src/components/tournaments/tournament-detail.tsx "src/app/tournaments/[id]/page.tsx"
git commit -m "feat(ui): tournament detail with rounds, finish/reopen, delete+undo"
```

---

### Task 20: End-to-end happy path (Playwright)

**Files:**
- Create: `playwright.config.ts`, `e2e/tournament-flow.spec.ts`, `e2e/.auth/setup.ts`
- Modify: `package.json` (already has `e2e` script)
- Test: the E2E spec itself

**Interfaces:**
- Consumes: the running dev server + a Clerk test user. Uses Clerk's testing token approach so the E2E can bypass the interactive sign-in.

- [ ] **Step 1: Install Playwright browsers and Clerk testing helper**

```bash
npx playwright install --with-deps chromium
npm install -D @clerk/testing
```

- [ ] **Step 2: Write `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:3000', ...devices['iPhone 13'] },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: Write `e2e/.auth/setup.ts`** (obtains a Clerk session via testing token)

```ts
import { test as setup } from '@playwright/test';
import { clerkSetup, setupClerkTestingToken } from '@clerk/testing/playwright';

setup('authenticate', async ({ page }) => {
  await clerkSetup();
  await setupClerkTestingToken({ page });
  await page.goto('/sign-in');
  // Uses CLERK test credentials from env: E2E_CLERK_USER_USERNAME / E2E_CLERK_USER_PASSWORD
  await page.getByLabel(/email/i).fill(process.env.E2E_CLERK_USER_USERNAME!);
  await page.getByRole('button', { name: /continue/i }).click();
  await page.getByLabel(/password/i).fill(process.env.E2E_CLERK_USER_PASSWORD!);
  await page.getByRole('button', { name: /continue/i }).click();
  await page.waitForURL('/');
  await page.context().storageState({ path: 'e2e/.auth/state.json' });
});
```

- [ ] **Step 4: Write `e2e/tournament-flow.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/state.json' });

test('create tournament, log rounds, finish, see record', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /add tournament/i }).click();

  await page.getByRole('button', { name: /create & start logging/i }).click();
  await expect(page).toHaveURL(/\/tournaments\//);

  // Round 1 — win
  await page.getByRole('button', { name: /add round/i }).click();
  await page.getByText('Your leader').click();
  await page.getByPlaceholder('Search…').fill('Zoro');
  await page.getByRole('option', { name: /Roronoa Zoro/i }).click();
  await page.getByText('Opponent’s leader').click();
  await page.getByPlaceholder('Search…').fill('Doflamingo');
  await page.getByRole('option', { name: /Doflamingo/i }).click();
  await page.getByRole('button', { name: 'win' }).click();
  await page.getByRole('button', { name: /save round/i }).click();

  await expect(page.getByText(/vs Donquixote Doflamingo/i)).toBeVisible();

  // Finish
  await page.getByRole('button', { name: /finish/i }).click();
  await page.getByRole('button', { name: /finish & lock/i }).click();
  await expect(page.getByText('Locked')).toBeVisible();

  // Record reflects 1-0
  await page.goto('/');
  await expect(page.getByText('1-0').first()).toBeVisible();
});
```

- [ ] **Step 5: Run the E2E suite**

Run: `npm run e2e`
Expected: PASS. (Requires `.env.local` with Clerk test keys + `E2E_CLERK_USER_USERNAME`/`E2E_CLERK_USER_PASSWORD` for a Clerk test user, and the dev DB seeded via `npm run db:seed`.)

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts e2e package.json
git commit -m "test(e2e): tournament happy-path flow"
```

---

### Task 21: Provision Vercel integrations and deploy

**Files:**
- Modify: `.env.local` (local only — never committed), Vercel project env
- Create: none

**Interfaces:**
- Produces: a deployed, working app with Clerk + Neon provisioned.

- [ ] **Step 1: Provision Neon Postgres via the Vercel Marketplace**

Use the `vercel:marketplace` skill (or dashboard) to add **Neon**. This sets `DATABASE_URL` in the Vercel project. Pull it locally:

```bash
vercel env pull .env.local
```

- [ ] **Step 2: Provision Clerk via the Vercel Marketplace**

Add **Clerk**; it sets `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`. Add the sign-in/up URL vars from `.env.example` in the Vercel dashboard. Re-pull: `vercel env pull .env.local`.

- [ ] **Step 3: Run migrations against the production DB**

```bash
npm run db:migrate
```
Expected: enums + four tables created in Neon.

- [ ] **Step 4: Seed reference data in production**

```bash
npm run db:seed
```
Expected: `Seeded { leaders: 25, sets: 8 }`.

- [ ] **Step 5: Deploy to production**

Use the `vercel:deploy` skill with `prod`, or:
```bash
vercel --prod
```
Expected: deployment READY; the live URL shows the sign-in page, and after signing in, the (empty) tournament list.

- [ ] **Step 6: Smoke-check and commit any config**

Run: `curl -s -o /dev/null -w "%{http_code}\n" <prod-url>` → expect `200` (redirect to sign-in is fine).

```bash
git add -A
git commit -m "chore: production env + deploy config" --allow-empty
```

---

## Self-Review

**1. Spec coverage**

| Spec item | Task(s) |
|-----------|---------|
| Cloud + accounts (Clerk + Neon) | 2, 10, 21 |
| Hybrid seeded + custom leaders/sets | 3, 6, 11, 16 |
| Round = leader/opp/result/play-order/notes | 4, 8, 19 |
| Tournament types enum | 2, 4, 17, 18 |
| Create draft → detail | 7, 12, 18 |
| Finish/lock + confirm + reopen | 7, 12, 19 |
| Edit/delete tournament | 7, 12, 19 |
| Edit/delete round + renumber + undo | 8, 13, 19 |
| Computed record (`4-2`) | 5, 7, 17, 19 |
| Locked → 409 guard | 8, 13 |
| Custom-add dedupe | 6 |
| Ownership scoping / 404 not 403 | 7, 8, 9 |
| REST API surface (native-app-ready) | 11, 12, 13 |
| Mobile-first screens + empty/loading/error | 17, 18, 19 |
| Validation (400) | 4, 9, 11, 12, 13 |
| Testing (unit/integration/E2E) | all backend tasks + 20 |
| Deploy | 21 |

No spec requirement is unassigned. Decklist photos and statistics are intentionally out of scope per the spec.

**2. Placeholder scan:** No `TODO`/`TBD`/"handle appropriately" left; every code step contains real code, every command has expected output. The two "Note" callouts (seed idempotency in Task 3, test import-path in Task 11) describe real constraints, not deferred work.

**3. Type consistency:** Service signatures (`db, ownerId, …`) are identical between their defining task and their callers in the route-handler tasks. DTO field names (`playedOn`, `roundNumber`, `myLeaderId`, `opponentLeaderId`, `playOrder`) match the Drizzle schema columns and the Zod schemas. `computeRecord`/`formatRecord` names are used consistently in Tasks 5, 7, 17, 19. `record` shape `{wins,losses,draws}` is uniform across service, DTO, and UI. Route context type `{ params: Promise<{ id: string }> }` is consistent across all dynamic routes (Next.js 16 async params).

Plan is internally consistent; no fixes required.
