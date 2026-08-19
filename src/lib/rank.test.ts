import { describe, it, expect } from 'vitest';
import { rankTier, rankLabel, isPodiumTier } from './rank';

describe('rankTier', () => {
  it('grades the podium', () => {
    expect(rankTier(1, 32)).toBe('champion');
    expect(rankTier(2, 32)).toBe('silver');
    expect(rankTier(3, 32)).toBe('bronze');
  });

  it('takes the first matching rung, so a podium is never demoted to a cut', () => {
    // 2nd of 32 satisfies "top 8 of a 16+ field" too. It must not read as one.
    expect(rankTier(2, 32)).toBe('silver');
  });

  it('marks a cut only when there was a field to cut from', () => {
    expect(rankTier(8, 16)).toBe('cut');
    expect(rankTier(4, 64)).toBe('cut');
    // 8th of 8 is last place, not a top cut.
    expect(rankTier(8, 8)).toBe(null);
    expect(rankTier(4, 8)).toBe(null);
  });

  it('leaves an ordinary finish plain', () => {
    expect(rankTier(9, 32)).toBe(null);
    expect(rankTier(19, 24)).toBe(null);
  });

  it('is null when nothing was recorded', () => {
    expect(rankTier(null, 32)).toBe(null);
    expect(rankTier(null, null)).toBe(null);
  });

  it('still crowns a win when the field size was never learned', () => {
    // A placement is often recorded before the turnout is known.
    expect(rankTier(1, null)).toBe('champion');
    expect(rankTier(3, null)).toBe('bronze');
    // But a cut cannot be claimed without knowing what was cut.
    expect(rankTier(6, null)).toBe(null);
  });

  it('names every rung', () => {
    expect(rankLabel.champion).toBe('Champion');
    expect(rankLabel.silver).toBe('Runner-up');
    expect(rankLabel.bronze).toBe('3rd place');
    expect(rankLabel.cut).toBe('Top 8');
  });

  it('counts only the metals as a podium', () => {
    expect(isPodiumTier('champion')).toBe(true);
    expect(isPodiumTier('bronze')).toBe(true);
    expect(isPodiumTier('cut')).toBe(false);
    expect(isPodiumTier(null)).toBe(false);
  });
});
