import { describe, it, expect } from 'vitest';
import { getLeaderImage, leaderPrintings, leaderSearchText } from './leader-visual';

describe('getLeaderImage', () => {
  it('resolves bundled art by set code', () => {
    expect(getLeaderImage('OP01-003')).toBe('/leaders/OP01-003.webp');
  });

  it('returns null for custom leaders and unknown codes', () => {
    expect(getLeaderImage(null)).toBeNull();
    expect(getLeaderImage(undefined)).toBeNull();
    expect(getLeaderImage('NOPE-001')).toBeNull();
  });

  it('resolves a chosen printing', () => {
    expect(getLeaderImage('OP01-003', 'OP01-003_p1')).toBe('/leaders/OP01-003_p1.webp');
  });

  it('falls back to the base printing when no art is chosen', () => {
    expect(getLeaderImage('OP01-003', null)).toBe('/leaders/OP01-003.webp');
    expect(getLeaderImage('OP01-003', undefined)).toBe('/leaders/OP01-003.webp');
  });

  it('falls back to the base printing for art belonging to another card', () => {
    // A preference stored against a set code that was later renumbered must
    // degrade to that card's own art rather than render a broken image.
    expect(getLeaderImage('OP01-003', 'OP06-022_p2')).toBe('/leaders/OP01-003.webp');
    expect(getLeaderImage('OP01-003', 'nonsense')).toBe('/leaders/OP01-003.webp');
  });
});

describe('leaderPrintings', () => {
  it('lists every bundled printing with the base first', () => {
    const printings = leaderPrintings('OP01-003');
    expect(printings.length).toBeGreaterThan(1);
    expect(printings[0]).toBe('OP01-003');
    expect(printings.every((p) => p.startsWith('OP01-003'))).toBe(true);
  });

  it('is empty for custom leaders and unknown codes', () => {
    expect(leaderPrintings(null)).toEqual([]);
    expect(leaderPrintings('NOPE-001')).toEqual([]);
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
