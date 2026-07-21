import { describe, it, expect } from 'vitest';
import { ACCENTS, DEFAULT_ACCENT, isValidAccent } from './accents';

describe('accents', () => {
  it('has 6 presets, each with key/name/hex color', () => {
    expect(ACCENTS.length).toBe(6);
    for (const a of ACCENTS) {
      expect(a.key).toBeTruthy();
      expect(a.name).toBeTruthy();
      expect(a.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
  it('DEFAULT_ACCENT is a valid key', () => {
    expect(isValidAccent(DEFAULT_ACCENT)).toBe(true);
    expect(DEFAULT_ACCENT).toBe('indigo');
  });
  it('isValidAccent accepts known and rejects unknown', () => {
    expect(isValidAccent('green')).toBe(true);
    expect(isValidAccent('teal')).toBe(false);
  });
});
