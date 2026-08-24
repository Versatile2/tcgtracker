'use client';
import { Donut } from './donut';
import { pct } from './stat-card';
import { chartColorVar, rampColorVar } from '@/lib/stats/chart-colors';
import { formatRecord } from '@/lib/record';
import { foldTail, type Breakdown, type Coverage } from '@/lib/stats/segment-stats';

/**
 * One dimension of a segment: a donut of shares, and the rows behind it.
 *
 * The list is the point. It carries every row, its record and its win rate,
 * while the chart shows only the largest few — so the shape is readable at a
 * glance and nothing is hidden from the reader who wants the numbers.
 *
 * A row with no games is still listed, greyed, reading "0-0 —". A gap in what
 * you have faced is the most actionable thing on the page, and deleting the
 * empty row would hide exactly that.
 */

/** Beyond this the ring stops being a chart. The list keeps every row. */
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
  /** The headline in the hole, when the dimension has something to complete. */
  coverage?: Coverage;
  coverageCaption?: string;
  empty: string;
}) {
  const played = rows.filter((r) => r.games > 0);
  const sliced = foldTail(played, MAX_SLICES);

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
      ) : (
        <div className="mt-3 flex items-center gap-4">
          <Donut
            rows={sliced}
            label={title}
            center={coverage
              ? { value: coverage.total !== null ? `${coverage.seen}/${coverage.total}` : String(coverage.seen), caption: coverageCaption ?? '' }
              : { value: String(played.reduce((n, r) => n + r.games, 0)), caption: 'games' }}
          />
          <ul className="min-w-0 flex-1 space-y-1.5">
            {rows.map((r, i) => (
              <li key={r.key} className={r.games === 0 ? 'opacity-45' : undefined}>
                <div className="flex items-center gap-2 text-sm">
                  <Swatch colors={r.colors} rampIndex={i} rampCount={rows.length} />
                  <span className="min-w-0 flex-1 truncate">{r.label}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatRecord(r)}{r.games > 0 && <> · {pct(r.winRate)}</>}
                    {r.games === 0 && <> · —</>}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * The identity mark beside a row's name. Hollow when the row has no colours of
 * its own — a meta or a tournament type is not a colour, and inventing one would
 * imply a meaning the data does not carry.
 */
function Swatch({ colors, rampIndex, rampCount }: { colors: string[]; rampIndex: number; rampCount: number }) {
  // The legend mark must match the slice, or the list stops being the chart's key.
  if (colors.length === 0) {
    return <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: rampColorVar(rampIndex, rampCount) }} />;
  }
  const background = colors.length === 1
    ? chartColorVar(colors[0])
    : `linear-gradient(135deg, ${colors.map((c, i, all) =>
        `${chartColorVar(c)} ${(i / all.length) * 100}%, ${chartColorVar(c)} ${((i + 1) / all.length) * 100}%`).join(', ')})`;
  return <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background }} />;
}
