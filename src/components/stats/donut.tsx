import { Fragment } from 'react';
import { chartColorVar, sliceFill, rampColorVar } from '@/lib/stats/chart-colors';
import type { Breakdown } from '@/lib/stats/segment-stats';

/**
 * A donut of shares, with a headline in the hole.
 *
 * Hand-rolled SVG rather than a charting library: the app needs donuts and bars
 * and nothing else, a library costs more than the feature on a phone, and the
 * share cards render to canvas, which libraries make harder.
 *
 * **The chart is decoration.** It is `aria-hidden`, and the legend list beside it
 * is the real content — every slice is named and carries its record there. That
 * is not only for screen readers: two of the six colours fall under 3:1 against
 * the page, and the validator's rule is that a contrast warning obliges visible
 * labels. The labels are what make the palette legal.
 *
 * Slices are separated by a 2px gap of surface, so adjacent fills never touch —
 * which is what keeps two similar hues legible as two slices.
 */

const SIZE = 120;
const R = 52;
const STROKE = 16;
const CIRCUMFERENCE = 2 * Math.PI * R;
/** Surface gap between slices, in user units of the circumference. */
const GAP = 2;

export function Donut({
  rows,
  center,
  label,
}: {
  rows: Breakdown[];
  /** The headline in the hole — a coverage count, not a percentage. */
  center?: { value: string; caption: string };
  /** Names the chart for anyone reading the DOM; the legend carries the data. */
  label: string;
}) {
  const total = rows.reduce((n, r) => n + r.games, 0);

  // Nothing logged: an empty ring rather than a division by zero or a chart of
  // one grey slice pretending to be data.
  if (total === 0) {
    return (
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-[120px] shrink-0" role="img" aria-label={`${label}: nothing logged yet`}>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--muted)" strokeWidth={STROKE} />
        {center && <CenterText value="—" caption={center.caption} />}
      </svg>
    );
  }

  const slug = label.replace(/\W+/g, '');
  // Each arc's start is derived from the rows before it rather than accumulated
  // into a running variable: the React Compiler rejects reassigning a value
  // captured by a render closure, and with at most nine slices the recomputation
  // costs nothing.
  const arcs = rows.map((r, i) => {
    const fraction = r.games / total;
    const before = rows.slice(0, i).reduce((n, x) => n + x.games, 0) / total;
    return {
      row: r,
      dash: Math.max(0, fraction * CIRCUMFERENCE - GAP),
      offset: before * CIRCUMFERENCE,
      gradientId: `slice-${slug}-${r.key.replace(/\W+/g, '')}`,
    };
  });

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-[120px] shrink-0" aria-hidden>
      <defs>
        {arcs.filter((a) => a.row.colors.length > 1).map((a) => (
          <linearGradient key={a.gradientId} id={a.gradientId} x1="0" y1="0" x2="1" y2="1">
            {a.row.colors.map((c, i, all) => (
              // Hard stops, not a blend: six colours blended across one slice is
              // brown. Each colour owns an equal band, the same rule the
              // multi-colour leader avatars follow.
              //
              // A Fragment, not a <g>: a group element is not valid inside
              // <linearGradient> and the stops inside one are simply discarded,
              // which renders a six-colour slice as nothing at all.
              <Fragment key={c}>
                <stop offset={`${(i / all.length) * 100}%`} stopColor={chartColorVar(c)} />
                <stop offset={`${((i + 1) / all.length) * 100}%`} stopColor={chartColorVar(c)} />
              </Fragment>
            ))}
          </linearGradient>
        ))}
      </defs>
      <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
        {arcs.map((a, i) => (
          <circle
            key={a.row.key}
            cx={SIZE / 2} cy={SIZE / 2} r={R}
            fill="none"
            stroke={a.row.colors.length > 0 ? sliceFill(a.row.colors, a.gradientId) : rampColorVar(i, arcs.length)}
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
