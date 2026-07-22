'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useStats } from '@/components/query-hooks';
import { OverallStats } from './overall-stats';
import { PerSetStats } from './per-set-stats';
import { MatchupStats } from './matchup-stats';
import { ShareDialog } from '@/components/share/share-dialog';
import { StatsShareCard } from '@/components/share/stats-share-card';
import { shareFilename } from '@/lib/share-image';

export function StatsView() {
  const { data, isLoading, isError } = useStats();
  const [shareOpen, setShareOpen] = useState(false);

  return (
    <main className="mx-auto max-w-xl space-y-6 p-4 pb-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Statistics</h1>
        <div className="flex items-center gap-3">
          {data && data.overall.totalTournaments > 0 && (
            <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>Share</Button>
          )}
          <Link href="/" className="text-sm text-muted-foreground">← Home</Link>
        </div>
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

      {data && (
        <ShareDialog open={shareOpen} onOpenChange={setShareOpen} title="Share stats" filename={shareFilename('stats', 'my-stats')}>
          <StatsShareCard overall={data.overall} />
        </ShareDialog>
      )}
    </main>
  );
}
