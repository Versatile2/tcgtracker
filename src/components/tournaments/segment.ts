/**
 * The three kinds of thing you can log. Split out from `tournament-list.tsx`
 * so `segmentFromTab` can be unit tested without pulling in the component's
 * `next/navigation` and UI imports — this repo has no infrastructure for
 * rendering client components in tests.
 */
export type Segment = 'tournaments' | 'sessions' | 'matches';

// Stale `?tab=` links — an old bookmark, a cached PWA shell — must still land
// on the renamed segment, so these aliases are permanent, not shims to delete
// later. `freeplay` is the pre-2026-08-19 value and is deliberately the one
// place in `src/` that still spells the retired word; `session-guard.test.ts`
// allows it by name.
export function segmentFromTab(tab: string | null | undefined): Segment {
  if (tab === 'matches') return 'matches';
  if (tab === 'sessions' || tab === 'freeplay') return 'sessions';
  return 'tournaments';
}
