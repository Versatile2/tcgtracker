import { describe, it, expect } from 'vitest';
import { newlyUnlocked } from './newly-unlocked';

describe('newlyUnlocked', () => {
  it('returns keys not present in seen', () => {
    expect(newlyUnlocked(['a', 'b', 'c'], ['a'])).toEqual(['b', 'c']);
  });
  it('returns empty when nothing new', () => {
    expect(newlyUnlocked(['a', 'b'], ['a', 'b', 'c'])).toEqual([]);
  });
  it('returns all when seen is empty', () => {
    expect(newlyUnlocked(['a', 'b'], [])).toEqual(['a', 'b']);
  });
});
