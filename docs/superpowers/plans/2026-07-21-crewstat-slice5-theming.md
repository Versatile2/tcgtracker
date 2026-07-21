# Crew Stat Slice 5: Appearance & Themes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Settings → Appearance area with Light/Dark/System theme mode (next-themes) and 6 deck-inspired accent color presets, applied app-wide via CSS variables and persisted. No schema/API/service changes.

**Architecture:** `next-themes` `ThemeProvider` (class strategy, mounted in `Providers`) toggles shadcn's existing `.dark` tokens; an `AccentProvider` sets a `data-accent` attribute on `<html>` that CSS `[data-accent="…"]` rules use to override `--primary`/`--primary-foreground`/`--ring`; a `/settings` page exposes both, reached from a header gear link.

**Tech Stack:** Next.js 16 · TypeScript · next-themes · Tailwind v4 + shadcn tokens · Vitest.

## Global Constraints

- **Additive only** — no changes to `src/services/**`, `src/app/api/**`, or the database.
- **SSR-safe** — `window`/`localStorage`/`document` only touched in effects or in a try/catch inline script; `<html>` gets `suppressHydrationWarning` (next-themes mutates the class pre-hydration).
- Accent CSS overrides are appended at the END of `globals.css` so they win over `.dark` (equal specificity → source order decides), making the accent mode-agnostic.
- Default accent is `indigo` (matches the PWA `theme_color`).
- Build must pass; existing 73 tests stay green. One commit per task.

---

## File Structure

```
src/
  app/providers.tsx                 # + ThemeProvider (Task 1) + AccentProvider (Task 2)
  app/layout.tsx                    # + suppressHydrationWarning (Task 1) + FOUC script (Task 2)
  app/globals.css                   # + [data-accent] overrides (Task 2)
  lib/accents.ts                    # ACCENTS, DEFAULT_ACCENT, isValidAccent (Task 2)
  lib/accents.test.ts
  components/theme/accent-provider.tsx   # AccentProvider + useAccent (Task 2)
  components/theme/mode-toggle.tsx       # Light/Dark/System (Task 3)
  components/theme/accent-picker.tsx     # swatches (Task 3)
  components/settings/settings-view.tsx  # Appearance card (Task 3)
  app/settings/page.tsx                  # /settings (Task 3)
  components/tournaments/tournament-list.tsx  # + Settings gear link (Task 3)
```

---

### Task 1: Theme mode via next-themes

**Files:**
- Modify: `src/app/providers.tsx`, `src/app/layout.tsx`, `package.json`
- Test: none (build gate; existing suite stays green)

**Interfaces:**
- Produces: app-wide Light/Dark/System mode; `.dark` class toggled by next-themes; fixes `sonner`'s `useTheme` (provider now present).

- [ ] **Step 1: Install next-themes**

```bash
npm install next-themes
```

- [ ] **Step 2: Wrap `Providers` with `ThemeProvider`** — edit `src/app/providers.tsx` (keep the existing QueryClient + persister logic; only add the theme wrapper):

```tsx
'use client';
import { useState } from 'react';
import { ThemeProvider } from 'next-themes';
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

  const query = persister
    ? <PersistQueryClientProvider client={client} persistOptions={{ persister, maxAge: WEEK }}>{children}</PersistQueryClientProvider>
    : <QueryClientProvider client={client}>{children}</QueryClientProvider>;

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {query}
    </ThemeProvider>
  );
}
```

- [ ] **Step 3: Add `suppressHydrationWarning` to `<html>` in `src/app/layout.tsx`** — find the `<html lang="en" ...>` tag and add the attribute (keep the existing className/fonts):

```tsx
<html lang="en" suppressHydrationWarning className={/* keep existing font variable classes */ ...}>
```

- [ ] **Step 4: Build + test**

Run: `npm run build` → succeeds.
Run: `npm test` → existing 73 tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/providers.tsx src/app/layout.tsx package.json package-lock.json
git commit -m "feat(theme): light/dark/system mode via next-themes"
```

---

### Task 2: Accent themes (definitions, CSS, provider, FOUC script)

**Files:**
- Create: `src/lib/accents.ts`, `src/lib/accents.test.ts`, `src/components/theme/accent-provider.tsx`
- Modify: `src/app/globals.css`, `src/app/providers.tsx`, `src/app/layout.tsx`
- Test: `src/lib/accents.test.ts`

**Interfaces:**
- Produces: `ACCENTS`, `AccentKey`, `DEFAULT_ACCENT`, `isValidAccent`; `AccentProvider`, `useAccent()`.

- [ ] **Step 1: Write the failing test `src/lib/accents.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { ACCENTS, DEFAULT_ACCENT, isValidAccent } from './accents';

