import { describe, it, expect } from 'vitest';
import { formatPlayedOn } from './format-date';

describe('formatPlayedOn', () => {
  it('renders a readable date without leading zeros on the day', () => {
    expect(formatPlayedOn('2026-08-09')).toBe('9 Aug 2026');
  });

  it('handles a two-digit day', () => {
    expect(formatPlayedOn('2026-08-16')).toBe('16 Aug 2026');
  });

  it('handles the last month', () => {
    expect(formatPlayedOn('2025-12-31')).toBe('31 Dec 2025');
  });

  it('returns the input unchanged when it is not an ISO date', () => {
    expect(formatPlayedOn('')).toBe('');
    expect(formatPlayedOn('not-a-date')).toBe('not-a-date');
  });

  it('rejects an out-of-range month rather than rendering undefined', () => {
    expect(formatPlayedOn('2026-13-01')).toBe('2026-13-01');
  });
});
