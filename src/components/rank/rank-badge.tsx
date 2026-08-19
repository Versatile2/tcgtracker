import { Trophy, Medal, Swords } from 'lucide-react';
import { cn } from '@/lib/utils';
import { rankLabel, type RankTier } from '@/lib/rank';

const icon: Record<RankTier, typeof Trophy> = {
  champion: Trophy,
  silver: Medal,
  bronze: Medal,
  // A cut is a bracket you survived, not a medal you were handed.
  cut: Swords,
};

/**
 * The struck medal: gradient fill, dark ink, identical in light and dark mode.
 *
 * A real medal does not change colour when the lights go out, and fixing the
 * ink dark also sidesteps the contrast trap of gold on white.
 *
 * Screen readers get the rung and the placement as words — the metal says
 * nothing to them, so the text has to.
 */
export function RankBadge({
  tier,
  placement,
  className,
}: {
  tier: RankTier;
  /** "1st of 32" — the fact; the tier is the flourish. */
  placement: string | null;
  className?: string;
}) {
  const Icon = icon[tier];
  return (
    <span className={cn('rank-chip', `rank-${tier}`, className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {/* The metal says "champion" to everyone who can see it. This says it to
          everyone else. */}
      {placement && <span className="sr-only">{rankLabel[tier]} — </span>}
      {placement ?? rankLabel[tier]}
    </span>
  );
}

/** Classes that turn a surface into that rung's skin. Null tier changes nothing. */
export function rankSkin(tier: RankTier | null): string | undefined {
  return tier ? `rank-skin rank-${tier}` : undefined;
}
