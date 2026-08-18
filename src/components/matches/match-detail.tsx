'use client';
import { useRouter } from 'next/navigation';
import { NavBar } from '@/components/nav/nav-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { useTournament } from '@/components/query-hooks';
import { MatchForm } from './match-form';

/**
 * Loads a match, then hands it to the same form that created it — editing a
 * single game is the same act as logging one, so it is the same screen.
 *
 * A match always has exactly one round (the server refuses a second), but a
 * create still in the outbox can be read back before its round has been applied
 * locally, so an empty `rounds` is treated as still loading rather than as an
 * error.
 */
export function MatchDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data, isLoading, isError } = useTournament(id);

  if (isLoading || (data && data.rounds.length === 0 && !isError)) {
    return (
      <>
        <NavBar backLabel="Back" onBack={() => router.push('/?tab=matches')} />
        <main className="mx-auto max-w-xl p-4"><Skeleton className="h-40 w-full" /></main>
      </>
    );
  }

  if (isError || !data) {
    return (
      <>
        <NavBar backLabel="Back" onBack={() => router.push('/?tab=matches')} />
        <main className="mx-auto max-w-xl p-4"><p className="text-destructive">Couldn’t load this match.</p></main>
      </>
    );
  }

  return <MatchForm initial={data} />;
}
