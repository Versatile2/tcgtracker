import { describe, it, expect } from 'vitest';
import { isMilestone, headlineFor, type Celebration } from './celebration';
import type { Achievement } from '@/lib/achievements/definitions';

const base: Celebration = {
  result: 'win',
  myLeader: null,
  opponentLeader: null,
  xpGained: 15,
  unlocked: [],
  leveledTo: null,
  streakWeeks: 1,
  streakExtended: false,
  placement: null,
  fieldSize: null,
  headline: '',
};

const badge = (name: string): Achievement => ({
  key: 'k', name, description: 'd', unlocked: true, progress: { current: 1, target: 1 },
});

describe('isMilestone', () => {
  it('stays quiet for an ordinary round', () => {
    expect(isMilestone(base)).toBe(false);
  });

  it('fires on a win even when nothing else was earned', () => {
    // The point of the rule: the Champion achievement unlocks once and never
    // again, so without this a second tournament win would pass in silence.
    expect(isMilestone({ ...base, placement: 1, fieldSize: 32 })).toBe(true);
  });

  it('fires on the rest of the podium too', () => {
    expect(isMilestone({ ...base, placement: 2, fieldSize: 32 })).toBe(true);
    expect(isMilestone({ ...base, placement: 3, fieldSize: 32 })).toBe(true);
  });

  it('does not fire for a cut or an ordinary finish', () => {
    // A cut earns an edge in the list; it does not stop the player.
    expect(isMilestone({ ...base, placement: 5, fieldSize: 32 })).toBe(false);
    expect(isMilestone({ ...base, placement: 19, fieldSize: 24 })).toBe(false);
  });

  it('still fires on the things it always fired on', () => {
    expect(isMilestone({ ...base, unlocked: [badge('First Blood')] })).toBe(true);
    expect(isMilestone({ ...base, leveledTo: 3 })).toBe(true);
    expect(isMilestone({ ...base, streakExtended: true })).toBe(true);
  });
});

describe('headlineFor', () => {
  const args = {
    result: 'win' as const, unlocked: [], leveledTo: null,
    streakExtended: false, streakWeeks: 1,
  };

  it('names the finish', () => {
    expect(headlineFor({ ...args, placement: 1, fieldSize: 32 })).toBe('Champion');
    expect(headlineFor({ ...args, placement: 2, fieldSize: 32 })).toBe('Runner-up');
    expect(headlineFor({ ...args, placement: 3, fieldSize: 32 })).toBe('3rd place');
  });

  it('puts the win above the badge it earned', () => {
    expect(headlineFor({
      ...args, unlocked: [badge('Champion')], placement: 1, fieldSize: 8,
    })).toBe('Champion');
    expect(headlineFor({
      ...args, unlocked: [badge('Century')], placement: 1, fieldSize: 8,
    })).toBe('Champion');
  });

  it('leaves every other headline alone', () => {
    expect(headlineFor({ ...args, unlocked: [badge('Century')] })).toBe('Century');
    expect(headlineFor({ ...args, leveledTo: 4 })).toBe('Level 4');
    expect(headlineFor({ ...args, placement: 9, fieldSize: 32 })).toBe('Win logged');
  });
});
