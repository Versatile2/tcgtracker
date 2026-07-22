# Grand Line TCG — V1 Feedback Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the leader a tournament-level choice (not per-round), replace the "Set" concept with "Meta" (OP01–OP16) everywhere, and rename the product to "Grand Line TCG — Track your OPTCG Games".

**Architecture:** Existing Next.js 16 App Router app with a thin stack: Drizzle schema → service functions (pure, DB-injected) → route handlers that `json()` the service result directly (rows *are* the DTO shape) → a typed `apiClient` → TanStack Query hooks → React components. The change is a coordinated refactor across all layers. We do it bottom-up: database → validation/DTOs → services → routes/client → components → branding, so each layer's tests stay green as we go.

**Tech Stack:** Next.js 16, TypeScript, Drizzle ORM (node-postgres), Zod, TanStack Query, Vitest (against a local `crewstat_test` Postgres), Tailwind v4, base-ui/shadcn.

## Global Constraints

- **Clean start — no data migration.** Existing tournaments/rounds may be dropped. Regenerate the single Drizzle migration from scratch.
- **`myLeaderId` is required** on a tournament; **`metaId` is optional** (nullable).
- **Internal rename `set → meta` is total:** table `sets`→`metas`, column `setId`→`metaId`, and every identifier (`SetDTO`, `PerSetStat`, `bestSet`, `listSets`, `useSets`, `/api/sets`, `hasSetDominator`, `distinctSets`, …). No "set" identifier survives except stable achievement keys (`set_dominator`, `well_traveled`) which stay as-is to preserve unlock identity.
- **Product name:** `Grand Line TCG`. **Tagline / description:** `Track your OPTCG Games`. Do NOT rename the GitHub repo, the Vercel project, or localStorage keys (e.g. `crewstat-accent`) — those are infra/storage identifiers, not user-facing copy.
- **Meta display:** metas are labelled code-first (`OP16`), keeping the real set name for OP01–OP08.
- **Tests run against local Postgres** via `DATABASE_URL_TEST`; run a single test file with `npm test -- <path>`.
- **Vitest uses esbuild (no typecheck).** Unit tests pass on runtime behavior even while other files have stale types; the whole-repo typecheck is validated by `npm run build` in the frontend/verification tasks.

---

## Task 1: Database layer — schema, seed, migration, test reset

