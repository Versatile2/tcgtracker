# Grand Line TCG — Slice 3b (offline logging), CSV export, and polish (Design)

**Date:** 2026-08-07
**Status:** Approved design, ready for implementation
**Scope:** Three deferred items from the V1 backlog, in one pass: (1) offline **logging** with a durable sync queue, (2) CSV data export, (3) lint/polish cleanup. Mobile-first throughout.

## 1. Context

Slices 1–6 are live. Slice 3 made the app installable and **viewable** offline, but every write is guarded: `new-tournament-form.tsx` and `tournament-detail.tsx` check `useOnlineStatus()` and refuse with "You're offline — reconnect to save". That directly contradicts Product Principle 1 (*"Log-first. Capturing a round mid-event must be fast and possible offline"*) in exactly the situation the product is for: a phone in a venue with no signal.

This slice removes that guard by making writes durable locally and replaying them on reconnect.

---

## 2. Slice 3b — offline logging via a write outbox

### 2.1 Decision: one path, always through the outbox

Every tournament/round write is enqueued into a persistent **outbox** and applied optimistically to the TanStack Query cache. A flusher drains the queue against the REST API whenever the app is online.

The alternative — branching on `navigator.onLine` and only queueing when offline — was rejected. A single path means the offline code is exercised on every online write, so it cannot silently rot; it also removes the await-the-server latency from the logging flow, which is the hot path on mobile.

Rejected alternative: TanStack Query's paused-mutation persistence (`resumePausedMutations`). It is the idiomatic choice but gives weak ordering guarantees across dependent mutations (create tournament → add its rounds) and no inspectable queue to build a "3 unsynced" indicator from. A purpose-built FIFO outbox is ~200 lines, testable in plain node, and models the dependency correctly.

### 2.2 Client-generated ids

The blocker for offline creation is that a round references a `tournamentId` the server has never seen. Solution: **the client generates the UUID** (`crypto.randomUUID()`) for tournaments and rounds and sends it in the create payload.

- `createTournamentSchema` / `createRoundSchema` gain an optional `id: z.uuid()`.
- The server uses the supplied id when present, and falls back to `defaultRandom()` when absent (so existing callers and tests are unaffected).
- Creating with an id that already exists is **idempotent**: the server returns the row already stored, unmodified, instead of inserting. This makes replay safe under at-least-once delivery — a queued op whose response was lost to a dying connection will not duplicate on retry. An id owned by a *different* user is a 409 rather than a primary-key crash.
- For rounds the idempotency check runs *before* the "tournament is editable" guard, so replaying an already-applied round create still succeeds if the tournament has since been locked.
- `DELETE` of an already-deleted row returns success rather than 404 during replay (the client treats 404-on-delete as success rather than changing server semantics — see §2.5).

Because the client controls the id, navigation after "Create & Start Logging" is instant: we push to `/tournaments/<id>` without awaiting anything.

### 2.3 What is *not* offline-capable

**Custom leaders and custom metas still require a connection.** They are the one write whose id a round takes a foreign key on *and* which carries a server-side uniqueness rule on name — a queued custom leader that collides on name at replay time would leave rounds pointing at an id the server rejected. Rather than build conflict reconciliation for an edge case, the combobox's "add custom" path stays online-guarded with an honest message: *"Custom leaders need a connection — log the round and set the leader later."* The seeded OP01–OP16 leader list covers the overwhelming majority of venue logging.

This is a deliberate, documented limitation, not an oversight.

### 2.4 Modules

```
src/lib/outbox/
  types.ts     OutboxOp union + OutboxEntry ({ opId, op, createdAt, attempts })
  coalesce.ts  pure enqueue rules that collapse redundant ops
  storage.ts   load/save/subscribe over localStorage key 'crewstat-outbox'
  flush.ts     FIFO drain against an injected executor; classifies failures
  use-outbox.ts  React hook: pending count, status, enqueue, auto-flush
```

`OutboxOp` is a discriminated union over `kind`:

| kind | carries |
|---|---|
| `tournament.create` | full `CreateTournamentInput` including client `id` |
| `tournament.update` | `tournamentId`, patch |
| `tournament.delete` / `.finish` / `.reopen` | `tournamentId` |
| `round.create` | `tournamentId`, full `CreateRoundInput` including client `id` |
| `round.update` | `roundId`, patch |
| `round.delete` | `roundId` |

`storage.ts` keeps the queue under the existing `crewstat-*` prefix (per the naming constraint) and exposes a subscribe function so the UI can render pending counts via `useSyncExternalStore`.

### 2.5 Coalescing (pure, in `coalesce.ts`)

Applied at enqueue time so the queue stays small and replay stays consistent:

- `tournament.delete` for a tournament whose `tournament.create` is still queued → drop the create, drop every queued op referencing that tournament, and drop the delete. Nothing ever reached the server, so nothing needs to.
- `round.delete` for a round whose `round.create` is still queued → drop both.
- `round.update` / `tournament.update` for an entity whose create is still queued → merge the patch into the queued create payload rather than appending an op.
- Consecutive `tournament.update`s for the same tournament merge.
- `finish` then `reopen` (or the reverse) for the same tournament collapse to the later one.

Everything else appends. Order is otherwise strictly preserved.

### 2.6 Flush semantics

`flushOutbox(entries, executor)` drains **serially, oldest first**, stopping at the first retryable failure so ordering is never violated. Failure classification:

