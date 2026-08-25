'use client';
import { Flame, Sparkles } from 'lucide-react';
import { LargeTitleScreen } from '@/components/nav/large-title-screen';
import { Skeleton } from '@/components/ui/skeleton';
import { AchievementCard } from '@/components/achievements/achievement-card';
import { CountUp } from '@/components/celebrate/count-up';
import { useProgress } from '@/components/progress/use-progress';

/**
 * Who you are in this app: level, streak, and everything you have earned.
 *
 * Achievements live here rather than in a tab of their own — they are identity,
 * not a separate destination, and folding them in keeps the bottom bar at four
 * items instead of five.
 *
 * Every number is derived from history already in the cache, so this screen is
 * complete with no connection.
 */
export function ProfileView() {
  const { xp, level, streak, achievements, payoff, ready } = useProgress();
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <LargeTitleScreen title="Profile">
      {!ready ? (
        <div className="mt-4 space-y-4">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          <section className="rounded-2xl border border-primary/30 bg-primary/8 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-[0.625rem] font-semibold tracking-wide text-muted-foreground uppercase">Level</p>
                <p className="text-4xl font-bold tabular-nums"><CountUp value={level.level} /></p>
              </div>
              <p className="text-sm text-muted-foreground tabular-nums">
                <CountUp value={xp} /> XP
              </p>
            </div>

            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-primary/20"
              role="progressbar"
              aria-valuenow={level.into}
              aria-valuemin={0}
              aria-valuemax={level.span}
              aria-label={`Progress to level ${level.level + 1}`}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                style={{ width: `${Math.round((level.into / level.span) * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
              {level.span - level.into} XP to level {level.level + 1}
            </p>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <Stat
              icon={Flame}
              label="Streak"
              value={streak.weeks === 0 ? 'None' : `${streak.weeks} wk`}
              hint={streak.weeks === 0 ? 'Log a game to start one' : streak.atRisk ? 'Log this week to keep it' : 'Safe this week'}
              accent={streak.weeks > 0 && !streak.atRisk}
            />
            <Stat
              icon={Sparkles}
              label="Achievements"
              value={`${unlockedCount}/${achievements.length}`}
              hint={payoff ? `${payoff.remaining} from ${payoff.name}` : 'All earned'}
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Achievements</h2>
            <div className="grid grid-cols-2 gap-3">
              {achievements.map((a) => <AchievementCard key={a.key} a={a} />)}
            </div>
          </section>
        </div>
      )}
    </LargeTitleScreen>
  );
}

function Stat({
  icon: Icon, label, value, hint, accent = false,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/60 p-3">
      <p className="flex items-center gap-1.5 text-[0.625rem] font-semibold tracking-wide text-muted-foreground uppercase">
        <Icon className={accent ? 'size-3.5 text-primary-ink' : 'size-3.5'} aria-hidden />
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
