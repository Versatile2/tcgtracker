import { pct } from '@/components/stats/stat-card';
import { formatRecord } from '@/lib/record';
import type { SegmentStats } from '@/lib/stats/segment-stats';
import type { Headline } from '@/lib/stats/headline';

/**
 * What is actually on screen, as a shareable card.
 *
 * The only share on this surface used to live on the overview and post every
 * game type mixed together — so a player looking at a clean tournament record
 * had no way to share the thing they were looking at, which is the cheapest
 * growth loop this product has.
 *
 * It carries the headline rather than only the totals, because the matchup is
 * the interesting part and the part nobody else's tracker can produce.
 */
export function SegmentShareCard({
  title,
  stats,
  headline,
}: {
  title: string;
  stats: SegmentStats;
  headline: Headline;
}) {
  return (
    <div className="w-[380px] space-y-4 rounded-xl border bg-card p-5 text-card-foreground">
      <p className="text-sm font-medium text-muted-foreground">My {title.toLowerCase()}</p>
      <p className="text-4xl font-bold tabular-nums">
        {formatRecord(stats)}
        <span className="ml-2 text-xl font-medium text-muted-foreground">{pct(stats.winRate)}</span>
      </p>
      <p className="-mt-2 text-sm text-muted-foreground tabular-nums">
        {stats.games} {stats.games === 1 ? 'game' : 'games'} · {stats.events} {stats.events === 1 ? 'event' : 'events'}
      </p>

      {headline.worst && (
        <div className="rounded-lg border p-3 text-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Toughest matchup</p>
          <p className="mt-0.5 font-semibold">{headline.worst.name}</p>
          <p className="text-muted-foreground tabular-nums">
            {formatRecord(headline.worst)} · {pct(headline.worst.winRate)}
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {stats.colorsBeaten.seen} of {stats.colorsBeaten.total} colours beaten · Grand Line TCG
      </p>
    </div>
  );
}
