import { describe, it, expect } from 'vitest';
import { matchupsForLeader, verdictOf } from './matchups';
import type { LeaderDTO, TournamentSummaryDTO, MatchSummaryDTO } from '../dto';

const leader = (id: string, colors: string[]): LeaderDTO =>
  ({ id, name: id, colors, setCode: id, isCustom: false, ownerId: null } as LeaderDTO);

const LEADERS = [leader('me', ['red']), leader('other', ['blue']), leader('kaido', ['purple']), leader('duo', ['purple', 'red'])];

const round = (p: Partial<MatchSummaryDTO> = {}): MatchSummaryDTO => ({
  opponentLeaderId: 'kaido', myLeaderId: null, opponentMetaId: null,
  result: 'win', kind: 'swiss', playOrder: 'first', ...p,
});

const tourney = (p: Partial<TournamentSummaryDTO> = {}): TournamentSummaryDTO => ({
  id: Math.random().toString(36).slice(2), type: 'local', myLeaderId: 'me', metaId: null,
  name: null, notes: null, placement: null, fieldSize: null, playedOn: '2026-08-01',
  status: 'draft', record: { wins: 0, losses: 0, draws: 0 }, matches: [], deckCount: 0, ...p,
} as TournamentSummaryDTO);

const forMe = (ts: TournamentSummaryDTO[], seg: 'tournaments' | 'sessions' | 'matches' = 'tournaments') =>
  matchupsForLeader(ts, LEADERS, seg, 'me');

describe('verdictOf', () => {
  it('calls the boundaries the same way the server does', () => {
    // Pinned exactly: a matchup that reads "favored" on one screen and "even" on
    // another is worse than no verdict at all.
    expect(verdictOf(0.55, 10)).toBe('favored');
    expect(verdictOf(0.5499, 10)).toBe('even');
    expect(verdictOf(0.45, 10)).toBe('unfavored');
    expect(verdictOf(0.4501, 10)).toBe('even');
  });

  it('refuses to judge a matchup it has barely seen', () => {
    // The defect this closes: one win used to render `favored` in confident
    // green, and the badge would flip to red on the next loss.
    expect(verdictOf(1, 1)).toBe('unknown');
    expect(verdictOf(0, 1)).toBe('unknown');
    expect(verdictOf(1, 4)).toBe('unknown');
  });

  it('starts judging at exactly five games', () => {
    expect(verdictOf(1, 5)).toBe('favored');
  });

  it('gives no verdict at all for a leader with no games', () => {
    // rate() returns 0 for no games, and 0 <= 0.45 — which used to render an
    // unplayed matchup as a loss.
    expect(verdictOf(0, 0)).toBe('unknown');
  });
});

describe('matchupsForLeader', () => {
  it('counts only rounds played with that leader', () => {
    const m = forMe([
      tourney({ myLeaderId: 'me', matches: [round()] }),
      tourney({ myLeaderId: 'other', matches: [round()] }),
    ]);
    expect(m.opponents.map((o) => [o.name, o.games])).toEqual([['kaido', 1]]);
  });

  it('reads the deck from the round on a session', () => {
    const m = matchupsForLeader(
      [tourney({ type: 'session_locals', myLeaderId: null, matches: [round({ myLeaderId: 'me' }), round({ myLeaderId: 'other' })] })],
      LEADERS, 'sessions', 'me',
    );
    expect(m.opponents[0].games).toBe(1);
  });

  it('stays inside the segment it was asked for', () => {
    const ts = [
      tourney({ matches: [round()] }),
      tourney({ type: 'match', matches: [round()] }),
    ];
    expect(forMe(ts, 'tournaments').opponents[0].games).toBe(1);
    expect(forMe(ts, 'matches').opponents[0].games).toBe(1);
  });

  it('splits turn order and leaves out rounds that recorded none', () => {
    const m = forMe([tourney({ matches: [
      round({ playOrder: 'first', result: 'win' }),
      round({ playOrder: 'second', result: 'loss' }),
      round({ playOrder: null, result: 'win' }),
    ] })]);
    expect([m.turnOrder.first.games, m.turnOrder.second.games]).toEqual([1, 1]);
  });

  it('keeps byes out of turn order, because they record no play order', () => {
    const m = forMe([tourney({ matches: [round({ kind: 'bye', opponentLeaderId: null, playOrder: null })] })]);
    expect([m.turnOrder.first.games, m.turnOrder.second.games]).toEqual([0, 0]);
    expect(m.opponents).toEqual([]);
  });

  it('counts a two-colour opponent under each of its colours', () => {
    // Deliberately unlike the donut on the same page, which slices by
    // combination so it can partition. Here the question is per colour.
    const m = forMe([tourney({ matches: [round({ opponentLeaderId: 'duo' })] })]);
    expect(m.colorBreakdown.map((c) => c.color).sort()).toEqual(['purple', 'red']);
    expect(m.colorBreakdown.every((c) => c.games === 1)).toBe(true);
  });

  it('files a colourless opponent under its own row', () => {
    const m = matchupsForLeader(
      [tourney({ matches: [round({ opponentLeaderId: 'blank' })] })],
      [...LEADERS, leader('blank', [])], 'tournaments', 'me',
    );
    expect(m.colorBreakdown.map((c) => c.color)).toEqual(['colorless']);
  });

  it('orders opponents by games played, then by name', () => {
    const m = forMe([tourney({ matches: [
      round({ opponentLeaderId: 'kaido' }), round({ opponentLeaderId: 'kaido' }),
      round({ opponentLeaderId: 'other' }),
    ] })]);
    expect(m.opponents.map((o) => o.name)).toEqual(['kaido', 'other']);
  });

  it('returns empty structures rather than nothing for an unplayed leader', () => {
    const m = matchupsForLeader([tourney({ matches: [round()] })], LEADERS, 'tournaments', 'nobody');
    expect(m.opponents).toEqual([]);
    expect(m.turnOrder.first.games).toBe(0);
    expect(m.colorBreakdown).toEqual([]);
  });
});
