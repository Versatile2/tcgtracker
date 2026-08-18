import { Suspense } from 'react';
import { TournamentList } from '@/components/tournaments/tournament-list';

export default function HomePage() {
  // The list reads ?tab to land on the segment you just logged into, and
  // useSearchParams needs a boundary in a prerendered route.
  return (
    <Suspense>
      <TournamentList />
    </Suspense>
  );
}
