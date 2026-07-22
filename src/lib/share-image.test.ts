import { describe, it, expect } from 'vitest';
import { shareFilename } from './share-image';

describe('shareFilename', () => {
  it('slugifies the label', () => {
    expect(shareFilename('tournament', 'Paramount War 4-2')).toBe('grand-line-tcg-tournament-paramount-war-4-2.png');
  });
  it('falls back to "card" on empty label', () => {
    expect(shareFilename('stats', '')).toBe('grand-line-tcg-stats-card.png');
  });
  it('trims, lowercases, and strips punctuation', () => {
    expect(shareFilename('achievement', '  Rainbow Crusher!  ')).toBe('grand-line-tcg-achievement-rainbow-crusher.png');
  });
});
