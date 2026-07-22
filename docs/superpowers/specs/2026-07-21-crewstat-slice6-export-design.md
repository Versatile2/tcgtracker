# Crew Stat — Slice 6: Export & Social Sharing (Design)

**Date:** 2026-07-21
**Status:** Approved design, ready for implementation planning
**Scope:** Generate branded, shareable PNG images of a finished tournament, your overall stats, and an unlocked achievement — captured client-side, with download + native share. Additive; no schema/API/service changes.

## 1. Context & Decision

Slices 1–5 are shipped and live. The user chose the full export scope (tournament + stats + achievement). Image generation is **client-side** via `html-to-image` capturing a dedicated, branded "share card" DOM node — no server, no Satori CSS limitations, and it reuses the app's theme/accent (Slice 5). Sharing uses the **Web Share API** (native share sheet, incl. save-to-photos) with a **download fallback**. Each card carries a small "Made with Crew Stat" watermark.

CSV/data export (UC22) is a separate PRO-tier feature and is **out of scope** here — this slice is image sharing.

## 2. What we build

1. A client capture/share utility (`html-to-image` → PNG blob → native share or download).
2. Three branded share-card components (tournament result, overall stats, achievement) designed to look good standalone (not screenshots of the UI), at a fixed width for consistent output.
3. A reusable `ShareDialog` that previews a card and offers Download / Share.
4. Share triggers wired into the tournament detail page, the stats page, and unlocked achievement cards.

## 3. Architecture (additive)

```
Share button (detail / stats / achievement)
   → opens <ShareDialog filename=… > <XShareCard …/> </ShareDialog>
        → captureNode(cardRef)  [html-to-image toBlob, pixelRatio 2]
        → shareOrDownload(blob, filename)  [navigator.share files → else download]
```

No changes to `src/services/**`, `src/app/api/**`, or the database. New client-only code; the capture util touches `document`/`navigator` only in handlers.

## 4. Capture / share utility — `src/lib/share-image.ts`

- **`captureNode(node: HTMLElement) => Promise<Blob>`** — `html-to-image` `toBlob(node, { pixelRatio: 2, cacheBust: true })`; throws if capture fails.
- **`shareOrDownload(blob, filename) => Promise<void>`** — build a `File`; if `navigator.canShare({ files })` is available, `navigator.share({ files })` (fall back to download on throw/cancel); otherwise `downloadBlob`.
- **`downloadBlob(blob, filename)`** — object URL + temporary `<a download>` click + revoke.
- **`shareFilename(kind, label) => string`** — pure: `crewstat-<kind>-<slugified-label>.png` (lowercased, non-alphanumerics → `-`, trimmed, capped). Unit-tested.

## 5. Share cards (fixed-width, branded)

All rendered at a fixed width (~`w-[380px]`) so captures are consistent; styled with the app's `Card`/tokens so the current **accent** shows through; each ends with a `Made with Crew Stat · crewstat-three.vercel.app` watermark.

- **`TournamentShareCard`** — `{ tournament: TournamentDetailDTO, leaderName: (id) => string }`: type badge · set · date header, the big record (`formatRecord`), a compact rounds list (round #, W/L/D chip, opponent name), watermark.
- **`StatsShareCard`** — `{ overall: OverallStatsDTO }`: total tournaments, overall record, win rate %, best set, most-played leader, watermark.
- **`AchievementShareCard`** — `{ achievement: AchievementDTO }`: an "Unlocked" badge, the achievement name + description, watermark.

## 6. `ShareDialog` (reusable)

`{ open, onOpenChange, filename, children }` — a shadcn `Dialog` showing the card (via an internal `ref`) in a scrollable preview, plus **Download** and **Share** buttons. On click: `captureNode(ref)` → `downloadBlob` (Download) or `shareOrDownload` (Share); a busy state disables the buttons; a `toast.error` on capture failure. Share falls back to download when the Web Share API isn't available (desktop), so both buttons always work.

## 7. Triggers

- **Tournament detail** (`tournament-detail.tsx`): a "Share" button (near the header / actions) opens the tournament `ShareDialog`. Uses the loaded `useLeaders()` to resolve leader names.
- **Stats page** (`stats-view.tsx`): a "Share" button in the header opens the stats `ShareDialog` (only when there's data).
- **Achievements** (`achievement-card.tsx` / view): a small share icon on **unlocked** cards opens the achievement `ShareDialog` for that achievement.

## 8. Testing

Image capture and the Web Share API are browser-only and not meaningfully unit-testable. Therefore:
- **Unit test:** `shareFilename` — slugifies/limits/handles empty (pure).
- **Build gate:** `npm run build` succeeds; existing 76 tests still pass.
- **Manual/browser verification (documented acceptance):** each Share button opens a card preview; Download saves a PNG; Share opens the native sheet on a supporting device (else downloads); the card reflects the current theme/accent and shows the watermark.

## 9. Out of Scope (future)

CSV/data export (PRO); server-rendered OG images for link previews; customizable card layouts/backgrounds; sharing directly to specific networks via their APIs. The client capture utility is reusable if server OG images are added later.
