'use client';
import { Donut } from './donut';
import { pct } from './stat-card';
import { chartColorVar, rampColorVar } from '@/lib/stats/chart-colors';
import { formatRecord } from '@/lib/record';
import { isThin } from '@/lib/stats/headline';
import { foldTail, qualifiesForDonut, type Breakdown, type Coverage } from '@/lib/stats/segment-stats';

/**
 * One dimension of a segment: its shape, and the rows behind it.
 *
 * The chart is drawn only when it has something to divide — otherwise the same
 * data is a list of bars, which reads better and costs less height than a ring
 * with one slice in it.
 *
 * **The legend is the chart's key, so both are built from the same array.** They
 * were not: the ring was folded to eight rows while the legend listed all of
 * them, so a folded `Other (n)` slice had no legend entry at all, and the accent
 * ramp was indexed against two different lengths, tinting every swatch
 * differently from its slice. One array now feeds both.
 *
 * A row with no games is still listed, greyed. A gap in what you have faced is
 * the most actionable thing on the page, and deleting the empty row hides it.
 */

/** Beyond this the ring stops being readable. */
const MAX_SLICES = 8;

export function ChartCard({
  title,
  rows,
  coverage,
  coverageCaption,
  empty,
}: {
  title: string;
  rows: Breakdown[];
  coverage?: Coverage;
  coverageCaption?: string;
  empty: string;
}) {
  const played = rows.filter((r) => r.games > 0);
  const shown = foldTail(played, MAX_SLICES);
  const unplayed = rows.filter((r) => r.games === 0);
  const asDonut = qualifiesForDonut(shown);
  const games = played.reduce((n, r) => n + r.games, 0);

  return (
    <section className="rounded-2xl border p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {coverage && (
          <span className="text-sm tabular-nums text-muted-foreground">
            {coverage.seen}{coverage.total !== null && ` / ${coverage.total}`}
          </span>
        )}
      </div>

      {played.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      ) : asDonut ? (
        <div className="mt-3 flex items-center gap-4">
          <Donut
            rows={shown}
            label={title}
            center={coverage
              ? { value: coverage.total !== null ? `${coverage.seen}/${coverage.total}` : String(coverage.seen), caption: coverageCaption ?? '' }
              : { value: String(games), caption: games === 1 ? 'game' : 'games' }}
          />
          <ul className="min-w-0 flex-1 space-y-1.5">
            {[...shown, ...unplayed].map((r, i) => <Row key={r.key} row={r} index={i} count={shown.length} />)}
          </ul>
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {[...shown, ...unplayed].map((r, i) => (
            <Row key={r.key} row={r} index={i} count={shown.length} bar={games > 0 ? r.games / games : 0} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({ row, index, count, bar }: { row: Breakdown; index: number; count: number; bar?: number }) {
  const thin = row.games > 0 && isThin(row.games);
  return (
    <li className={row.games === 0 ? 'opacity-45' : undefined}>
      <div className="flex items-center gap-2 text-sm">
        <Swatch colors={row.colors} rampIndex={index} rampCount={count} />
        {/* Wraps rather than truncating: "Green / Yellow" cut to "Green / Yell…"
            costs the reader the second colour, which is the whole label. */}
        <span className="min-w-0 flex-1 break-words">{row.label}</span>
        <span className="shrink-0 tabular-nums">
          <span className={thin ? 'text-muted-foreground/70' : 'font-medium'}>{formatRecord(row)}</span>
          {row.games > 0
            ? <span className="text-muted-foreground"> · {pct(row.winRate)}</span>
            : <span className="text-muted-foreground"> · —</span>}
        </span>
      </div>
      {bar !== undefined && row.games > 0 && (
        <div className="mt-1 ml-5 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full" style={{ width: `${bar * 100}%`, background: swatchBackground(row.colors, index, count) }} />
        </div>
      )}
      {/* Stated, not implied: a record this short is not yet a pattern, and the
          reader should know that before they act on it. */}
      {thin && <p className="ml-5 text-xs text-muted-foreground">{row.games} {row.games === 1 ? 'game' : 'games'} — too early to call</p>}
    </li>
  );
}

/** The paint a row's mark and bar share, so the list reads as one key. */
function swatchBackground(colors: string[], rampIndex: number, rampCount: number): string {
  if (colors.length === 0) return rampColorVar(rampIndex, rampCount);
  if (colors.length === 1) return chartColorVar(colors[0]);
  return `linear-gradient(135deg, ${colors.map((c, i, all) =>
    `${chartColorVar(c)} ${(i / all.length) * 100}%, ${chartColorVar(c)} ${((i + 1) / all.length) * 100}%`).join(', ')})`;
}

function Swatch({ colors, rampIndex, rampCount }: { colors: string[]; rampIndex: number; rampCount: number }) {
  return <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: swatchBackground(colors, rampIndex, rampCount) }} />;
}
