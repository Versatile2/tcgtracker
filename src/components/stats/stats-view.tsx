'use client';
import { useState } from 'react';
import { LargeTitleScreen } from '@/components/nav/large-title-screen';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useStats } from '@/components/query-hooks';
import { OverallStats } from './overall-stats';
import { PerMetaStats } from './per-meta-stats';
import { OpponentStats } from './opponent-stats';
import { MatchupStats } from './matchup-stats';
import { ShareDialog } from '@/components/share/share-dialog';
import { StatsShareCard } from '@/components/share/stats-share-card';
import { shareFilename } from '@/lib/share-image';

export function StatsView() {
  const { data, isLoading, isError } = useStats();
  const [shareOpen, setShareOpen] = useState(false);

  return (
    <LargeTitleScreen
      title="Statistics"
      action={
        data && data.overall.totalTournaments > 0 ? (
          <Button variant="outline" onClick={() => setShareOpen(true)} className="h-11 px-4">Share</Button>
        ) : undefined
      }
    >
      <div className="mt-4 space-y-6">
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
            <PerMetaStats rows={data.perMeta ?? []} />
            <OpponentStats rows={data.opponents ?? []} />
            <MatchupStats leaders={data.playedLeaders ?? []} />
          </>
        )}

        {data && (
          <ShareDialog open={shareOpen} onOpenChange={setShareOpen} title="Share stats" filename={shareFilename('stats', 'my-stats')}>
            <StatsShareCard overall={data.overall} />
          </ShareDialog>
        )}
      </div>
    </LargeTitleScreen>
  );
}