- **Retryable** — network error, or HTTP 5xx. Increment `attempts`, keep the entry, stop the drain, retry on the next trigger.
- **Permanent** — HTTP 400/403/409. The op can never succeed; drop it and collect it into a `failed[]` list the UI surfaces once ("1 change couldn't be saved").
- **404** — on a delete, treated as **success** (already gone). On anything else, permanent.

Triggers: app mount, the `online` event, and after any enqueue while online. There is no timer-based polling — a background interval would burn battery in a venue for no benefit.

**Ordering vs. refetching.** On reconnect the flusher runs to completion *before* queries are invalidated, so a refetch can never overwrite optimistic state that has not been sent yet.

### 2.7 Optimistic cache updates

At enqueue time the corresponding hook writes the change straight into the query cache (`setQueryData` on `['tournament', id]` and `['tournaments']`). Because the query cache is already persisted to localStorage, optimistic state survives a reload and an app restart — which matters, since a phone in a venue will background the PWA between rounds.

Optimistic `roundNumber` is computed client-side as `max(existing) + 1`. The server recomputes it authoritatively (and renumbers on delete), so the value reconciles on the post-flush refetch. This is the one field that can visibly correct itself; acceptable, and only in the rare offline-delete-then-reconnect case.

### 2.8 Mobile UI

- **Sync pill** replaces `offline-badge.tsx`. States: `Offline` (muted, nothing pending) · `Offline · N unsynced` (amber) · `Syncing…` (spinner) · `Synced` (green, auto-dismisses after 2s) · `N unsynced — tap to retry` (amber, when parked after repeated failures). Positioned top-center respecting `env(safe-area-inset-top)`, tap target ≥44px when interactive.
- **Per-round pending dot** on `RoundItem` — a small muted cloud/clock glyph for rounds still in the outbox, so a player can see at a glance what has not landed.
- **Pending badge on `TournamentCard`** for tournaments with queued ops.
- **Write guards removed** from `new-tournament-form.tsx` and `tournament-detail.tsx`, including the delete → Undo path (which now enqueues like any other write — this resolves the "offline-guard the delete-Undo" nit by making the guard unnecessary).

### 2.9 Testing

- `coalesce.test.ts` — every rule in §2.5, plus order preservation.
- `flush.test.ts` — serial ordering; stop-on-retryable; drop-on-permanent; 404-on-delete as success; attempts increment.
- `storage.test.ts` — round-trip, corrupt-JSON tolerance (drop and start clean rather than crash the app), subscribe/notify.
- Service/route tests for client-supplied ids and idempotent re-create.
- Existing suite must stay green.

Browser-level offline behaviour remains a documented manual check (as in Slice 3): DevTools offline → create a tournament, log 3 rounds, reload, go online, confirm all four land exactly once.

---

## 3. CSV export

### 3.1 Not a PRO tier

The original Slice 6 spec parked CSV as "a separate PRO-tier feature". There is no billing infrastructure, and PRODUCT.md records that no pricing exists and that future work **must not fabricate** pricing or tiers. Building a paywall would mean inventing a commercial structure that does not exist. **CSV export ships free.** If a paid tier is ever introduced, gating an existing free feature is a product decision to make then, with real pricing.

### 3.2 Shape

One flat table, **one row per round**, denormalized with its tournament context — the shape a player can drop into a spreadsheet and pivot. Columns:

```
tournament_id, tournament_name, tournament_type, tournament_date, tournament_status,
my_leader, tournament_meta, round_number, round_kind, opponent_leader, opponent_meta,
result, play_order, won_die_roll, games, notes
```

`games` serializes a top-cut best-of-3 as e.g. `W(first);L(second);W(first)`. Leaders and metas are exported by **name**, not id — the file is for humans, and ids are meaningless outside the database. `tournament_id` is retained as a grouping key.

### 3.3 Components

- `src/lib/csv.ts` — pure `toCsv(headers, rows)`. Handles quoting, embedded quotes/commas/newlines, and prefixes a `'` to any cell starting with `= + - @` to defuse spreadsheet formula injection. Unit tested.
- `src/services/export.ts` — `exportRounds(db, ownerId)` returning ordered, joined rows. Tested against the test database.
- `src/app/api/export/csv/route.ts` — `GET`, returns `text/csv; charset=utf-8` with `Content-Disposition: attachment; filename="grand-line-tcg-YYYY-MM-DD.csv"`. Prefixed with a UTF-8 BOM so Excel reads accented leader names correctly.
- Settings gains a **Data** card with an "Export CSV" action — a plain `<a href download>`, which is the most reliable download trigger across iOS Safari and Android Chrome. Disabled with an explanatory line when offline (export needs the server).

A player with zero tournaments gets a header-only file rather than an error.

---

## 4. Polish

- **eslint noise.** 277 of 279 current problems come from `.claude/` and `.agents/` tooling directories, not app source. Add `.claude/**`, `.agents/**`, `.codex/**` to the eslint ignore list so `npm run lint` reports only real findings.
- **`use-online-status.ts`** — the `set-state-in-effect` error is genuine: the hook is subscribing to an external store by hand. Rewrite with `useSyncExternalStore`, which is what that API is for and which fixes SSR/hydration correctness at the same time.
- **`mode-toggle.tsx`** — same error, from a `mounted` flag. Extract a shared `useIsMounted()` built on `useSyncExternalStore`.
- **`leader-visual.ts`** — drop the unused `_name` parameter.

Target: `npm run lint` clean, zero errors and zero warnings.

---

## 5. Out of scope

Offline custom leader/meta creation (§2.3); background-sync APIs; multi-device conflict resolution (last-write-wins via the server remains the model); JSON export; any billing or tier gating.
