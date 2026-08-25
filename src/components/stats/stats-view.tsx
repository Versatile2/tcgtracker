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
import { FormStrip } from './form-strip';
import { formStrip, streaks } from '@/lib/stats/form';
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
 * Everything that was here has moved. Overall and per-meta went first, then
 * by-opponent and the matchup explorer: each of them asks a question that is
 * really per game type, and answering it across all three at once mixed a
 * player's tournament record in with their testing games. What is left is the
 * only thing that is genuinely about all of them — who you are — and the way in.
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

  /*
   * The overall record, shown to the player.
   *
   * The app already computed this — `useStats().data.overall` — and used it for
   * exactly one thing: rendering the image you post. The screen itself showed
   * three rows to add up by hand under a hero reading "Level 3". It is computed
   * here instead of read from the server so it cannot disagree with the numbers
   * beside it after a round logged offline.
   */
  const overall = useMemo(() => {
    const wins = perSegment.reduce((n, s) => n + s.stats.wins, 0);
    const losses = perSegment.reduce((n, s) => n + s.stats.losses, 0);
    const draws = perSegment.reduce((n, s) => n + s.stats.draws, 0);
    const games = wins + losses + draws;
    return { wins, losses, draws, games, winRate: games > 0 ? wins / games : 0 };
  }, [perSegment]);

  const time = useMemo(() => ({
    form: formStrip(tournaments ?? [], 'all'),
    streak: streaks(tournaments ?? [], 'all'),
  }), [tournaments]);

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
            <section className="space-y-3">
              <p className="text-3xl font-bold tabular-nums">
                {formatRecord(overall)}
                <span className="ml-2 text-lg font-medium text-muted-foreground">{pct(overall.winRate)}</span>
              </p>
              <p className="-mt-2 text-sm text-muted-foreground tabular-nums">
                {overall.games} {overall.games === 1 ? 'game' : 'games'} all told
              </p>
              <FormStrip form={time.form} streak={time.streak} />
            </section>

            <PlayerCard />

            <section className="space-y-2">
              <h2 className="text-lg font-semibold">By game type</h2>
              {perSegment.map(({ kind, stats }) => (
                <Link
                  key={kind.key}
                  href={`/stats/${kind.key}`}
                  className="flex items-center gap-3 rounded-xl border p-3 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary-ink">
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
