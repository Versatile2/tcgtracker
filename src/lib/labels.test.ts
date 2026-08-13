import { describe, it, expect } from 'vitest';
import { tournamentTypeLabel, metaLabel } from './labels';

describe('tournamentTypeLabel', () => {
  it('humanizes enum values', () => {
    expect(tournamentTypeLabel('treasure_cup')).toBe('Treasure Cup');
    expect(tournamentTypeLabel('extra_grand_battle')).toBe('Extra Grand Battle');
    expect(tournamentTypeLabel('local')).toBe('Local');
  });
});

describe('metaLabel', () => {
  it('shows an official meta as its set code alone', () => {
    expect(metaLabel({ name: 'OP01 Romance Dawn', code: 'OP01' })).toBe('OP01');
    expect(metaLabel({ name: 'OP16 The Time of Battle', code: 'OP16' })).toBe('OP16');
  });

  it('shows a custom meta as its full name, since it has no code', () => {
    expect(metaLabel({ name: 'Locals house rules', code: null })).toBe('Locals house rules');
  });
});
