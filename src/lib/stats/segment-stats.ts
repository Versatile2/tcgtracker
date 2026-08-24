import { isSession, MATCH_TYPE } from '../tournament-kinds';
import { tournamentTypeLabel, metaLabel } from '../labels';
import { comboKey, comboLabel, comboColors, COLOR_ORDER } from './colors';
import type { LeaderDTO, MetaDTO, TournamentSummaryDTO, TournamentType } from '../dto';
import type { Segment } from '@/components/tournaments/segment';

/**
 * Every statistic the app shows, computed on the client from the cache it
 * already holds.
 *
 * The tournament list carries `matches[]` and the leader catalog carries
 * colours, which between them answer every question here — so this needs no
 * endpoint and no SQL, and keeps working at a venue with no signal. That is the
 * same reason achievements are computed this way (`achievements/from-cache.ts`),
 * and it matters more here: statistics are what a player opens the app to read
 * between rounds.
 */

export type Breakdown = {
  key: string;
  label: string;
  /** Colours to paint the slice with. Empty for non-colour breakdowns. */
  colors: string[];
  wins: number; losses: number; draws: number;
  games: number;
  winRate: number;
  /** This row's fraction of the segment's games, 0–1. Rows sum to 1. */
  share: number;
};

export type Coverage = {
  /** How many distinct things have been faced or played. */
  seen: number;
  /** How many exist to be seen. Null when the total is open-ended. */
  total: number | null;
};

export type SegmentStats = {
  events: number;
  wins: number; losses: number; draws: number;
  games: number;
  winRate: number;
  byColorFaced: Breakdown[];
  byMyColor: Breakdown[];
  byMeta: Breakdown[];
  byType: Breakdown[];
  /** Individual colours beaten at least once, of six — the Rainbow progress. */
  colorsBeaten: Coverage;
  metasPlayed: Coverage;
  typesPlayed: Coverage;
};

/** Which of the three lists a tournament belongs to. */
export function segmentOf(type: TournamentType): Segment {
  if (type === MATCH_TYPE) return 'matches';
  return isSession(type) ? 'sessions' : 'tournaments';
}

/**
 * Byes and no-shows are not games. The SQL excludes them from every win-rate
 * query, and this must agree or the same record would read differently on two
 * screens.
 */
const isGame = (kind: string) => kind !== 'bye' && kind !== 'no_show';

type Tally = { wins: number; losses: number; draws: number; colors: string[]; label: string };

function tallyOf(map: Map<string, Tally>, key: string, label: string, colors: string[]): Tally {
  const existing = map.get(key);
  if (existing) return existing;
  const fresh: Tally = { wins: 0, losses: 0, draws: 0, colors, label };
  map.set(key, fresh);
  return fresh;
}

const rate = (wins: number, games: number) => (games > 0 ? wins / games : 0);

/**
 * Rows ordered by games played, then by label so ties do not shuffle between
 * renders. `share` is of the segment's games, so rows sum to 1.
 */
function toRows(map: Map<string, Tally>, totalGames: number): Breakdown[] {
  return [...map.entries()]
    .map(([key, t]) => {
      const games = t.wins + t.losses + t.draws;
      return {
        key, label: t.label, colors: t.colors,
        wins: t.wins, losses: t.losses, draws: t.draws,
        games, winRate: rate(t.wins, games),
        share: totalGames > 0 ? games / totalGames : 0,
      };
    })
    .sort((a, b) => b.games - a.games || a.label.localeCompare(b.label));
}

/**
 * Folds everything past the first `max` rows into one "Other".
 *
 * A donut of twenty slices is decoration, not a chart. The full list still
 * reaches the legend — only the chart is trimmed — so nothing is lost, and the
 * fold is visible rather than silent.
 */
