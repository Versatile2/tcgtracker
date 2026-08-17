# First-Look Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four defects and the clutter found by rendering every main screen of the app for the first time.

**Architecture:** Nine small, independent presentational changes plus one pure helper. The only non-obvious one is the hydration fix, which is structural: the provider tree must be identical on server and client. No schema, service, DTO or API changes.

**Tech Stack:** Next.js 16 (App Router), React 19, TanStack Query (+ localStorage persister), Tailwind v4, lucide-react, vitest.

**Spec:** `docs/superpowers/specs/2026-08-17-first-look-fixes-design.md`

## Global Constraints

- **Every fix is verified by screenshot, not by reasoning.** This whole set exists because lint, `tsc`, a green suite and two code reviews missed all of it. `npm run shot -- <route> <out.png> [--dark]` is the gate.
- **Run the dev server against the TEST database.** `scripts/screenshot.mjs`'s header explains why; pointing it at the default `DATABASE_URL` writes to **production Neon**:
  ```
  export DATABASE_URL="$(grep '^DATABASE_URL_TEST=' .env.local | cut -d= -f2- | tr -d '"')"
  npx next dev -p 3100
  ```
  A server may already be running on port 3100 with seeded data — check before starting another.
- **Never use `toLocaleDateString` or any locale-dependent formatting.** Server and client can resolve different locales, which reintroduces exactly the hydration bug Task 1 removes.
- **No component-test infrastructure exists** (`vitest.config.ts` is `environment: 'node'`, collects `.ts` only; `@testing-library/react` and `jsdom` are installed but unused). Do NOT stand any up.
- Two things in screenshots are NOT defects: the red "2 Issues" badge is the Next dev overlay, and the bottom nav appearing mid-page is how `position: fixed` renders in a full-page screenshot.
- Commit after every task.

---

### Task 1: Fix the hydration mismatch

The headline defect. Every load of `/` and `/stats` logs *"Hydration failed because the server rendered HTML didn't match the client"* and React discards the server tree.

**Files:**
- Modify: `src/app/providers.tsx:21-29`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Reproduce it first**

With the dev server running against the test DB:

```bash
npm run shot -- / /tmp/before.png
```

Expected: the command prints a `console errors:` block containing "Hydration failed because the server rendered HTML didn't match the client". **Do not proceed until you have seen this** — it is the evidence the fix is real.

- [ ] **Step 2: Make the provider tree identical on both sides**

The cause is that `persister` is `null` on the server and non-null on the client, so the server renders `QueryClientProvider` and the client renders `PersistQueryClientProvider` — different components in the same position.

Replace the `persister` memo and the `query` branch with a single tree:

```tsx
  // One provider on both sides. Branching the tree on `typeof window` meant the
  // server rendered QueryClientProvider and the client PersistQueryClientProvider,
  // which can never hydrate cleanly. The persister simply no-ops without storage,
  // so persistence still only happens in the browser.
  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      key: 'crewstat-query-cache',
    }),
  );

  const query = (
    <PersistQueryClientProvider client={client} persistOptions={{ persister, maxAge: WEEK, buster: CACHE_BUSTER }}>
      {children}
    </PersistQueryClientProvider>
  );
```

Leave the `QueryClient` memo, `WEEK`, `CACHE_BUSTER`, `ThemeProvider` and `AccentProvider` untouched. Remove the now-unused `QueryClientProvider` import.

Do **not** add `suppressHydrationWarning` anywhere — it is already on `<html>` (`layout.tsx:37`) for next-themes, and adding more would hide this class of bug rather than fix it.

- [ ] **Step 3: Prove it is gone**

```bash
npm run shot -- / /tmp/after-list.png
npm run shot -- /stats /tmp/after-stats.png
```

Expected: **no `console errors:` block at all** on either. If a hydration error remains, stop and report — the cause is elsewhere and guessing will make it worse.

- [ ] **Step 4: Verify the rest still works**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: clean, 208 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/providers.tsx
git commit -m "fix(app): render one provider tree so the client can hydrate"
```

---

### Task 2: A date formatter with no locale dependency

**Files:**
- Create: `src/lib/format-date.ts`
- Test: `src/lib/format-date.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `formatPlayedOn(iso: string): string` — `'2026-08-09'` → `'9 Aug 2026'`. Used by Tasks 3 and 6.

