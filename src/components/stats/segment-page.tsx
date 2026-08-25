'use client';
import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { NavBar } from '@/components/nav/nav-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { useTournaments, useLeaders, useMetas } from '@/components/query-hooks';
import { useIsMounted } from '@/lib/use-is-mounted';
import { statsForSegment } from '@/lib/stats/segment-stats';
import { logKind } from '@/lib/log-kinds';
import { formatRecord } from '@/lib/record';
import { ChartCard } from './chart-card';
import { OpponentStats } from './opponent-stats';
import { MatchupStats } from './matchup-stats';
import { FormStrip } from './form-strip';
import { HeadlineCard } from './headline-card';
import { TrendCard } from './trend-card';
import { formStrip, streaks, trendByMonth } from '@/lib/stats/form';
import { Button } from '@/components/ui/button';
import { ShareDialog } from '@/components/share/share-dialog';
import { SegmentShareCard } from '@/components/share/segment-share-card';
import { shareFilename } from '@/lib/share-image';
import { headlineFrom } from '@/lib/stats/headline';
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
  const time = useMemo(() => ({
    form: formStrip(tournaments ?? [], segment),
    streak: streaks(tournaments ?? [], segment),
    trend: trendByMonth(tournaments ?? [], segment),
  }), [tournaments, segment]);
  const headline = useMemo(() => headlineFrom(stats, stats.turnOrder), [stats]);
  const [shareOpen, setShareOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const ready = mounted && !isLoading;

  return (
    <>
      <NavBar backLabel="Statistics" onBack={() => router.push('/stats')} />
      <main className="mx-auto max-w-xl p-4 pb-24">
        <div className="flex items-start justify-between gap-3">
          {/* Plural: the page is about every tournament, not one of them. */}
          <h1 className="text-3xl font-bold tracking-tight capitalize">{kind.plural}</h1>
          {ready && stats.games > 0 && (
            <Button variant="outline" onClick={() => setShareOpen(true)} className="h-11 shrink-0 px-4">Share</Button>
          )}
        </div>

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

            <div className="mt-3">
              <FormStrip form={time.form} streak={time.streak} />
            </div>

            <div className="mt-4 space-y-4">
              {/* The answer, then the evidence for it. */}
              <HeadlineCard headline={headline} />

              {/* The product's stated first edge, no longer at the bottom of the
                  page behind an empty select. */}
              <MatchupStats
                tournaments={tournaments ?? []}
                leaders={leaders ?? []}
                segment={segment}
                playedLeaders={stats.playedLeaders}
              />

              <TrendCard points={time.trend} />

              <ChartCard
                title="Colours faced"
                rows={stats.byColorFaced}
                coverage={stats.colorsBeaten}
                coverageCaption="beaten"
                empty="No opponents recorded yet."
              />
              {/* Behind a disclosure, deliberately.
                  "Colours faced" stays open because it is the richest breakdown
                  and the one only this product can produce. The other three
                  answer follow-up questions, and leaving all four open cost 574px
                  on a page whose first complaint was that it never ends. The
                  reader who wants them is one tap away; the reader between rounds
                  never scrolls past the answer. */}
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setMoreOpen((v) => !v)}
                  aria-expanded={moreOpen}
                  className="flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl border border-dashed px-4 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  More breakdowns
                  <ChevronDown className={`size-4 shrink-0 transition-transform ${moreOpen ? 'rotate-180' : ''}`} aria-hidden />
                </button>

                {moreOpen && (
                  <>
                    <ChartCard title="My colours" rows={stats.byMyColor} empty="No decks recorded yet." />
                    <ChartCard
                      title="By meta"
                      rows={stats.byMeta}
                      coverage={stats.metasPlayed}
                      coverageCaption="metas"
                      empty="No metas recorded yet."
                    />
                    {/* Free play is a single type, so a donut of it would be one
                        slice saying nothing. */}
                    {segment !== 'matches' && (
                      <ChartCard
                        title="By type"
                        rows={stats.byType}
                        coverage={stats.typesPlayed}
                        coverageCaption="types"
                        empty="Nothing logged yet."
                      />
                    )}
                  </>
                )}
              </div>

              <OpponentStats rows={stats.byOpponent} />
            </div>
          </>
        )}
        {ready && stats.games > 0 && (
          <ShareDialog
            open={shareOpen}
            onOpenChange={setShareOpen}
            title={`Share ${kind.plural}`}
            filename={shareFilename('stats', kind.key)}
          >
            <SegmentShareCard title={kind.plural} stats={stats} headline={headline} />
          </ShareDialog>
        )}
      </main>
    </>
  );
}
