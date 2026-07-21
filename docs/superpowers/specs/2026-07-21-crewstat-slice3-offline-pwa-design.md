# Crew Stat — Slice 3: Offline-viewable PWA (Design)

**Date:** 2026-07-21
**Status:** Approved design, ready for implementation planning
**Scope:** Make Crew Stat an installable PWA that renders already-loaded data offline, with an online/offline indicator and clear messaging when a write is attempted offline. Additive only — no schema, service, or API changes.

## 1. Context & Decision

Slices 1–2 are shipped and live. The app is server-authoritative (every action hits the Postgres-backed REST API). For Slice 3 the user chose the **lighter offline scope**: view offline + installable + indicator. **Full offline logging with a sync queue (UC18/23 in full) is explicitly out of scope** — a possible future "Slice 3b."

What this slice delivers:
- **Installable** (Add to Home Screen) via a web manifest + icons.
- **Offline app shell** via a runtime-caching service worker.
- **Offline data** via a persisted TanStack Query cache (already-loaded tournaments/detail/stats render offline).
- **Online/offline indicator** in the header.
- **Offline write-guarding:** create/log/finish/delete show a clear "You're offline — reconnect to save" toast instead of a confusing failure.

## 2. Honest limitation

The app must be opened **online at least once** so the service worker can cache the shell, Clerk can establish a session, and the query cache can populate. A true cold start with no network and no prior session cannot authenticate — expected PWA behavior for an auth'd, server-backed app. This is documented, not worked around.

## 3. Architecture (additive)

```
Layout
 ├─ <ServiceWorkerRegister/>   registers /sw.js (client)
 ├─ Providers → PersistQueryClientProvider (localStorage persister, long gcTime)
 └─ <OfflineBadge/>            uses useOnlineStatus()

public/sw.js                   runtime caching: cache-first static, network-first navigations w/ cache fallback
src/app/manifest.ts            MetadataRoute.Manifest (name, icons, standalone, theme)
public/icon-192.png, icon-512.png, icon-maskable-512.png, apple-icon.png
```

No changes to `src/services/**`, `src/app/api/**`, or the database.

## 4. Components

- **`src/app/manifest.ts`** — `MetadataRoute.Manifest`: `name: 'Crew Stat'`, `short_name: 'Crew Stat'`, `start_url: '/'`, `display: 'standalone'`, `background_color`/`theme_color`, and the icons (192, 512, maskable). Layout `metadata`/`viewport` gains `themeColor` and an apple-touch-icon link.

- **`public/sw.js`** — a hand-rolled service worker (bundler-agnostic; no build plugin):
  - `install`: `skipWaiting()`.
  - `activate`: clean old caches, `clients.claim()`.
  - `fetch`: only handle same-origin GET. Navigations (mode `navigate`) → network-first, fall back to cached shell/route; static assets (`/_next/static`, images, icons) → cache-first with background update; everything else (including `/api/*`) → pass-through/network-first without caching API responses (data offline comes from the persisted query cache, not the SW). Cache is versioned; bump the version to invalidate.

- **`src/components/service-worker-register.tsx`** — `'use client'`; registers `/sw.js` on mount (guarded by `'serviceWorker' in navigator`), production-safe. Mounted once in the root layout.

- **`src/app/providers.tsx`** (modified) — wrap the query client with `PersistQueryClientProvider` from `@tanstack/react-query-persist-client`, using `createSyncStoragePersister({ storage: window.localStorage })`. Set the `QueryClient` `defaultOptions.queries.gcTime` high (e.g. 24h) and the persister `maxAge` to match so persisted data survives reloads/offline. SSR-guard: only use the persister when `typeof window !== 'undefined'`; otherwise fall back to plain `QueryClientProvider` (so server render is unaffected).

- **`src/lib/use-online-status.ts`** — `useOnlineStatus(): boolean`. Initializes from `navigator.onLine`, subscribes to `online`/`offline` events, cleans up on unmount. SSR-safe (defaults to `true` when `navigator` is undefined).

- **`src/components/offline-badge.tsx`** — `'use client'`; renders a small "Offline" pill (muted/amber) fixed near the top when `!useOnlineStatus()`, nothing when online. Mounted in the layout so it appears on every screen.

- **Offline write-guarding** — the primary write entry points check `useOnlineStatus()` and, when offline, `toast` "You're offline — reconnect to save" and return early instead of firing the mutation:
  - `new-tournament-form.tsx` (create),
  - `tournament-detail.tsx` (add/edit round via the sheet submit, finish, reopen, delete tournament, delete round).
  This is a friendly guard, not a correctness mechanism (the server is still the source of truth); it prevents confusing network-error states.

## 5. Testing

PWA/service-worker/offline rendering is browser-level behavior that unit tests do not meaningfully cover. Therefore:
- **Unit test (jsdom):** `useOnlineStatus` — reflects `navigator.onLine`, flips on `offline`/`online` events. (Adds `@testing-library/react` + `jsdom` dev deps; a per-file `// @vitest-environment jsdom` directive keeps the rest of the suite on the node environment.)
- **Build gate:** `npm run build` succeeds; manifest and routes compile; existing 55 tests still pass.
- **Manual/browser verification (documented, not automated):** installability (manifest + icons detected), offline reload shows cached shell + data, offline badge appears, and a write attempt while offline shows the toast. Noted as the acceptance check for the SW/PWA pieces.

## 6. Out of Scope (future)

Offline **logging** with a durable sync queue and conflict/ID reconciliation (heavier "Slice 3b"); custom/selectable app icons and themes (Slice 5); background sync APIs. The runtime-caching SW and persisted cache here are compatible with adding a write outbox later without rework.
