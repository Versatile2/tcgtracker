import { describe, it, expect } from 'vitest';
import { ordinal, placementLabel, isWin, isPodium, isTopCut } from './placement';

describe('ordinal', () => {
  it('handles the ordinary cases', () => {
    expect([1, 2, 3, 4, 21, 22, 23].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '21st', '22nd', '23rd']);
  });

  it('handles the teens, which the naive rule gets wrong', () => {
    expect([11, 12, 13, 111, 112, 113].map(ordinal)).toEqual(['11th', '12th', '13th', '111th', '112th', '113th']);
  });
});

describe('placementLabel', () => {
  it('reads as a result', () => {
    expect(placementLabel(2, 14)).toBe('2nd of 14');
  });

  it('drops the field when it was never learned', () => {
    expect(placementLabel(2, null)).toBe('2nd');
  });

  it('is nothing when unplaced', () => {
    expect(placementLabel(null, 14)).toBeNull();
    expect(placementLabel(null, null)).toBeNull();
  });
});

describe('what a finish counts as', () => {
  it('recognises a win', () => {
    expect(isWin(1)).toBe(true);
    expect(isWin(2)).toBe(false);
    expect(isWin(null)).toBe(false);
  });

  it('recognises a podium regardless of field size', () => {
    expect([1, 2, 3].every((p) => isPodium(p))).toBe(true);
    expect(isPodium(4)).toBe(false);
    expect(isPodium(null)).toBe(false);
  });

  it('only calls it a top cut when there was a field to cut from', () => {
    // 8th of 8 is last place, not a cut.
    expect(isTopCut(8, 8)).toBe(false);
    expect(isTopCut(8, 16)).toBe(true);
    expect(isTopCut(9, 32)).toBe(false);
    expect(isTopCut(1, null)).toBe(false);
    expect(isTopCut(null, 32)).toBe(false);
  });
});
