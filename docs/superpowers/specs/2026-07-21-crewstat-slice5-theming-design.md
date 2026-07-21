# Crew Stat — Slice 5: Appearance & Themes (Design)

**Date:** 2026-07-21
**Status:** Approved design, ready for implementation planning
**Scope:** A Settings → Appearance area giving a Light/Dark/System theme mode and ~6 deck-inspired accent color presets, applied app-wide via CSS variables and persisted. Additive; no schema/API/service changes.

## 1. Context & Decision

Slices 1–4 are shipped and live. "Customization" (UC13–16) originally listed app-icon swapping and per-leader card art, which are impractical/low-value on the web (you can't reliably re-skin an installed PWA icon per user, and per-leader art needs an asset library). The user chose the web-native, high-value subset: **theme mode + accent color themes**. This also fixes the Slice-3 note that `sonner` calls `next-themes`' `useTheme()` with no `ThemeProvider` mounted.

## 2. What we build

1. **Theme mode** — Light / Dark / System via `next-themes` (`attribute="class"`, `defaultTheme="system"`, `enableSystem`). Toggles the existing `.dark` class that shadcn's tokens already key off. Persisted by next-themes in `localStorage`.
2. **Accent themes** — 6 presets that override the shadcn `--primary` / `--primary-foreground` / `--ring` CSS variables app-wide, working in both light and dark mode. Persisted in `localStorage`, applied via a `data-accent` attribute on `<html>`. A tiny inline script sets `data-accent` before paint to avoid a flash.
3. **Settings page** (`/settings`) with an Appearance section: a mode segmented control and clickable accent swatches, reachable from a gear link in the home header.

**Accent presets** (`--primary` / white foreground; applied for both modes):

| key | name | color |
|-----|------|-------|
| `indigo` | Indigo (default) | `#4f46e5` |
| `green` | Zoro Green | `#16a34a` |
| `red` | Law Red | `#dc2626` |
| `purple` | Robin Purple | `#7c3aed` |
| `blue` | Nami Blue | `#2563eb` |
| `slate` | Kaido Slate | `#475569` |

Default accent is `indigo` (matches the PWA `theme_color`). Overriding `--primary` re-skins buttons, active states, badges, progress bars, and other `primary`-based surfaces across every existing screen.

## 3. Architecture (additive)

```
layout.tsx
 ├─ <html suppressHydrationWarning data-accent (set by inline FOUC script)>
 ├─ inline <script>  → sets document.documentElement.dataset.accent from localStorage (pre-paint)
 └─ Providers → ThemeProvider (next-themes) → PersistQueryClientProvider → app

src/lib/accents.ts        ACCENTS list, AccentKey, DEFAULT_ACCENT, isValidAccent()  (+ test)
src/app/globals.css       [data-accent="…"] { --primary; --primary-foreground; --ring } overrides
src/components/theme/accent-provider.tsx   useAccent() context (reads/writes localStorage + data-accent)
src/components/theme/mode-toggle.tsx        Light/Dark/System control (next-themes useTheme)
src/components/theme/accent-picker.tsx      swatches (useAccent)
src/app/settings/page.tsx + settings-view.tsx
src/components/tournaments/tournament-list.tsx   + Settings gear link
```

No changes to `src/services/**`, `src/app/api/**`, or the database.

## 4. Providers & FOUC

- **`next-themes` `ThemeProvider`** mounted inside `Providers` (`src/app/providers.tsx`), wrapping the existing query providers, with `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`. `<html>` gets `suppressHydrationWarning` (next-themes mutates the class before hydration).
- **Accent**: an `AccentProvider` (React context) exposes `useAccent(): { accent, setAccent }`. On `setAccent` it writes `localStorage['crewstat-accent']` and sets `document.documentElement.dataset.accent`. A small inline script in the layout sets `data-accent` from storage (default `indigo`) before paint, so there's no accent flash. SSR-safe: the provider only touches `window`/`localStorage` in effects; the inline script is guarded with try/catch.

## 5. Settings UI

- **`/settings`** → `SettingsView` with an "Appearance" card:
  - **Theme mode:** a 3-way control (Light / Dark / System) driven by `next-themes` `useTheme()` (`setTheme`, `theme`), hydration-guarded (render after mount to avoid mismatch).
  - **Accent:** a row of 6 color swatches; the selected one is ringed; clicking calls `setAccent`.
- **Nav:** a gear/`Settings` link in the home header (next to Stats / Achievements) and a "← Home" back link on the settings page.

## 6. Testing

Theme/accent is browser-level (class toggling, CSS variables) and not meaningfully unit-testable. Therefore:
- **Unit test:** `src/lib/accents.ts` — `ACCENTS` shape, `DEFAULT_ACCENT` is a valid key, `isValidAccent` accepts known keys and rejects unknown.
- **Build gate:** `npm run build` succeeds; existing 73 tests still pass.
- **Manual/browser verification (documented acceptance):** mode toggle switches light/dark and persists across reload; accent swatches re-skin the app and persist; no theme/accent flash on reload; system mode follows the OS.

## 7. Out of Scope (future)

Per-leader card art and selectable installed-app icons (need an asset library / are web-limited); custom user-defined colors; background patterns/textures; per-theme export styling (Slice 6). The CSS-variable approach here is compatible with adding more presets or a custom picker later.
