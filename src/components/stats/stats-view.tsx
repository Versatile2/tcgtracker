'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { LargeTitleScreen } from '@/components/nav/large-title-screen';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useStats, useTournaments, useLeaders, useMetas } from '@/components/query-hooks';
import { useIsMounted } from '@/lib/use-is-mounted';
import { statsForSegment } from '@/lib/stats/segment-stats';
import { LOG_KINDS } from '@/lib/log-kinds';
import { formatRecord } from '@/lib/record';
import { PlayerCard } from './player-card';
import { OpponentStats } from './opponent-stats';
import { MatchupStats } from './matchup-stats';
import { pct } from './stat-card';
import { ShareDialog } from '@/components/share/share-dialog';
import { StatsShareCard } from '@/components/share/stats-share-card';
import { shareFilename } from '@/lib/share-image';

/**
 * The way in to statistics: who you are, then one row per kind of game.
 *
 * The three rows are the whole navigation. Each carries the record for that kind
 * so the overview answers "how am I doing?" on its own, and opens the page that
 * answers "at what?".
 *
 * Overall and per-meta used to be rendered here from `/api/stats`. They are
 * per-game-type questions and have moved into the pages, computed from the
 * cache. By-opponent and the matchup explorer still come from the server and
 * still sit here; scoping those per type is the next slice, not this one.
 */
export function StatsView() {
  const { data } = useStats();
  const { data: tournaments, isLoading } = useTournaments();
  const { data: leaders } = useLeaders();
  const { data: metas } = useMetas();
  const mounted = useIsMounted();
  const [shareOpen, setShareOpen] = useState(false);

  const perSegment = useMemo(
    () => LOG_KINDS.map((kind) => ({
      kind,
      stats: statsForSegment(tournaments ?? [], leaders ?? [], metas ?? [], kind.key),
    })),
    [tournaments, leaders, metas],
  );

  const ready = mounted && !isLoading;
  const anyGames = perSegment.some((s) => s.stats.games > 0);

  return (
    <LargeTitleScreen
      title="Statistics"
      action={
        anyGames ? <Button variant="outline" onClick={() => setShareOpen(true)} className="h-11 px-4">Share</Button> : undefined
      }
    >
      <div className="mt-4 space-y-6">
        {!ready && <div className="space-y-3"><Skeleton className="h-28 w-full" /><Skeleton className="h-40 w-full" /></div>}

        {ready && !anyGames && (
          <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
            No stats yet — log a game to get started.
          </div>
        )}

        {ready && anyGames && (
          <>
            <PlayerCard />

            <section className="space-y-2">
              <h2 className="text-lg font-semibold">By game type</h2>
              {perSegment.map(({ kind, stats }) => (
                <Link
                  key={kind.key}
                  href={`/stats/${kind.key}`}
                  className="flex items-center gap-3 rounded-xl border p-3 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                    <kind.icon className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold capitalize">{kind.plural}</span>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {stats.games === 0
                        ? 'Nothing logged yet'
                        : <>{formatRecord(stats)} · {pct(stats.winRate)} · {stats.games} {stats.games === 1 ? 'game' : 'games'}</>}
                    </span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              ))}
            </section>

            <OpponentStats rows={data?.opponents ?? []} />
            <MatchupStats leaders={data?.playedLeaders ?? []} />
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
