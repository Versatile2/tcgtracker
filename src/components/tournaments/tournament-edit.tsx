'use client';
import { useRouter } from 'next/navigation';
import { NavBar } from '@/components/nav/nav-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { useTournament } from '@/components/query-hooks';
import { TournamentForm } from './tournament-form';
import { isSession } from '@/lib/tournament-kinds';

/**
 * Loads a tournament, then hands it to the form that created it.
 *
 * A locked tournament is not editable — the detail screen does not offer the
 * button, and this refuses the route as well, so a stale link or a back button
 * cannot walk around it.
 */
export function TournamentEdit({ id }: { id: string }) {
  const router = useRouter();
  const { data, isLoading, isError } = useTournament(id);
  const back = () => router.push(`/tournaments/${id}`);

  if (isLoading) {
    return (
      <>
        <NavBar backLabel="Back" onBack={back} />
        <main className="mx-auto max-w-xl p-4"><Skeleton className="h-40 w-full" /></main>
      </>
    );
  }

  if (isError || !data) {
    return (
      <>
        <NavBar backLabel="Back" onBack={back} />
        <main className="mx-auto max-w-xl p-4"><p className="text-destructive">Couldn’t load this tournament.</p></main>
      </>
    );
  }

  if (data.status === 'locked') {
    return (
      <>
        <NavBar backLabel="Back" onBack={back} />
        <main className="mx-auto max-w-xl space-y-3 p-4">
          <p className="text-sm text-muted-foreground">
            This {isSession(data.type) ? 'session' : 'tournament'} is finished. Reopen it to make changes.
          </p>
        </main>
      </>
    );
  }

  return <TournamentForm initial={data} />;
}
