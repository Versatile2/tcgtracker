import { segmentOf } from './segment-stats';
import { isThin } from './headline';
import type { LeaderDTO, TournamentSummaryDTO } from '../dto';
import type { Segment } from '@/components/tournaments/segment';

/**
 * How one of your leaders actually fares, within one kind of game.
 *
 * The same question `getMatchupStats` answers on the server, computed from the
 * cache instead — so it works offline and can be scoped to a game type, which
 * the endpoint could not do. `matchups.parity.test.ts` holds the two to the same
 * answer on the same history.
 *
 * Note the deliberate difference from the "Colours faced" donut on the same
 * page. That chart slices by *combination*, because a pie must partition. This
 * counts each colour a deck contains, because the question here is narrower —
 * "how does this leader do into red?" — and a two-colour opponent is a genuine
 * data point for both of its colours.
 */

export type Counts = { wins: number; losses: number; draws: number; games: number; winRate: number };
export type MatchupOpponent = Counts & { leaderId: string; name: string; verdict: Verdict };
export type Verdict = 'favored' | 'even' | 'unfavored' | 'unknown';
export type LeaderMatchups = {
  opponents: MatchupOpponent[];
  turnOrder: { first: Counts; second: Counts };
  colorBreakdown: (Counts & { color: string })[];
};

const rate = (wins: number, games: number) => (games > 0 ? wins / games : 0);

function counts(wins: number, losses: number, draws: number): Counts {
  const games = wins + losses + draws;
  return { wins, losses, draws, games, winRate: rate(wins, games) };
}

/**
 * A verdict, but only where there is evidence for one.
 *
 * The thresholds match the server's, so a matchup never reads differently on two
 * screens. What is added here is the sample gate: without it one win renders
 * `favored` in confident green, and a competitive player watches the badge flip
 * from red to green after a single game — at which point the whole matchup layer
 * stops being credible. This is the product's first claimed edge; a verdict it
 * has to retract costs more than a verdict it declines to give.
 */
export function verdictOf(winRate: number, games: number): Verdict {
  if (isThin(games)) return 'unknown';
  if (winRate >= 0.55) return 'favored';
  if (winRate <= 0.45) return 'unfavored';
  return 'even';
}

type Bucket = { wins: number; losses: number; draws: number };
const empty = (): Bucket => ({ wins: 0, losses: 0, draws: 0 });
function add(b: Bucket, result: 'win' | 'loss' | 'draw') {
  if (result === 'win') b.wins += 1;
  else if (result === 'loss') b.losses += 1;
  else b.draws += 1;
}

export function matchupsForLeader(
  tournaments: readonly TournamentSummaryDTO[],
  leaders: readonly LeaderDTO[],
  segment: Segment,
  leaderId: string,
): LeaderMatchups {
  const byId = new Map(leaders.map((l) => [l.id, l]));
  const opponents = new Map<string, Bucket & { name: string }>();
  const colors = new Map<string, Bucket>();
  const first = empty();
  const second = empty();

  for (const t of tournaments) {
    if (segmentOf(t.type) !== segment) continue;
    for (const m of t.matches) {
      // A session records the deck per round; every other type records one for
      // the event. The same coalesce the SQL applies.
      if ((m.myLeaderId ?? t.myLeaderId) !== leaderId) continue;

      // Turn order counts any round that recorded one. Byes and no-shows never
      // do — the form does not ask — which is how they stay out of this without
      // a kind filter the server does not have either.
      if (m.playOrder === 'first') add(first, m.result);
      else if (m.playOrder === 'second') add(second, m.result);

      // Everything below needs an opponent. The server reaches these through an
      // inner join on the opponent leader, so a round without one contributes
      // nothing there either.
      if (!m.opponentLeaderId) continue;
      const opp = byId.get(m.opponentLeaderId);
      if (!opp) continue;

      const row = opponents.get(m.opponentLeaderId) ?? { ...empty(), name: opp.name };
      add(row, m.result);
      opponents.set(m.opponentLeaderId, row);

      const present = opp.colors.length > 0 ? opp.colors : ['colorless'];
      for (const c of present) {
        const bucket = colors.get(c) ?? empty();
        add(bucket, m.result);
        colors.set(c, bucket);
      }
    }
  }

  return {
    opponents: [...opponents.entries()]
      .map(([id, b]) => {
        const c = counts(b.wins, b.losses, b.draws);
        return { leaderId: id, name: b.name, ...c, verdict: verdictOf(c.winRate, c.games) };
      })
      .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name)),
    turnOrder: {
      first: counts(first.wins, first.losses, first.draws),
      second: counts(second.wins, second.losses, second.draws),
    },
    colorBreakdown: [...colors.entries()]
      .map(([color, b]) => ({ color, ...counts(b.wins, b.losses, b.draws) }))
      .sort((a, b) => b.games - a.games || a.color.localeCompare(b.color)),
  };
}
