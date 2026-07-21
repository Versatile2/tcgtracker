# Crew Stat Slice 3: Offline-viewable PWA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Crew Stat an installable PWA that renders already-loaded data offline, with an online/offline indicator and a clear "you're offline" message when a write is attempted — without any schema/API/service changes.

**Architecture:** A web manifest + icons (installability), a hand-rolled runtime-caching service worker (offline app shell), a persisted TanStack Query cache in localStorage (offline data), a `useOnlineStatus` hook driving an offline badge, and offline write-guards on the existing write flows.

**Tech Stack:** Next.js 16 App Router · TypeScript · TanStack Query (+ persist-client, sync-storage-persister) · shadcn/ui · Vitest (+ jsdom for one hook test).

## Global Constraints

- **Additive only** — no changes to `src/services/**`, `src/app/api/**`, or the database.
- **SSR-safe** — anything touching `window`/`navigator`/`localStorage` is guarded so server render and the existing 55 tests are unaffected.
- The service worker is a static `public/sw.js` (no build plugin); registered only client-side, guarded by `'serviceWorker' in navigator`.
- Offline write-guarding is a friendly UX guard (toast + early return), NOT a correctness mechanism — the server stays the source of truth.
- Icons already exist on disk at `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`, `public/apple-icon.png` (generated during setup) — Task 1 commits them.
- Build must pass; existing 55 tests stay green. One commit per task.

---

## File Structure

```
public/
  sw.js                                   # runtime-caching service worker (Task 2)
  icon-192.png icon-512.png icon-maskable-512.png apple-icon.png   # (exist; committed in Task 1)
src/
  app/
    manifest.ts                           # PWA manifest (Task 1)
    layout.tsx                            # + viewport themeColor, apple icon, mounts SW register + badge (Tasks 1,2,4)
    providers.tsx                         # + PersistQueryClientProvider (Task 3)
  components/
    service-worker-register.tsx           # registers /sw.js (Task 2)
    offline-badge.tsx                     # offline indicator (Task 4)
    tournaments/new-tournament-form.tsx   # + offline write-guard (Task 4)
    tournaments/tournament-detail.tsx     # + offline write-guards (Task 4)
  lib/
    use-online-status.ts                  # hook (Task 4)
    use-online-status.test.ts             # jsdom test (Task 4)
```

---

### Task 1: PWA manifest, icons, and layout metadata

**Files:**
- Create: `src/app/manifest.ts`
- Modify: `src/app/layout.tsx` (add `viewport` with themeColor + apple-touch icon metadata)
- Commit (already on disk): `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`, `public/apple-icon.png`
- Test: none (build gate)

**Interfaces:**
- Produces: `/manifest.webmanifest` served by Next; installability metadata.

- [ ] **Step 1: Write `src/app/manifest.ts`**

```ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Crew Stat',
    short_name: 'Crew Stat',
    description: 'OPTCG tournament tracker',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#4f46e5',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
```

- [ ] **Step 2: Update `src/app/layout.tsx`** — add a `viewport` export and apple-touch icon; keep everything else (ClerkProvider, Providers, Toaster, Geist fonts) intact.

Add imports/exports (merge with existing `Metadata` import):

```tsx
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Crew Stat',
  description: 'OPTCG tournament tracker',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Crew Stat', statusBarStyle: 'default' },
  icons: { icon: '/favicon.ico', apple: '/apple-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#4f46e5',
};
```

(If a `metadata` const already exists, extend it with the `manifest`, `appleWebApp`, and `icons` fields rather than duplicating.)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds; `/manifest.webmanifest` appears as a generated route in the output.

- [ ] **Step 4: Commit** (include the icon assets)

```bash
git add src/app/manifest.ts src/app/layout.tsx public/icon-192.png public/icon-512.png public/icon-maskable-512.png public/apple-icon.png
git commit -m "feat(pwa): web manifest, icons, and installability metadata"
```

---

### Task 2: Service worker + registration

