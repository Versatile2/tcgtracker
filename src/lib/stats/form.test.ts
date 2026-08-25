import { describe, it, expect } from 'vitest';
import { formStrip, streaks, trendByMonth } from './form';
import { headlineFrom, isThin, THIN, turnOrderIsMeaningful } from './headline';
import type { SegmentStats, OpponentRow } from './segment-stats';
import type { TournamentSummaryDTO, MatchSummaryDTO } from '../dto';

const round = (result: 'win' | 'loss' | 'draw', kind = 'swiss'): MatchSummaryDTO =>
  ({ opponentLeaderId: 'o', myLeaderId: null, opponentMetaId: null, result, kind, playOrder: 'first' } as MatchSummaryDTO);

let seq = 0;
const ev = (playedOn: string, results: MatchSummaryDTO[], type = 'local'): TournamentSummaryDTO => ({
  id: `t${seq++}`, type, myLeaderId: 'me', metaId: null, name: null, notes: null,
  placement: null, fieldSize: null, playedOn, status: 'draft',
  record: { wins: 0, losses: 0, draws: 0 }, matches: results, deckCount: 0,
} as TournamentSummaryDTO);

describe('formStrip', () => {
  it('returns the most recent games first', () => {
    const ts = [ev('2026-01-01', [round('loss')]), ev('2026-03-01', [round('win')])];
    expect(formStrip(ts, 'all')).toEqual(['win', 'loss']);
  });

  it('orders rounds within one event by the order they were played', () => {
    // playedOn lives on the tournament, so within an event the round order is
    // the only ordering available — and the last round is the most recent.
    expect(formStrip([ev('2026-01-01', [round('loss'), round('win')])], 'all'))
      .toEqual(['win', 'loss']);
  });

  it('keeps only the last n', () => {
    const ts = [ev('2026-01-01', Array.from({ length: 12 }, (_, i) => round(i === 11 ? 'draw' : 'win')))];
    const strip = formStrip(ts, 'all', 10);
    expect(strip).toHaveLength(10);
    expect(strip[0]).toBe('draw');
  });

  it('leaves byes and no-shows out — they are not games', () => {
    const ts = [ev('2026-01-01', [round('win'), round('win', 'bye'), round('loss', 'no_show')])];
    expect(formStrip(ts, 'all')).toEqual(['win']);
  });

  it('honours the scope, including all', () => {
    const ts = [ev('2026-01-01', [round('win')]), ev('2026-02-01', [round('loss')], 'match')];
    expect(formStrip(ts, 'tournaments')).toEqual(['win']);
    expect(formStrip(ts, 'matches')).toEqual(['loss']);
    expect(formStrip(ts, 'all')).toEqual(['loss', 'win']);
  });

  it('is empty rather than undefined with no history', () => {
    expect(formStrip([], 'all')).toEqual([]);
  });
});

describe('streaks', () => {
  it('counts the run in progress', () => {
    expect(streaks([ev('2026-01-01', [round('loss'), round('win'), round('win')])], 'all').current).toBe(2);
  });

  it('reports zero when the last game was a loss', () => {
    expect(streaks([ev('2026-01-01', [round('win'), round('loss')])], 'all').current).toBe(0);
  });

  it('lets a draw end a streak without starting a losing one', () => {
    // A draw is not a win and is not a loss; treating it as either would
    // misreport a game the player did not lose.
    const s = streaks([ev('2026-01-01', [round('win'), round('win'), round('draw')])], 'all');
    expect([s.current, s.longest]).toEqual([0, 2]);
  });

  it('remembers the best run even after it ends', () => {
    const s = streaks([ev('2026-01-01', [
      round('win'), round('win'), round('win'), round('loss'), round('win'),
    ])], 'all');
    expect([s.current, s.longest]).toEqual([1, 3]);
  });

  it('handles all wins and all losses', () => {
    expect(streaks([ev('2026-01-01', [round('win'), round('win')])], 'all')).toEqual({ current: 2, longest: 2 });
    expect(streaks([ev('2026-01-01', [round('loss'), round('loss')])], 'all')).toEqual({ current: 0, longest: 0 });
  });

  it('is zero for an empty history', () => {
    expect(streaks([], 'all')).toEqual({ current: 0, longest: 0 });
  });
});

