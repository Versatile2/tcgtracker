import { describe, it, expect } from 'vitest';
import { statsForSegment, segmentOf, foldTail, type Breakdown } from './segment-stats';
import { normalizeColors, comboKey, comboLabel } from './colors';
import type { LeaderDTO, MetaDTO, TournamentSummaryDTO, MatchSummaryDTO } from '../dto';

const leader = (id: string, colors: string[]): LeaderDTO =>
  ({ id, name: id, colors, setCode: id, isCustom: false, ownerId: null } as LeaderDTO);

const LEADERS = [
  leader('zoro', ['red']),
  leader('law', ['purple', 'red']),
  leader('sakazuki', ['blue', 'black']),
  leader('rainbow', ['blue', 'green', 'purple', 'red', 'black', 'yellow']),
  leader('reversed', ['yellow', 'black']),
];
const METAS: MetaDTO[] = [
  { id: 'm1', name: 'OP01 Romance Dawn', code: 'OP01', isCustom: false, ownerId: null },
  { id: 'm2', name: 'OP02 Paramount War', code: 'OP02', isCustom: false, ownerId: null },
  { id: 'mine', name: 'Kitchen table', code: null, isCustom: true, ownerId: 'u' },
];

const round = (p: Partial<MatchSummaryDTO> = {}): MatchSummaryDTO => ({
  opponentLeaderId: 'zoro', myLeaderId: null, opponentMetaId: null,
  result: 'win', kind: 'swiss', playOrder: 'first', ...p,
});

const tourney = (p: Partial<TournamentSummaryDTO> = {}): TournamentSummaryDTO => ({
  id: Math.random().toString(36).slice(2), type: 'local', myLeaderId: 'zoro', metaId: 'm1',
  name: null, notes: null, placement: null, fieldSize: null, playedOn: '2026-08-01',
  status: 'draft', record: { wins: 0, losses: 0, draws: 0 }, matches: [], deckCount: 0, ...p,
} as TournamentSummaryDTO);

const stats = (ts: TournamentSummaryDTO[], seg: 'tournaments' | 'sessions' | 'matches' = 'tournaments') =>
  statsForSegment(ts, LEADERS, METAS, seg);

describe('segmentOf', () => {
  it('files each type under the list it appears in', () => {
    expect(segmentOf('local')).toBe('tournaments');
    expect(segmentOf('regionals')).toBe('tournaments');
    // Ranked play logged as a tournament counts; the same games as a session do not.
    expect(segmentOf('ranked_sim')).toBe('tournaments');
    expect(segmentOf('session_sim')).toBe('sessions');
    expect(segmentOf('testing')).toBe('sessions');
    expect(segmentOf('match')).toBe('matches');
  });
});

describe('colour combinations', () => {
  it('puts the same pairing under one key however the catalog spells it', () => {
    // The catalog really does carry both: black/yellow on four leaders,
    // yellow/black on one. Unnormalised they would be two slices of one chart.
    expect(comboKey(['black', 'yellow'])).toBe(comboKey(['yellow', 'black']));
  });

  it('orders colours the way the game does, not alphabetically', () => {
    expect(normalizeColors(['yellow', 'red', 'blue'])).toEqual(['red', 'blue', 'yellow']);
  });

  it('drops duplicates rather than counting a colour twice', () => {
    expect(comboKey(['red', 'red'])).toBe('red');
  });

  it('names a six-colour deck by what it is', () => {
    expect(comboLabel('red/green/blue/purple/black/yellow')).toBe('All six');
  });

  it('gives a colourless leader its own slice instead of dropping the game', () => {
    expect(comboKey([])).toBe('colorless');
    expect(comboLabel('colorless')).toBe('No colour');
  });
});