**Files:**
- Create: `public/sw.js`, `src/components/service-worker-register.tsx`
- Modify: `src/app/layout.tsx` (mount `<ServiceWorkerRegister/>`)
- Test: none (build gate; SW behavior verified manually in a browser)

**Interfaces:**
- Produces: `<ServiceWorkerRegister/>` (renders null; registers `/sw.js`).

- [ ] **Step 1: Write `public/sw.js`**

```js
const CACHE = 'crewstat-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // never cache API/auth

  if (request.mode === 'navigate') {
    // network-first; fall back to cached page, then to cached root shell
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('/')))
    );
    return;
  }

  // static assets: cache-first with background refresh
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
```

- [ ] **Step 2: Write `src/components/service-worker-register.tsx`**

```tsx
'use client';
import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const register = () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); };
    if (document.readyState === 'complete') register();
    else {
      window.addEventListener('load', register);
      return () => window.removeEventListener('load', register);
    }
  }, []);
  return null;
}
```

- [ ] **Step 3: Mount it in `src/app/layout.tsx`** — inside `<body>`, alongside the existing `<Providers>`/`<Toaster>` (add the import and the element):

```tsx
import { ServiceWorkerRegister } from '@/components/service-worker-register';
// ...inside <body>, after <Toaster /> (or anywhere in body):
<ServiceWorkerRegister />
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds; `public/sw.js` is served statically at `/sw.js`.

- [ ] **Step 5: Commit**

```bash
git add public/sw.js src/components/service-worker-register.tsx src/app/layout.tsx
git commit -m "feat(pwa): runtime-caching service worker and registration"
```

---

### Task 3: Persisted query cache (offline data)

**Files:**
- Modify: `src/app/providers.tsx`
- Modify: `package.json` (deps)
- Test: none (build gate; existing suite must stay green)

**Interfaces:**
- Produces: query cache persisted to `localStorage` so already-loaded data renders offline.

- [ ] **Step 1: Install the persistence packages**

```bash
npm install @tanstack/react-query-persist-client @tanstack/query-sync-storage-persister
```

- [ ] **Step 2: Rewrite `src/app/providers.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

const WEEK = 1000 * 60 * 60 * 24 * 7;

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, gcTime: WEEK, retry: 1 } },
  }));
  const [persister] = useState(() =>
    typeof window !== 'undefined'
      ? createSyncStoragePersister({ storage: window.localStorage, key: 'crewstat-query-cache' })
      : null
  );

  if (!persister) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return (
    <PersistQueryClientProvider client={client} persistOptions={{ persister, maxAge: WEEK }}>
      {children}
    </PersistQueryClientProvider>
  );
}
```

- [ ] **Step 3: Build + test**

Run: `npm run build` → succeeds.
Run: `npm test` → existing 55 tests still pass (no code under test changed).

- [ ] **Step 4: Commit**

```bash
git add src/app/providers.tsx package.json package-lock.json
git commit -m "feat(pwa): persist query cache to localStorage for offline data"
```

---

### Task 4: Online-status hook, offline badge, and write-guards

**Files:**
- Create: `src/lib/use-online-status.ts`, `src/lib/use-online-status.test.ts`, `src/components/offline-badge.tsx`
- Modify: `src/app/layout.tsx` (mount `<OfflineBadge/>`), `src/components/tournaments/new-tournament-form.tsx`, `src/components/tournaments/tournament-detail.tsx`
- Modify: `package.json` (dev deps for the hook test)
- Test: `src/lib/use-online-status.test.ts` (jsdom)

**Interfaces:**
- Produces: `useOnlineStatus(): boolean`; `<OfflineBadge/>`.

- [ ] **Step 1: Install test deps for the hook**

```bash
npm install -D @testing-library/react jsdom
```

- [ ] **Step 2: Write the failing test `src/lib/use-online-status.test.ts`**

```ts
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useOnlineStatus } from './use-online-status';

