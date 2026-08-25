import type { OpponentRow, SegmentStats } from './segment-stats';
import type { Counts } from './matchups';

/**
 * Games below which a record is not a finding.
 *
 * Production holds 24 events; most splits here are under ten games, where a win
 * rate is noise wearing a percentage sign. The established OPTCG statistics
 * sites solve this with volume — Straw Hat Stats will not show a leader under
 * 100 matches — which is not available to a personal tracker and never will be.
 *
 * So the rule is honesty rather than volume: a thin row is still shown, because
 * the player logged those games and hiding them would make the page disagree
 * with their own history, but it is marked, and it can never be promoted into a
 * claim. Five is the smallest number at which a 4-1 reads as a pattern rather
 * than as a coin landing the same way twice.
 */
export const THIN = 5;

export const isThin = (games: number) => games < THIN;

export type Headline = {
  worst: OpponentRow | null;
  best: OpponentRow | null;
  turnOrder: { first: Counts; second: Counts } | null;
};

/**
 * The finding, stated — or nothing, honestly.
 *
 * Worst leads rather than best because it is the actionable one: a matchup you
 * lose is a deck decision, a matchup you win is a pat on the back.
 *
 * Only rows at or above `THIN` are eligible. Without that, `1-0 · 100%` becomes
 * "your best matchup", which is worse than showing nothing — a claim the app
 * has to retract the moment the second game is played.
 */
export function headlineFrom(stats: SegmentStats, turnOrder: Headline['turnOrder']): Headline {
  const eligible = stats.byOpponent.filter((r) => !isThin(r.games));
  // Ties broken by games, so the better-evidenced of two equal rates wins, and
  // then by name so the headline does not change between renders.
  const byRate = [...eligible].sort(
    (a, b) => a.winRate - b.winRate || b.games - a.games || a.name.localeCompare(b.name),
  );
  const worst = byRate[0] ?? null;
  const best = byRate.length > 1 ? byRate[byRate.length - 1] : null;
  return {
    worst,
    // Never the same row twice: with one eligible opponent it is the worst, and
    // calling it the best as well would read as two findings from one fact.
    best: best && worst && best.leaderId === worst.leaderId ? null : best,
    turnOrder: turnOrder && (turnOrder.first.games > 0 || turnOrder.second.games > 0) ? turnOrder : null,
  };
}

/** Whether the turn-order split is worth stating, or is just two small numbers. */
export function turnOrderIsMeaningful(t: Headline['turnOrder']): boolean {
  if (!t) return false;
  return !isThin(t.first.games) && !isThin(t.second.games)
    && Math.abs(t.first.winRate - t.second.winRate) >= 0.1;
}
