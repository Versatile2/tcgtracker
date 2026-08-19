import { isWin, isPodium, isTopCut } from './placement';

/**
 * How good a finish was, in four rungs.
 *
 * Built on the same predicates the achievements use rather than on fresh
 * comparisons, so the card a player sees and the achievement they unlocked can
 * never disagree about what a result was worth. `8th of 8` is last place and
 * gets nothing — that rule already lives in `isTopCut` and is inherited here
 * rather than restated.
 */
export type RankTier = 'champion' | 'silver' | 'bronze' | 'cut';

/** The first matching rung wins: 2nd of 32 is silver, not a cut. */
export function rankTier(placement: number | null, fieldSize: number | null): RankTier | null {
  if (isWin(placement)) return 'champion';
  if (isPodium(placement)) return placement === 2 ? 'silver' : 'bronze';
  if (isTopCut(placement, fieldSize)) return 'cut';
  return null;
}

/** What each rung is called, so four surfaces cannot drift on wording. */
export const rankLabel: Record<RankTier, string> = {
  champion: 'Champion',
  silver: 'Runner-up',
  bronze: '3rd place',
  cut: 'Top 8',
};

/** Only the metals are worth interrupting a player for. */
export const isPodiumTier = (tier: RankTier | null) =>
  tier === 'champion' || tier === 'silver' || tier === 'bronze';