- [ ] **Step 1: Write the failing test**

Create `src/lib/format-date.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatPlayedOn } from './format-date';

describe('formatPlayedOn', () => {
  it('renders a readable date without leading zeros on the day', () => {
    expect(formatPlayedOn('2026-08-09')).toBe('9 Aug 2026');
  });

  it('handles a two-digit day', () => {
    expect(formatPlayedOn('2026-08-16')).toBe('16 Aug 2026');
  });

  it('handles the last month', () => {
    expect(formatPlayedOn('2025-12-31')).toBe('31 Dec 2025');
  });

  it('returns the input unchanged when it is not an ISO date', () => {
    expect(formatPlayedOn('')).toBe('');
    expect(formatPlayedOn('not-a-date')).toBe('not-a-date');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/lib/format-date.test.ts`
Expected: FAIL — cannot resolve `./format-date`.

- [ ] **Step 3: Implement it**

Create `src/lib/format-date.ts`:

```ts
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Render a stored `YYYY-MM-DD` as `9 Aug 2026`.
 *
 * Deliberately does NOT use `toLocaleDateString` or the `Date` constructor. The
 * server and the browser can resolve different locales and time zones, which
 * would produce different strings for the same row — the exact hydration
 * mismatch this codebase just removed from the provider tree. Reading the ISO
 * parts is deterministic everywhere.
 *
 * Anything that is not a `YYYY-MM-DD` string is returned unchanged, so a bad
 * value degrades to showing the raw data rather than throwing in a render.
 */
export function formatPlayedOn(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, year, month, day] = m;
  const name = MONTHS[Number(month) - 1];
  if (!name) return iso;
  return `${Number(day)} ${name} ${year}`;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npm test -- src/lib/format-date.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format-date.ts src/lib/format-date.test.ts
git commit -m "feat(dates): add a locale-independent played-on formatter"
```

---

### Task 3: Tournament card — protect the date and the set code

**Files:**
- Modify: `src/components/tournaments/tournament-card.tsx`

**Interfaces:**
- Consumes: `formatPlayedOn` from Task 2.
- Produces: nothing.

Observed: the subtitle is one truncating line holding leader name, set code and date, so on a narrow card the date disappears entirely ("Monkey D. Luffy OP01-0…").

- [ ] **Step 1: Split the subtitle into a truncating part and a fixed part**

Replace the subtitle `<p>` (currently around lines 60-70) with a flex row whose date segment cannot shrink:

```tsx
            <div className={cn('flex items-baseline gap-1.5 text-sm text-muted-foreground', hasName ? 'mt-0.5' : 'mt-1')}>
              {t.type !== 'freeplay' && (
                <span className="truncate">
                  <span className="text-foreground">{leaderName}</span>
                  {leader?.setCode && <span> {leader.setCode}</span>}
                </span>
              )}
              {/* Never truncated: the date is short and is the thing that was being
                  silently dropped when everything shared one truncating line. */}
              <span className="shrink-0">{formatPlayedOn(t.playedOn)}</span>
              {t.type === 'freeplay' && t.deckCount > 0 && (
                <span className="shrink-0">· {deckCountLabel(t.deckCount)}</span>
              )}
            </div>
```

Note the separator between leader and date is now the flex `gap-1.5` rather than a `·`, so the two segments read as distinct fields. Keep the existing `deckCountLabel` import; add `formatPlayedOn` from `@/lib/format-date`.

- [ ] **Step 2: Verify**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: clean, suite green.

```bash
npm run shot -- / /tmp/card.png
```

Open it. Expected: each classic card shows leader name, set code **and** a date like `9 Aug 2026`; the freeplay card shows its date and `3 decks`. Nothing is cut off mid-word at the right edge.

- [ ] **Step 3: Commit**

```bash
git add src/components/tournaments/tournament-card.tsx
git commit -m "fix(tournaments): stop the card subtitle truncating the date away"
```

---

### Task 4: Opponent stats — protect the set code

