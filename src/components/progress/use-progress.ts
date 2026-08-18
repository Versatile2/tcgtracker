'use client';
import { useMemo } from 'react';
import { useLeaders, useTournaments } from '@/components/query-hooks';
import { useIsMounted } from '@/lib/use-is-mounted';
import { evaluateAchievements, type Achievement } from '@/lib/achievements/definitions';
import { ctxFromCache } from '@/lib/achievements/from-cache';
import { totalXp, levelFor, weekStreak, nextPayoff, type Payoff, type Streak } from '@/lib/progress';

export type Progress = {
  xp: number;
  level: ReturnType<typeof levelFor>;
  streak: Streak;
  achievements: Achievement[];
  /** The nearest thing still to earn, or null. */
  payoff: Payoff | null;
  /** False until the tournament list has arrived; nothing above is meaningful yet. */
  ready: boolean;
};

/**
 * Everything the gamification layer knows, derived from the caches the app
 * already keeps.
 *
 * No endpoint, no table, no round trip: a player at a venue with no signal sees
 * the same level, streak and progress they would at home, because it is all a
 * function of the history sitting in the query cache.
 *
 * `useIsMounted` gates the streak because it depends on today's date, and a
 * server render across a midnight boundary would disagree with the client.
 */
export function useProgress(): Progress {
  const { data: tournaments } = useTournaments();
  const { data: leaders } = useLeaders();
  const mounted = useIsMounted();

  return useMemo(() => {
    const ts = tournaments ?? [];
    const achievements = evaluateAchievements(ctxFromCache(ts, leaders ?? []));
    const xp = totalXp(ts);
    const today = new Date().toISOString().slice(0, 10);
    return {
      xp,
      level: levelFor(xp),
      streak: mounted ? weekStreak(ts, today) : { weeks: 0, atRisk: false },
      achievements,
      payoff: nextPayoff(achievements),
      // Same reason the streak is gated: the persisted cache restores
      // synchronously, so claiming readiness before mount would render a
      // different first pass than the server did.
      ready: mounted && tournaments !== undefined,
    };
  }, [tournaments, leaders, mounted]);
}
