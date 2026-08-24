'use client';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { NavBar } from '@/components/nav/nav-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { useTournaments, useLeaders, useMetas } from '@/components/query-hooks';
import { useIsMounted } from '@/lib/use-is-mounted';
import { statsForSegment } from '@/lib/stats/segment-stats';
import { logKind } from '@/lib/log-kinds';
import { formatRecord } from '@/lib/record';
import { ChartCard } from './chart-card';
import { pct } from './stat-card';
import type { Segment } from '@/components/tournaments/segment';

/**
 * One game type, broken down four ways.
 *
 * Everything here is computed from the caches the app already holds, so it is
 * instant on arrival and works with no signal — which is when a player is most
 * likely to be reading it, between rounds at a venue.
 */
export function SegmentPage({ segment }: { segment: Segment }) {
  const router = useRouter();
  const mounted = useIsMounted();
  const { data: tournaments, isLoading } = useTournaments();
  const { data: leaders } = useLeaders();
  const { data: metas } = useMetas();
  const kind = logKind(segment);

  const stats = useMemo(
    () => statsForSegment(tournaments ?? [], leaders ?? [], metas ?? [], segment),
    [tournaments, leaders, metas, segment],
  );

  const ready = mounted && !isLoading;

  return (
    <>
      <NavBar backLabel="Statistics" onBack={() => router.push('/stats')} />
      <main className="mx-auto max-w-xl p-4 pb-24">
        {/* Plural: the page is about every tournament, not one of them. */}
        <h1 className="text-3xl font-bold tracking-tight capitalize">{kind.plural}</h1>

        {!ready ? (
          <div className="mt-4 space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-48 w-full" /></div>
        ) : stats.games === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
            Nothing logged here yet. {kind.blurb}
          </p>
        ) : (
          <>
            <p className="mt-1 text-muted-foreground">
              <span className="tabular-nums">{formatRecord(stats)}</span> · {pct(stats.winRate)} ·{' '}
              <span className="tabular-nums">{stats.games}</span> {stats.games === 1 ? 'game' : 'games'} across{' '}
              <span className="tabular-nums">{stats.events}</span> {stats.events === 1 ? kind.noun : kind.plural}
            </p>

            <div className="mt-4 space-y-4">
              <ChartCard
                title="Colours faced"
                rows={stats.byColorFaced}
                coverage={stats.colorsBeaten}
                coverageCaption="beaten"
                empty="No opponents recorded yet."
              />
              <ChartCard
                title="My colours"
                rows={stats.byMyColor}
                empty="No decks recorded yet."
              />
              <ChartCard
                title="By meta"
                rows={stats.byMeta}
                coverage={stats.metasPlayed}
                coverageCaption="metas"
                empty="No metas recorded yet."
              />
              {/* Free play is a single type, so a donut of it would be one slice
                  saying nothing. The card is omitted rather than drawn empty. */}
              {segment !== 'matches' && (
                <ChartCard
                  title="By type"
                  rows={stats.byType}
                  coverage={stats.typesPlayed}
                  coverageCaption="types"
                  empty="Nothing logged yet."
                />
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}