**Files:**
- Modify: `src/components/stats/opponent-stats.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

Observed: "Portgas D. Ace OP…", "Donquixote Dofla…". The set code is the only thing separating the 15 Monkey D. Luffy printings, so it is the worst possible thing to drop first.

- [ ] **Step 1: Let the name give way instead of the code**

The name and code currently sit inside one `truncate` span. Split them so only the name truncates:

```tsx
                  <span className="flex min-w-0 items-baseline gap-1 font-medium">
                    <span className="truncate">{r.name}</span>
                    {leader?.setCode && (
                      <span className="shrink-0 font-normal text-muted-foreground">{leader.setCode}</span>
                    )}
                  </span>
```

`min-w-0` is required for the inner `truncate` to work inside a flex parent.

- [ ] **Step 2: Verify**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: clean, suite green.

```bash
npm run shot -- /stats /tmp/opp.png
```

Expected: in the "By opponent" section, long names like Donquixote Doflamingo are cut short while their set code stays fully visible.

- [ ] **Step 3: Commit**

```bash
git add src/components/stats/opponent-stats.tsx
git commit -m "fix(stats): keep the set code visible when an opponent name is long"
```

---

### Task 5: The freeplay glyph becomes an icon

**Files:**
- Modify: `src/components/tournaments/freeplay-glyph.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `FreeplayGlyph` keeps its `size` and `className` props unchanged.

Observed: it renders as a small red-and-white box, because 🎴 depends on the platform having that codepoint.

- [ ] **Step 1: Replace the emoji with a lucide icon**

Swap the emoji for `Shuffle` — "the deck changes" — which is the only lucide icon that states what freeplay actually is, and matches every other icon in the app:

```tsx
import { Shuffle } from 'lucide-react';
import { cn } from '@/lib/utils';

// Matches LeaderAvatar's 5:7 card footprint so a freeplay card sits flush in a
// list beside normal leader avatars.
const SIZES = {
  sm: 'w-6 h-[2.1rem] rounded-[0.2rem]',
  md: 'w-11 h-[3.85rem] rounded-[0.35rem]',
  lg: 'w-16 h-[5.6rem] rounded-lg',
} as const;

const ICON = { sm: 'size-3', md: 'size-5', lg: 'size-7' } as const;

/** Stands in for the leader avatar on a freeplay session, which has no single leader. */
export function FreeplayGlyph({ size = 'md', className }: { size?: keyof typeof SIZES; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center border border-border/60 bg-muted text-muted-foreground',
        SIZES[size], className,
      )}
    >
      <Shuffle className={ICON[size]} />
    </div>
  );
}
```

The text-size classes leave `SIZES` because an icon is sized by its own class, not by font size.

- [ ] **Step 2: Verify**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: clean, suite green.

```bash
npm run shot -- / /tmp/glyph.png
npm run shot -- / /tmp/glyph-dark.png --dark
```

Expected: the freeplay card shows a clean shuffle icon in both themes — no box, no missing-glyph square.

- [ ] **Step 3: Commit**

```bash
git add src/components/tournaments/freeplay-glyph.tsx
git commit -m "fix(freeplay): use an icon instead of an emoji that may not render"
```

---

### Task 6: Detail page — stop repeating a leader that cannot change

**Files:**
- Modify: `src/components/tournaments/tournament-detail.tsx`, `src/components/tournaments/round-item.tsx`

**Interfaces:**
- Consumes: `formatPlayedOn` from Task 2.
- Produces: `RoundItem`'s `myLeader` prop becomes optional in effect — passing `undefined` renders no avatar at all rather than a placeholder.

Observed: seven identical Roronoa Zoro cards down a seven-round tournament. In a non-freeplay tournament the leader is fixed for the whole event, so every card after the first is noise on the app's densest screen.

- [ ] **Step 1: Render the row's leader avatar only when there is one**

In `src/components/tournaments/round-item.tsx`, the avatar currently always renders with a `'—'` fallback:

```tsx
      <LeaderAvatar name={myLeader?.name ?? '—'} colors={myLeader?.colors} setCode={myLeader?.setCode} size="md" />
```

Replace it with a conditional, so an absent leader takes no space instead of showing a placeholder:

