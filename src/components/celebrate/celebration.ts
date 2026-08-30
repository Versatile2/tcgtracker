import type { Achievement } from '@/lib/achievements/definitions';
import { rankTier, rankLabel, isPodiumTier } from '@/lib/rank';

export type CelebrationLeader = { id: string; name: string; colors?: string[]; setCode?: string | null } | null;

export type Celebration = {
  /** Null when the act was starting an event rather than playing a game. */
  result: 'win' | 'loss' | 'draw' | null;
  myLeader: CelebrationLeader;
  opponentLeader: CelebrationLeader;
  xpGained: number;
  /** Newly crossed this save — never the whole unlocked list. */
  unlocked: Achievement[];
  /** The level just reached, or null when it did not change. */
  leveledTo: number | null;
  streakWeeks: number;
  streakExtended: boolean;
  /** Where the event finished, when this save was the one that finished it. */
  placement: number | null;
  fieldSize: number | null;
  headline: string;
};

/**
 * Whether this save earns the full moment or a quiet acknowledgement.
 *
 * The spine of the design. Eight rounds at a Regional must not cost eight
 * interruptions, and celebrating every save equally makes none of them feel
 * like anything. So the overlay is reserved for a save that actually changed
 * something — and because most saves do not, the ones that do land hard.
 */
export function isMilestone(c: Celebration): boolean {
  // A podium finish earns the moment on its own merits. Without this clause the
  // Champion achievement — which unlocks once and never again — is the only
  // thing marking a win, so a player's second tournament victory passes more
  // quietly than an ordinary round. Winning is rare enough that it can never
  // become noise.
  if (isPodiumTier(rankTier(c.placement, c.fieldSize))) return true;
  return c.unlocked.length > 0 || c.leveledTo !== null || c.streakExtended;
}

/** What the moment says, in the player's terms. Most specific claim wins. */
export function headlineFor(input: {
  result: 'win' | 'loss' | 'draw' | null;
  unlocked: Achievement[];
  leveledTo: number | null;
  streakExtended: boolean;
  streakWeeks: number;
  placement?: number | null;
  fieldSize?: number | null;
}): string {
  // Above the achievement branch on purpose: a win that also unlocks something
  // is a win first. "Champion" beats the name of the badge it earned.
  const tier = rankTier(input.placement ?? null, input.fieldSize ?? null);
  if (isPodiumTier(tier)) return rankLabel[tier!];
  if (input.unlocked.length === 1) return input.unlocked[0].name;
  if (input.unlocked.length > 1) return `${input.unlocked.length} achievements`;
  if (input.leveledTo !== null) return `Level ${input.leveledTo}`;
  if (input.streakExtended && input.streakWeeks > 1) return `${input.streakWeeks} weeks running`;
  if (input.streakExtended) return 'Streak started';
  if (input.result === null) return 'Event started';
  return input.result === 'win' ? 'Win logged' : input.result === 'loss' ? 'Logged' : 'Draw logged';
}
