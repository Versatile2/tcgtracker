'use client';
import { pct } from './stat-card';
import { formatRecord } from '@/lib/record';
import { leaderImageUrl, leaderBackground } from '@/lib/leader-visual';
import { useLeaders } from '@/components/query-hooks';
import { useLeaderArt } from '@/components/leaders/leader-art-provider';
import { THIN, turnOrderIsMeaningful, type Headline } from '@/lib/stats/headline';

/**
 * The finding, stated — the first thing on the page that is an answer rather
 * than a number.
 *
 * Before this, a reader standing between rounds had to assemble "my worst
 * matchup is Kaido at 1-4" themselves from four cards and roughly three phone
 * screens of scrolling. The data was all there; the conclusion was not.
 *
 * Worst leads because it is the actionable one: a matchup you lose is a deck
 * decision, a matchup you win is a pat on the back.
 *
 * The opponent's own card art sits behind it at low contrast. That is not
 * decoration for its own sake — it is the one thing on this surface that could
 * only belong to this product, and the clean scans that make it usable only
 * arrived recently. It falls back to the leader's colour field when no clean
 * scan exists, the same rule `getLeaderImage` already applies everywhere else.
 */
export function HeadlineCard({ headline }: { headline: Headline }) {
  const { data: leaders } = useLeaders();
  const { imageIdFor } = useLeaderArt();
  const { worst, best, turnOrder } = headline;

  // Nothing has enough games behind it to be a finding. Say that, rather than
  // promoting a 1-0 into a claim the app would have to retract.
  if (!worst) {
    return (
      <section className="rounded-2xl border border-dashed p-4">
        <h2 className="text-base font-semibold">No verdicts yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Matchups need {THIN} games before they mean anything. Keep logging and this
          will tell you which decks to worry about.
        </p>
      </section>
    );
  }

  const leader = leaders?.find((l) => l.id === worst.leaderId);
  const art = leaderImageUrl(imageIdFor(leader?.id));

  return (
    <section className="relative overflow-hidden rounded-2xl border p-4">
      {/* Behind the text, never competing with it: the art is context, and the
          numbers are the content. */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-2/5" aria-hidden>
        {art
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={art} alt="" className="size-full object-cover opacity-15" />
          : <div className="size-full opacity-15" style={{ background: leaderBackground(leader?.colors) }} />}
        <div className="absolute inset-0 bg-gradient-to-r from-card via-card/70 to-transparent" />
      </div>

      <div className="relative">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your worst matchup</h2>
        <p className="mt-1 text-2xl font-bold break-words">{worst.name}</p>
        <p className="mt-0.5 text-sm tabular-nums">
          <span className="font-semibold">{formatRecord(worst)}</span>
          <span className="text-muted-foreground"> · {pct(worst.winRate)} over {worst.games} games</span>
        </p>

        <dl className="mt-3 space-y-1 text-sm">
          {best && (
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted-foreground">Best</dt>
              <dd className="tabular-nums">
                <span className="font-medium">{best.name}</span>
                <span className="text-muted-foreground"> {formatRecord(best)} · {pct(best.winRate)}</span>
              </dd>
            </div>
          )}
          {/* Stated only when both sides are evidenced and actually differ —
              otherwise it is two small numbers pretending to be a habit. */}
          {turnOrder && turnOrderIsMeaningful(turnOrder) && (
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted-foreground">
                Better on the {turnOrder.first.winRate > turnOrder.second.winRate ? 'play' : 'draw'}
              </dt>
              <dd className="tabular-nums text-muted-foreground">
                {pct(turnOrder.first.winRate)} first · {pct(turnOrder.second.winRate)} second
              </dd>
            </div>
          )}
        </dl>
      </div>
    </section>
  );
}