describe('statsForSegment', () => {
  it('counts only the segment asked for', () => {
    const ts = [
      tourney({ type: 'local', matches: [round()] }),
      tourney({ type: 'session_locals', myLeaderId: null, matches: [round({ myLeaderId: 'zoro' })] }),
      tourney({ type: 'match', matches: [round()] }),
    ];
    expect(stats(ts, 'tournaments').games).toBe(1);
    expect(stats(ts, 'sessions').games).toBe(1);
    expect(stats(ts, 'matches').games).toBe(1);
  });

  it('leaves byes and no-shows out of the record', () => {
    // The SQL excludes them from every win-rate query; disagreeing here would
    // show one record on the list and another on the stats page.
    const s = stats([tourney({ matches: [
      round({ result: 'win' }),
      round({ result: 'win', kind: 'bye' }),
      round({ result: 'loss', kind: 'no_show' }),
    ] })]);
    expect([s.wins, s.losses, s.games]).toEqual([1, 0, 1]);
  });

  it('gives a two-colour opponent one slice, not two half-slices', () => {
    const s = stats([tourney({ matches: [round({ opponentLeaderId: 'law' })] })]);
    expect(s.byColorFaced.map((r) => [r.key, r.games])).toEqual([['red/purple', 1]]);
  });

  it('keeps every row summing to the whole, so a donut can be drawn from it', () => {
    const s = stats([tourney({ matches: [
      round({ opponentLeaderId: 'zoro' }),
      round({ opponentLeaderId: 'law' }),
      round({ opponentLeaderId: 'rainbow' }),
    ] })]);
    const total = s.byColorFaced.reduce((n, r) => n + r.share, 0);
    expect(total).toBeCloseTo(1, 10);
    expect(s.byColorFaced).toHaveLength(3);
  });

  it('counts a win over a two-colour deck toward both its colours', () => {
    // The slices partition; coverage does not. Beating Purple/Red beats both.
    const s = stats([tourney({ matches: [round({ opponentLeaderId: 'law', result: 'win' })] })]);
    expect(s.colorsBeaten).toEqual({ seen: 2, total: 6 });
  });

  it('does not count a colour beaten when the game was lost', () => {
    const s = stats([tourney({ matches: [round({ opponentLeaderId: 'law', result: 'loss' })] })]);
    expect(s.colorsBeaten.seen).toBe(0);
  });

  it('completes the rainbow from one win over an all-colour leader', () => {
    // Worth pinning: the promo Release Event leaders make this reachable in a
    // single game, which is a real consequence of the data, not a bug.
    const s = stats([tourney({ matches: [round({ opponentLeaderId: 'rainbow' })] })]);
    expect(s.colorsBeaten).toEqual({ seen: 6, total: 6 });
  });

  it('reads my colours from the round on a session, and the event elsewhere', () => {
    const t = stats([tourney({ myLeaderId: 'sakazuki', matches: [round()] })]);
    expect(t.byMyColor.map((r) => r.key)).toEqual(['blue/black']);
    const s = stats([tourney({
      type: 'session_locals', myLeaderId: null,
      matches: [round({ myLeaderId: 'law' }), round({ myLeaderId: 'zoro' })],
    })], 'sessions');
    expect(s.byMyColor.map((r) => r.key).sort()).toEqual(['red', 'red/purple']);
  });

  it("prefers the round's own meta over the event's", () => {
    const s = stats([tourney({ metaId: 'm1', matches: [
      round(), round({ opponentMetaId: 'm2' }),
    ] })]);
    expect(s.byMeta.map((r) => [r.label, r.games]).sort()).toEqual([['OP01', 1], ['OP02', 1]]);
  });

  it('files a round with no meta anywhere under its own row', () => {
    const s = stats([tourney({ metaId: null, matches: [round()] })]);
    expect(s.byMeta.map((r) => r.label)).toEqual(['No meta']);
    // …and that row is not a meta you have played, so it must not raise coverage.
    expect(s.metasPlayed.seen).toBe(0);
  });

  it('counts only official metas toward coverage', () => {
    const s = stats([tourney({ metaId: 'mine', matches: [round()] })]);
    expect(s.metasPlayed.total).toBe(2);
  });

  it('reports zeroes rather than NaN when nothing has been logged', () => {
    const s = stats([]);
    expect([s.games, s.winRate, s.events]).toEqual([0, 0, 0]);
    expect(s.byColorFaced).toEqual([]);
    expect(s.colorsBeaten).toEqual({ seen: 0, total: 6 });
  });

  it('orders rows by games played, so the chart reads largest first', () => {
    const s = stats([tourney({ matches: [
      round({ opponentLeaderId: 'law' }),
      round({ opponentLeaderId: 'zoro' }),
      round({ opponentLeaderId: 'zoro' }),
    ] })]);
    expect(s.byColorFaced.map((r) => r.games)).toEqual([2, 1]);
  });

  it('files a round with no opponent recorded rather than dropping it', () => {
    const s = stats([tourney({ matches: [round({ opponentLeaderId: null })] })]);
    expect(s.games).toBe(1);
    expect(s.byColorFaced.map((r) => r.key)).toEqual(['colorless']);
  });
});

describe('foldTail', () => {
  const row = (key: string, games: number): Breakdown => ({
    key, label: key, colors: [], wins: games, losses: 0, draws: 0,
    games, winRate: 1, share: games / 100,
  });

  it('leaves a short list alone', () => {
    const rows = [row('a', 3), row('b', 2)];
    expect(foldTail(rows, 8)).toBe(rows);
  });

  it('folds the tail into one row and says how many it swallowed', () => {
    const rows = Array.from({ length: 11 }, (_, i) => row(`r${i}`, 11 - i));
    const out = foldTail(rows, 8);
    expect(out).toHaveLength(9);
    expect(out[8].label).toBe('Other (3)');
  });

  it('keeps the folded row honest about its own totals', () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`r${i}`, 10 - i));
    const out = foldTail(rows, 8);
    const tail = rows.slice(8);
    expect(out[8].games).toBe(tail.reduce((n, r) => n + r.games, 0));
    expect(out[8].share).toBeCloseTo(tail.reduce((n, r) => n + r.share, 0), 10);
  });
});