afterEach(() => cleanup());

describe('useOnlineStatus', () => {
  it('starts online and reacts to offline/online events', () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(result.current).toBe(false);
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(result.current).toBe(true);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npm test -- src/lib/use-online-status.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Write `src/lib/use-online-status.ts`**

```ts
'use client';
import { useEffect, useState } from 'react';

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);
  return online;
}
```

- [ ] **Step 5: Run the test to green**

Run: `npm test -- src/lib/use-online-status.test.ts`
Expected: PASS. Then run full `npm test` — the jsdom directive is per-file, so the rest of the suite stays on the node environment; all pass.

- [ ] **Step 6: Write `src/components/offline-badge.tsx`**

```tsx
'use client';
import { useOnlineStatus } from '@/lib/use-online-status';

export function OfflineBadge() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      role="status"
      className="fixed left-1/2 top-2 z-50 -translate-x-1/2 rounded-full bg-amber-500 px-3 py-1 text-xs font-medium text-black shadow"
    >
      Offline — changes can’t be saved
    </div>
  );
}
```

- [ ] **Step 7: Mount `<OfflineBadge/>` in `src/app/layout.tsx`** (inside `<body>`, e.g. next to `<Toaster/>`):

```tsx
import { OfflineBadge } from '@/components/offline-badge';
// ...inside <body>:
<OfflineBadge />
```

- [ ] **Step 8: Add offline write-guards** — in each write handler, bail early with a toast when offline.

In `src/components/tournaments/new-tournament-form.tsx`: import the hook, read it, and guard `submit`:

```tsx
import { useOnlineStatus } from '@/lib/use-online-status';
// inside the component:
const online = useOnlineStatus();
// at the very top of the submit handler body:
if (!online) { toast.error("You're offline — reconnect to save"); return; }
```

In `src/components/tournaments/tournament-detail.tsx`: import and read the hook, then guard the entry points that mutate — the add/edit-round submit (`onSubmit` passed to `RoundFormSheet`), `handleDeleteRound`, and the `finish`/`reopen`/`removeTournament` button click handlers — each begins with:

```tsx
if (!online) { toast.error("You're offline — reconnect to save"); return; }
```

Use the existing `toast` import (sonner) already present in these files. Do not change any other behavior. Keep the guards minimal and consistent.

- [ ] **Step 9: Build + full test**

Run: `npm run build` → succeeds.
Run: `npm test` → all pass (55 + the new hook test), pristine.

- [ ] **Step 10: Commit**

```bash
git add src/lib/use-online-status.ts src/lib/use-online-status.test.ts src/components/offline-badge.tsx src/app/layout.tsx src/components/tournaments/new-tournament-form.tsx src/components/tournaments/tournament-detail.tsx package.json package-lock.json
git commit -m "feat(pwa): online-status hook, offline badge, and offline write-guards"
```

---

## Self-Review

**Spec coverage:**

| Spec item | Task |
|-----------|------|
| Installable (manifest + icons) | 1 |
| Offline app shell (service worker) | 2 |
| Offline data (persisted query cache) | 3 |
| Online/offline indicator | 4 |
| Offline write-guarding | 4 |
| Hook unit test; build gate; manual verification note | 4 (test), all (build) |
| SSR-safety (window/navigator/localStorage guards) | 2, 3, 4 |
| No schema/API/service changes | (all — none touch those) |

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `useOnlineStatus(): boolean` is consumed by `OfflineBadge` and the two write-flow components identically; the manifest uses `MetadataRoute.Manifest`; `Viewport`/`Metadata` typed from `next`. The providers change preserves the existing `QueryClient` defaults and only wraps with persistence.

**Manual verification (documented acceptance for SW/PWA, per spec §5):** after deploy — install prompt/Add-to-Home-Screen works; toggling the browser offline still renders the last-loaded pages + data; the offline badge appears; attempting to create/log while offline shows the toast. These are browser-level behaviors not covered by unit tests.
