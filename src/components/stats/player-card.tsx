'use client';
import Link from 'next/link';
import { Flame, ChevronRight } from 'lucide-react';
import { useProgress } from '@/components/progress/use-progress';

/**
 * Who the player is, at the top of their statistics.
 *
 * Level, streak and the nearest achievement already existed, but lived on
 * Profile — a page you visit to look at yourself. Here they answer the question
 * the screen is for: the numbers below say how you have played, and this says
 * what it has added up to.
 */
export function PlayerCard() {
  const { level, xp, streak, payoff, ready } = useProgress();
  if (!ready) return null;

  return (
    <section className="rounded-2xl border p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-lg font-bold">Level {level.level}</span>
        <span className="text-sm tabular-nums text-muted-foreground">
          {level.into} / {level.span} XP
        </span>
      </div>
      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={level.span}
        aria-valuenow={level.into}
        aria-label={`Level ${level.level}, ${level.into} of ${level.span} XP`}
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${(level.into / level.span) * 100}%` }} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="tabular-nums">{xp.toLocaleString()} XP total</span>
        {streak.weeks > 0 && (
          <span className="flex items-center gap-1">
            <Flame className="size-4 text-primary" aria-hidden />
            <span className="font-semibold text-foreground tabular-nums">{streak.weeks}</span>
            week{streak.weeks === 1 ? '' : 's'} running
          </span>
        )}
      </div>

      {/* Phrased as what is left, not as what is locked: a player who knows they
          are one win away has a reason to log the next game. */}
      {payoff && (
        <Link
          href="/achievements"
          className="mt-3 flex items-center gap-1.5 rounded-lg text-sm text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* `label` already names the achievement ("1 from On Fire"), so the
              name is not repeated in front of it. */}
          Next: {payoff.label}
          <ChevronRight className="size-4 shrink-0" aria-hidden />
        </Link>
      )}
    </section>
  );
}
