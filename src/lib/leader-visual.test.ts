import { describe, it, expect } from 'vitest';
import { getLeaderImage, leaderSearchText } from './leader-visual';

describe('getLeaderImage', () => {
  it('resolves bundled art by set code', () => {
    expect(getLeaderImage('OP01-003')).toBe('/leaders/OP01-003.webp');
  });

  it('returns null for custom leaders and unknown codes', () => {
    expect(getLeaderImage(null)).toBeNull();
    expect(getLeaderImage(undefined)).toBeNull();
    expect(getLeaderImage('NOPE-001')).toBeNull();
  });
});

describe('leaderSearchText', () => {
  it('matches on the name and the card own set code', () => {
    const hay = leaderSearchText('Monkey D. Luffy', 'ST13-003');
    expect(hay).toContain('monkey d. luffy');
    expect(hay).toContain('st13-003');
  });

  it('matches on a reprinting starter-deck code', () => {
    // ST-17 ships Doflamingo under his original OP01-060 code, so a player
    // searching for their "ST17" deck must still find the card.
    expect(leaderSearchText('Donquixote Doflamingo', 'OP01-060')).toContain('st17');
    expect(leaderSearchText('Monkey D. Luffy', 'OP09-061')).toContain('st26');
  });

  it('does not invent deck codes for leaders that were never reprinted', () => {
    expect(leaderSearchText('Monkey D. Luffy', 'OP01-003')).toBe('monkey d. luffy op01-003');
  });

  it('handles custom leaders with no set code', () => {
    expect(leaderSearchText('My Homebrew', null)).toBe('my homebrew');
  });
});
