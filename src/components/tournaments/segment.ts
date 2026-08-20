/**
 * The three kinds of thing you can log. Split out from `tournament-list.tsx`
 * so `segmentFromTab` can be unit tested without pulling in the component's
 * `next/navigation` and UI imports — this repo has no infrastructure for
 * rendering client components in tests.
 */
export type Segment = 'tournaments' | 'sessions' | 'matches';

// A stale `?tab=freeplay` link — an old bookmark, a cached PWA shell — must
// still land on the renamed segment, so the alias is permanent, not a shim to
// delete later.
export function segmentFromTab(tab: string | null | undefined): Segment {
  if (tab === 'matches') return 'matches';
  if (tab === 'sessions' || tab === 'freeplay') return 'sessions';
  return 'tournaments';
}