```tsx
      {/* Only freeplay rounds carry their own leader; a classic tournament's leader
          is fixed for the event and is stated once in the page header. */}
      {myLeader && <LeaderAvatar name={myLeader.name} colors={myLeader.colors} setCode={myLeader.setCode} size="md" />}
```

- [ ] **Step 2: Only supply a leader for freeplay**

In `src/components/tournaments/tournament-detail.tsx`, `leaderForRound` (around line 74) resolves `r.myLeaderId ?? t.myLeaderId`, which is why every classic round shows the tournament's leader. Make it return `undefined` unless the tournament is freeplay:

```tsx
  // Freeplay records a deck per round, so each row names its own. Every other
  // type has one leader for the whole event: repeating it on every row costs
  // height and says nothing the header has not already said.
  const leaderForRound = (r: RoundDTO) => {
    if (t.type !== 'freeplay') return undefined;
    const l = r.myLeaderId ? leaders?.find((x) => x.id === r.myLeaderId) : undefined;
    return l ? { name: l.name, colors: l.colors, setCode: l.setCode } : undefined;
  };
```

Read the existing function before editing and keep its return shape identical — only the guard and the id resolution change.

- [ ] **Step 3: Format the header date**

Same file, around line 107:

```tsx
          <p className="text-sm text-muted-foreground">{formatPlayedOn(t.playedOn)}</p>
```

Add the `formatPlayedOn` import from `@/lib/format-date`.

**Keep the "Leader: {name}" line.** The header's card art shows the name only in tiny print, so that line is the only legible statement of which leader the tournament was played with.

- [ ] **Step 4: Verify**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: clean, suite green.

```bash
npm run shot -- /tournaments/<a classic tournament id> /tmp/detail.png
npm run shot -- /tournaments/<the freeplay session id> /tmp/detail-freeplay.png
```

Get the ids with:
```bash
node --env-file=.env.local -e "const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL_TEST});p.query('select id,type,name from tournaments').then(r=>console.table(r.rows)).finally(()=>p.end())"
```

Expected: the classic tournament shows its leader **once**, in the header, and its rounds are visibly shorter; the freeplay session still shows each round's own deck; the header date reads `9 Aug 2026`.

- [ ] **Step 5: Commit**

```bash
git add src/components/tournaments/tournament-detail.tsx src/components/tournaments/round-item.tsx
git commit -m "fix(tournaments): show the player's leader once, not on every round"
```

---

### Task 7: By-meta drops its tournament count

**Files:**
- Modify: `src/components/stats/per-meta-stats.tsx:16`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

Observed: Overall reports 2 tournaments while By-meta lists "1 tournament" and "2 tournaments" — summing to 3. Both are correct under the freeplay rules (Overall excludes freeplay, By-meta includes it), but nothing explains that, so the page looks wrong.

- [ ] **Step 1: Show games instead of tournaments**

Replace the metric line:

```tsx
              <span className="text-muted-foreground tabular-nums">
                {formatRecord({ wins: r.wins, losses: r.losses, draws: r.draws })} · {pct(r.winRate)} · {games} {games === 1 ? 'game' : 'games'}
              </span>
```

with `games` derived just above, inside the `rows.map` callback:

```tsx
        {rows.map((r) => {
          const games = r.wins + r.losses + r.draws;
          return (
```

`PerMetaStatDTO` carries `tournaments`, `wins`, `losses`, `draws` and `winRate` but **no `games` field** (`src/lib/dto.ts:34-36`), so it has to be summed here. Do not add a field to the DTO for this — the three components are already on the row, and widening the DTO would mean touching the service and its tests for a display detail. Note the map callback currently returns JSX directly; adding a `const` means converting it to a block body with an explicit `return`.

This removes the invitation to sum to 3 without changing a number, and games is the better denominator anyway — it is what the win rate beside it is computed over.

- [ ] **Step 2: Verify**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: clean, suite green.

```bash
npm run shot -- /stats /tmp/permeta.png
```

Expected: each By-meta row reads like `5-2-1 · 63% · 8 games`, with no tournament count anywhere in that section. Overall still reads 2 tournaments.

