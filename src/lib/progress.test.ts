import { describe, it, expect } from 'vitest';
import { XP, xpForTournament, totalXp, levelFor, isoWeek, weekStreak, nextPayoff } from './progress';
import type { Achievement } from './achievements/definitions';
import type { TournamentSummaryDTO } from './dto';

function tournament(playedOn: string, wins: number, losses: number, opts: { locked?: boolean; draws?: number } = {}) {
  return {
    id: `${playedOn}-${wins}-${losses}`,
    type: 'local', myLeaderId: 'l', metaId: null, name: null, notes: null,
    playedOn, status: opts.locked ? 'locked' : 'draft',
    record: { wins, losses, draws: opts.draws ?? 0 },
    matches: [], deckCount: 0,
  } as unknown as TournamentSummaryDTO;
}

describe('XP', () => {
  it('pays for every game, and a little more for winning', () => {
    expect(xpForTournament(tournament('2026-08-18', 2, 1))).toBe(3 * XP.round + 2 * XP.win);
  });

  it('still pays a player who lost every game', () => {
    // Paying only for wins would teach a losing player to stop logging, and the
    // product exists for what logging produces.
    expect(xpForTournament(tournament('2026-08-18', 0, 3))).toBe(3 * XP.round);
  });

  it('counts draws as games', () => {
    expect(xpForTournament(tournament('2026-08-18', 0, 0, { draws: 2 }))).toBe(2 * XP.round);
  });

  it('adds a bonus once the event is finished', () => {
    const open = xpForTournament(tournament('2026-08-18', 1, 1));
    const done = xpForTournament(tournament('2026-08-18', 1, 1, { locked: true }));
    expect(done - open).toBe(XP.finishedEvent);
  });

  it('totals across a history', () => {
    expect(totalXp([tournament('2026-08-01', 1, 0), tournament('2026-08-08', 0, 1)]))
      .toBe(XP.round + XP.win + XP.round);
  });

  it('is zero with nothing logged', () => {
    expect(totalXp([])).toBe(0);
  });
});

describe('levels', () => {
  it('starts everyone at level 1', () => {
    expect(levelFor(0).level).toBe(1);
    expect(levelFor(99).level).toBe(1);
  });

  it('crosses at the documented thresholds', () => {
    expect(levelFor(100).level).toBe(2);
    expect(levelFor(299).level).toBe(2);
    expect(levelFor(300).level).toBe(3);
    expect(levelFor(600).level).toBe(4);
  });

  it('reports progress through the current level', () => {
    const l = levelFor(150);
    expect(l.level).toBe(2);
    expect(l.into).toBe(50);
    expect(l.span).toBe(200);
    expect(l.nextAt).toBe(300);
  });

  it('widens as it goes, so later levels stay worth reaching', () => {
    expect(levelFor(100).span).toBeLessThan(levelFor(600).span);
  });

  it('survives nonsense input rather than returning NaN', () => {
    expect(levelFor(-50).level).toBe(1);
    expect(levelFor(-50).into).toBe(0);
  });
});

describe('ISO weeks', () => {
  it('puts a Monday and the Sunday after it in one week', () => {
    expect(isoWeek('2026-08-17')).toBe(isoWeek('2026-08-23'));
  });

  it('separates that Sunday from the Monday after', () => {
    expect(isoWeek('2026-08-23')).not.toBe(isoWeek('2026-08-24'));
  });

  it('handles a year boundary without inventing week 53 of the wrong year', () => {
    // 2026-12-31 is a Thursday, so it belongs to week 53 of 2026.
    expect(isoWeek('2026-12-31')).toBe('2026-W53');
    expect(isoWeek('2027-01-04')).toBe('2027-W01');
  });
});

describe('the week streak', () => {
  const TODAY = '2026-08-19'; // a Wednesday

  it('is zero with nothing logged', () => {
    expect(weekStreak([], TODAY)).toEqual({ weeks: 0, atRisk: false });
  });

  it('counts this week and the weeks before it', () => {
    const history = [tournament('2026-08-19', 1, 0), tournament('2026-08-12', 1, 0), tournament('2026-08-05', 1, 0)];
    expect(weekStreak(history, TODAY)).toEqual({ weeks: 3, atRisk: false });
  });

  it('survives an empty current week, and says it is at risk', () => {
    // The week is not over. Calling the streak broken on Wednesday would be a
    // lie, and a discouraging one.
    const history = [tournament('2026-08-12', 1, 0), tournament('2026-08-05', 1, 0)];
    expect(weekStreak(history, TODAY)).toEqual({ weeks: 2, atRisk: true });
  });

  it('breaks once a whole week is skipped', () => {
    const history = [tournament('2026-08-05', 1, 0), tournament('2026-07-29', 1, 0)];
    expect(weekStreak(history, TODAY)).toEqual({ weeks: 0, atRisk: false });
  });

  it('does not double-count two events in the same week', () => {
    const history = [tournament('2026-08-17', 1, 0), tournament('2026-08-19', 1, 0)];
    expect(weekStreak(history, TODAY).weeks).toBe(1);
  });

  it('counts casual games too, because it measures the habit', () => {
    const match = { ...tournament('2026-08-19', 1, 0), type: 'match' } as TournamentSummaryDTO;
    expect(weekStreak([match], TODAY).weeks).toBe(1);
  });
});

describe('the next payoff', () => {
  const achievement = (key: string, name: string, current: number, target: number, unlocked = false): Achievement =>
    ({ key, name, description: '', unlocked, progress: { current, target } });

  it('still names a target for a player who has logged nothing', () => {
    // The brand-new player is exactly who needs a reason to log a first game,
    // so an untouched achievement is a valid answer.
    expect(nextPayoff([achievement('a', 'First Blood', 0, 1)])?.label).toBe('1 from First Blood');
  });

  it('prefers the one already started when two are equally close', () => {
    const out = nextPayoff([achievement('a', 'Untouched', 0, 2), achievement('b', 'Started', 8, 10)]);
    expect(out?.name).toBe('Started');
  });

  it('picks the one closest to landing', () => {
    const out = nextPayoff([achievement('a', 'Century', 98, 100), achievement('b', 'Regular', 4, 10)]);
    expect(out?.name).toBe('Century');
    expect(out?.remaining).toBe(2);
    expect(out?.label).toBe('2 from Century');
  });

  it('ignores what is already unlocked', () => {
    const out = nextPayoff([achievement('a', 'Done', 10, 10, true), achievement('b', 'Open', 1, 10)]);
    expect(out?.name).toBe('Open');
  });

  it('ignores achievements with no progress to report', () => {
    const boolish: Achievement = { key: 'p', name: 'Perfect Run', description: '', unlocked: false, progress: null };
    expect(nextPayoff([boolish])).toBeNull();
  });
});