Moves `myLeaderId` from `rounds` to `tournaments` and renames `sets`→`metas` / `setId`→`metaId`. Regenerates the migration and recreates the local test DB so migrations apply cleanly.

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/seed-data.ts`
- Modify: `src/db/seed.ts`
- Modify: `src/db/seed.test.ts`
- Modify: `tests/setup/db.ts`
- Delete + regenerate: `drizzle/0000_*.sql`, `drizzle/meta/`

**Interfaces:**
- Produces: `tournaments.myLeaderId` (uuid, NOT NULL, FK→leaders), `tournaments.metaId` (uuid, nullable, FK→metas); `rounds` has NO `myLeaderId`; table `metas` (was `sets`); `SEED_METAS`; `seedReferenceData` returns `{ leaders: number; metas: number }`.

- [ ] **Step 1: Rewrite the `sets` table as `metas` and move the leader in `schema.ts`**

In `src/db/schema.ts`, rename the `sets` export to `metas` (keep all columns, only the exported const name and `pgTable('metas', …)` change):

```ts
export const metas = pgTable('metas', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  code: text('code'),
  releasedAt: date('released_at'),
  isCustom: boolean('is_custom').notNull().default(false),
  ownerId: text('owner_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

Change the `tournaments` table: rename `setId` → `metaId` and add `myLeaderId` (required):

```ts
export const tournaments = pgTable('tournaments', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: text('owner_id').notNull(),
  type: tournamentType('type').notNull(),
  myLeaderId: uuid('my_leader_id').notNull().references(() => leaders.id),
  metaId: uuid('meta_id').references(() => metas.id),
  name: text('name'),
  playedOn: date('played_on').notNull(),
  status: tournamentStatus('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

Change the `rounds` table: remove the `myLeaderId` column entirely (leave `opponentLeaderId`, `result`, `playOrder`, `notes`, `roundNumber`, timestamps):

```ts
export const rounds = pgTable('rounds', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  roundNumber: integer('round_number').notNull(),
  opponentLeaderId: uuid('opponent_leader_id').notNull().references(() => leaders.id),
  result: roundResult('result').notNull(),
  playOrder: playOrder('play_order'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Replace the seed data with `SEED_METAS` (OP01–OP16)**

In `src/db/seed-data.ts`, rename `SEED_SETS` → `SEED_METAS` and extend it (keep `SEED_LEADERS` unchanged):

```ts
export const SEED_METAS: { name: string; code: string }[] = [
  { name: 'OP01 Romance Dawn', code: 'OP01' },
  { name: 'OP02 Paramount War', code: 'OP02' },
  { name: 'OP03 Pillars of Strength', code: 'OP03' },
  { name: 'OP04 Kingdoms of Intrigue', code: 'OP04' },
  { name: 'OP05 Awakening of the New Era', code: 'OP05' },
  { name: 'OP06 Wings of the Captain', code: 'OP06' },
  { name: 'OP07 500 Years in the Future', code: 'OP07' },
  { name: 'OP08 Two Legends', code: 'OP08' },
  { name: 'OP09', code: 'OP09' },
  { name: 'OP10', code: 'OP10' },
  { name: 'OP11', code: 'OP11' },
  { name: 'OP12', code: 'OP12' },
  { name: 'OP13', code: 'OP13' },
  { name: 'OP14', code: 'OP14' },
  { name: 'OP15', code: 'OP15' },
  { name: 'OP16', code: 'OP16' },
];
```

- [ ] **Step 3: Update `seed.ts` to seed metas**

Rewrite `src/db/seed.ts` to import/insert metas and return `{ leaders, metas }`:

```ts
import { and, isNull, sql } from 'drizzle-orm';
import { db as defaultDb } from './client';
import { leaders, metas } from './schema';
import { SEED_LEADERS, SEED_METAS } from './seed-data';

type DB = typeof defaultDb;

export async function seedReferenceData(db: DB) {
  let leaderCount = 0;
  for (const l of SEED_LEADERS) {
    const existing = await db.select().from(leaders)
      .where(and(isNull(leaders.ownerId), sql`lower(${leaders.name}) = lower(${l.name})`))
      .limit(1);
    if (existing[0]) continue;
    const res = await db.insert(leaders)
      .values({ name: l.name, colors: l.colors, isCustom: false, ownerId: null })
      .returning();
    leaderCount += res.length;
  }
  let metaCount = 0;
  for (const m of SEED_METAS) {
    const existing = await db.select().from(metas)
      .where(and(isNull(metas.ownerId), sql`lower(${metas.name}) = lower(${m.name})`))
      .limit(1);
    if (existing[0]) continue;
    const res = await db.insert(metas)
      .values({ name: m.name, code: m.code, isCustom: false, ownerId: null })
      .returning();
    metaCount += res.length;
  }
  return { leaders: leaderCount, metas: metaCount };
}

// Allow `npm run db:seed`
if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  seedReferenceData(defaultDb)
    .then((r) => { console.log('Seeded', r); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 4: Update `tests/setup/db.ts` reset to truncate `metas`**

In `tests/setup/db.ts`, change the `resetDb` TRUNCATE list (`sets` → `metas`):

```ts
export async function resetDb() {
  await testDb.execute(
    sql`TRUNCATE TABLE rounds, tournaments, metas, leaders RESTART IDENTITY CASCADE`,
  );
}
```

- [ ] **Step 5: Update `seed.test.ts` for the new return shape**

Open `src/db/seed.test.ts` and replace every reference to the `sets` count / `sets` table with `metas`. The seed call now returns `{ leaders, metas }`; assertions that read `result.sets` become `result.metas`, and any direct `sets` table query becomes `metas`. Update the expected seeded count to `16` (length of `SEED_METAS`) wherever the old test asserted the set count (`8`).

- [ ] **Step 6: Regenerate the migration from scratch**

Because we renamed a table and columns and this is a clean start, delete the old migration and regenerate:

```bash
rm -f drizzle/0000_*.sql && rm -rf drizzle/meta && npm run db:generate
```

Expected: a single new `drizzle/0000_*.sql` is created describing the current schema (tables `leaders`, `metas`, `tournaments` with `my_leader_id` + `meta_id`, `rounds` without `my_leader_id`).

- [ ] **Step 7: Recreate the local test database so the fresh migration applies**

The test DB still has the old tables; drop and recreate it so `global-setup` migrate runs against an empty DB:

```bash
psql "$DATABASE_URL_TEST" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' 2>/dev/null \
  || dropdb crewstat_test && createdb crewstat_test
```

(If `$DATABASE_URL_TEST` is not exported in your shell, read it from `.env.local`.)

- [ ] **Step 8: Run the seed test**

Run: `npm test -- src/db/seed.test.ts`
Expected: PASS (migration applied, 25 leaders + 16 metas seeded, return shape `{ leaders, metas }`).

- [ ] **Step 9: Commit**

```bash
git add src/db/schema.ts src/db/seed-data.ts src/db/seed.ts src/db/seed.test.ts tests/setup/db.ts drizzle/
git commit -m "feat(db): tournament-level leader, metas table, fresh migration"
```

---

## Task 2: Validation schemas & DTOs

Moves `myLeaderId` from the round schema to the tournament schema, renames the reference schema, and updates the TypeScript DTOs. (Vitest doesn't typecheck, so only `validation.test.ts` gates here; consumers are fixed in later tasks and verified at build time.)

**Files:**
- Modify: `src/lib/validation/round.ts`
- Modify: `src/lib/validation/tournament.ts`
- Modify: `src/lib/validation/reference.ts`
- Modify: `src/lib/dto.ts`
- Modify: `src/lib/validation/validation.test.ts`

**Interfaces:**
- Produces: `createTournamentSchema` requires `myLeaderId: uuid` + optional `metaId: uuid`; `updateTournamentSchema` has optional `myLeaderId`, `metaId` (nullable); `createRoundSchema`/`updateRoundSchema` have NO `myLeaderId`; `customMetaSchema`/`CustomMetaInput`; DTOs: `MetaDTO`, `RoundDTO` (no `myLeaderId`), `TournamentSummaryDTO`/`TournamentDetailDTO` with `myLeaderId: string` + `metaId: string | null`, `PerMetaStatDTO`, `OverallStatsDTO.bestMeta`, `StatsDTO.perMeta`.

- [ ] **Step 1: Update the round schema (remove `myLeaderId`)**

In `src/lib/validation/round.ts`, delete the `myLeaderId` line from both schemas:

```ts
export const createRoundSchema = z.object({
  opponentLeaderId: z.string().uuid(),
  result: resultEnum,
  playOrder: playOrderEnum.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const updateRoundSchema = z.object({
  opponentLeaderId: z.string().uuid().optional(),
  result: resultEnum.optional(),
  playOrder: playOrderEnum.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
```

- [ ] **Step 2: Update the tournament schema (add `myLeaderId`, rename `setId`→`metaId`)**

In `src/lib/validation/tournament.ts`:

```ts
export const createTournamentSchema = z.object({
  type: tournamentTypeEnum,
  myLeaderId: z.string().uuid(),
  metaId: z.string().uuid().optional(),
  name: z.string().trim().max(120).optional(),
  playedOn: dateString,
});

export const updateTournamentSchema = z.object({
  type: tournamentTypeEnum.optional(),
  myLeaderId: z.string().uuid().optional(),
  metaId: z.string().uuid().nullable().optional(),
  name: z.string().trim().max(120).nullable().optional(),
  playedOn: dateString.optional(),
});
```

- [ ] **Step 3: Rename the reference schema (set→meta)**

In `src/lib/validation/reference.ts`, rename `customSetSchema`→`customMetaSchema` and `CustomSetInput`→`CustomMetaInput` (leave the leader schema untouched):

```ts
export const customMetaSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export type CustomMetaInput = z.infer<typeof customMetaSchema>;
```

- [ ] **Step 4: Update the DTOs**

In `src/lib/dto.ts`: rename `SetDTO`→`MetaDTO`; drop `myLeaderId` from `RoundDTO`; add `myLeaderId`/`metaId` to the tournament summary; rename the per-set stat DTO and the `bestSet`/`perSet` fields:

```ts
export type MetaDTO = { id: string; name: string; code: string | null; isCustom: boolean; ownerId: string | null };
export type RoundDTO = {
  id: string; tournamentId: string; roundNumber: number;
  opponentLeaderId: string;
  result: 'win' | 'loss' | 'draw'; playOrder: 'first' | 'second' | null; notes: string | null;
};
```

```ts
export type TournamentSummaryDTO = {
  id: string; type: TournamentType; myLeaderId: string; metaId: string | null; name: string | null;
  playedOn: string; status: 'draft' | 'locked'; record: RecordDTO;
};
```

```ts
export type OverallStatsDTO = {
  totalTournaments: number;
  wins: number; losses: number; draws: number;
  winRate: number; drawRate: number;
  bestMeta: { metaId: string | null; name: string; winRate: number; games: number } | null;
  mostPlayedLeader: { leaderId: string; name: string; tournaments: number } | null;
};
export type PerMetaStatDTO = {
  metaId: string | null; name: string;
  tournaments: number; wins: number; losses: number; draws: number; winRate: number;
};
export type PlayedLeaderDTO = { id: string; name: string };
export type StatsDTO = { overall: OverallStatsDTO; perMeta: PerMetaStatDTO[]; playedLeaders: PlayedLeaderDTO[] };
```

(`TournamentDetailDTO` needs no edit — it is `Omit<TournamentSummaryDTO, 'record'> & { rounds: RoundDTO[] }` and inherits the new fields.)

- [ ] **Step 5: Update `validation.test.ts`**

Open `src/lib/validation/validation.test.ts`. For every round-input fixture, remove the `myLeaderId` property. For every tournament-create fixture, add `myLeaderId: '<a valid uuid>'` (reuse an existing uuid literal already in the file, or `'00000000-0000-0000-0000-000000000001'`). If a test asserts that `createTournamentSchema` rejects/accepts specific fields, add a case asserting it **rejects** input missing `myLeaderId` and one asserting `metaId` is optional. Rename any `customSetSchema` usage to `customMetaSchema`.

- [ ] **Step 6: Run the validation tests**

Run: `npm test -- src/lib/validation/validation.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/validation/ src/lib/dto.ts
git commit -m "feat(validation): leader on tournament, meta rename, DTO updates"
```

---

## Task 3: Reference service, route & client (sets → metas)

**Files:**
- Modify: `src/services/reference.ts`
- Modify: `src/services/reference.test.ts`
- Rename: `src/app/api/sets/route.ts` → `src/app/api/metas/route.ts`
- Modify: `src/app/api/reference.route.test.ts`
- Modify: `src/lib/api-client.ts`
- Modify: `src/components/query-hooks.ts`

**Interfaces:**
- Consumes: `metas` table, `customMetaSchema`/`CustomMetaInput`, `MetaDTO` (Task 1, 2).
- Produces: `listMetas(db, ownerId)`, `addCustomMeta(db, ownerId, input)`, type `Meta`; route `GET/POST /api/metas`; `apiClient.listMetas`/`apiClient.addMeta`; hooks `useMetas()`/`useAddCustomMeta()`.

- [ ] **Step 1: Rename the reference service functions**

In `src/services/reference.ts`: change the import `sets`→`metas`, `CustomSetInput`→`CustomMetaInput`, the `Set` type→`Meta`, and rename `listSets`→`listMetas`, `addCustomSet`→`addCustomMeta`. The `visibleTo` helper's type union `typeof leaders | typeof sets` becomes `typeof leaders | typeof metas`. Body is otherwise identical with `sets` replaced by `metas`:

```ts
import { leaders, metas } from '../db/schema';
import type { CustomLeaderInput, CustomMetaInput } from '../lib/validation/reference';

export type Meta = typeof metas.$inferSelect;

const visibleTo = (table: typeof leaders | typeof metas, ownerId: string) =>
  or(isNull(table.ownerId), eq(table.ownerId, ownerId));

export async function listMetas(db: DB, ownerId: string): Promise<Meta[]> {
  return db.select().from(metas).where(visibleTo(metas, ownerId)).orderBy(asc(metas.name));
}

export async function addCustomMeta(db: DB, ownerId: string, input: CustomMetaInput): Promise<Meta> {
  const existing = await db.select().from(metas)
    .where(and(visibleTo(metas, ownerId), sql`lower(${metas.name}) = lower(${input.name})`))
    .limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db.insert(metas)
    .values({ name: input.name, isCustom: true, ownerId })
    .returning();
  return row;
}
```

- [ ] **Step 2: Move the route file `sets` → `metas`**

```bash
git mv src/app/api/sets/route.ts src/app/api/metas/route.ts && rmdir src/app/api/sets 2>/dev/null || true
```

Then edit `src/app/api/metas/route.ts` to use the renamed service/schema:

```ts
import { db } from '@/db/client';
import { requireUserId, errorToResponse, json } from '@/lib/api/handler';
import { listMetas, addCustomMeta } from '@/services/reference';
import { customMetaSchema } from '@/lib/validation/reference';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const userId = await requireUserId();
    return json(await listMetas(db, userId));
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const input = customMetaSchema.parse(await req.json());
    return json(await addCustomMeta(db, userId, input), { status: 201 });
  } catch (err) {
    return errorToResponse(err);
  }
}
```

- [ ] **Step 3: Update the API client**

In `src/lib/api-client.ts`: change the DTO import `SetDTO`→`MetaDTO` and `CustomSetInput`→`CustomMetaInput`, and rename the two methods + endpoint:

```ts
  listMetas: () => request<MetaDTO[]>('/api/metas'),
  addMeta: (b: CustomMetaInput) => request<MetaDTO>('/api/metas', { method: 'POST', body: JSON.stringify(b) }),
```

- [ ] **Step 4: Update the query hooks**

In `src/components/query-hooks.ts`: change the key `sets: ['sets']` → `metas: ['metas']`, rename `useSets`→`useMetas` (querying `apiClient.listMetas`), and `useAddCustomSet`→`useAddCustomMeta` (calling `apiClient.addMeta`, invalidating `keys.metas`):

```ts
export const useMetas = () => useQuery({ queryKey: keys.metas, queryFn: apiClient.listMetas });
```

```ts
export function useAddCustomMeta() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: apiClient.addMeta, onSuccess: () => qc.invalidateQueries({ queryKey: keys.metas }) });
}
```

- [ ] **Step 5: Update the reference tests**

In `src/services/reference.test.ts`: rename `listSets`/`addCustomSet` calls to `listMetas`/`addCustomMeta`, and update any expected seeded count/name to a meta (e.g. expect `listMetas` to include `OP16`). In `src/app/api/reference.route.test.ts`: change any `/api/sets` request path to `/api/metas` and the imported route to `../metas/route` (adjust the relative import to the moved file), and rename `customSet`-style fixtures.

- [ ] **Step 6: Run the reference tests**

Run: `npm test -- src/services/reference.test.ts src/app/api/reference.route.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/reference.ts src/services/reference.test.ts src/app/api/metas/ src/app/api/reference.route.test.ts src/lib/api-client.ts src/components/query-hooks.ts
git commit -m "feat(reference): metas service, /api/metas route, useMetas hooks"
```

---

## Task 4: Tournament & round services

**Files:**
- Modify: `src/services/tournaments.ts`
- Modify: `src/services/rounds.ts`
- Modify: `src/services/tournaments.test.ts`
- Modify: `src/services/rounds.test.ts`
- Modify: `src/app/api/tournaments/route.test.ts`
- Modify: `src/app/api/rounds/route.test.ts`

**Interfaces:**
- Consumes: `createTournamentSchema`/`updateTournamentSchema` (with `myLeaderId`, `metaId`), `createRoundSchema` (no `myLeaderId`).
- Produces: `createTournament` persists `myLeaderId` + `metaId`; `updateTournament` patches `myLeaderId`/`metaId`; `addRound`/`updateRound` no longer read `myLeaderId`.

- [ ] **Step 1: Persist leader + meta in `createTournament`/`updateTournament`**

In `src/services/tournaments.ts`, update `createTournament` insert values:

```ts
  const [row] = await db.insert(tournaments)
    .values({
      ownerId, type: input.type,
      myLeaderId: input.myLeaderId,
      metaId: input.metaId ?? null,
      name: input.name ?? null, playedOn: input.playedOn, status: 'draft',
    })
    .returning();
```

And in `updateTournament`, replace the `setId` patch line and add `myLeaderId`:

```ts
  if (input.type !== undefined) patch.type = input.type;
  if (input.myLeaderId !== undefined) patch.myLeaderId = input.myLeaderId;
  if (input.metaId !== undefined) patch.metaId = input.metaId;
  if (input.name !== undefined) patch.name = input.name;
  if (input.playedOn !== undefined) patch.playedOn = input.playedOn;
```

- [ ] **Step 2: Remove `myLeaderId` from the round service**

In `src/services/rounds.ts`, delete the `myLeaderId` line from the `addRound` insert and from the `updateRound` patch:

```ts
  const [row] = await db.insert(rounds).values({
    tournamentId,
    roundNumber: Number(max) + 1,
    opponentLeaderId: input.opponentLeaderId,
    result: input.result,
    playOrder: input.playOrder ?? null,
    notes: input.notes ?? null,
  }).returning();
```

```ts
  const patch: Partial<typeof rounds.$inferInsert> = { updatedAt: new Date() };
  if (input.opponentLeaderId !== undefined) patch.opponentLeaderId = input.opponentLeaderId;
  if (input.result !== undefined) patch.result = input.result;
  if (input.playOrder !== undefined) patch.playOrder = input.playOrder;
  if (input.notes !== undefined) patch.notes = input.notes;
```

- [ ] **Step 3: Update the tournament/round service tests**

In `src/services/tournaments.test.ts` and `src/services/rounds.test.ts`:
- Every `createTournament(db, USER, { type: 'local', playedOn: '…' })` must now include a leader. Change the helper to fetch leaders first and pass one, e.g.:

```ts
async function setup() {
  const ls = await listLeaders(db, USER);
  const t = await createTournament(db, USER, { type: 'local', myLeaderId: ls[0].id, playedOn: '2026-07-20' });
  return { t, mine: ls[0].id, opp: ls[1].id };
}
```

- Every `addRound(db, USER, t.id, { myLeaderId: mine, opponentLeaderId: opp, … })` drops `myLeaderId`: `addRound(db, USER, t.id, { opponentLeaderId: opp, result: 'win' })`. (`mine` may become unused in a helper — delete it if so, or keep it for the `createTournament` call.)
- In `tournaments.test.ts`, replace any assertion about `setId` with `metaId`, and add a test that `createTournament` persists `myLeaderId` and that `updateTournament` can change it while draft.

- [ ] **Step 4: Update the route tests**

In `src/app/api/tournaments/route.test.ts` and `src/app/api/rounds/route.test.ts`: apply the same fixture changes — POST bodies for tournament-create include `myLeaderId` (and optional `metaId`); POST bodies for round-create/update omit `myLeaderId`. Add an assertion in the tournaments route test that a create POST **without** `myLeaderId` returns 400.

- [ ] **Step 5: Run the service + route tests**

Run: `npm test -- src/services/tournaments.test.ts src/services/rounds.test.ts src/app/api/tournaments/route.test.ts src/app/api/rounds/route.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/tournaments.ts src/services/rounds.ts src/services/tournaments.test.ts src/services/rounds.test.ts src/app/api/tournaments/route.test.ts src/app/api/rounds/route.test.ts
git commit -m "feat(tournaments): leader+meta on tournament, drop per-round leader"
```

---

## Task 5: Stats service & route

Repoints every `rounds.myLeaderId` query to `tournaments.myLeaderId`, and renames the set aggregation to meta.

**Files:**
- Modify: `src/services/stats.ts`
- Modify: `src/app/api/stats/route.ts`
- Modify: `src/services/stats.test.ts`
- Modify: `src/services/stats.matchups.test.ts`
- Modify: `src/app/api/stats/stats.route.test.ts`

**Interfaces:**
- Produces: `getPerMetaStats`, `PerMetaStat`, `OverallStats.bestMeta`, `aggregateByMeta`; `getPlayedLeaders`/`mostPlayedLeader`/`getMatchupStats` all keyed on `tournaments.myLeaderId`. Stats route returns `{ overall, perMeta, playedLeaders }`.

- [ ] **Step 1: Rename the per-set aggregation to per-meta**

In `src/services/stats.ts`, change the import `sets`→`metas`, rename the types `PerSetStat`→`PerMetaStat` (field `setId`→`metaId`) and `OverallStats.bestSet`→`bestMeta` (field `setId`→`metaId`). Rewrite `aggregateBySet`→`aggregateByMeta`:

```ts
async function aggregateByMeta(db: DB, ownerId: string) {
  const rows = await db
    .select({
      metaId: tournaments.metaId,
      metaName: metas.name,
      tournaments: sql<number>`count(distinct ${tournaments.id})`,
      wins: sql<number>`count(*) filter (where ${rounds.result} = 'win')`,
      losses: sql<number>`count(*) filter (where ${rounds.result} = 'loss')`,
      draws: sql<number>`count(*) filter (where ${rounds.result} = 'draw')`,
    })
    .from(rounds)
    .innerJoin(tournaments, eq(rounds.tournamentId, tournaments.id))
    .leftJoin(metas, eq(tournaments.metaId, metas.id))
    .where(eq(tournaments.ownerId, ownerId))
    .groupBy(tournaments.metaId, metas.name);
  return rows.map((r) => {
    const wins = num(r.wins), losses = num(r.losses), draws = num(r.draws);
    return {
      metaId: r.metaId ?? null,
      name: r.metaName ?? 'No meta',
      tournaments: num(r.tournaments),
      wins, losses, draws,
      games: wins + losses + draws,
      winRate: rate(wins, wins + losses + draws),
    };
  });
}
```

- [ ] **Step 2: Update `getPerMetaStats` and `getOverallStats`**

Rename `getPerSetStats`→`getPerMetaStats`, mapping `setId`→`metaId`. In `getOverallStats`, call `aggregateByMeta`, and build `bestMeta` instead of `bestSet`:

```ts
export async function getPerMetaStats(db: DB, ownerId: string): Promise<PerMetaStat[]> {
  const rows = await aggregateByMeta(db, ownerId);
  return rows
    .map(({ metaId, name, tournaments, wins, losses, draws, winRate }) => ({ metaId, name, tournaments, wins, losses, draws, winRate }))
    .sort((a, b) => b.winRate - a.winRate || a.name.localeCompare(b.name));
}
```

```ts
  const best = withGames[0];
  const bestMeta = best ? { metaId: best.metaId, name: best.name, winRate: best.winRate, games: best.games } : null;
```

Return `bestMeta` (not `bestSet`) from `getOverallStats`.

- [ ] **Step 3: Repoint `getPlayedLeaders` and `mostPlayedLeader` to the tournament leader**

Replace `getPlayedLeaders` so it derives the leader from the tournament (only leaders that actually have rounds logged):

```ts
export async function getPlayedLeaders(db: DB, ownerId: string): Promise<{ id: string; name: string }[]> {
  return db
    .selectDistinct({ id: leaders.id, name: leaders.name })
    .from(tournaments)
    .innerJoin(rounds, eq(rounds.tournamentId, tournaments.id))
    .innerJoin(leaders, eq(tournaments.myLeaderId, leaders.id))
    .where(eq(tournaments.ownerId, ownerId))
    .orderBy(leaders.name);
}
```

Replace the `mostPlayedLeader` query to count tournaments by `tournaments.myLeaderId` directly (one row per tournament, no rounds join needed):

```ts
  const [mp] = await db
    .select({
      leaderId: tournaments.myLeaderId,
      name: leaders.name,
      tournaments: sql<number>`count(*)`,
    })
    .from(tournaments)
    .innerJoin(leaders, eq(tournaments.myLeaderId, leaders.id))
    .where(eq(tournaments.ownerId, ownerId))
    .groupBy(tournaments.myLeaderId, leaders.name)
    .orderBy(desc(sql`count(*)`), leaders.name)
    .limit(1);
```

- [ ] **Step 4: Repoint the matchup queries to the tournament leader**

In `getMatchupStats`, change the three filters from `eq(rounds.myLeaderId, leaderId)` to `eq(tournaments.myLeaderId, leaderId)` (the `tournaments` join is already present in the opponents and turn-order queries). For the raw color-breakdown SQL, change `r.my_leader_id = ${leaderId}` to `t.my_leader_id = ${leaderId}`:

```sql
    WHERE t.owner_id = ${ownerId} AND t.my_leader_id = ${leaderId}
```

- [ ] **Step 5: Update the stats route**

In `src/app/api/stats/route.ts`, import `getPerMetaStats` and return `perMeta`:

```ts
import { getOverallStats, getPerMetaStats, getPlayedLeaders } from '@/services/stats';
```

```ts
    const [overall, perMeta, playedLeaders] = await Promise.all([
      getOverallStats(db, userId),
      getPerMetaStats(db, userId),
      getPlayedLeaders(db, userId),
    ]);
    return json({ overall, perMeta, playedLeaders });
```

- [ ] **Step 6: Update the stats tests**

In `src/services/stats.test.ts`, `src/services/stats.matchups.test.ts`, and `src/app/api/stats/stats.route.test.ts`:
- Update all `createTournament` fixtures to include `myLeaderId` and use `metaId` instead of `setId`. To test per-meta / matchups by different leaders, create **separate tournaments** with different `myLeaderId` (you can no longer vary the leader per round within one tournament).
- Drop `myLeaderId` from all `addRound` fixtures.
- Rename assertions: `perSet`→`perMeta`, `setId`→`metaId`, `bestSet`→`bestMeta`, and the "No set" label→"No meta".
- Where a test previously logged rounds with two different `myLeaderId` values in one tournament to exercise matchups, split them into two tournaments each with its own leader.

- [ ] **Step 7: Run the stats tests**

Run: `npm test -- src/services/stats.test.ts src/services/stats.matchups.test.ts src/app/api/stats/stats.route.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/services/stats.ts src/app/api/stats/route.ts src/services/stats.test.ts src/services/stats.matchups.test.ts src/app/api/stats/stats.route.test.ts
git commit -m "feat(stats): leader/meta from tournament, per-meta aggregation"
```

---

## Task 6: Achievements service & route

**Files:**
- Modify: `src/services/achievements.ts`
- Modify: `src/services/achievements.test.ts`
- Modify: `src/app/api/achievements/route.test.ts`

**Interfaces:**
- Consumes: `tournaments.myLeaderId`, `tournaments.metaId`.
- Produces: `computeCtx` reads `metaId` (not `setId`) and `myLeaderId` from the tournament join; `Ctx` fields `hasMetaDominator`/`distinctMetas`.

- [ ] **Step 1: Rename the `Ctx` set fields to meta**

In `src/services/achievements.ts` `Ctx` type: `hasSetDominator`→`hasMetaDominator`, `distinctSets`→`distinctMetas`:

```ts
export type Ctx = {
  totalTournaments: number; totalRounds: number;
  wins: number; losses: number; draws: number; winRate: number;
  hasPerfectRun: boolean; maxLeaderTournaments: number; hasMetaDominator: boolean;
  secondWins: number; colorsBeaten: number; maxWinStreak: number; distinctMetas: number;
};
```

- [ ] **Step 2: Update the achievement copy (keep keys stable)**

In the `ACHIEVEMENTS` array, update the two set-themed entries' user-facing text and `evaluate` field, keeping `key` unchanged:

```ts
  { key: 'set_dominator', name: 'Meta Dominator', description: 'Reach a 75% win rate in one meta (10+ games).', evaluate: (c) => bool(c.hasMetaDominator) },
```

```ts
  { key: 'well_traveled', name: 'Well Traveled', description: 'Play in 5 different metas.', evaluate: (c) => count(c.distinctMetas, 5) },
```

- [ ] **Step 3: Rename the row types and `computeCtx` internals**

Change `RoundRow`/`TourneyRow` `setId`→`metaId`, and rename the accumulators `perSet`→`perMeta`, `distinctSets`→`distinctMetas`, `hasSetDominator`→`hasMetaDominator`, reading `r.metaId`:

```ts
type RoundRow = { tournamentId: string; metaId: string | null; myLeaderId: string; result: Result; playOrder: 'first' | 'second' | null; opponentColors: string[] };
type TourneyRow = { id: string; metaId: string | null; playedOn: string; createdAt: Date };
```

Inside `computeCtx`, rename `const perSet`→`const perMeta`, `const distinctSets`→`const distinctMetas`, and the block:

```ts
    if (r.metaId) {
      distinctMetas.add(r.metaId);
      const pm = perMeta.get(r.metaId) ?? { wins: 0, games: 0 };
      pm.games++;
      if (r.result === 'win') pm.wins++;
      perMeta.set(r.metaId, pm);
    }
```

```ts
  const hasMetaDominator = [...perMeta.values()].some((s) => s.games >= 10 && s.wins / s.games >= 0.75);
```

Return `hasMetaDominator` and `distinctMetas: distinctMetas.size` in the returned object.

- [ ] **Step 4: Repoint the achievements queries to the tournament leader/meta**

In `getAchievements`, the round query takes `myLeaderId` and `metaId` from `tournaments` (not `rounds`):

```ts
  const roundRows = await db
    .select({
      tournamentId: rounds.tournamentId,
      metaId: tournaments.metaId,
      myLeaderId: tournaments.myLeaderId,
      result: rounds.result,
      playOrder: rounds.playOrder,
      opponentColors: leaders.colors,
    })
    .from(rounds)
    .innerJoin(tournaments, eq(rounds.tournamentId, tournaments.id))
    .innerJoin(leaders, eq(rounds.opponentLeaderId, leaders.id))
    .where(eq(tournaments.ownerId, ownerId));

  const tourneyRows = await db
    .select({ id: tournaments.id, metaId: tournaments.metaId, playedOn: tournaments.playedOn, createdAt: tournaments.createdAt })
    .from(tournaments)
    .where(eq(tournaments.ownerId, ownerId));
```

- [ ] **Step 5: Update the achievements tests**

In `src/services/achievements.test.ts` and `src/app/api/achievements/route.test.ts`: add `myLeaderId` to `createTournament` fixtures and use `metaId` instead of `setId`; drop `myLeaderId` from `addRound` fixtures. For the "Deck Master" (10 tournaments, one leader) and "Meta Dominator" tests, set the leader/meta on the **tournament**. For "Well Traveled" (5 metas), create 5 tournaments with distinct `metaId`. Rename any `hasSetDominator`/`distinctSets` references.

- [ ] **Step 6: Run the achievements tests**

Run: `npm test -- src/services/achievements.test.ts src/app/api/achievements/route.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/achievements.ts src/services/achievements.test.ts src/app/api/achievements/route.test.ts
git commit -m "feat(achievements): leader/meta from tournament, meta-themed copy"
```

---

## Task 7: Frontend — tournament creation, round form, detail

**Files:**
- Modify: `src/components/tournaments/new-tournament-form.tsx`
- Modify: `src/components/tournaments/round-form-sheet.tsx`
- Modify: `src/components/tournaments/round-item.tsx`
- Modify: `src/components/tournaments/tournament-detail.tsx`
- Modify: `src/components/share/tournament-share-card.tsx`

**Interfaces:**
- Consumes: `useMetas`/`useAddCustomMeta` (Task 3), `useLeaders`/`useAddCustomLeader`, `createTournamentSchema` (leader required), `RoundDTO` (no `myLeaderId`), tournament DTO with `myLeaderId`/`metaId`.

- [ ] **Step 1: Add a required Leader field + Meta field to the new-tournament form**

In `src/components/tournaments/new-tournament-form.tsx`: swap `useSets`/`useAddCustomSet` for `useMetas`/`useAddCustomMeta`, add leader state + a required Leader combobox, add `myLeaderId` to the create payload, and disable submit until a leader is chosen. Replace the component body's reference section:

```tsx
import { useLeaders, useAddCustomLeader, useMetas, useAddCustomMeta, useCreateTournament } from '@/components/query-hooks';
```

```tsx
  const { data: leaders } = useLeaders();
  const addLeader = useAddCustomLeader();
  const { data: metas } = useMetas();
  const addMeta = useAddCustomMeta();
  const create = useCreateTournament();
  const online = useOnlineStatus();

  const [type, setType] = useState<TournamentType>('local');
  const [myLeaderId, setMyLeaderId] = useState<string | null>(null);
  const [metaId, setMetaId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [playedOn, setPlayedOn] = useState(() => new Date().toISOString().slice(0, 10));
```

```tsx
  async function submit() {
    if (!online) { toast.error("You're offline — reconnect to save"); return; }
    if (!myLeaderId) { toast.error('Choose your leader first'); return; }
    try {
      const t = await create.mutateAsync({
        type, myLeaderId, metaId: metaId ?? undefined, name: name.trim() || undefined, playedOn,
      });
      router.push(`/tournaments/${t.id}`);
    } catch {
      toast.error('Could not create tournament');
    }
  }
```

Replace the "Set" field block with a Leader block (required) followed by a Meta block (optional):

```tsx
      <div className="space-y-2">
        <label className="text-sm font-medium">Leader</label>
        <ReferenceCombobox
          options={leaders ?? []} value={myLeaderId} onChange={setMyLeaderId}
          onAddCustom={async (n) => { const l = await addLeader.mutateAsync({ name: n, colors: [] }); return { id: l.id, name: l.name }; }}
          placeholder="Choose your leader" />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Meta (optional)</label>
        <ReferenceCombobox
          options={metas ?? []} value={metaId} onChange={setMetaId}
          onAddCustom={async (n) => { const m = await addMeta.mutateAsync({ name: n }); return { id: m.id, name: m.name }; }}
          placeholder="e.g. OP16" />
      </div>
```

Update the submit button `disabled` to also require a leader:

```tsx
      <Button onClick={submit} disabled={create.isPending || !myLeaderId} className="h-14 w-full text-base">
        {create.isPending ? 'Creating…' : 'Create & Start Logging'}
      </Button>
```

- [ ] **Step 2: Remove the "My leader" field from the round form**

In `src/components/tournaments/round-form-sheet.tsx`: delete the `myLeaderId` state, the "My leader" combobox block, and remove `myLeaderId` from the submit payload + `valid` check. The first field becomes "Opponent deck":

```tsx
  const [oppLeaderId, setOppLeaderId] = useState<string | null>(initial?.opponentLeaderId ?? null);
  const [result, setResult] = useState<Result | null>(initial?.result ?? null);
  const [playOrder, setPlayOrder] = useState<PlayOrder | null>(initial?.playOrder ?? null);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);

  const valid = oppLeaderId && result;
```

```tsx
      await onSubmit({ opponentLeaderId: oppLeaderId, result, playOrder, notes: notes.trim() || null });
```

Delete the entire `<div>` containing the "My leader" label + its `ReferenceCombobox` (keep the "Opponent deck" block as the first field).

- [ ] **Step 3: Update `round-item.tsx` to show only the opponent**

In `src/components/tournaments/round-item.tsx`, the match line no longer shows the player's leader (it's the same for the whole tournament):

```tsx
        <p className="truncate text-sm">
          vs <span className="text-foreground">{leaderName(round.opponentLeaderId)}</span>
        </p>
```

- [ ] **Step 4: Show the leader on the tournament detail + allow changing while draft**

In `src/components/tournaments/tournament-detail.tsx`:
- Remove `myLeaderId` from the Undo re-add payload:

```tsx
        onClick: () => addRound.mutate({
          opponentLeaderId: r.opponentLeaderId,
          result: r.result, playOrder: r.playOrder, notes: r.notes,
        }),
```

- Import and use `useUpdateTournament`, and add the leader under the title. When editable, render a `ReferenceCombobox` bound to the tournament's leader; otherwise show the name. Add near the other hooks:

```tsx
import { useTournament, useLeaders, useUpdateTournament, useAddRound, useUpdateRound, useDeleteRound, useFinishTournament, useReopenTournament, useDeleteTournament } from '@/components/query-hooks';
import { ReferenceCombobox } from './reference-combobox';
```

```tsx
  const updateTournament = useUpdateTournament(id);
```

Under the `<h1>`/date block, add a leader row (uses `t.myLeaderId`):

```tsx
          <div className="mt-2 max-w-[16rem]">
            {editable ? (
              <ReferenceCombobox
                options={leaders ?? []}
                value={t.myLeaderId}
                onChange={(lid) => { if (lid && lid !== t.myLeaderId) updateTournament.mutate({ myLeaderId: lid }); }}
                onAddCustom={async () => ({ id: t.myLeaderId, name: leaderName(t.myLeaderId) })}
                placeholder="Leader" />
            ) : (
              <p className="text-sm">Leader: <span className="font-medium">{leaderName(t.myLeaderId)}</span></p>
            )}
          </div>
```

- [ ] **Step 5: Add the leader to the tournament share card**

In `src/components/share/tournament-share-card.tsx`, show the tournament leader in the header (it now lives on the tournament). Under the title/record row, add:

```tsx
      <p className="text-sm text-muted-foreground">Leader: <span className="text-foreground">{leaderName(tournament.myLeaderId)}</span></p>
```

- [ ] **Step 6: Lint the changed components**

Run: `npm run lint`
Expected: no errors in the edited files. (A full typecheck runs in Task 8's build gate, after the stats components are updated.)

- [ ] **Step 7: Commit**

```bash
git add src/components/tournaments/new-tournament-form.tsx src/components/tournaments/round-form-sheet.tsx src/components/tournaments/round-item.tsx src/components/tournaments/tournament-detail.tsx src/components/share/tournament-share-card.tsx
git commit -m "feat(ui): tournament-level leader + meta in create/detail/round"
```

---

## Task 8: Frontend — stats components (set → meta)

**Files:**
- Rename: `src/components/stats/per-set-stats.tsx` → `src/components/stats/per-meta-stats.tsx`
- Modify: `src/components/stats/overall-stats.tsx`
- Modify: `src/components/stats/stats-view.tsx`
- Modify: `src/components/share/stats-share-card.tsx`

**Interfaces:**
- Consumes: `StatsDTO.perMeta`, `PerMetaStatDTO`, `OverallStatsDTO.bestMeta`.

- [ ] **Step 1: Rename the per-set component to per-meta**

```bash
git mv src/components/stats/per-set-stats.tsx src/components/stats/per-meta-stats.tsx
```

Rewrite `src/components/stats/per-meta-stats.tsx` to the meta DTO/labels:

```tsx
import { pct } from './stat-card';
import { formatRecord } from '@/lib/record';
import type { PerMetaStatDTO } from '@/lib/dto';

export function PerMetaStats({ rows }: { rows: PerMetaStatDTO[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">By meta</h2>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.metaId ?? 'none'} className="rounded-lg border p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{r.name}</span>
              <span className="text-muted-foreground tabular-nums">
                {formatRecord({ wins: r.wins, losses: r.losses, draws: r.draws })} · {pct(r.winRate)} · {r.tournaments} {r.tournaments === 1 ? 'tournament' : 'tournaments'}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: pct(r.winRate) }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Update `overall-stats.tsx` (Best set → Best meta)**

```tsx
        <StatCard label="Best meta" value={o.bestMeta ? o.bestMeta.name : '—'} sub={o.bestMeta ? `${pct(o.bestMeta.winRate)} over ${o.bestMeta.games} games` : undefined} />
```

- [ ] **Step 3: Update `stats-view.tsx` import + usage**

```tsx
import { PerMetaStats } from './per-meta-stats';
```

```tsx
          <PerMetaStats rows={data.perMeta} />
```

- [ ] **Step 4: Update the stats share card (Best set → Best meta)**

In `src/components/share/stats-share-card.tsx`:

```tsx
        {overall.bestMeta && (
          <p>Best meta: <span className="text-foreground">{overall.bestMeta.name}</span> ({pct(overall.bestMeta.winRate)})</p>
        )}
```

(The `My Crew Stat` heading in this file is handled in Task 9.)

- [ ] **Step 5: Full typecheck via build**

Run: `npm run build`
Expected: build succeeds — the whole repo is now type-consistent (`set`/`myLeaderId` no longer referenced anywhere).

- [ ] **Step 6: Commit**

```bash
git add src/components/stats/ src/components/share/stats-share-card.tsx
git commit -m "feat(ui): per-meta stats and best-meta labels"
```

---

## Task 9: Branding — Grand Line TCG

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/manifest.ts`
- Modify: `src/components/tournaments/tournament-list.tsx`
- Modify: `src/components/share/watermark.tsx`
- Modify: `src/components/share/stats-share-card.tsx`

- [ ] **Step 1: Update root metadata**

In `src/app/layout.tsx`:

```tsx
export const metadata: Metadata = {
  title: 'Grand Line TCG',
  description: 'Track your OPTCG Games',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Grand Line TCG', statusBarStyle: 'default' },
  icons: { icon: '/favicon.ico', apple: '/apple-icon.png' },
};
```

(Leave the `crewstat-accent` localStorage key in the inline script untouched — it's a storage key, not user-facing copy.)

- [ ] **Step 2: Update the PWA manifest**

In `src/app/manifest.ts`:

```ts
    name: 'Grand Line TCG',
    short_name: 'Grand Line',
    description: 'Track your OPTCG Games',
```

- [ ] **Step 3: Update the app header**

In `src/components/tournaments/tournament-list.tsx`:

```tsx
        <h1 className="text-2xl font-bold">Grand Line TCG</h1>
```

- [ ] **Step 4: Update the share watermark**

In `src/components/share/watermark.tsx`:

```tsx
      Made with Grand Line TCG · tcgtracker-three.vercel.app
```

- [ ] **Step 5: Update the stats share card heading**

In `src/components/share/stats-share-card.tsx`:

```tsx
      <p className="text-lg font-bold">My Grand Line TCG</p>
```

- [ ] **Step 6: Build to confirm branding compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/layout.tsx src/app/manifest.ts src/components/tournaments/tournament-list.tsx src/components/share/watermark.tsx src/components/share/stats-share-card.tsx
git commit -m "feat(brand): rename product to Grand Line TCG"
```

---

## Task 10: Full verification

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: all suites PASS.

- [ ] **Step 2: Lint + typecheck build**

Run: `npm run lint && npm run build`
Expected: no lint errors, build succeeds.

- [ ] **Step 3: Manually drive the core flow**

Start the app (`npm run dev`), then verify end-to-end using the `verify` / `run` skill or a browser:
1. The header, browser tab title, and PWA install name read **Grand Line TCG** / tagline **Track your OPTCG Games**.
2. Create a tournament: the **Leader** field is required (Create disabled until chosen); **Meta** is optional and lists `OP01…OP16` with custom-add.
3. Add a round: it asks only for the **opponent**, result, play order, notes — no "My leader".
4. The detail header shows the tournament leader and lets you change it while Draft.
5. Stats page shows **By meta** and **Best meta**; matchups list works for the leader you played.
6. Share cards show the leader and **Made with Grand Line TCG**.

- [ ] **Step 4: Final confirmation commit (if any docs/touch-ups)**

If everything passes and no code changed in this task, nothing to commit. Otherwise:

```bash
git add -A && git commit -m "chore: verify Grand Line TCG rework"
```

---

## Self-Review

- **Spec coverage:** (1) leader on tournament → Tasks 1,2,4,5,6,7; (2) meta replaces set → Tasks 1,2,3,5,6,8; (3) product rename → Task 9. Required-leader / optional-meta → Task 2 schemas + Task 7 form gating. Clean start (no migration) → Task 1 Steps 6–7. Meta display code-first → Task 1 Step 2. Stats impact → Task 5. Achievements impact → Task 6. All spec sections map to a task. ✓
- **Placeholder scan:** every code step shows concrete code; test-update steps name exact fixtures to change; no "TBD"/"handle edge cases". ✓
- **Type consistency:** `metaId`/`myLeaderId`/`bestMeta`/`perMeta`/`PerMetaStat`/`listMetas`/`useMetas`/`hasMetaDominator`/`distinctMetas` used consistently across schema (T1), DTO/validation (T2), services (T3–6), and components (T7–8). Stable achievement keys `set_dominator`/`well_traveled` intentionally retained (noted in Global Constraints and Task 6). ✓