- [ ] **Step 3: Commit**

```bash
git add src/components/stats/per-meta-stats.tsx
git commit -m "fix(stats): count games per meta so the totals stop contradicting"
```

---

### Task 8: Pluralise the most-played leader, and level the achievement grid

Two one-line-class fixes with the same character: something reads as unfinished.

**Files:**
- Modify: `src/components/stats/overall-stats.tsx:27`, `src/components/achievements/achievement-card.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: "1 tournaments" → "1 tournament"**

`overall-stats.tsx:27` interpolates the count unconditionally. Give it the same treatment the codebase already uses elsewhere:

```tsx
        <StatCard label="Most-played leader" value={o.mostPlayedLeader ? o.mostPlayedLeader.name : '—'} sub={o.mostPlayedLeader ? `${o.mostPlayedLeader.tournaments} ${o.mostPlayedLeader.tournaments === 1 ? 'tournament' : 'tournaments'}` : undefined} />
```

- [ ] **Step 2: Bottom-align the achievement progress region**

Observed: cards in a grid row stretch to equal height, but the progress bar sits directly under a description of variable length, so bars in the same row land at different heights and rows look ragged. Binary achievements (Perfect Run, Meta Dominator) render nothing there at all, leaving a dead gap.

Make the card a column and push the progress block to the bottom, so every bar in a row aligns on the card's bottom edge:

```tsx
    <Card className={`flex h-full flex-col p-4 ${a.unlocked ? 'border-primary' : 'opacity-70'}`}>
```

and on the progress block, replace `mt-3` with `mt-auto pt-3`:

```tsx
      {!a.unlocked && a.progress && (
        <div className="mt-auto pt-3">
```

`mt-auto` inside a flex column absorbs the leftover space above the block, which is what makes bars line up across a row regardless of description length. A card with no progress simply ends after its description — consistent, rather than a gap in the middle.

- [ ] **Step 3: Verify**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: clean, suite green.

```bash
npm run shot -- /stats /tmp/plural.png
npm run shot -- /achievements /tmp/ach.png
```

Expected: "Most-played leader" reads `1 tournament`; on the achievements grid, a card with a progress bar and one without sit level, with bars aligned along each row.

- [ ] **Step 4: Commit**

```bash
git add src/components/stats/overall-stats.tsx src/components/achievements/achievement-card.tsx
git commit -m "fix(ui): pluralise the tournament count and level the achievement grid"
```

---

### Task 9: Whole-app screenshot pass

The point of this plan is that reasoning missed all of it. This task looks at everything once more, together.

**Files:** none — verification only.

- [ ] **Step 1: Capture every main screen in both themes**

```bash
for spec in "/:list" "/stats:stats" "/achievements:ach" "/settings:settings"; do
  route="${spec%%:*}"; name="${spec##*:}"
  npm run shot -- "$route" "/tmp/final-$name-light.png"
  npm run shot -- "$route" "/tmp/final-$name-dark.png" --dark
done
```

Plus both tournament detail pages (classic and freeplay), using the ids from Task 6.

- [ ] **Step 2: Confirm each fix, and look for what the fixes broke**

Check every item: no hydration errors in any `console errors:` block; dates formatted everywhere; the shuffle icon; set codes surviving truncation; one leader card on a classic detail page and per-round decks on freeplay; games not tournaments in By-meta; "1 tournament"; level achievement rows.

Then look at the screenshots as a whole for anything these changes introduced — a row that now collapses, a card that lost its alignment, spacing that reads wrong now that a repeated element is gone. Report what you see, including anything you are unsure about.

- [ ] **Step 3: Final verification and commit**

Run: `npm run lint && npx tsc --noEmit && npm test && npm run build`
Expected: all clean, 212 tests passing (208 plus Task 2's four).

If Step 2 turned up anything, fix it and note it; otherwise there is nothing to commit here beyond what earlier tasks already did.

---

## Task dependency order

Task 2 must precede Tasks 3 and 6 (they import `formatPlayedOn`). Task 1 should go first so later screenshots are not noisy with hydration errors. Tasks 3, 4, 5, 7 and 8 are mutually independent. Task 9 is last by definition.
