# BountyLog — Slice 1: Core Tournament Tracking (Design)

**Date:** 2026-07-20
**Status:** Approved design, ready for implementation planning
**Scope:** First vertical slice of BountyLog, an OPTCG (One Piece TCG) competitive tournament tracker. Web-first, mobile-friendly.

---

## 1. Context & Slice Roadmap

BountyLog's full vision spans 27 use cases across 8 categories (tracking, statistics, achievements, customization, cloud sync, export, offline, accessibility). That is far too large for a single design or build. We deliver it as vertical, independently useful slices, each with its own spec → plan → build cycle:

| Slice | Use Cases | Delivers |
|-------|-----------|----------|
| **1. Core Tournament Tracking (this doc)** | UC 1–3, 5 | Create tournaments, log rounds, finish/lock, edit/delete, history list |
| 2. Statistics & Analysis | UC 6–9 | Overall record, per-set performance, matchup analysis (reads slice-1 data) |
| 3. Accounts polish + Offline sync | UC 18, 23 | Offline queue, sync indicators (auth/cloud already exist from slice 1) |
| 4. Achievements | UC 10–12 | Auto-unlock badges, profile showcase |
| 5. Customization | UC 13–16 | Themes, patterns, leader art |
| 6. Export & Social Sharing | UC 20–21 | Shareable result/stat images |
| 7. PRO tier | UC 22 + billing | CSV export, subscription |

Decklist photos (UC4) are deferred out of slice 1 (they pull in blob storage + camera UX); scheduled as a fast-follow.

## 2. Product Decisions (confirmed)

- **Cloud + accounts from day one.** Email auth and a hosted Postgres database are part of slice 1 (not deferred).
- **Hybrid reference data.** Leaders/decks/sets come from a curated seeded list with an "add custom" escape hatch when something is missing.
- **Round detail = minimal + turn order.** Each round captures: my leader, opponent deck, result (W/L/D), a play-order (1st/2nd) toggle, and optional notes. Turn order is captured now so slice 2's turn-order win-rate analysis needs no re-logging.
- **REST API layer built now (Option B), web-only consumer for the moment.** A future native iPhone app will reuse the same endpoints; we are not building the native app now.
- **Seed data = small starter set** (~20–30 popular leaders + major sets). A complete authoritative import is a later pass; custom-add covers gaps in the meantime.

## 3. Architecture

Layered, with the REST API as the shared contract:

```
Web UI (Next.js client components, shadcn/ui)
      │  fetch (TanStack Query)
      ▼
REST API  —  Route Handlers under /app/api/*   ← contract the future native app reuses
      │
      ▼
Service layer  —  plain TS functions (business rules)
      │
      ▼
Data layer  —  Drizzle ORM queries against Neon Postgres
```

**Stack**
- Next.js 16 App Router + TypeScript + Tailwind (already scaffolded and deployed to Vercel as `tcgtracker`)
- **Clerk** — email authentication (native Vercel Marketplace integration)
- **Neon Postgres** (Vercel Marketplace) + **Drizzle ORM**
- **shadcn/ui** — accessible, mobile-first components (also sets up slice 5 theming)
- **TanStack Query** — client-side fetching/caching + optimistic updates (powers edit/delete/undo)
- **Zod** — validation at the API boundary, schemas reused for client-side form validation

**Principles**
- Every request is authenticated by Clerk and scoped to the signed-in user; the API only ever reads/writes rows the user owns.
- Business rules (locking, renumbering, record computation, custom-add dedupe) live in the service layer, not in route handlers or the UI, so they are unit-testable in isolation and reusable by the future native API.
- Records are always computed from rounds, never stored, so they can't go stale.

## 4. Data Model (Postgres via Drizzle)

