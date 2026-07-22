import { describe, it, expect } from 'vitest';
import { shareFilename } from './share-image';

describe('shareFilename', () => {
  it('slugifies the label', () => {
    expect(shareFilename('tournament', 'Paramount War 4-2')).toBe('crewstat-tournament-paramount-war-4-2.png');
  });
  it('falls back to "card" on empty label', () => {
    expect(shareFilename('stats', '')).toBe('crewstat-stats-card.png');
  });
  it('trims, lowercases, and strips punctuation', () => {
    expect(shareFilename('achievement', '  Rainbow Crusher!  ')).toBe('crewstat-achievement-rainbow-crusher.png');
  });
});
