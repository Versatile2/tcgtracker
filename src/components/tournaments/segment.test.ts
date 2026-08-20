import { describe, it, expect } from 'vitest';
import { segmentFromTab } from './segment';

describe('segmentFromTab', () => {
  it('maps the current ?tab=sessions value to the sessions segment', () => {
    expect(segmentFromTab('sessions')).toBe('sessions');
  });

  // A stale link — an old bookmark, a cached PWA shell — may still carry the
  // pre-rename value, and it must keep opening the same tab.
  it('maps the legacy ?tab=freeplay value to the sessions segment too', () => {
    expect(segmentFromTab('freeplay')).toBe('sessions');
  });

  it('maps ?tab=matches to the matches segment', () => {
    expect(segmentFromTab('matches')).toBe('matches');
  });

  it('falls back to tournaments for anything else, including no tab at all', () => {
    expect(segmentFromTab(null)).toBe('tournaments');
    expect(segmentFromTab(undefined)).toBe('tournaments');
    expect(segmentFromTab('bogus')).toBe('tournaments');
  });
});