describe('trendByMonth', () => {
  it('buckets by calendar month, oldest first', () => {
    const ts = [ev('2026-03-04', [round('win')]), ev('2026-01-20', [round('loss')])];
    expect(trendByMonth(ts, 'all').map((p) => [p.month, p.label, p.games]))
      .toEqual([['2026-01', 'Jan', 1], ['2026-03', 'Mar', 1]]);
  });

  it('omits months with no games rather than plotting a zero', () => {
    // A month away from the game is not a month of losses, and drawing it as a
    // trough would invent a slump that never happened.
    const ts = [ev('2026-01-05', [round('win')]), ev('2026-04-05', [round('win')])];
    expect(trendByMonth(ts, 'all').map((p) => p.month)).toEqual(['2026-01', '2026-04']);
  });

  it('crosses a year boundary in the right order', () => {
    const ts = [ev('2027-01-02', [round('win')]), ev('2026-12-30', [round('loss')])];
    expect(trendByMonth(ts, 'all').map((p) => p.month)).toEqual(['2026-12', '2027-01']);
  });

  it('reads the month off the ISO string rather than through a Date', () => {
    // Parsing would shift a late-evening event into the previous month for
    // anyone west of UTC, moving a game between two points on the chart.
    expect(trendByMonth([ev('2026-08-01', [round('win')])], 'all')[0].month).toBe('2026-08');
  });

  it('computes a win rate per month', () => {
    const p = trendByMonth([ev('2026-05-01', [round('win'), round('win'), round('loss')])], 'all')[0];
    expect([p.wins, p.games, Math.round(p.winRate * 100)]).toEqual([2, 3, 67]);
  });
});

const opp = (name: string, wins: number, losses: number): OpponentRow => ({
  leaderId: name, name, wins, losses, draws: 0, games: wins + losses,
  winRate: wins + losses > 0 ? wins / (wins + losses) : 0, byMeta: [],
});

const statsWith = (byOpponent: OpponentRow[]) => ({ byOpponent } as SegmentStats);
const counts = (wins: number, losses: number) => ({
  wins, losses, draws: 0, games: wins + losses, winRate: wins / (wins + losses),
});

describe('headlineFrom', () => {
  it('leads with the worst matchup, because that is the actionable one', () => {
    const h = headlineFrom(statsWith([opp('Kaido', 1, 4), opp('Enel', 4, 1)]), null);
    expect([h.worst?.name, h.best?.name]).toEqual(['Kaido', 'Enel']);
  });

  it('refuses to promote a matchup it has barely seen', () => {
    // The whole point of the threshold: 1-0 must never become "your best".
    const h = headlineFrom(statsWith([opp('Kaido', 2, 3), opp('Enel', 1, 0)]), null);
    expect(h.best?.name).not.toBe('Enel');
    expect(h.worst?.name).toBe('Kaido');
  });

  it('says nothing at all when nothing clears the threshold', () => {
    const h = headlineFrom(statsWith([opp('Enel', 1, 0), opp('Nami', 0, 2)]), null);
    expect([h.worst, h.best]).toEqual([null, null]);
  });

  it('does not call one opponent both the best and the worst', () => {
    const h = headlineFrom(statsWith([opp('Kaido', 3, 2)]), null);
    expect(h.worst?.name).toBe('Kaido');
    expect(h.best).toBeNull();
  });

  it('breaks a tie toward the better-evidenced row', () => {
    const h = headlineFrom(statsWith([opp('Few', 3, 3), opp('Many', 10, 10)]), null);
    expect(h.worst?.name).toBe('Many');
  });

  it('drops a turn-order split with no games in it', () => {
    expect(headlineFrom(statsWith([]), { first: counts(0, 0), second: counts(0, 0) }).turnOrder).toBeNull();
  });
});

describe('turnOrderIsMeaningful', () => {
  it('is true only when both sides are evidenced and actually differ', () => {
    expect(turnOrderIsMeaningful({ first: counts(8, 2), second: counts(4, 6) })).toBe(true);
  });

  it('is false when the two sides are close', () => {
    // A 5% gap over ten games each is noise, and stating it as a finding would
    // teach the player to read noise as a pattern.
    expect(turnOrderIsMeaningful({ first: counts(6, 4), second: counts(5, 5) })).toBe(false);
  });

  it('is false when either side is thin', () => {
    expect(turnOrderIsMeaningful({ first: counts(2, 0), second: counts(0, 8) })).toBe(false);
  });
});

describe('the threshold itself', () => {
  it('is five, and marks anything below it', () => {
    expect(THIN).toBe(5);
    expect([isThin(4), isThin(5)]).toEqual([true, false]);
  });
});