export function foldTail(rows: Breakdown[], max: number): Breakdown[] {
  if (rows.length <= max) return rows;
  const head = rows.slice(0, max);
  const tail = rows.slice(max);
  const wins = tail.reduce((n, r) => n + r.wins, 0);
  const losses = tail.reduce((n, r) => n + r.losses, 0);
  const draws = tail.reduce((n, r) => n + r.draws, 0);
  const games = wins + losses + draws;
  return [...head, {
    key: '__other__',
    label: `Other (${tail.length})`,
    colors: [],
    wins, losses, draws, games,
    winRate: rate(wins, games),
    share: tail.reduce((n, r) => n + r.share, 0),
  }];
}

export function statsForSegment(
  tournaments: readonly TournamentSummaryDTO[],
  leaders: readonly LeaderDTO[],
  metas: readonly MetaDTO[],
  segment: Segment,
): SegmentStats {
  const colorsOf = new Map(leaders.map((l) => [l.id, l.colors]));
  const metaById = new Map(metas.map((m) => [m.id, m]));
  const inSegment = tournaments.filter((t) => segmentOf(t.type) === segment);

  const faced = new Map<string, Tally>();
  const mine = new Map<string, Tally>();
  const byMeta = new Map<string, Tally>();
  const byType = new Map<string, Tally>();
  const beaten = new Set<string>();
  let wins = 0, losses = 0, draws = 0;

  for (const t of inSegment) {
    const typeKey = t.type;
    const typeLabel = tournamentTypeLabel(t.type);
    for (const m of t.matches) {
      if (!isGame(m.kind)) continue;
      wins += m.result === 'win' ? 1 : 0;
      losses += m.result === 'loss' ? 1 : 0;
      draws += m.result === 'draw' ? 1 : 0;

      const add = (tally: Tally) => {
        if (m.result === 'win') tally.wins += 1;
        else if (m.result === 'loss') tally.losses += 1;
        else tally.draws += 1;
      };

      // Opponent colours. A round with no opponent is a game played against
      // nobody recorded; it still counts in the record but has no colour to file
      // it under, so it lands in the colourless slice rather than being dropped.
      const oppColors = m.opponentLeaderId ? colorsOf.get(m.opponentLeaderId) ?? [] : [];
      const oppKey = comboKey(oppColors);
      add(tallyOf(faced, oppKey, comboLabel(oppKey), comboColors(oppKey)));
      // Coverage counts individual colours, not the combination: beating a
      // Purple/Red deck really does beat purple and red.
      if (m.result === 'win') for (const c of oppColors) beaten.add(c);

      // My colours. A session records its deck per round; every other type
      // records one for the whole event.
      const myLeader = m.myLeaderId ?? t.myLeaderId;
      const myKey = comboKey(myLeader ? colorsOf.get(myLeader) ?? [] : []);
      add(tallyOf(mine, myKey, comboLabel(myKey), comboColors(myKey)));

      // The meta this round was played in, the round's own winning over the
      // event's — the same coalesce the SQL applies.
      const metaId = m.opponentMetaId ?? t.metaId;
      const meta = metaId ? metaById.get(metaId) : undefined;
      const metaKey = metaId ?? '__none__';
      add(tallyOf(byMeta, metaKey, meta ? metaLabel(meta) : 'No meta', []));

      add(tallyOf(byType, typeKey, typeLabel, []));
    }
  }

  const games = wins + losses + draws;
  const officialMetas = metas.filter((m) => !m.isCustom).length;

  return {
    events: inSegment.length,
    wins, losses, draws, games,
    winRate: rate(wins, games),
    byColorFaced: toRows(faced, games),
    byMyColor: toRows(mine, games),
    byMeta: toRows(byMeta, games),
    byType: toRows(byType, games),
    colorsBeaten: { seen: beaten.size, total: COLOR_ORDER.length },
    metasPlayed: { seen: [...byMeta.keys()].filter((k) => k !== '__none__').length, total: officialMetas || null },
    typesPlayed: { seen: byType.size, total: null },
  };
}
