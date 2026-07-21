'use client';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { useStats } from '@/components/query-hooks';
import { OverallStats } from './overall-stats';
import { PerSetStats } from './per-set-stats';
import { MatchupStats } from './matchup-stats';

export function StatsView() {
  const { data, isLoading, isError } = useStats();

  return (
    <main className="mx-auto max-w-xl space-y-6 p-4 pb-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Statistics</h1>
        <Link href="/" className="text-sm text-muted-foreground">← Home</Link>
      </div>

      {isLoading && <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>}
      {isError && <p className="text-destructive">Couldn’t load statistics.</p>}
      {data && data.overall.totalTournaments === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          No stats yet — log a tournament to get started.
        </div>
      )}
      {data && data.overall.totalTournaments > 0 && (
        <>
          <OverallStats o={data.overall} />
          <PerSetStats rows={data.perSet} />
          <MatchupStats leaders={data.playedLeaders} />
        </>
      )}
    </main>
  );
}
