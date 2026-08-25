'use client';
import { Flame } from 'lucide-react';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import type { Outcome, Streaks } from '@/lib/stats/form';

/**
 * The last ten games, most recent first, and the run you are on.
 *
 * The first thing on the page, because it is the only thing that answers "how am
 * I going *now*". Every other number here is a lifetime aggregate, and in a game
 * whose format rotates OP01 through OP16 a lifetime aggregate can be the wrong
 * default — the meta has moved since half of it was recorded.
 *
 * Pips use the validated chart palette rather than raw green and red: they are
 * the same steps the charts below were checked against in both themes, so the
 * page has one colour language rather than two.
 */

const style: Record<Outcome, string> = {
  win: 'bg-[var(--chart-green)]',
  loss: 'bg-[var(--chart-red)]',
  draw: 'bg-muted-foreground/40',
};
const title: Record<Outcome, string> = { win: 'Win', loss: 'Loss', draw: 'Draw' };

export function FormStrip({ form, streak }: { form: Outcome[]; streak: Streaks }) {
  const reduced = usePrefersReducedMotion();
  if (form.length === 0) return null;

  const wins = form.filter((r) => r === 'win').length;
  const losses = form.filter((r) => r === 'loss').length;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {/* Most recent first, so the eye lands on the newest game. The list is the
          content; the pips are its shape. */}
      <ol className="flex items-center gap-1" aria-label={`Last ${form.length} games, most recent first`}>
        {form.map((r, i) => (
          <li
            key={i}
            title={title[r]}
            className={`size-2.5 rounded-full ${style[r]} ${reduced ? '' : 'animate-in fade-in zoom-in'}`}
            style={reduced ? undefined : { animationDelay: `${i * 30}ms`, animationDuration: '200ms', animationFillMode: 'both' }}
          >
            <span className="sr-only">{title[r]}</span>
          </li>
        ))}
      </ol>
      <span className="text-sm tabular-nums text-muted-foreground">
        {wins}-{losses} in the last {form.length}
      </span>
      {streak.current >= 2 && (
        <span className="flex items-center gap-1 text-sm">
          <Flame className="size-4 text-primary-ink" aria-hidden />
          <span className="font-semibold tabular-nums">{streak.current}</span>
          <span className="text-muted-foreground">in a row</span>
        </span>
      )}
    </div>
  );
}