**`leaders`** — serves both "my leader" and "opponent deck" (in OPTCG an opponent's deck is identified by their leader).
- `id`, `name`, `colors` (text[] — seeds slice-2 color breakdown), `is_custom` (bool), `owner_id` (text, nullable — `null` = global seed, set = a user's custom addition), timestamps.

**`sets`**
- `id`, `name`, `code`, `released_at` (date), `is_custom` (bool), `owner_id` (nullable, same pattern), timestamps.

**`tournaments`**
- `id`, `owner_id` (Clerk user id, indexed), `type` (enum), `set_id` (fk → sets), `name` (nullable), `played_on` (date), `status` (enum: `draft` | `locked`), `created_at`, `updated_at`.

**`rounds`**
- `id`, `tournament_id` (fk → tournaments, cascade delete), `round_number` (int), `my_leader_id` (fk → leaders), `opponent_leader_id` (fk → leaders), `result` (enum: `win` | `loss` | `draw`), `play_order` (enum: `first` | `second`, nullable), `notes` (text, nullable), `created_at`, `updated_at`.

**Enums**
- `tournament_type`: `local`, `treasure_cup`, `regionals`, `extra_grand_battle`, `pirates_party`, `testing`
- `tournament_status`: `draft`, `locked`
- `round_result`: `win`, `loss`, `draw`
- `play_order`: `first`, `second`

The schema deliberately feeds slice 2 for free: matchup = `my_leader_id` vs `opponent_leader_id`; per-set performance = filter by `set_id`; turn-order win rate = `play_order`; color breakdown = `leaders.colors`.

*Note:* slice 1 stores `owner_id` as the Clerk user id string (no local `users` table). A synced `users`/`profiles` table can be introduced when a later slice needs user-level data (achievements, settings).

## 5. REST API Surface

All endpoints require a valid Clerk session and are scoped to the signed-in user. All request bodies are Zod-validated.

**Reference data**
- `GET  /api/leaders` — global seed + this user's custom leaders
- `POST /api/leaders` — add custom leader `{ name, colors }`
- `GET  /api/sets` — global seed + this user's custom sets
- `POST /api/sets` — add custom set `{ name }`

**Tournaments**
- `GET    /api/tournaments` — list (summary: type, set, date, computed record, status)
- `POST   /api/tournaments` — create draft `{ type, setId, name?, playedOn }`
- `GET    /api/tournaments/:id` — detail incl. rounds
- `PATCH  /api/tournaments/:id` — edit `{ type?, setId?, name?, playedOn? }`
- `DELETE /api/tournaments/:id` — delete (cascades rounds)
- `POST   /api/tournaments/:id/finish` — lock (`status → locked`)
- `POST   /api/tournaments/:id/reopen` — unlock (`status → draft`) to fix a mistake

**Rounds**
- `POST   /api/tournaments/:id/rounds` — add `{ myLeaderId, opponentLeaderId, result, playOrder?, notes? }`
- `PATCH  /api/rounds/:id` — edit any round field
- `DELETE /api/rounds/:id` — delete + renumber remaining rounds

## 6. Screens (mobile-first, responsive to desktop)

1. **Sign in / sign up** — Clerk-hosted, email.
2. **Tournament list (home)** — one card per tournament (type badge, set, date, record `4-2`, lock icon); filter chips by type (UC2); thumb-reachable "Add Tournament"; friendly empty state.
3. **New tournament** — pick type → pick set (dropdown + add custom) → optional name → date (defaults today) → creates a draft and opens the detail screen.
4. **Tournament detail** — header (type · set · date · running record · draft/locked); round list; sticky "Add Round"; 3-dot menu (edit / delete / reopen); "Finish Tournament" with confirm dialog.
5. **Add/Edit round** — bottom sheet: leader select (searchable + add custom), opponent select, W/L/D segmented control, 1st/2nd play-order toggle, notes; large tap targets, one-handed.
6. **Round item** — opponent name, colored result chip, play/draw marker, notes preview; long-press/swipe → edit/delete with an Undo toast (optimistic update + delayed commit).

All forms and lists have explicit loading (skeleton), empty, and error states.

## 7. Error Handling & Edge Cases

- **Validation:** Zod at the API boundary; same schemas drive inline client-side form validation. Invalid input → `400` with field-level messages.
- **Auth:** missing/invalid session → `401`; requesting a row you don't own → `404` (not `403`, to avoid leaking existence).
- **Locked tournaments:** round writes to a locked tournament → `409 Conflict` with a "reopen to edit" message.
- **Custom-add dedupe:** adding a custom leader/set whose name matches an existing one reuses the existing record instead of creating a duplicate (keeps stats clean).
- **Optimistic UI failure:** TanStack Query rolls back the optimistic change and shows a retry toast.

## 8. Testing

- **Unit (Vitest):** service-layer rules — record computation, round renumbering on delete, lock/reopen guards, custom-add dedupe.
- **Integration:** route handlers against a test Postgres (Neon branch), covering auth scoping and the 400/401/404/409 paths.
- **E2E (Playwright, 1–2 happy paths):** sign in → create tournament → log rounds → finish → record shows in list, at a mobile viewport.

## 9. Out of Scope for Slice 1

Each of these is a later slice and is intentionally excluded here: statistics & matchup analysis, decklist photos, offline queue/sync indicators, achievements, themes/icons/leader-art, image export & sharing, CSV export, PRO/billing, public profiles. The slice-1 schema is shaped so slice 2 (statistics) can be built purely as a read layer over this data.
