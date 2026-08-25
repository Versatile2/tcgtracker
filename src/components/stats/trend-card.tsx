'use client';
import { pct } from './stat-card';
import type { MonthPoint } from '@/lib/stats/form';

/**
 * Win rate by month — whether you are getting better.
 *
 * Rendered only from two points onward: a line between two dots is a line, not a
 * trend, and drawing one from a single month would state a direction the data
 * cannot support.
 *
 * Months with no games are absent rather than plotted at zero, so a gap in the
 * line is a gap in play. That is why the x positions come from the array index
 * rather than from the calendar: the chart shows the months that happened, in
 * order, without inventing troughs for the ones that did not.
 */

const W = 300;
const H = 64;
const PAD = 6;

export function TrendCard({ points }: { points: MonthPoint[] }) {
  if (points.length < 2) return null;

  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (rate: number) => H - PAD - rate * (H - PAD * 2);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.winRate).toFixed(1)}`).join(' ');
  const best = points.reduce((a, b) => (b.winRate > a.winRate ? b : a));

  return (
    <section className="rounded-2xl border p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Win rate by month</h2>
        <span className="text-sm tabular-nums text-muted-foreground">best {pct(best.winRate)} · {best.label}</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-16 w-full" aria-hidden>
        {/* 50% reference, so a line's height means something without an axis. */}
        <line x1={PAD} y1={y(0.5)} x2={W - PAD} y2={y(0.5)} stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3" />
        <path d={line} fill="none" stroke="var(--primary-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={p.month} cx={x(i)} cy={y(p.winRate)} r="3.5" fill="var(--primary-ink)" />
        ))}
      </svg>

      {/* The table is the content; the line is its shape. */}
      <ul className="mt-2 flex justify-between text-xs text-muted-foreground">
        {points.map((p) => (
          <li key={p.month} className="text-center tabular-nums">
            <span className="block">{p.label}</span>
            <span className="block font-medium text-foreground">{pct(p.winRate)}</span>
            <span className="block">{p.games}g</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
