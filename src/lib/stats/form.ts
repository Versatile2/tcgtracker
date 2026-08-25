import { segmentOf } from './segment-stats';
import type { TournamentSummaryDTO } from '../dto';
import type { Segment } from '@/components/tournaments/segment';

/**
 * The stats that know about time.
 *
 * Everything else on this surface is a lifetime aggregate, which cannot answer
 * the question a player actually arrives with — am I getting better? In a game
 * whose format rotates OP01 through OP16, a round from five months ago and one
 * from last night carry the same weight in every other number here.
 *
 * ## What "recent" can mean
 *
 * `playedOn` is recorded on the **tournament**, not the round, so every round of
 * one event shares a day. Ordering is therefore by event date, then by round
 * order within the event. That is honest for form and for a monthly trend, and
 * it is written down rather than implied: the app does not know what time of day
 * a round was played and this does not pretend otherwise.
 *
 * Byes and no-shows are not games and appear nowhere here, exactly as they are
 * already excluded from every win rate.
 */

export type Scope = Segment | 'all';
export type Outcome = 'win' | 'loss' | 'draw';

const inScope = (type: Parameters<typeof segmentOf>[0], scope: Scope) =>
  scope === 'all' || segmentOf(type) === scope;

const isGame = (kind: string) => kind !== 'bye' && kind !== 'no_show';

/** Every game in scope, oldest first. The order everything below depends on. */
function chronological(tournaments: readonly TournamentSummaryDTO[], scope: Scope) {
  return [...tournaments]
    .filter((t) => inScope(t.type, scope))
    // Ties broken by id so two events on one day keep a stable order between
    // renders rather than shuffling with whatever the cache happened to return.
    .sort((a, b) => a.playedOn.localeCompare(b.playedOn) || a.id.localeCompare(b.id))
    .flatMap((t) => t.matches.filter((m) => isGame(m.kind)).map((m) => ({ result: m.result as Outcome, playedOn: t.playedOn })));
}

/** The last `n` results, most recent first — what a form strip draws. */
export function formStrip(
  tournaments: readonly TournamentSummaryDTO[],
  scope: Scope,
  n = 10,
): Outcome[] {
  const all = chronological(tournaments, scope);
  return all.slice(Math.max(0, all.length - n)).reverse().map((g) => g.result);
}

export type Streaks = { current: number; longest: number };

/**
 * Runs of wins: the one on now, and the best ever.
 *
 * A draw ends a streak without starting anything — it is not a win, and calling
 * it a loss would misreport a game the player did not lose.
 */
export function streaks(tournaments: readonly TournamentSummaryDTO[], scope: Scope): Streaks {
  const all = chronological(tournaments, scope);
  let longest = 0, run = 0;
  for (const g of all) {
    run = g.result === 'win' ? run + 1 : 0;
    if (run > longest) longest = run;
  }
  let current = 0;
  for (let i = all.length - 1; i >= 0 && all[i].result === 'win'; i--) current += 1;
  return { current, longest };
}

export type MonthPoint = {
  /** `YYYY-MM`, the bucket key. */
  month: string;
  /** `Aug` — the axis label. */
  label: string;
  wins: number; losses: number; draws: number; games: number; winRate: number;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * One point per calendar month that has games, oldest first.
 *
 * Months with no games are omitted rather than plotted as zero: a month away
 * from the game is not a month of losses, and drawing it as a trough would
 * invent a slump that never happened.
 *
 * The key is sliced from the ISO date rather than parsed into a Date, which
 * keeps it in the player's own calendar instead of shifting an evening event
 * into the previous month for anyone west of UTC.
 */
export function trendByMonth(tournaments: readonly TournamentSummaryDTO[], scope: Scope): MonthPoint[] {
  const buckets = new Map<string, { wins: number; losses: number; draws: number }>();
  for (const g of chronological(tournaments, scope)) {
    const month = g.playedOn.slice(0, 7);
    const b = buckets.get(month) ?? { wins: 0, losses: 0, draws: 0 };
    if (g.result === 'win') b.wins += 1;
    else if (g.result === 'loss') b.losses += 1;
    else b.draws += 1;
    buckets.set(month, b);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, b]) => {
      const games = b.wins + b.losses + b.draws;
      return {
        month,
        label: MONTHS[Number(month.slice(5, 7)) - 1] ?? month,
        ...b, games,
        winRate: games > 0 ? b.wins / games : 0,
      };
    });
}
