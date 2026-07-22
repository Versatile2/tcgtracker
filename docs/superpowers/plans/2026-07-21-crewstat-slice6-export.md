# Crew Stat Slice 6: Export & Social Sharing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Client-side shareable PNG images of a finished tournament, overall stats, and an unlocked achievement — download + native share, branded with a watermark. No schema/API/service changes.

**Architecture:** A `html-to-image` capture/share utility → three branded fixed-width share-card components → a reusable `ShareDialog` (preview + Download/Share) → share triggers on the tournament detail, stats, and achievement UIs.

**Tech Stack:** Next.js 16 · TypeScript · html-to-image · shadcn/ui · Web Share API · Vitest.

## Global Constraints

- **Additive only** — no changes to `src/services/**`, `src/app/api/**`, or the database.
- **Client-only** — `html-to-image`, `document`, and `navigator` are used only inside client components / event handlers. The one pure helper (`shareFilename`) is unit-tested.
- Share cards are **fixed-width** (`w-[380px]`) so captures are consistent; they use the app tokens so the current theme/accent shows through; each ends with a "Made with Crew Stat" watermark.
- `Share` falls back to `Download` when the Web Share API is unavailable (desktop).
- Build must pass; existing 76 tests stay green. One commit per task.

---

## File Structure

```
src/
  lib/share-image.ts              # captureNode, downloadBlob, shareOrDownload, shareFilename
  lib/share-image.test.ts         # shareFilename unit test
  components/share/
    watermark.tsx
    tournament-share-card.tsx
    stats-share-card.tsx
    achievement-share-card.tsx
    share-dialog.tsx              # reusable preview + Download/Share
    achievement-share-button.tsx  # trigger for unlocked achievements (Task 3)
  components/tournaments/tournament-detail.tsx  # + Share trigger (Task 3)
  components/stats/stats-view.tsx               # + Share trigger (Task 3)
  components/achievements/achievement-card.tsx  # + share button when unlocked (Task 3)
```

---

### Task 1: Capture / share utility

**Files:**
- Create: `src/lib/share-image.ts`, `src/lib/share-image.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `captureNode(node) => Promise<Blob>`, `downloadBlob(blob, filename)`, `shareOrDownload(blob, filename) => Promise<void>`, `shareFilename(kind, label) => string`.

- [ ] **Step 1: Install html-to-image**

```bash
npm install html-to-image
```

- [ ] **Step 2: Write the failing test `src/lib/share-image.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { shareFilename } from './share-image';

