import { chartColorVar, rampColorVar } from '@/lib/stats/chart-colors';
import type { Breakdown } from '@/lib/stats/segment-stats';

/**
 * A donut of shares, with a headline in the hole.
 *
 * Hand-rolled SVG rather than a charting library: the app needs donuts and bars
 * and nothing else, a library costs more than the feature on a phone, and the
 * share cards render to canvas, which libraries make harder.
 *
 * **The legend beside this is its key, and the two must agree.** They did not:
 * a multi-colour slice used to be painted with a `linearGradient`, which is
 * defined in object bounding-box space — the whole 120×120 square — so the
 * colour a slice received depended on where it sat on the ring rather than on
 * the deck it represented. "All six" rendered as a plain grey arc,
 * indistinguishable from Red/Black beside it, and neither matched its swatch.
 *
 * So there are no gradients here. A slice with k colours is drawn as k
 * sub-arcs of equal angular width, in the deck's own colour order. A Purple/Red
 * slice really is half purple and half red along the ring, which is exactly what
 * its legend swatch shows.
 *
 * The 2px surface gap falls only at the end of a *row*, never between the
 * sub-arcs inside one — a gap mid-slice would read as two decks.
 */

const SIZE = 120;
const R = 52;
const STROKE = 16;
const CIRCUMFERENCE = 2 * Math.PI * R;
const GAP = 2;

export function Donut({
  rows,
  center,
  label,
}: {
  /** Exactly the rows the legend lists. Fold before passing, not after. */
  rows: Breakdown[];
  center?: { value: string; caption: string };
  label: string;
}) {
  const total = rows.reduce((n, r) => n + r.games, 0);

  if (total === 0) {
    return (
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-[120px] shrink-0" role="img" aria-label={`${label}: nothing logged yet`}>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--muted)" strokeWidth={STROKE} />
        {center && <CenterText value="—" caption={center.caption} />}
      </svg>
    );
  }

  // Each arc's start is derived from the rows before it rather than accumulated
  // into a running variable: the React Compiler rejects reassigning a value
  // captured by a render closure, and with at most nine rows this costs nothing.
  const arcs = rows.flatMap((r, i) => {
    const before = rows.slice(0, i).reduce((n, x) => n + x.games, 0) / total;
    const span = r.games / total;
    // A row with no colours of its own — a meta, a tournament type — takes one
    // step of the accent ramp, matching the swatch the legend gives it.
    const colors = r.colors.length > 0 ? r.colors : [null];
    return colors.map((color, j) => {
      const sub = span / colors.length;
      const isLast = j === colors.length - 1;
      return {
        key: `${r.key}-${color ?? 'ramp'}`,
        stroke: color ? chartColorVar(color) : rampColorVar(i, rows.length),
        dash: Math.max(0, sub * CIRCUMFERENCE - (isLast ? GAP : 0)),
        offset: (before + sub * j) * CIRCUMFERENCE,
      };
    });
  });

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-[120px] shrink-0" aria-hidden>
      <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
        {arcs.map((a) => (
          <circle
            key={a.key}
            cx={SIZE / 2} cy={SIZE / 2} r={R}
            fill="none"
            stroke={a.stroke}
            strokeWidth={STROKE}
            strokeDasharray={`${a.dash} ${CIRCUMFERENCE - a.dash}`}
            strokeDashoffset={-a.offset}
          />
        ))}
      </g>
      {center && <CenterText value={center.value} caption={center.caption} />}
    </svg>
  );
}

function CenterText({ value, caption }: { value: string; caption: string }) {
  return (
    <>
      {/* Text wears text tokens, never a series colour — the ring carries identity. */}
      <text x={SIZE / 2} y={SIZE / 2 - 2} textAnchor="middle" dominantBaseline="middle"
        className="fill-foreground text-[1.4rem] font-bold tabular-nums">{value}</text>
      <text x={SIZE / 2} y={SIZE / 2 + 16} textAnchor="middle" dominantBaseline="middle"
        className="fill-muted-foreground text-[0.5rem] uppercase tracking-wide">{caption}</text>
    </>
  );
}
