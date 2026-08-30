'use client';
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { keys } from '@/lib/query-keys';
import { evaluateAchievements, newlyUnlockedKeys, type Achievement } from '@/lib/achievements/definitions';
import { ctxFromCache } from '@/lib/achievements/from-cache';
import { XP, totalXp, levelFor, weekStreak } from '@/lib/progress';
import type { LeaderDTO, TournamentSummaryDTO } from '@/lib/dto';
import { useCelebrate } from './celebration-provider';
import { headlineFor, type Celebration } from './celebration';

/**
 * Wraps a logging write so the reward lands on the same screen and in the same
 * breath as the act that earned it.
 *
 * It reads progress from the query cache before the write, applies the write —
 * which is optimistic and synchronous — then reads it again and celebrates the
 * difference. That is what makes an unlock arrive *now*, offline, instead of
 * whenever the player next happens to open another screen.
 *
 * The server stays authoritative: this evaluation is optimistic in exactly the
 * way the cached round it is reading is optimistic, and the next server read
 * reconciles both.
 */
export function useLogCelebration() {
  const qc = useQueryClient();
  const { celebrate } = useCelebrate();

  return useCallback(
    (
      apply: () => void,
      game: {
        /** Null when starting an event rather than logging a game. */
        result: 'win' | 'loss' | 'draw' | null;
        myLeaderId: string | null;
        opponentLeaderId: string | null;
        /** Set only by the finish path, where a placement is being recorded. */
        placement?: number | null;
        fieldSize?: number | null;
      },
    ) => {
      const read = () => {
        const tournaments = qc.getQueryData<TournamentSummaryDTO[]>(keys.tournaments) ?? [];
        const leaders = qc.getQueryData<LeaderDTO[]>(keys.leaders) ?? [];
        const today = new Date().toISOString().slice(0, 10);
        return {
          leaders,
          achievements: evaluateAchievements(ctxFromCache(tournaments, leaders)),
          xp: totalXp(tournaments),
          streak: weekStreak(tournaments, today),
        };
      };

      const before = read();
      apply();
      const after = read();

      const unlockedKeys = newlyUnlockedKeys(before.achievements, after.achievements);
      const unlocked: Achievement[] = after.achievements.filter((a) => unlockedKeys.includes(a.key));

      const beforeLevel = levelFor(before.xp).level;
      const afterLevel = levelFor(after.xp).level;
      // Only a real crossing counts. An empty tournaments cache leaves both at
      // the same level, which is the right answer: say nothing rather than
      // invent a level-up from missing data.
      const leveledTo = afterLevel > beforeLevel ? afterLevel : null;

      const streakExtended = after.streak.weeks > before.streak.weeks;

      // Computed from the round itself rather than the cache difference, so the
      // number shown is right even on a cold start where the list has not been
      // fetched yet.
      // Starting an event pays nothing by itself; the games pay.
      const xpGained = game.result === null ? 0 : XP.round + (game.result === 'win' ? XP.win : 0);

      const leader = (id: string | null) => {
        const l = id ? after.leaders.find((x) => x.id === id) : undefined;
        return l ? { id: l.id, name: l.name, colors: l.colors, setCode: l.setCode } : null;
      };

      const c: Celebration = {
        result: game.result,
        myLeader: leader(game.myLeaderId),
        opponentLeader: leader(game.opponentLeaderId),
        xpGained,
        unlocked,
        leveledTo,
        streakWeeks: after.streak.weeks,
        streakExtended,
        placement: game.placement ?? null,
        fieldSize: game.fieldSize ?? null,
        headline: headlineFor({
          result: game.result,
          unlocked,
          leveledTo,
          streakExtended,
          streakWeeks: after.streak.weeks,
          placement: game.placement ?? null,
          fieldSize: game.fieldSize ?? null,
        }),
      };
      celebrate(c);
    },
    [qc, celebrate],
  );
}