describe('shareFilename', () => {
  it('slugifies the label', () => {
    expect(shareFilename('tournament', 'Paramount War 4-2')).toBe('crewstat-tournament-paramount-war-4-2.png');
  });
  it('falls back to "card" on empty label', () => {
    expect(shareFilename('stats', '')).toBe('crewstat-stats-card.png');
  });
  it('trims, lowercases, and strips punctuation', () => {
    expect(shareFilename('achievement', '  Rainbow Crusher!  ')).toBe('crewstat-achievement-rainbow-crusher.png');
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npm test -- src/lib/share-image.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Write `src/lib/share-image.ts`**

```ts
import { toBlob } from 'html-to-image';

export async function captureNode(node: HTMLElement): Promise<Blob> {
  const blob = await toBlob(node, { pixelRatio: 2, cacheBust: true });
  if (!blob) throw new Error('Image capture failed');
  return blob;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function shareOrDownload(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: 'image/png' });
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  if (nav && typeof nav.canShare === 'function' && nav.canShare({ files: [file] }) && typeof nav.share === 'function') {
    try {
      await nav.share({ files: [file] });
      return;
    } catch {
      // user cancelled or share failed → fall through to download
    }
  }
  downloadBlob(blob, filename);
}

export function shareFilename(kind: string, label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return `crewstat-${kind}-${slug || 'card'}.png`;
}
```

- [ ] **Step 5: Run the test to green**

Run: `npm test -- src/lib/share-image.test.ts`
Expected: PASS. If importing `html-to-image` breaks the node test environment (unlikely — it doesn't touch the DOM at import), move `shareFilename` into its own module `src/lib/share-filename.ts`, import it from `share-image.ts`, and point the test at the pure module; note the change.

- [ ] **Step 6: Full test + build**

Run: `npm test` → all pass (76 + shareFilename). `npm run build` → succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/lib/share-image.ts src/lib/share-image.test.ts package.json package-lock.json
git commit -m "feat(share): client image capture + share/download utility"
```

---

### Task 2: Share cards and ShareDialog

**Files:**
- Create: `src/components/share/watermark.tsx`, `tournament-share-card.tsx`, `stats-share-card.tsx`, `achievement-share-card.tsx`, `share-dialog.tsx`
- Test: none (build gate)

**Interfaces:**
- Consumes: `formatRecord`/`computeRecord` (`@/lib/record`), `tournamentTypeLabel` (`@/lib/labels`), DTOs, `captureNode`/`downloadBlob`/`shareOrDownload`, shadcn `Dialog`/`Button`/`Badge`, `lucide-react`, `toast`.
- Produces: `Watermark`, `TournamentShareCard`, `StatsShareCard`, `AchievementShareCard`, `ShareDialog`.

- [ ] **Step 1: Write `src/components/share/watermark.tsx`**

```tsx
export function Watermark() {
  return (
    <p className="pt-2 text-center text-[10px] uppercase tracking-wide text-muted-foreground">
      Made with Crew Stat · crewstat-three.vercel.app
    </p>
  );
}
```

- [ ] **Step 2: Write `src/components/share/tournament-share-card.tsx`**

```tsx
import { Badge } from '@/components/ui/badge';
import { formatRecord, computeRecord } from '@/lib/record';
import { tournamentTypeLabel } from '@/lib/labels';
import type { TournamentDetailDTO } from '@/lib/dto';
import { Watermark } from './watermark';

const chip: Record<'win' | 'loss' | 'draw', string> = {
  win: 'bg-green-600 text-white',
  loss: 'bg-red-600 text-white',
  draw: 'bg-yellow-500 text-black',
};

export function TournamentShareCard({
  tournament,
  leaderName,
}: {
  tournament: TournamentDetailDTO;
  leaderName: (id: string) => string;
}) {
  const record = computeRecord(tournament.rounds);
  return (
    <div className="w-[380px] space-y-3 rounded-xl border bg-card p-5 text-card-foreground">
      <div className="flex items-center justify-between">
        <Badge variant="secondary">{tournamentTypeLabel(tournament.type)}</Badge>
        <span className="text-sm text-muted-foreground">{tournament.playedOn}</span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className="text-lg font-bold leading-tight">{tournament.name ?? tournamentTypeLabel(tournament.type)}</p>
        <p className="shrink-0 text-3xl font-bold tabular-nums">{formatRecord(record)}</p>
      </div>
      <div className="space-y-1">
        {tournament.rounds.map((r) => (
          <div key={r.id} className="flex items-center gap-2 text-sm">
            <span className="w-5 text-muted-foreground">{r.roundNumber}</span>
            <Badge className={chip[r.result]}>{r.result[0].toUpperCase()}</Badge>
            <span className="truncate">{leaderName(r.opponentLeaderId)}</span>
          </div>
        ))}
        {tournament.rounds.length === 0 && <p className="text-sm text-muted-foreground">No rounds logged</p>}
      </div>
      <Watermark />
    </div>
  );
}
```

- [ ] **Step 3: Write `src/components/share/stats-share-card.tsx`**

```tsx
import { formatRecord } from '@/lib/record';
import type { OverallStatsDTO } from '@/lib/dto';
import { Watermark } from './watermark';

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

export function StatsShareCard({ overall }: { overall: OverallStatsDTO }) {
  return (
    <div className="w-[380px] space-y-4 rounded-xl border bg-card p-5 text-card-foreground">
      <p className="text-lg font-bold">My Crew Stat</p>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Tournaments" value={String(overall.totalTournaments)} />
        <Stat label="Record" value={formatRecord(overall)} />
        <Stat label="Win rate" value={pct(overall.winRate)} />
        <Stat label="Draw rate" value={pct(overall.drawRate)} />
      </div>
      <div className="space-y-1 text-sm text-muted-foreground">
        {overall.bestSet && (
          <p>Best set: <span className="text-foreground">{overall.bestSet.name}</span> ({pct(overall.bestSet.winRate)})</p>
        )}
        {overall.mostPlayedLeader && (
          <p>Top leader: <span className="text-foreground">{overall.mostPlayedLeader.name}</span></p>
        )}
      </div>
      <Watermark />
    </div>
  );
}
```

- [ ] **Step 4: Write `src/components/share/achievement-share-card.tsx`**

```tsx
import { Check } from 'lucide-react';
import type { AchievementDTO } from '@/lib/dto';
import { Watermark } from './watermark';

export function AchievementShareCard({ achievement }: { achievement: AchievementDTO }) {
  return (
    <div className="w-[380px] space-y-3 rounded-xl border bg-card p-6 text-center text-card-foreground">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check className="h-7 w-7" />
      </div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Achievement unlocked</p>
      <p className="text-xl font-bold">{achievement.name}</p>
      <p className="text-sm text-muted-foreground">{achievement.description}</p>
      <Watermark />
    </div>
  );
}
```

- [ ] **Step 5: Write `src/components/share/share-dialog.tsx`**

```tsx
'use client';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { captureNode, downloadBlob, shareOrDownload } from '@/lib/share-image';

export function ShareDialog({
  open,
  onOpenChange,
  title,
  filename,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  filename: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  async function run(share: boolean) {
    if (!ref.current) return;
    setBusy(true);
    try {
      const blob = await captureNode(ref.current);
      if (share) await shareOrDownload(blob, filename);
      else downloadBlob(blob, filename);
    } catch {
      toast.error('Could not create image');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="max-h-[60vh] overflow-auto rounded-lg bg-muted/30 p-3">
          <div ref={ref} className="mx-auto w-fit">{children}</div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" disabled={busy} onClick={() => run(false)}>Download</Button>
          <Button className="flex-1" disabled={busy} onClick={() => run(true)}>{busy ? 'Working…' : 'Share'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Build**

Run: `npm run build` → succeeds. `npm test` → 76 + shareFilename still green.

- [ ] **Step 7: Commit**

```bash
git add src/components/share
git commit -m "feat(share): watermark, share cards, and ShareDialog"
```

---

### Task 3: Wire share triggers into the tournament, stats, and achievement UIs

**Files:**
- Create: `src/components/share/achievement-share-button.tsx`
- Modify: `src/components/tournaments/tournament-detail.tsx`, `src/components/stats/stats-view.tsx`, `src/components/achievements/achievement-card.tsx`
- Test: none (build gate)

**Interfaces:**
- Consumes: `ShareDialog`, the three share cards, `shareFilename`, existing hooks/data.

- [ ] **Step 1: Add a Share trigger to `src/components/tournaments/tournament-detail.tsx`**

The component is already `'use client'` and has `leaders` (via `useLeaders`), a `leaderName(id)` resolver, and the loaded tournament `t`. Add near the top of the component body:

```tsx
import { ShareDialog } from '@/components/share/share-dialog';
import { TournamentShareCard } from '@/components/share/tournament-share-card';
import { shareFilename } from '@/lib/share-image';
// ...inside the component:
const [shareOpen, setShareOpen] = useState(false);
```

Add a Share button in the header actions area (next to the 3-dot menu / Finish), e.g.:

```tsx
<Button variant="outline" onClick={() => setShareOpen(true)}>Share</Button>
```

And render the dialog once (e.g. near the RoundFormSheet at the end of the JSX):

```tsx
<ShareDialog
  open={shareOpen}
  onOpenChange={setShareOpen}
  title="Share tournament"
  filename={shareFilename('tournament', t.name ?? tournamentTypeLabel(t.type))}
>
  <TournamentShareCard tournament={t} leaderName={leaderName} />
</ShareDialog>
```

Ensure `tournamentTypeLabel` is imported (it already is in this file). Keep all existing behavior; only add the Share button + dialog.

- [ ] **Step 2: Add a Share trigger to `src/components/stats/stats-view.tsx`**

The component is `'use client'` and has `data` from `useStats()`. Add:

```tsx
import { ShareDialog } from '@/components/share/share-dialog';
import { StatsShareCard } from '@/components/share/stats-share-card';
import { shareFilename } from '@/lib/share-image';
// ...
const [shareOpen, setShareOpen] = useState(false);
```

In the header row (where the title + "← Home" link are), add a small Share button that is enabled only when there is data with tournaments. When `data && data.overall.totalTournaments > 0`, render:

```tsx
<Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>Share</Button>
```

And render the dialog when data exists:

```tsx
{data && (
  <ShareDialog open={shareOpen} onOpenChange={setShareOpen} title="Share stats" filename={shareFilename('stats', 'my-stats')}>
    <StatsShareCard overall={data.overall} />
  </ShareDialog>
)}
```

Import `Button` if not already imported. Keep existing sections unchanged.

- [ ] **Step 3: Write `src/components/share/achievement-share-button.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { ShareDialog } from './share-dialog';
import { AchievementShareCard } from './achievement-share-card';
import { shareFilename } from '@/lib/share-image';
import type { AchievementDTO } from '@/lib/dto';

export function AchievementShareButton({ achievement }: { achievement: AchievementDTO }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={`Share ${achievement.name}`}
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground"
      >
        <Share2 className="h-4 w-4" />
      </button>
      <ShareDialog
        open={open}
        onOpenChange={setOpen}
        title="Share achievement"
        filename={shareFilename('achievement', achievement.name)}
      >
        <AchievementShareCard achievement={achievement} />
      </ShareDialog>
    </>
  );
}
```

- [ ] **Step 4: Render the share button in `src/components/achievements/achievement-card.tsx`** — for **unlocked** achievements only. Add the import and place the button in the card header next to the check badge:

```tsx
import { AchievementShareButton } from '@/components/share/achievement-share-button';
// ...in the header flex, when a.unlocked, render the check AND the share button:
{a.unlocked && (
  <span className="flex shrink-0 items-center gap-2">
    <AchievementShareButton achievement={a} />
    <span className="rounded-full bg-primary p-1 text-primary-foreground"><Check className="h-3 w-3" /></span>
  </span>
)}
```

(Keep the existing name/description/progress rendering unchanged. `AchievementCard` is rendered inside the client `AchievementsView`, so embedding this client button is fine.)

- [ ] **Step 5: Build + full test**

Run: `npm run build` → succeeds; all routes compile.
Run: `npm test` → all pass, pristine.

- [ ] **Step 6: Commit**

```bash
git add src/components/share/achievement-share-button.tsx src/components/tournaments/tournament-detail.tsx src/components/stats/stats-view.tsx src/components/achievements/achievement-card.tsx
git commit -m "feat(share): share buttons on tournament, stats, and achievements"
```

---

## Self-Review

**Spec coverage:**

| Spec item | Task |
|-----------|------|
| Client capture/share utility (html-to-image + Web Share + download) | 1 |
| `shareFilename` (pure, tested) | 1 |
| Tournament / Stats / Achievement share cards + watermark | 2 |
| Reusable ShareDialog (preview + Download/Share) | 2 |
| Triggers on tournament detail / stats / unlocked achievements | 3 |
| Theme/accent reflected in cards (uses tokens) | 2 |
| Build gate + manual browser acceptance | all |

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `ShareDialog` props (`open/onOpenChange/title/filename/children`) are used identically by all three call sites; cards consume `TournamentDetailDTO`/`OverallStatsDTO`/`AchievementDTO` field-for-field; `shareFilename(kind,label)` signature matches every caller; `captureNode`/`shareOrDownload`/`downloadBlob` are the only DOM/browser entry points and are called only from the client `ShareDialog`.

**Note for implementers:** `html-to-image` embeds computed styles including the accent `--primary`, so cards reflect the current theme. Capture and `navigator.share` are browser-only (verified manually after deploy). `Share` falls back to `Download` on desktop where the Web Share API (files) isn't available.
