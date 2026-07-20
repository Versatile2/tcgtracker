import { describe, it, expect } from 'vitest';
import { computeRecord, formatRecord } from './record';

describe('computeRecord', () => {
  it('counts wins/losses/draws', () => {
    const r = computeRecord([{ result: 'win' }, { result: 'win' }, { result: 'loss' }, { result: 'draw' }]);
    expect(r).toEqual({ wins: 2, losses: 1, draws: 1 });
  });
  it('handles empty', () => {
    expect(computeRecord([])).toEqual({ wins: 0, losses: 0, draws: 0 });
  });
});

describe('formatRecord', () => {
  it('omits draws when zero', () => {
    expect(formatRecord({ wins: 4, losses: 2, draws: 0 })).toBe('4-2');
  });
  it('includes draws when present', () => {
    expect(formatRecord({ wins: 4, losses: 2, draws: 1 })).toBe('4-2-1');
  });
});