describe('accents', () => {
  it('has 6 presets, each with key/name/hex color', () => {
    expect(ACCENTS.length).toBe(6);
    for (const a of ACCENTS) {
      expect(a.key).toBeTruthy();
      expect(a.name).toBeTruthy();
      expect(a.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
  it('DEFAULT_ACCENT is a valid key', () => {
    expect(isValidAccent(DEFAULT_ACCENT)).toBe(true);
    expect(DEFAULT_ACCENT).toBe('indigo');
  });
  it('isValidAccent accepts known and rejects unknown', () => {
    expect(isValidAccent('green')).toBe(true);
    expect(isValidAccent('teal')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/lib/accents.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/lib/accents.ts`**

```ts
export const ACCENTS = [
  { key: 'indigo', name: 'Indigo', color: '#4f46e5' },
  { key: 'green', name: 'Zoro Green', color: '#16a34a' },
  { key: 'red', name: 'Law Red', color: '#dc2626' },
  { key: 'purple', name: 'Robin Purple', color: '#7c3aed' },
  { key: 'blue', name: 'Nami Blue', color: '#2563eb' },
  { key: 'slate', name: 'Kaido Slate', color: '#475569' },
] as const;

export type AccentKey = (typeof ACCENTS)[number]['key'];
export const DEFAULT_ACCENT: AccentKey = 'indigo';

export function isValidAccent(key: string): key is AccentKey {
  return ACCENTS.some((a) => a.key === key);
}
```

- [ ] **Step 4: Run the test to green**

Run: `npm test -- src/lib/accents.test.ts`
Expected: PASS.

- [ ] **Step 5: Append accent overrides to the END of `src/app/globals.css`** (after the `.dark { … }` block, so they win in both modes):

```css
/* Accent themes — override shadcn --primary/--ring; applied in both light and dark */
[data-accent="indigo"] { --primary: #4f46e5; --primary-foreground: #ffffff; --ring: #4f46e5; }
[data-accent="green"]  { --primary: #16a34a; --primary-foreground: #ffffff; --ring: #16a34a; }
[data-accent="red"]    { --primary: #dc2626; --primary-foreground: #ffffff; --ring: #dc2626; }
[data-accent="purple"] { --primary: #7c3aed; --primary-foreground: #ffffff; --ring: #7c3aed; }
[data-accent="blue"]   { --primary: #2563eb; --primary-foreground: #ffffff; --ring: #2563eb; }
[data-accent="slate"]  { --primary: #475569; --primary-foreground: #ffffff; --ring: #475569; }
```

- [ ] **Step 6: Write `src/components/theme/accent-provider.tsx`**

```tsx
'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { DEFAULT_ACCENT, isValidAccent, type AccentKey } from '@/lib/accents';

const STORAGE_KEY = 'crewstat-accent';
type AccentContextValue = { accent: AccentKey; setAccent: (a: AccentKey) => void };
const AccentContext = createContext<AccentContextValue | null>(null);

export function AccentProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<AccentKey>(DEFAULT_ACCENT);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isValidAccent(stored)) setAccentState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);

  const setAccent = (a: AccentKey) => {
    setAccentState(a);
    try { window.localStorage.setItem(STORAGE_KEY, a); } catch { /* ignore */ }
  };

  return <AccentContext.Provider value={{ accent, setAccent }}>{children}</AccentContext.Provider>;
}

export function useAccent(): AccentContextValue {
  const ctx = useContext(AccentContext);
  if (!ctx) throw new Error('useAccent must be used within AccentProvider');
  return ctx;
}
```

- [ ] **Step 7: Mount `AccentProvider` in `src/app/providers.tsx`** — wrap the query providers (inside `ThemeProvider`):

```tsx
import { AccentProvider } from '@/components/theme/accent-provider';
// ...
return (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
    <AccentProvider>{query}</AccentProvider>
  </ThemeProvider>
);
```

- [ ] **Step 8: Add the FOUC inline script to `src/app/layout.tsx`** — as the FIRST child inside `<body>`, before `<Providers>`, so `data-accent` is set before paint:

```tsx
<script
  dangerouslySetInnerHTML={{
    __html: `try{var a=localStorage.getItem('crewstat-accent')||'indigo';document.documentElement.dataset.accent=a;}catch(e){document.documentElement.dataset.accent='indigo';}`,
  }}
/>
```

- [ ] **Step 9: Build + full test**

Run: `npm run build` → succeeds.
Run: `npm test` → all pass (73 + accents test).

- [ ] **Step 10: Commit**

```bash
git add src/lib/accents.ts src/lib/accents.test.ts src/app/globals.css src/components/theme/accent-provider.tsx src/app/providers.tsx src/app/layout.tsx
git commit -m "feat(theme): accent color presets with persisted data-accent"
```

---

### Task 3: Settings page — mode toggle, accent picker, nav link

**Files:**
- Create: `src/components/theme/mode-toggle.tsx`, `src/components/theme/accent-picker.tsx`, `src/components/settings/settings-view.tsx`, `src/app/settings/page.tsx`
- Modify: `src/components/tournaments/tournament-list.tsx`
- Test: none (build gate)

**Interfaces:**
- Consumes: `useTheme` (next-themes), `useAccent`, `ACCENTS`, shadcn `Button`/`Card`, `lucide-react`.

- [ ] **Step 1: Write `src/components/theme/mode-toggle.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

const MODES = [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']] as const;

export function ModeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="grid grid-cols-3 gap-2">
      {MODES.map(([value, label]) => (
        <Button
          key={value}
          type="button"
          variant={mounted && theme === value ? 'default' : 'outline'}
          className="h-11"
          onClick={() => setTheme(value)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write `src/components/theme/accent-picker.tsx`**

```tsx
'use client';
import { Check } from 'lucide-react';
import { ACCENTS } from '@/lib/accents';
import { useAccent } from '@/components/theme/accent-provider';
import { cn } from '@/lib/utils';

export function AccentPicker() {
  const { accent, setAccent } = useAccent();
  return (
    <div className="flex flex-wrap gap-3">
      {ACCENTS.map((a) => (
        <button
          key={a.key}
          type="button"
          onClick={() => setAccent(a.key)}
          aria-label={a.name}
          title={a.name}
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-background transition',
            accent === a.key ? 'ring-foreground' : 'ring-transparent'
          )}
          style={{ backgroundColor: a.color }}
        >
          {accent === a.key && <Check className="h-4 w-4 text-white" />}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write `src/components/settings/settings-view.tsx`**

```tsx
'use client';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { ModeToggle } from '@/components/theme/mode-toggle';
import { AccentPicker } from '@/components/theme/accent-picker';

export function SettingsView() {
  return (
    <main className="mx-auto max-w-xl space-y-4 p-4 pb-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settings</h1>
        <Link href="/" className="text-sm text-muted-foreground">← Home</Link>
      </div>
      <Card className="space-y-5 p-4">
        <h2 className="text-lg font-semibold">Appearance</h2>
        <div className="space-y-2">
          <p className="text-sm font-medium">Theme</p>
          <ModeToggle />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Accent</p>
          <AccentPicker />
        </div>
      </Card>
    </main>
  );
}
```

- [ ] **Step 4: Write `src/app/settings/page.tsx`**

```tsx
import { SettingsView } from '@/components/settings/settings-view';

export default function SettingsPage() {
  return <SettingsView />;
}
```

- [ ] **Step 5: Add a Settings gear link to the home header in `src/components/tournaments/tournament-list.tsx`** — add `Settings` to the `lucide-react` import and place a gear link in the header's link flex (next to Achievements/Stats):

```tsx
import { Plus, Settings } from 'lucide-react';
// ...in the header link group:
<Link href="/settings" aria-label="Settings" className="text-muted-foreground"><Settings className="h-5 w-5" /></Link>
```

(Keep the existing Achievements and Stats links; only add the gear.)

- [ ] **Step 6: Build + full test**

Run: `npm run build` → succeeds; `/settings` route generated.
Run: `npm test` → all pass, pristine.

- [ ] **Step 7: Commit**

```bash
git add src/components/theme/mode-toggle.tsx src/components/theme/accent-picker.tsx src/components/settings src/app/settings/page.tsx src/components/tournaments/tournament-list.tsx
git commit -m "feat(ui): settings page with theme mode and accent pickers"
```

---

## Self-Review

**Spec coverage:**

| Spec item | Task |
|-----------|------|
| Light/Dark/System mode (next-themes) | 1 |
| ThemeProvider mounted (fixes sonner useTheme) | 1 |
| Accent presets (6) applied app-wide via CSS vars | 2 |
| Persisted accent + `data-accent` + FOUC script | 2 |
| accents helper + unit test | 2 |
| Settings page (mode + accent UI) | 3 |
| Header Settings link | 3 |
| SSR-safety (suppressHydrationWarning, effects/try-catch) | 1, 2 |

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `AccentKey`/`ACCENTS`/`DEFAULT_ACCENT`/`isValidAccent` are used consistently by `AccentProvider`, `AccentPicker`, and the FOUC script's default (`'indigo'` = `DEFAULT_ACCENT`); `useAccent` throws outside its provider; `ModeToggle` guards hydration with a `mounted` flag (next-themes `theme` is undefined on the server).

**Manual verification (documented acceptance, per spec §6):** mode toggle switches + persists; accent swatches re-skin `--primary` surfaces + persist; no flash on reload (FOUC script + suppressHydrationWarning); System follows the OS. These are browser-level and not unit-tested.
