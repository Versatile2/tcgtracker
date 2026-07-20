import { describe, it, expect } from 'vitest';
import { tournamentTypeLabel } from './labels';

describe('tournamentTypeLabel', () => {
  it('humanizes enum values', () => {
    expect(tournamentTypeLabel('treasure_cup')).toBe('Treasure Cup');
    expect(tournamentTypeLabel('extra_grand_battle')).toBe('Extra Grand Battle');
    expect(tournamentTypeLabel('local')).toBe('Local');
  });
});
